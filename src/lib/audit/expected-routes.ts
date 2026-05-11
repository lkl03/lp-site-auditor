/**
 * LP-specific expected route mapping.
 *
 * This file centralizes all URL aliases for expected pages on LP-built sites.
 * "Aliases" are alternative URL paths that are equally valid for a given page.
 * If ANY alias returns 200 with content, the page is considered found.
 *
 * HOW TO ADD A NEW ROUTE:
 * 1. Add an entry to LP_EXPECTED_ROUTES with key, label, aliases, and requiredWhen.
 * 2. Update context-rules.ts if you need custom rule logic for the page.
 * 3. Run tests: npm test
 */

import type { AuditProfile } from "./profile";

export interface ExpectedRouteGroup {
  /** Unique key used in rule IDs and tests. */
  key: string;
  /** Human-readable label shown in findings. */
  label: string;
  /** URL path aliases — at least one must match for the page to be considered found. */
  aliases: string[];
  /** Returns true when this route should be checked for the given profile. */
  requiredWhen: (profile: AuditProfile) => boolean;
}

/**
 * LP-specific expected routes.
 * Order matters: routes listed first are scanned first.
 */
export const LP_EXPECTED_ROUTES: ExpectedRouteGroup[] = [
  // ── Always scanned ───────────────────────────────────────────────────────────
  {
    key: "home-search",
    label: "Home Search / MLS Listings",
    aliases: ["/home-search"],
    requiredWhen: () => true,
  },

  // ── Property pages (based on propertyPageMode) ────────────────────────────
  {
    key: "properties-portfolio",
    label: "Portfolio / Combined Property Page",
    aliases: ["/properties"],
    requiredWhen: (p) => p.propertyPageMode === "portfolio",
  },
  {
    key: "properties-for-sale",
    label: "Properties For Sale",
    aliases: ["/properties/sale"],
    requiredWhen: (p) => p.propertyPageMode === "separate-sale-sold",
  },
  {
    key: "properties-sold",
    label: "Properties Sold",
    aliases: ["/properties/sold"],
    requiredWhen: (p) => p.propertyPageMode === "separate-sale-sold",
  },

  // ── Agent-site specific ───────────────────────────────────────────────────
  {
    key: "about-agent",
    label: "About / Agent Bio",
    aliases: ["/about", "/about-me", "/bio"],
    requiredWhen: (p) => p.siteType === "agent",
  },

  // ── Team-site specific ────────────────────────────────────────────────────
  {
    key: "team-page",
    label: "Team Page",
    aliases: ["/team", "/our-team", "/meet-the-team"],
    requiredWhen: (p) => p.siteType === "team",
  },

  // ── Additional pages (only when selected in the form) ─────────────────────
  {
    key: "vlog",
    label: "Videos / Vlog",
    aliases: ["/vlog"],
    requiredWhen: (p) => p.additionalPages.includes("Videos"),
  },
  {
    key: "blog",
    label: "Blog",
    aliases: ["/blog"],
    requiredWhen: (p) => p.additionalPages.includes("Blog"),
  },
  {
    key: "buyers",
    label: "Buyers Guide",
    aliases: ["/buyers", "/buyers-guide"],
    requiredWhen: (p) => p.additionalPages.includes("Buyers"),
  },
  {
    key: "sellers",
    label: "Sellers Guide",
    aliases: ["/sellers", "/sellers-guide"],
    requiredWhen: (p) => p.additionalPages.includes("Sellers"),
  },
  {
    key: "mortgage",
    label: "Mortgage Calculator",
    aliases: ["/mortgage-calculator"],
    requiredWhen: (p) => p.additionalPages.includes("Mortgage"),
  },
  {
    key: "press",
    label: "Press / Media",
    aliases: ["/press", "/press-and-media"],
    requiredWhen: (p) => p.additionalPages.includes("Press"),
  },
  {
    key: "home-valuation",
    label: "Home Valuation",
    aliases: ["/home-valuation"],
    requiredWhen: (p) => p.additionalPages.includes("Home Valuation"),
  },
  {
    key: "testimonials",
    label: "Testimonials / Reviews",
    aliases: ["/testimonials"],
    requiredWhen: (p) => p.additionalPages.includes("Testimonials"),
  },
  {
    key: "neighborhoods",
    label: "Neighborhoods",
    aliases: ["/neighborhoods"],
    requiredWhen: (p) => p.additionalPages.includes("Neighborhoods"),
  },
  {
    key: "contact",
    label: "Contact",
    aliases: ["/contact", "/contact-us"],
    requiredWhen: (p) => p.additionalPages.includes("Contact"),
  },
  {
    key: "developments",
    label: "Developments / New Development",
    aliases: ["/developments", "/new-development"],
    requiredWhen: (p) => p.additionalPages.includes("Developments"),
  },
];

/**
 * Returns all URL paths to attempt scanning for a given profile.
 * Alias groups are flattened — the scanner will try each alias
 * and the rules will check if ANY alias returned 200.
 */
export function getExpectedRouteUrls(profile: AuditProfile, origin: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const route of LP_EXPECTED_ROUTES) {
    if (route.requiredWhen(profile)) {
      for (const alias of route.aliases) {
        const url = `${origin}${alias}`;
        if (!seen.has(url)) {
          seen.add(url);
          urls.push(url);
        }
      }
    }
  }
  return urls;
}

/**
 * Returns only the route groups applicable to this profile.
 * Used by context rules to build findings.
 */
export function getApplicableRouteGroups(profile: AuditProfile): ExpectedRouteGroup[] {
  return LP_EXPECTED_ROUTES.filter((r) => r.requiredWhen(profile));
}

/**
 * Checks if any of the given alias paths exist in a list of scanned pages.
 * Returns the matched URL, or undefined if none matched.
 */
export function findMatchingAlias(
  aliases: string[],
  scannedPages: { url: string; statusCode: number; error?: string }[]
): string | undefined {
  for (const alias of aliases) {
    const match = scannedPages.find(
      (p) =>
        p.url.toLowerCase().includes(alias.toLowerCase()) &&
        !p.error &&
        p.statusCode >= 200 &&
        p.statusCode < 400
    );
    if (match) return match.url;
  }
  return undefined;
}
