import * as cheerio from "cheerio";
import type { PageData } from "./types";

const MAX_PAGES = 20;
const CONCURRENCY = 4;        // parallel fetches
const PAGE_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const TEXT_SAMPLE_LENGTH = 3_000; // ↑ from 500 so emails/phones deeper in page are captured

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /default[-_]?image/i,
  /sample[-_]?image/i,
  /demo[-_]?image/i,
  /stock[-_]?photo/i,
  /template[-_]?image/i,
  /lorem[-_]?ipsum/i,
  /no[-_]?photo/i,
  /image[-_]?coming[-_]?soon/i,
  /unsplash\.com\/photos\/[a-zA-Z0-9_-]+$/,
  /via\.placeholder/i,
];

const SOCIAL_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "zillow.com",
];

const DISCLAIMER_KEYWORDS = [
  "idx",
  "mls",
  "broker reciprocity",
  "equal housing",
  "realtor",
  "brokerage",
  "listing information",
  "multiple listing",
];

const PROHIBITED_TERMS = ["off-market", "off market", "pocket listing"];

const LICENSE_PATTERNS = [
  /\bDRE\s*#?\s*\d{7,10}\b/i,
  /\bCA\s+DRE\s*#?\s*\d{7,10}\b/i,
  /\bLicense\s*#?\s*\d{5,12}\b/i,
  /\bLic\.?\s*#?\s*\d{5,12}\b/i,
  /\bBRE\s*#?\s*\d{7,10}\b/i,
  /\bTREC\s*#?\s*\d{5,12}\b/i,
];

// MLS listing signals for /home-search detection
export const MLS_SIGNALS = [
  "listing", "listings", "homes for sale", "search homes", "property search",
  "idx", "mls", "price", "beds", "baths", "sqft", "square feet",
  "search results", "properties found", "active listings",
];

function isPrivateIP(hostname: string): boolean {
  const privateRanges = [
    /^localhost$/i,
    /^127\./,
    /^0\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/i,
    /^fe80:/i,
    /^0\.0\.0\.0$/,
    /^metadata\.google\.internal$/i,
  ];
  return privateRanges.some((r) => r.test(hostname));
}

export function validateUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid URL format. Must include http:// or https://" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http:// and https:// URLs are allowed" };
  }
  if (isPrivateIP(url.hostname)) {
    return { ok: false, error: "Private/local IP addresses are not allowed" };
  }
  return { ok: true, url };
}

async function fetchPage(
  url: string,
  signal: AbortSignal
): Promise<{ html: string; statusCode: number }> {
  const res = await fetch(url, {
    signal,
    redirect: "follow",
    headers: {
      "User-Agent": "LP-QA-Scanner/1.0 (internal audit tool)",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return { html: "", statusCode: res.status };
  }

  const reader = res.body?.getReader();
  if (!reader) return { html: "", statusCode: res.status };

  let received = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.length;
      if (received > MAX_BODY_BYTES) {
        reader.cancel();
        break;
      }
      chunks.push(value);
    }
  }

  const html = new TextDecoder().decode(
    chunks.reduce((acc, chunk) => {
      const merged = new Uint8Array(acc.length + chunk.length);
      merged.set(acc);
      merged.set(chunk, acc.length);
      return merged;
    }, new Uint8Array())
  );

  return { html, statusCode: res.status };
}

