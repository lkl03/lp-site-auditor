import * as cheerio from "cheerio";
import type { PageData } from "./types";
import { PRIORITY_PATHS } from "./rubric";

const MAX_PAGES = 10;
const MAX_LINKS_PER_PAGE = 50;
const PAGE_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 3 * 1024 * 1024; // 3 MB

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

const PROHIBITED_TERMS = ["off-market", "off market"];

const LICENSE_PATTERNS = [
  /\bDRE\s*#?\s*\d{7,10}\b/i,
  /\bCA\s+DRE\s*#?\s*\d{7,10}\b/i,
  /\bLicense\s*#?\s*\d{5,12}\b/i,
  /\bLic\.?\s*#?\s*\d{5,12}\b/i,
  /\bBRE\s*#?\s*\d{7,10}\b/i,
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
    /^169\.254\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
    /^metadata\.google\.internal$/i,
    /^169\.254\.169\.254$/,
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

async function fetchPage(url: string, signal: AbortSignal): Promise<{ html: string; statusCode: number }> {
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

function parsePage(html: string, pageUrl: string): Omit<PageData, "url" | "statusCode" | "error"> {
  const $ = cheerio.load(html);

  const title = $("title").first().text().trim();
  const metaDescription = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const h1 = $("h1").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h2 = $("h2").map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const h3 = $("h3").map((_, el) => $(el).text().trim()).get().filter(Boolean);
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
  $("a[href]")
    .slice(0, MAX_LINKS_PER_PAGE)
    .each((_, el) => {
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
    const hasSubmit =
      !!$(el).find('button[type="submit"], input[type="submit"], button:not([type="button"])').length;
    const labels = $(el).find("label").length;
    forms.push({ inputs, hasSubmit, labels });
  });

  const bodyText = $("body").text();

  const emails: string[] = [];
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const email = href.replace("mailto:", "").split("?")[0].trim();
    if (email) emails.push(email);
  });
  const emailPattern = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const textEmails = bodyText.match(emailPattern) ?? [];
  for (const e of textEmails) {
    if (!emails.includes(e)) emails.push(e);
  }

  const phones: string[] = [];
  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const phone = href.replace("tel:", "").trim();
    if (phone) phones.push(phone);
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

  const lowerText = bodyText.toLowerCase();
  const disclaimers: string[] = DISCLAIMER_KEYWORDS.filter((kw) => lowerText.includes(kw));
  const prohibitedTerms: string[] = PROHIBITED_TERMS.filter((t) => lowerText.includes(t));

  const licenseNumbers: string[] = [];
  for (const pattern of LICENSE_PATTERNS) {
    const matches = bodyText.match(pattern);
    if (matches) licenseNumbers.push(...matches);
  }

  const inlineFixedWidths = $('[style]')
    .toArray()
    .some((el) => /width\s*:\s*\d+px/i.test($(el).attr("style") ?? ""));

  const hasVideo = !!$("video, iframe[src*='youtube'], iframe[src*='vimeo']").length;
  const hasHero = !!$(".hero, .opener, [class*='hero'], [class*='opener'], [id*='hero']").length;
  const hasCTA = !!$(
    "a.cta, button.cta, .cta-button, [class*='cta'], a[class*='btn']"
  ).length;

  const textSample = bodyText.replace(/\s+/g, " ").trim().slice(0, 500);

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
  };
}

function collectPriorityUrls(startUrl: URL, discovered: string[]): string[] {
  const origin = startUrl.origin;
  const priority = PRIORITY_PATHS.map((p) => `${origin}${p}`);
  const allUrls = [...new Set([startUrl.toString(), ...priority, ...discovered])];
  return allUrls.slice(0, MAX_PAGES);
}

export async function crawlSite(startUrl: URL): Promise<PageData[]> {
  const visited = new Set<string>();
  const queue: string[] = [startUrl.toString()];
  const pages: PageData[] = [];
  const discovered: string[] = [];

  // Phase 1: fetch root and discover links
  const rootController = new AbortController();
  const rootTimeout = setTimeout(() => rootController.abort(), PAGE_TIMEOUT_MS);
  try {
    const { html, statusCode } = await fetchPage(startUrl.toString(), rootController.signal);
    clearTimeout(rootTimeout);
    visited.add(startUrl.toString());

    const parsed = parsePage(html, startUrl.toString());
    pages.push({ url: startUrl.toString(), statusCode, ...parsed });

    for (const link of parsed.links) {
      try {
        const u = new URL(link);
        if (u.hostname === startUrl.hostname) discovered.push(link);
      } catch {}
    }
  } catch (err) {
    clearTimeout(rootTimeout);
    pages.push({
      url: startUrl.toString(),
      statusCode: 0,
      error: err instanceof Error ? err.message : "Fetch failed",
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
    });
    return pages;
  }

  // Phase 2: crawl priority + discovered pages up to limit
  const urlsToVisit = collectPriorityUrls(startUrl, discovered);
  for (const rawUrl of urlsToVisit) {
    if (pages.length >= MAX_PAGES) break;
    let url: string;
    try {
      url = new URL(rawUrl).toString();
    } catch {
      continue;
    }
    if (visited.has(url)) continue;
    visited.add(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
    try {
      const { html, statusCode } = await fetchPage(url, controller.signal);
      clearTimeout(timeout);
      const parsed = parsePage(html, url);
      pages.push({ url, statusCode, ...parsed });
    } catch (err) {
      clearTimeout(timeout);
      pages.push({
        url,
        statusCode: 0,
        error: err instanceof Error ? err.message : "Fetch failed",
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
      });
    }
  }

  return pages;
}