function parsePage(
  html: string,
  pageUrl: string
): Omit<PageData, "url" | "statusCode" | "error"> {
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim();
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const h1 = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const h2 = $("h2")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const h3 = $("h3")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);
  const favicon =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    $('link[rel="apple-touch-icon"]').attr("href") ||
    "";
  const canonical = $('link[rel="canonical"]').attr("href") ?? "";
  const ogImage = $('meta[property="og:image"]').attr("content") ?? "";
  const viewportMeta = !!$('meta[name="viewport"]').length;

  const base = new URL(pageUrl);

  const allLinks: string[] = [];
  const externalLinks: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim() ?? "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    try {
      const resolved = new URL(href, base).toString();
      const u = new URL(resolved);
      if (u.hostname === base.hostname) {
        allLinks.push(resolved);
      } else {
        externalLinks.push(resolved);
      }
    } catch {}
  });

  const buttons = $("button, [role='button'], a.btn, .cta-button")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  const images: PageData["images"] = [];
  const placeholderImages: string[] = [];
  const imagesWithoutSrcset: string[] = [];

  $("img").each((_, el) => {
    const src = $(el).attr("src")?.trim() ?? "";
    const alt = $(el).attr("alt")?.trim() ?? "";
    const width = parseInt($(el).attr("width") ?? "0") || undefined;
    const height = parseInt($(el).attr("height") ?? "0") || undefined;
    images.push({ src, alt, width, height });

    if (src && PLACEHOLDER_PATTERNS.some((p) => p.test(src))) {
      placeholderImages.push(src);
    }
    if (src && !$(el).attr("srcset") && !$(el).parent("picture").length) {
      imagesWithoutSrcset.push(src);
    }
  });

  const forms: PageData["forms"] = [];
  $("form").each((_, el) => {
    const inputs = $(el).find("input, textarea, select").length;
    const hasSubmit = !!$(el).find(
      'button[type="submit"], input[type="submit"], button:not([type="button"])'
    ).length;
    const labels = $(el).find("label").length;
    forms.push({ inputs, hasSubmit, labels });
  });

  const bodyText = $("body").text();
  const lowerBodyText = bodyText.toLowerCase();

  // ── Email extraction (case-insensitive collection) ────────────────────────
  const emails: string[] = [];
  $('a[href^="mailto:"], a[href^="MAILTO:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const email = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
    if (email && !emails.includes(email)) emails.push(email);
  });
  // Also search visible text — regex is case-insensitive via flag
  const emailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/gi;
  const textEmails = bodyText.match(emailPattern) ?? [];
  for (const e of textEmails) {
    const normalized = e.toLowerCase();
    if (!emails.includes(normalized)) emails.push(normalized);
  }

  // ── Phone extraction ──────────────────────────────────────────────────────
  const phones: string[] = [];
  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const phone = href.replace("tel:", "").trim();
    if (phone && !phones.includes(phone)) phones.push(phone);
  });
  const phonePattern = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g;
  const textPhones = bodyText.match(phonePattern) ?? [];
  for (const p of textPhones) {
    if (!phones.includes(p)) phones.push(p);
  }

  const socialLinks: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const u = new URL(href, base);
      if (SOCIAL_DOMAINS.some((d) => u.hostname.includes(d))) {
        socialLinks.push(u.toString());
      }
    } catch {}
  });

  const disclaimers: string[] = DISCLAIMER_KEYWORDS.filter((kw) =>
    lowerBodyText.includes(kw)
  );
  const prohibitedTerms: string[] = PROHIBITED_TERMS.filter((t) =>
    lowerBodyText.includes(t)
  );

  const licenseNumbers: string[] = [];
  for (const pattern of LICENSE_PATTERNS) {
    const matches = bodyText.match(pattern);
    if (matches) licenseNumbers.push(...matches);
  }

  const inlineFixedWidths = $("[style]")
    .toArray()
    .some((el) => /width\s*:\s*\d+px/i.test($(el).attr("style") ?? ""));

  const hasVideo = !!$(
    "video, iframe[src*='youtube'], iframe[src*='vimeo'], iframe[src*='youtube-nocookie']"
  ).length;
  const hasHero = !!$(
    ".hero, .opener, [class*='hero'], [class*='opener'], [id*='hero']"
  ).length;
  const hasCTA = !!$("a.cta, button.cta, .cta-button, [class*='cta'], a[class*='btn']").length;

  // MLS listing signals on this page
  const hasListingSignals = MLS_SIGNALS.some((s) => lowerBodyText.includes(s));

  // Text quality signals
  const hasLoremIpsum = lowerBodyText.includes("lorem ipsum");
  const repeatedWords = detectRepeatedWords(bodyText);
  const hasEmptyHeadings =
    h1.some((t) => !t.trim()) || h2.some((t) => !t.trim()) || h3.some((t) => !t.trim());

  const textSample = bodyText.replace(/\s+/g, " ").trim().slice(0, TEXT_SAMPLE_LENGTH);

  return {
    title,
    metaDescription,
    h1,
    h2,
    h3,
    links: allLinks,
    externalLinks,
    buttons,
    images,
    forms,
    emails,
    phones,
    socialLinks,
    disclaimers,
    prohibitedTerms,
    placeholderImages,
    favicon,
    canonical,
    ogImage,
    viewportMeta,
    textSample,
    inlineFixedWidths,
    imagesWithoutSrcset,
    licenseNumbers,
    hasVideo,
    hasHero,
    hasCTA,
    hasListingSignals,
    hasLoremIpsum,
    repeatedWords,
    hasEmptyHeadings,
  };
}

/** Detect obviously repeated words like "the the" or "and and". */
function detectRepeatedWords(text: string): string[] {
  const words = text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
  const repeated: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    if (
      words[i] === words[i + 1] &&
      words[i].length > 2 && // ignore short words like "a a"
      !repeated.includes(words[i])
    ) {
      repeated.push(words[i]);
    }
  }
  return repeated;
}

/** Build an empty page data record for error cases. */
function makeErrorPage(url: string, error: string): PageData {
  return {
    url,
    statusCode: 0,
    error,
    title: "",
    metaDescription: "",
    h1: [],
    h2: [],
    h3: [],
    links: [],
    externalLinks: [],
    buttons: [],
    images: [],
    forms: [],
    emails: [],
    phones: [],
    socialLinks: [],
    disclaimers: [],
    prohibitedTerms: [],
    placeholderImages: [],
    favicon: "",
    canonical: "",
    ogImage: "",
    viewportMeta: false,
    textSample: "",
    inlineFixedWidths: false,
    imagesWithoutSrcset: [],
    licenseNumbers: [],
    hasVideo: false,
    hasHero: false,
    hasCTA: false,
    hasListingSignals: false,
    hasLoremIpsum: false,
    repeatedWords: [],
    hasEmptyHeadings: false,
  };
}

/** Fetch and parse a single page. Always resolves (errors become error PageData). */
async function fetchAndParsePage(url: string): Promise<PageData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const { html, statusCode } = await fetchPage(url, controller.signal);
    clearTimeout(timeout);
    const parsed = parsePage(html, url);
    return { url, statusCode, ...parsed };
  } catch (err) {
    clearTimeout(timeout);
    return makeErrorPage(url, err instanceof Error ? err.message : "Fetch failed");
  }
}

/**
 * Fetch a list of URLs in parallel batches of CONCURRENCY.
 * Respects maxTotal limit.
 */
async function fetchBatch(
  urls: string[],
  visited: Set<string>,
  pages: PageData[],
  maxTotal: number
): Promise<void> {
  const pending = urls.filter((u) => !visited.has(u));
  for (let i = 0; i < pending.length && pages.length < maxTotal; i += CONCURRENCY) {
    const batch = pending
      .slice(i, i + CONCURRENCY)
      .filter((u) => !visited.has(u))
      .slice(0, maxTotal - pages.length);

    if (batch.length === 0) break;

    // Mark as visited before fetching (prevents duplicates in concurrent batches)
    for (const u of batch) visited.add(u);

    const results = await Promise.all(batch.map((u) => fetchAndParsePage(u)));
    pages.push(...results);
  }
}

/**
 * Crawl a site starting at startUrl.
 *
 * @param startUrl - The root URL to begin crawling.
 * @param expectedUrls - URLs that should always be attempted (from AuditProfile).
 *   These are fetched with priority before discovered links.
 */
export async function crawlSite(
  startUrl: URL,
  expectedUrls: string[] = []
): Promise<PageData[]> {
  const visited = new Set<string>();
  const pages: PageData[] = [];

  // ── Phase 1: Fetch root page ──────────────────────────────────────────────
  visited.add(startUrl.toString());
  const rootPage = await fetchAndParsePage(startUrl.toString());
  pages.push(rootPage);

  if (rootPage.error || rootPage.statusCode === 0) {
    // Root failed — don't attempt further pages
    return pages;
  }

  // Collect internal links from root
  const discovered = rootPage.links
    .filter((l) => {
      try {
        return new URL(l).hostname === startUrl.hostname;
      } catch {
        return false;
      }
    })
    .slice(0, 40); // cap discovery to avoid huge queues

  // ── Phase 2: Fetch expected URLs (from AuditProfile) ─────────────────────
  // Deduplicate and normalize expected URLs
  const expectedNormalized = [...new Set(expectedUrls)].filter((u) => {
    try {
      return new URL(u).hostname === startUrl.hostname;
    } catch {
      return false;
    }
  });

  await fetchBatch(expectedNormalized, visited, pages, MAX_PAGES);

  // ── Phase 3: Fill remaining slots from discovered links ───────────────────
  await fetchBatch(discovered, visited, pages, MAX_PAGES);

  return pages;
}
