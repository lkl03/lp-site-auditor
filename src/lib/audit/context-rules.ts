/**
 * Context-aware rules that are activated based on AuditProfile fields.
 * These rules only run when the user has selected the relevant context.
 */
import type { AuditRule, AuditContext, Finding, AuditCategory } from "./types";
import { SCORE_IMPACTS } from "./rubric";
import { effectiveBrokerageName, effectiveMlsName } from "./profile";
import { getApplicableComplianceRules } from "../compliance/compliance-rules";
import { findMatchingAlias } from "./expected-routes";

// ── Helpers ───────────────────────────────────────────────────────────────────
function allPages(ctx: AuditContext) {
  return ctx.pages.filter((p) => !p.error && p.statusCode >= 200 && p.statusCode < 400);
}

function makeFinding(partial: Omit<Finding, "scoreImpact">): Finding {
  const impact =
    partial.status === "fail" || partial.status === "warning"
      ? SCORE_IMPACTS[partial.severity] ?? 0
      : 0;
  return { ...partial, scoreImpact: impact };
}

function pageTextAll(ctx: AuditContext): string {
  return ctx.pages.map((p) => p.textSample.toLowerCase()).join(" ");
}

/**
 * Check if any of the given URL aliases were successfully scanned.
 * Returns the matched URL, or undefined.
 */
function hasPageWithAliases(
  ctx: AuditContext,
  aliases: string[]
): { found: boolean; url?: string } {
  const url = findMatchingAlias(aliases, ctx.pages);
  return { found: !!url, url };
}

// ── Client Name Visibility ────────────────────────────────────────────────────
export function getClientNameRule(clientName: string): AuditRule {
  return {
    id: "client-name-visible",
    category: "Client Requests",
    title: "Client name visible on site",
    severity: "CRITICAL",
    evaluate(ctx) {
      const lower = clientName.toLowerCase();
      const parts = lower.trim().split(/\s+/);
      const allText = pageTextAll(ctx);
      const found = parts.some((part) => part.length > 2 && allText.includes(part));
      return [
        makeFinding({
          id: "client-name-visible",
          category: "Client Requests",
          title: "Client name visible on site",
          severity: "CRITICAL",
          status: found ? "pass" : "fail",
          evidence: found
            ? [`Client name "${clientName}" (or partial match) found in scanned content`]
            : [`Client name "${clientName}" was NOT detected in any scanned page`],
          recommendation: found
            ? ""
            : `The client name "${clientName}" does not appear on any scanned page. Add it to the homepage headline, About page, footer, and page titles.`,
          contextTriggered: true,
          contextLabel: "Client context check",
        }),
      ];
    },
  };
}

// ── Agent Site Rules ──────────────────────────────────────────────────────────
// Only activated when siteType = "agent"
export const agentSiteRules: AuditRule[] = [
  {
    id: "agent-about-page",
    category: "About / Agent / Team",
    title: "Agent about/bio page exists",
    severity: "CRITICAL",
    evaluate(ctx) {
      const r = hasPageWithAliases(ctx, ["/about", "/about-me", "/bio", "/agent"]);
      return [
        makeFinding({
          id: "agent-about-page",
          category: "About / Agent / Team",
          title: "Agent about/bio page exists",
          severity: "CRITICAL",
          status: r.found ? "pass" : "fail",
          evidence: r.found
            ? [`About/bio page found: ${r.url}`]
            : ["No about, bio, or agent page found in scanned URLs"],
          recommendation: r.found
            ? ""
            : "Build the About/Bio page. It should include the agent's name, headshot, bio, credentials, and contact info.",
          contextTriggered: true,
          contextLabel: "Agent-site check",
          pageUrl: r.url,
        }),
      ];
    },
  },
  {
    id: "agent-headshot-likely",
    category: "About / Agent / Team",
    title: "Agent headshot/photo present",
    severity: "HUMAN_REVIEW",
    evaluate() {
      return [
        makeFinding({
          id: "agent-headshot-likely",
          category: "About / Agent / Team",
          title: "Agent headshot/photo present",
          severity: "HUMAN_REVIEW",
          status: "needs_review",
          evidence: ["Headshot presence and quality cannot be verified automatically"],
          recommendation:
            "Verify a professional headshot of the agent appears on the About page and homepage. Check crop on desktop and mobile — the subject should not be cut off.",
          contextTriggered: true,
          contextLabel: "Agent-site check",
        }),
      ];
    },
  },
  {
    id: "agent-bio-content",
    category: "About / Agent / Team",
    title: "Agent bio content present and personalized",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      const aboutPage = ctx.pages.find(
        (p) => p.url.toLowerCase().includes("/about") || p.url.toLowerCase().includes("/bio")
      );
      return [
        makeFinding({
          id: "agent-bio-content",
          category: "About / Agent / Team",
          title: "Agent bio content present and personalized",
          severity: "HUMAN_REVIEW",
          status: "needs_review",
          evidence: aboutPage
            ? [`About page found at ${aboutPage.url} — verify content is personalized`]
            : ["No about page detected — verify bio content exists and is not placeholder"],
          recommendation:
            "Verify the agent bio is: (1) personalized, not generic, (2) includes credentials and specialties, (3) written consistently in first or third person, (4) free of Lorem Ipsum or template placeholders.",
          contextTriggered: true,
          contextLabel: "Agent-site check",
        }),
      ];
    },
  },
  {
    id: "agent-contact-form",
    category: "Forms & Lead Routing",
    title: "Agent contact form or CTA present",
    severity: "REQUIRED",
    evaluate(ctx) {
      const hasForms = allPages(ctx).some((p) => p.forms.length > 0);
      const hasCTA = allPages(ctx).some((p) => p.hasCTA);
      return [
        makeFinding({
          id: "agent-contact-form",
          category: "Forms & Lead Routing",
          title: "Contact form or CTA present",
          severity: "REQUIRED",
          status: hasForms || hasCTA ? "pass" : "fail",
          evidence: hasForms
            ? ["Contact form detected on one or more pages"]
            : hasCTA
            ? ["CTA element detected — verify it links to a contact form or overlay"]
            : ["No contact form or CTA detected on scanned pages"],
          recommendation:
            hasForms || hasCTA
              ? ""
              : "Add a contact form or clear CTA to the homepage, About page, and Contact page. Every agent site needs a clear contact path.",
          contextTriggered: true,
          contextLabel: "Agent-site check",
        }),
      ];
    },
  },
  {
    id: "agent-featured-properties",
    category: "Property Pages",
    title: "Property/listing section detectable on homepage",
    severity: "REQUIRED",
    evaluate(ctx) {
      const root = allPages(ctx)[0];
      if (!root) return [];
      const allText = root.textSample.toLowerCase();
      const hasPropertyContent =
        allText.includes("propert") ||
        allText.includes("listing") ||
        allText.includes("for sale") ||
        allText.includes("sold") ||
        allText.includes("portfolio") ||
        root.hasCTA;
      return [
        makeFinding({
          id: "agent-featured-properties",
          category: "Property Pages",
          title: "Property/listing section detectable on homepage",
          severity: "REQUIRED",
          status: hasPropertyContent ? "pass" : "warning",
          evidence: hasPropertyContent
            ? ["Property-related content detected on homepage"]
            : [
                "No property/listing keywords detected on homepage — section may be JS-rendered or missing",
              ],
          recommendation: hasPropertyContent
            ? ""
            : "Ensure the homepage includes a featured listings or portfolio section. This is a core conversion element for agent sites.",
          contextTriggered: true,
          contextLabel: "Agent-site check",
          pageUrl: root.url,
        }),
      ];
    },
  },
];

// ── Team Site Rules ───────────────────────────────────────────────────────────
// Only activated when siteType = "team"
export const teamSiteRules: AuditRule[] = [
  {
    id: "team-page-exists",
    category: "About / Agent / Team",
    title: "Team page exists",
    severity: "CRITICAL",
    evaluate(ctx) {
      const r = hasPageWithAliases(ctx, ["/team", "/our-team", "/meet-the-team", "/about", "/agents"]);
      return [
        makeFinding({
          id: "team-page-exists",
          category: "About / Agent / Team",
          title: "Team page exists",
          severity: "CRITICAL",
          status: r.found ? "pass" : "fail",
          evidence: r.found
            ? [`Team/about page found: ${r.url}`]
            : ["No team, about, or agents page found in scanned URLs"],
          recommendation: r.found
            ? ""
            : "Build a team page listing all agents with bios, headshots, and contact info. Link it from the main navigation.",
          contextTriggered: true,
          contextLabel: "Team-site check",
          pageUrl: r.url,
        }),
      ];
    },
  },
  {
    id: "team-members-content",
    category: "About / Agent / Team",
    title: "Team member content detectable",
    severity: "REQUIRED",
    evaluate(ctx) {
      const allText = pageTextAll(ctx);
      const teamKeywords = [
        "team", "agents", "associates", "our team", "meet the team", "team members",
      ];
      const found = teamKeywords.some((kw) => allText.includes(kw));
      return [
        makeFinding({
          id: "team-members-content",
          category: "About / Agent / Team",
          title: "Team member content detectable",
          severity: "REQUIRED",
          status: found ? "pass" : "warning",
          evidence: found
            ? ["Team-related content keywords detected"]
            : [
                "Team member keywords not detected — content may be JS-rendered or missing",
              ],
          recommendation: found
            ? ""
            : "Ensure the team page lists all agents with bios, headshots, and individual contact info.",
          contextTriggered: true,
          contextLabel: "Team-site check",
        }),
      ];
    },
  },
  {
    id: "team-nav-link",
    category: "Navigation & Links",
    title: "Team/About page linked in navigation",
    severity: "REQUIRED",
    evaluate(ctx) {
      const root = allPages(ctx)[0];
      if (!root) return [];
      const navLinks = root.links.map((l) => l.toLowerCase());
      const hasTeamLink = navLinks.some(
        (l) =>
          l.includes("/team") ||
          l.includes("/about") ||
          l.includes("/agents") ||
          l.includes("/meet")
      );
      return [
        makeFinding({
          id: "team-nav-link",
          category: "Navigation & Links",
          title: "Team/About page linked in navigation",
          severity: "REQUIRED",
          status: hasTeamLink ? "pass" : "warning",
          evidence: hasTeamLink
            ? ["Team/About link found in navigation"]
            : ["No team/about/agents link detected in homepage nav — may be JS-rendered"],
          recommendation: hasTeamLink
            ? ""
            : "Ensure the Team or About page is accessible from the main navigation.",
          contextTriggered: true,
          contextLabel: "Team-site check",
          pageUrl: root.url,
        }),
      ];
    },
  },
  {
    id: "team-headshots-human-review",
    category: "About / Agent / Team",
    title: "All team member headshots present",
    severity: "HUMAN_REVIEW",
    evaluate() {
      return [
        makeFinding({
          id: "team-headshots-human-review",
          category: "About / Agent / Team",
          title: "All team member headshots present",
          severity: "HUMAN_REVIEW",
          status: "needs_review",
          evidence: ["Headshot completeness cannot be verified automatically"],
          recommendation:
            "Verify every listed team member has a professional headshot. Check crop on desktop and mobile. Missing or cropped headshots are a common QA passback reason.",
          contextTriggered: true,
          contextLabel: "Team-site check",
        }),
      ];
    },
  },
  {
    id: "team-contact-form",
    category: "Forms & Lead Routing",
    title: "Team contact form or CTA present",
    severity: "REQUIRED",
    evaluate(ctx) {
      const hasForms = allPages(ctx).some((p) => p.forms.length > 0);
      const hasCTA = allPages(ctx).some((p) => p.hasCTA);
      return [
        makeFinding({
          id: "team-contact-form",
          category: "Forms & Lead Routing",
          title: "Contact form or CTA present",
          severity: "REQUIRED",
          status: hasForms || hasCTA ? "pass" : "fail",
          evidence: hasForms
            ? ["Contact form detected on one or more pages"]
            : hasCTA
            ? ["CTA element detected — verify it links to a contact form or overlay"]
            : ["No contact form or CTA detected on scanned pages"],
          recommendation:
            hasForms || hasCTA
              ? ""
              : "Add a contact form or clear CTA. Team sites must have a clear contact path for each agent and the team overall.",
          contextTriggered: true,
          contextLabel: "Team-site check",
        }),
      ];
    },
  },
];

// ── Property Page Rules ───────────────────────────────────────────────────────
export function getPropertyPageRules(
  mode: "portfolio" | "separate-sale-sold"
): AuditRule[] {
  if (mode === "portfolio") {
    return [
      {
        id: "portfolio-page-exists",
        category: "Property Pages",
        title: "Portfolio / combined property page exists",
        severity: "CRITICAL",
        evaluate(ctx) {
          // LP portfolio page lives at /properties
          const r = hasPageWithAliases(ctx, ["/properties"]);
          return [
            makeFinding({
              id: "portfolio-page-exists",
              category: "Property Pages",
              title: "Portfolio / combined property page exists",
              severity: "CRITICAL",
              status: r.found ? "pass" : "fail",
              evidence: r.found
                ? [`Portfolio page found: ${r.url}`]
                : ["No /properties page found — was not built or returned 404"],
              recommendation: r.found
                ? ""
                : "Build the /properties page showing both active and sold listings (portfolio mode).",
              contextTriggered: true,
              contextLabel: "Portfolio mode check",
              pageUrl: r.url,
            }),
          ];
        },
      },
      {
        id: "portfolio-nav-link",
        category: "Navigation & Links",
        title: "Properties linked in navigation",
        severity: "REQUIRED",
        evaluate(ctx) {
          const root = allPages(ctx)[0];
          if (!root) return [];
          const navLinks = root.links.map((l) => l.toLowerCase());
          const hasLink = navLinks.some(
            (l) =>
              l.includes("/properties") ||
              l.includes("/portfolio") ||
              l.includes("/listings")
          );
          return [
            makeFinding({
              id: "portfolio-nav-link",
              category: "Navigation & Links",
              title: "Properties page linked in navigation",
              severity: "REQUIRED",
              status: hasLink ? "pass" : "warning",
              evidence: hasLink
                ? ["Properties/portfolio link found in navigation"]
                : ["No properties/portfolio link detected in nav — may be JS-rendered"],
              recommendation: hasLink
                ? ""
                : "Add the /properties page to the main navigation.",
              contextTriggered: true,
              contextLabel: "Portfolio mode check",
              pageUrl: root.url,
            }),
          ];
        },
      },
      {
        id: "portfolio-spacing-human-review",
        category: "Property Pages",
        title: "Portfolio layout review",
        severity: "HUMAN_REVIEW",
        evaluate() {
          return [
            makeFinding({
              id: "portfolio-spacing-human-review",
              category: "Property Pages",
              title: "Portfolio card spacing and layout review",
              severity: "HUMAN_REVIEW",
              status: "needs_review",
              evidence: ["Visual layout cannot be verified automatically"],
              recommendation:
                "Verify: (1) Property cards have correct 96px spacing. (2) Card overlay text is readable on all image types. (3) Property images are correctly cropped. (4) 'View Property' buttons link correctly. (5) Check on mobile.",
              contextTriggered: true,
              contextLabel: "Portfolio mode check",
            }),
          ];
        },
      },
    ];
  }

  // Separate sale/sold pages — LP routes: /properties/sale and /properties/sold
  return [
    {
      id: "properties-for-sale-page",
      category: "Property Pages",
      title: "For sale / featured properties page exists",
      severity: "CRITICAL",
      evaluate(ctx) {
        const r = hasPageWithAliases(ctx, ["/properties/sale", "/properties", "/for-sale"]);
        return [
          makeFinding({
            id: "properties-for-sale-page",
            category: "Property Pages",
            title: "For sale / featured properties page exists",
            severity: "CRITICAL",
            status: r.found ? "pass" : "fail",
            evidence: r.found
              ? [`For sale page found: ${r.url}`]
              : [
                  "No /properties/sale or for-sale page found — check that the page was built and is not returning 404",
                ],
            recommendation: r.found
              ? ""
              : "Build the /properties/sale page showing active listings.",
            contextTriggered: true,
            contextLabel: "Separate pages mode check",
            pageUrl: r.url,
          }),
        ];
      },
    },
    {
      id: "sold-past-transactions-page",
      category: "Property Pages",
      title: "Sold / past transactions page exists",
      severity: "CRITICAL",
      evaluate(ctx) {
        const r = hasPageWithAliases(ctx, ["/properties/sold", "/sold", "/past-transactions"]);
        return [
          makeFinding({
            id: "sold-past-transactions-page",
            category: "Property Pages",
            title: "Sold / past transactions page exists",
            severity: "CRITICAL",
            status: r.found ? "pass" : "fail",
            evidence: r.found
              ? [`Sold page found: ${r.url}`]
              : [
                  "No /properties/sold or sold page found — check that the page was built and is not returning 404",
                ],
            recommendation: r.found
              ? ""
              : "Build the /properties/sold page showing past transactions.",
            contextTriggered: true,
            contextLabel: "Separate pages mode check",
            pageUrl: r.url,
          }),
        ];
      },
    },
    {
      id: "both-property-pages-in-nav",
      category: "Navigation & Links",
      title: "Both For Sale and Sold pages linked in navigation",
      severity: "REQUIRED",
      evaluate(ctx) {
        const root = allPages(ctx)[0];
        if (!root) return [];
        const navLinks = root.links.map((l) => l.toLowerCase());
        const hasSale = navLinks.some(
          (l) =>
            l.includes("/properties/sale") ||
            l.includes("/properties") ||
            l.includes("/for-sale") ||
            l.includes("/listings")
        );
        const hasSold = navLinks.some(
          (l) =>
            l.includes("/properties/sold") ||
            l.includes("/sold") ||
            l.includes("/past-transactions")
        );
        const status = hasSale && hasSold ? "pass" : hasSale || hasSold ? "warning" : "fail";
        return [
          makeFinding({
            id: "both-property-pages-in-nav",
            category: "Navigation & Links",
            title: "Both For Sale and Sold pages in navigation",
            severity: "REQUIRED",
            status,
            evidence: [
              hasSale ? "✓ For Sale/Properties nav link detected" : "✗ No For Sale/Properties nav link detected",
              hasSold ? "✓ Sold/Past Transactions nav link detected" : "✗ No Sold/Past Transactions nav link detected",
            ],
            recommendation:
              status === "pass"
                ? ""
                : "Add both the For Sale/Properties and Sold/Past Transactions pages to the main navigation.",
            contextTriggered: true,
            contextLabel: "Separate pages mode check",
            pageUrl: root.url,
          }),
        ];
      },
    },
    {
      id: "sold-page-sort-human-review",
      category: "Property Pages",
      title: "Sold page sorted correctly",
      severity: "HUMAN_REVIEW",
      evaluate() {
        return [
          makeFinding({
            id: "sold-page-sort-human-review",
            category: "Property Pages",
            title: "Sold page sorted descending by price",
            severity: "HUMAN_REVIEW",
            status: "needs_review",
            evidence: ["Sort order cannot be verified automatically"],
            recommendation:
              "Verify the Sold/Past Transactions page is sorted by price descending (highest first). This is the LP standard and a common QA passback.",
            contextTriggered: true,
            contextLabel: "Separate pages mode check",
          }),
        ];
      },
    },
  ];
}

// ── Additional Page Rules ─────────────────────────────────────────────────────
export function getAdditionalPageRules(selectedPages: string[]): AuditRule[] {
  const rules: AuditRule[] = [];

  // LP-specific route config per page type
  const pageConfigs: Record<
    string,
    {
      aliases: string[];
      category: AuditCategory;
      severity: "CRITICAL" | "REQUIRED";
      humanReviewNote: string;
    }
  > = {
    Buyers: {
      aliases: ["/buyers", "/buyers-guide"],
      category: "Buyers & Sellers Guide",
      severity: "CRITICAL",
      humanReviewNote:
        "Verify the Buyers page has relevant content (home search CTA, pre-approval info, buyer guide steps) and no placeholder text.",
    },
    Sellers: {
      aliases: ["/sellers", "/sellers-guide"],
      category: "Buyers & Sellers Guide",
      severity: "CRITICAL",
      humanReviewNote:
        "Verify the Sellers page links to a home valuation CTA and has relevant seller-focused content.",
    },
    Mortgage: {
      aliases: ["/mortgage-calculator"],
      category: "Buyers & Sellers Guide",
      severity: "REQUIRED",
      humanReviewNote:
        "Verify the mortgage calculator is functional. Check that lender partner links are correct.",
    },
    "Home Valuation": {
      aliases: ["/home-valuation"],
      category: "Buyers & Sellers Guide",
      severity: "CRITICAL",
      humanReviewNote:
        "Verify the home valuation CTA/button is functional and links correctly to the valuation tool.",
    },
    Neighborhoods: {
      aliases: ["/neighborhoods"],
      category: "Neighborhood Pages",
      severity: "CRITICAL",
      humanReviewNote:
        "Verify neighborhood pages have content relevant to the client's market. Each neighborhood page should have a title, description, and relevant imagery.",
    },
    Testimonials: {
      aliases: ["/testimonials"],
      category: "Client Requests",
      severity: "REQUIRED",
      humanReviewNote:
        "Verify testimonials are real, attributed to clients, and not placeholder or lorem ipsum text.",
    },
    Blog: {
      aliases: ["/blog"],
      category: "Blog / Press / Development",
      severity: "REQUIRED",
      humanReviewNote:
        "Verify blog posts exist and are not placeholder content. Check that post dates are current.",
    },
    Press: {
      aliases: ["/press", "/press-and-media"],
      category: "Blog / Press / Development",
      severity: "REQUIRED",
      humanReviewNote:
        "Verify press/media mentions are real. Check that all external links are functional.",
    },
    Developments: {
      aliases: ["/developments", "/new-development"],
      category: "Blog / Press / Development",
      severity: "REQUIRED",
      humanReviewNote:
        "Verify development pages have correct project details, status, and images.",
    },
    Videos: {
      aliases: ["/vlog"],
      category: "Blog / Press / Development",
      severity: "REQUIRED",
      humanReviewNote:
        "Verify video embeds use only YouTube or Vimeo. No other video providers are permitted. Check embeds load correctly.",
    },
    Contact: {
      aliases: ["/contact", "/contact-us"],
      category: "Forms & Lead Routing",
      severity: "CRITICAL",
      humanReviewNote:
        "Verify the contact page has a working form with correct field labels. Submit a test lead to confirm delivery.",
    },
  };

  for (const page of selectedPages) {
    if (page === "Other") continue;
    const cfg = pageConfigs[page];
    if (!cfg) continue;

    // Page existence rule
    rules.push({
      id: `additional-page-${page.toLowerCase().replace(/\s+/g, "-")}`,
      category: cfg.category,
      title: `${page} page exists`,
      severity: cfg.severity,
      evaluate(ctx) {
        const r = hasPageWithAliases(ctx, cfg.aliases);
        return [
          makeFinding({
            id: `additional-page-${page.toLowerCase().replace(/\s+/g, "-")}`,
            category: cfg.category,
            title: `${page} page exists`,
            severity: cfg.severity,
            status: r.found ? "pass" : "fail",
            evidence: r.found
              ? [`${page} page found: ${r.url}`]
              : [
                  `No ${page} page found — expected one of: ${cfg.aliases.join(", ")}`,
                  "Either the page was not built or it returned 404",
                ],
            recommendation: r.found
              ? ""
              : `Build the ${page} page. It was marked as required in the site setup. Expected URL: ${cfg.aliases[0]}`,
            contextTriggered: true,
            contextLabel: "Selected page check",
            pageUrl: r.url,
          }),
        ];
      },
    });

    // Quality human review for every additional page
    rules.push({
      id: `additional-page-${page.toLowerCase().replace(/\s+/g, "-")}-quality`,
      category: cfg.category,
      title: `${page} page quality check`,
      severity: "HUMAN_REVIEW",
      evaluate() {
        return [
          makeFinding({
            id: `additional-page-${page.toLowerCase().replace(/\s+/g, "-")}-quality`,
            category: cfg.category,
            title: `${page} page — content quality review`,
            severity: "HUMAN_REVIEW",
            status: "needs_review",
            evidence: [`${page} page was selected as a required page — visual verification needed`],
            recommendation: cfg.humanReviewNote,
            contextTriggered: true,
            contextLabel: "Selected page check",
          }),
        ];
      },
    });

    // Videos: extra embed source check
    if (page === "Videos") {
      rules.push({
        id: "videos-embed-source",
        category: "Blog / Press / Development",
        title: "Video embeds use approved sources",
        severity: "REQUIRED",
        evaluate(ctx) {
          const videoPages = ctx.pages.filter((p) => p.hasVideo);
          if (videoPages.length === 0) {
            return [
              makeFinding({
                id: "videos-embed-source",
                category: "Blog / Press / Development",
                title: "Video embeds detectable",
                severity: "REQUIRED",
                status: "warning",
                evidence: ["No video embeds detected — Videos page was selected"],
                recommendation:
                  "Add video content using YouTube or Vimeo embeds only. The /vlog page should have at least one visible video.",
                contextTriggered: true,
                contextLabel: "Videos page check",
              }),
            ];
          }
          return [
            makeFinding({
              id: "videos-embed-source",
              category: "Blog / Press / Development",
              title: "Video embeds detected",
              severity: "REQUIRED",
              status: "pass",
              evidence: [`${videoPages.length} page(s) with video content detected`],
              recommendation:
                "Verify all video embeds use YouTube or Vimeo. No other providers are permitted.",
              contextTriggered: true,
              contextLabel: "Videos page check",
            }),
          ];
        },
      });
    }
  }

  return rules;
}

// ── Brokerage-Specific Rules ──────────────────────────────────────────────────
export function getBrokerageRules(brokerage: string, otherName?: string): AuditRule[] {
  const brokerageName =
    brokerage === "Other" ? (otherName ?? "your brokerage") : brokerage;
  const rules: AuditRule[] = [];

  // Universal: brokerage name detectable
  rules.push({
    id: "brokerage-name-present",
    category: "Brokerage Pages",
    title: `Brokerage name (${brokerageName}) present on site`,
    severity: "REQUIRED",
    evaluate(ctx) {
      const lowerName = brokerageName.toLowerCase();
      const allText = pageTextAll(ctx);
      const nameParts = lowerName.split(/\s+/);
      const found =
        nameParts.length >= 2
          ? nameParts.slice(0, 2).every((p) => allText.includes(p))
          : allText.includes(lowerName);
      return [
        makeFinding({
          id: "brokerage-name-present",
          category: "Brokerage Pages",
          title: `Brokerage name "${brokerageName}" detected on site`,
          severity: "REQUIRED",
          status: found ? "pass" : "warning",
          evidence: found
            ? [`Brokerage name "${brokerageName}" detected in page content`]
            : [
                `Brokerage name "${brokerageName}" not detected — may be in footer image or JS-rendered`,
              ],
          recommendation: found
            ? ""
            : `Ensure the brokerage name "${brokerageName}" appears as visible text in the footer or on agent profile pages.`,
          contextTriggered: true,
          contextLabel: "Brokerage check",
        }),
      ];
    },
  });

  // Brokerage-specific rules
  switch (brokerage) {
    case "Compass":
      rules.push({
        id: "compass-placeholder-scan",
        category: "Brokerage Pages",
        title: "No Compass placeholder text remaining",
        severity: "REQUIRED",
        evaluate(ctx) {
          const allText = pageTextAll(ctx);
          const hasPlaceholder = ["client name", "[client", "{{client", "your name here"].some(
            (t) => allText.includes(t)
          );
          return [
            makeFinding({
              id: "compass-placeholder-scan",
              category: "Brokerage Pages",
              title: "No Compass placeholder text",
              severity: "REQUIRED",
              status: hasPlaceholder ? "fail" : "pass",
              evidence: hasPlaceholder
                ? ["Placeholder text detected — unreplaced template content found"]
                : ["No obvious placeholder text detected in page content"],
              recommendation: hasPlaceholder
                ? "Remove all unreplaced placeholder text. Search for 'Client Name', '[Client', or '{{' patterns throughout the site."
                : "",
              contextTriggered: true,
              contextLabel: "Compass check",
            }),
          ];
        },
      });
      break;

    case "Sotheby's International Realty":
      rules.push({
        id: "sothebys-independently-owned",
        category: "Compliance",
        title: "SIR 'independently owned and operated' disclaimer",
        severity: "REQUIRED",
        evaluate(ctx) {
          const allText = pageTextAll(ctx);
          const found =
            allText.includes("independently owned") ||
            allText.includes("independently operated");
          return [
            makeFinding({
              id: "sothebys-independently-owned",
              category: "Compliance",
              title: "SIR 'independently owned and operated' disclaimer",
              severity: "REQUIRED",
              status: found ? "pass" : "fail",
              evidence: found
                ? ["SIR disclaimer detected in page content"]
                : [
                    "Required SIR disclaimer 'independently owned and operated' not detected",
                  ],
              recommendation: found
                ? ""
                : "Add 'Each office is independently owned and operated.' to the site footer. This is required by Sotheby's International Realty.",
              contextTriggered: true,
              contextLabel: "Sotheby's check",
            }),
          ];
        },
      });
      break;
  }

  // Human review for all brokerages
  rules.push({
    id: "brokerage-compliance-review",
    category: "Compliance",
    title: `${brokerageName} compliance review`,
    severity: "HUMAN_REVIEW",
    evaluate() {
      const brokerageSpecific: Record<string, string> = {
        Compass:
          "Check: Compass logo lockup, Quincey/Circular font requirements, approved color palette (#000/#FFF), and no unauthorized brand variations.",
        "Sotheby's International Realty":
          "Check: SIR navy (#002349), correct logo with 'International Realty' text, required footer text, gallery and button styles.",
        "Coldwell Banker":
          "Check: CB logo lockup rules, 'Coldwell Banker' not abbreviated as 'CB Realty', required footer disclaimers.",
        "Douglas Elliman":
          "Check: Elliman logo usage, required footer disclaimers, brand color compliance.",
        "eXp Realty":
          "Check: eXp logo usage, color requirements, required footer text.",
        "SERHANT.":
          "Check: SERHANT. brand guidelines — note the period at end of name — logo usage and color requirements.",
        "The Agency":
          "Check: The Agency red/black branding, logo usage, required footer elements.",
        Corcoran:
          "Check: Corcoran logo, brand colors, required footer text and disclaimers.",
        "Keller Williams":
          "Check: KW logo lockup, brand guidelines, required footer text.",
        "Berkshire Hathaway HomeServices":
          "Check: BHHS shield symbol, 'Good to Know®' trademark, required footer disclaimers.",
      };
      const guide =
        brokerageSpecific[brokerage] ??
        `Verify ${brokerageName} brand guidelines: logo, colors, fonts, and required footer text are all compliant.`;
      return [
        makeFinding({
          id: "brokerage-compliance-review",
          category: "Compliance",
          title: `${brokerageName} compliance human review`,
          severity: "HUMAN_REVIEW",
          status: "needs_review",
          evidence: [`Brokerage: ${brokerageName}`],
          recommendation: `${guide} Refer to the LP Launch Bible and Coda compliance docs for ${brokerageName} requirements.`,
          contextTriggered: true,
          contextLabel: "Brokerage compliance",
        }),
      ];
    },
  });

  return rules;
}

// ── State/MLS Compliance Rules ────────────────────────────────────────────────
export function getStateMlsRules(
  stateOrRegion: string,
  mls: string,
  mlsOtherName?: string
): AuditRule[] {
  const mlsName = mls === "Other" ? (mlsOtherName ?? "your MLS") : mls;
  const rules: AuditRule[] = [];

  const complianceRules = getApplicableComplianceRules({
    stateOrRegion,
    brokerage: "",
    siteType: "agent",
  }).filter((r) => {
    const hasBrokerageFilter = r.scope.brokerages && r.scope.brokerages.length > 0;
    return !hasBrokerageFilter;
  });

  for (const compRule of complianceRules) {
    rules.push({
      id: `compliance-${compRule.id}`,
      category: "Compliance",
      title: compRule.title,
      severity:
        compRule.severity === "critical"
          ? "CRITICAL"
          : compRule.severity === "required"
          ? "REQUIRED"
          : compRule.severity === "verify"
          ? "VERIFY"
          : "HUMAN_REVIEW",
      evaluate(ctx) {
        if (compRule.humanReviewPrompt && !compRule.detectablePatterns?.length) {
          return [
            makeFinding({
              id: `compliance-${compRule.id}`,
              category: "Compliance",
              title: compRule.title,
              severity: "HUMAN_REVIEW",
              status: "needs_review",
              evidence: [`State/Region: ${stateOrRegion}`, compRule.description],
              recommendation: `${compRule.humanReviewPrompt}\n\n${compRule.recommendation}`,
              contextTriggered: true,
              contextLabel: "State/MLS compliance",
            }),
          ];
        }

        if (compRule.detectablePatterns?.length) {
          const allText = pageTextAll(ctx);
          const found = compRule.detectablePatterns.some((pattern) =>
            allText.includes(pattern)
          );
          const isProhibited = compRule.id === "off-market-prohibited";
          if (isProhibited) return []; // Handled by base ruleProhibitedOffMarket

          const status = found
            ? "pass"
            : compRule.severity === "required" || compRule.severity === "critical"
            ? "fail"
            : "warning";
          return [
            makeFinding({
              id: `compliance-${compRule.id}`,
              category: "Compliance",
              title: compRule.title,
              severity:
                compRule.severity === "critical"
                  ? "CRITICAL"
                  : compRule.severity === "required"
                  ? "REQUIRED"
                  : compRule.severity === "verify"
                  ? "VERIFY"
                  : "HUMAN_REVIEW",
              status,
              evidence: found
                ? [
                    `Pattern detected: "${compRule.detectablePatterns.find((p) =>
                      allText.includes(p)
                    )}"`,
                  ]
                : [
                    `Pattern not detected. State: ${stateOrRegion}. ${compRule.description}`,
                  ],
              recommendation: found
                ? compRule.humanReviewPrompt
                  ? `Auto-detected — still verify manually: ${compRule.humanReviewPrompt}`
                  : ""
                : compRule.recommendation,
              contextTriggered: true,
              contextLabel: "State/MLS compliance",
            }),
          ];
        }

        return [];
      },
    });
  }

  // MLS-specific human review
  rules.push({
    id: "mls-compliance-human-review",
    category: "Compliance",
    title: `${mlsName} compliance review`,
    severity: "HUMAN_REVIEW",
    evaluate() {
      return [
        makeFinding({
          id: "mls-compliance-human-review",
          category: "Compliance",
          title: `MLS compliance: ${mlsName}`,
          severity: "HUMAN_REVIEW",
          status: "needs_review",
          evidence: [`State/Region: ${stateOrRegion}`, `MLS: ${mlsName}`],
          recommendation: `Verify ${mlsName}-specific IDX disclaimer requirements: (1) Required disclaimer text matches MLS board rules. (2) Data copyright notice is present. (3) "Listing information last updated" date is shown where applicable. (4) Listing provider name meets MLS attribution requirements.`,
          contextTriggered: true,
          contextLabel: "MLS compliance",
        }),
      ];
    },
  });

  return rules;
}

// ── Visual/Layout QA Human Review ─────────────────────────────────────────────
/**
 * Visual QA checks that cannot be automated without a browser renderer (Playwright).
 * These are presented as human-review reminders to the Website Builder.
 *
 * NOTE: Full automated visual analysis (overflow detection, padding measurement,
 * headshot crop validation) requires Playwright rendering, which is intentionally
 * not implemented here due to Vercel serverless constraints. If browser rendering
 * is added in future, these can be promoted to automated VERIFY/REQUIRED rules.
 */
export function getVisualQaRules(siteType: "agent" | "team"): AuditRule[] {
  return [
    {
      id: "visual-headshot-crop",
      category: "About / Agent / Team",
      title: "Headshot crop review",
      severity: "HUMAN_REVIEW",
      evaluate() {
        const who = siteType === "agent" ? "agent headshot" : "team member headshots";
        return [
          makeFinding({
            id: "visual-headshot-crop",
            category: "About / Agent / Team",
            title: `Review ${siteType === "agent" ? "agent" : "team"} headshot crop`,
            severity: "HUMAN_REVIEW",
            status: "needs_review",
            evidence: ["Visual crop cannot be verified without rendering the page"],
            recommendation: `Check the ${who} on desktop (1440px) and mobile (390px). If the subject is cropped at the top or sides, reposition the image focal point in the LP backend or replace the image before QA.`,
            contextTriggered: true,
            contextLabel: "Visual QA check",
          }),
        ];
      },
    },
    {
      id: "visual-section-spacing",
      category: "Homepage",
      title: "Section spacing and padding review",
      severity: "HUMAN_REVIEW",
      evaluate() {
        return [
          makeFinding({
            id: "visual-section-spacing",
            category: "Homepage",
            title: "Review section padding and spacing consistency",
            severity: "HUMAN_REVIEW",
            status: "needs_review",
            evidence: ["Section spacing cannot be measured without rendering the page"],
            recommendation:
              "Walk through every page and check: (1) Section padding is consistent (LP standard is 80–96px vertical padding on desktop). (2) No excessive blank space above or below CTAs. (3) Content sections don't feel too cramped or too spread out. (4) Mobile padding does not make content feel tiny.",
            contextTriggered: true,
            contextLabel: "Visual QA check",
          }),
        ];
      },
    },
    {
      id: "visual-mobile-overflow",
      category: "Mobile / Responsive",
      title: "Mobile horizontal overflow check",
      severity: "HUMAN_REVIEW",
      evaluate() {
        return [
          makeFinding({
            id: "visual-mobile-overflow",
            category: "Mobile / Responsive",
            title: "Check for mobile horizontal overflow",
            severity: "HUMAN_REVIEW",
            status: "needs_review",
            evidence: [
              "Overflow cannot be detected without a browser renderer",
              "Inline fixed-width detection is available but CSS-based overflow is not",
            ],
            recommendation:
              "In Chrome DevTools mobile mode (390px width), scroll every page horizontally. If the page scrolls sideways, there is a layout overflow. Common causes: fixed-width images, un-capped absolute positioned elements, or wide tables.",
            contextTriggered: true,
            contextLabel: "Visual QA check",
          }),
        ];
      },
    },
    {
      id: "visual-cta-spacing",
      category: "Homepage",
      title: "CTA button spacing review",
      severity: "HUMAN_REVIEW",
      evaluate() {
        return [
          makeFinding({
            id: "visual-cta-spacing",
            category: "Homepage",
            title: "Review CTA button spacing",
            severity: "HUMAN_REVIEW",
            status: "needs_review",
            evidence: ["Button padding cannot be measured without rendering the page"],
            recommendation:
              "Check every CTA button on desktop and mobile: (1) Button text is not clipped or overflowing. (2) Button has adequate padding (not too cramped). (3) Spacing above and below the button is consistent with surrounding content. (4) On mobile, buttons span full width or are clearly tappable.",
            contextTriggered: true,
            contextLabel: "Visual QA check",
          }),
        ];
      },
    },
    {
      id: "visual-image-crops",
      category: "Image Quality",
      title: "Review image crops on desktop and mobile",
      severity: "HUMAN_REVIEW",
      evaluate() {
        return [
          makeFinding({
            id: "visual-image-crops",
            category: "Image Quality",
            title: "Review image crops on desktop and mobile",
            severity: "HUMAN_REVIEW",
            status: "needs_review",
            evidence: ["Image crop quality cannot be assessed from URL/HTML alone"],
            recommendation:
              "Check every hero, property card, and team/about image on desktop and mobile. Watch for: (1) Cut-off subjects in portrait photos. (2) Awkward crops on landscape shots. (3) Text overlay colliding with image subject. (4) Blurry or low-resolution images that look fine on desktop but pixelate on retina screens.",
            contextTriggered: true,
            contextLabel: "Visual QA check",
          }),
        ];
      },
    },
  ];
}

// ── Text Quality Rules ────────────────────────────────────────────────────────
export function getTextQualityRules(): AuditRule[] {
  return [
    {
      id: "text-quality-lorem-ipsum",
      category: "Final Validation",
      title: "No Lorem Ipsum placeholder text",
      severity: "CRITICAL",
      evaluate(ctx) {
        const pagesWithLorem = ctx.pages.filter((p) => p.hasLoremIpsum);
        if (pagesWithLorem.length === 0) {
          return [
            makeFinding({
              id: "text-quality-lorem-ipsum",
              category: "Final Validation",
              title: "No Lorem Ipsum placeholder text",
              severity: "CRITICAL",
              status: "pass",
              evidence: ["No 'Lorem ipsum' text detected on any scanned page"],
              recommendation: "",
            }),
          ];
        }
        return pagesWithLorem.map((p) =>
          makeFinding({
            id: "text-quality-lorem-ipsum",
            category: "Final Validation",
            title: "Lorem Ipsum placeholder text detected",
            severity: "CRITICAL",
            status: "fail",
            evidence: [`"Lorem ipsum" found on: ${p.url}`],
            recommendation:
              "Remove all Lorem Ipsum placeholder text and replace with real client content before submitting to QA.",
            pageUrl: p.url,
          })
        );
      },
    },
    {
      id: "text-quality-repeated-words",
      category: "Final Validation",
      title: "No obvious repeated words in content",
      severity: "VERIFY",
      evaluate(ctx) {
        const allRepeated = [
          ...new Set(ctx.pages.flatMap((p) => p.repeatedWords)),
        ];
        if (allRepeated.length === 0) {
          return [
            makeFinding({
              id: "text-quality-repeated-words",
              category: "Final Validation",
              title: "No obvious repeated words detected",
              severity: "VERIFY",
              status: "pass",
              evidence: ["No obvious word repetition detected in scanned content"],
              recommendation: "",
            }),
          ];
        }
        return [
          makeFinding({
            id: "text-quality-repeated-words",
            category: "Final Validation",
            title: "Potential repeated words in content",
            severity: "VERIFY",
            status: "warning",
            evidence: [
              `Possible duplicate words detected: ${allRepeated.slice(0, 5).join(", ")}`,
              "This may be a copy-paste error — verify manually",
            ],
            recommendation:
              "Review all page copy for accidental duplicate words (e.g., 'the the', 'and and'). Run text through Grammarly before QA submission.",
          }),
        ];
      },
    },
  ];
}

// ── Master Context Rule Selector ──────────────────────────────────────────────
/**
 * Given a full AuditContext, returns all context-appropriate rules.
 * BASE_RULES (from rules.ts) always run separately.
 */
export function selectContextRules(ctx: AuditContext): AuditRule[] {
  const { profile } = ctx;
  const rules: AuditRule[] = [];

  // Client name visibility — always checked
  rules.push(getClientNameRule(profile.clientName));

  // Site type specific — NEVER mix agent and team rules
  if (profile.siteType === "agent") {
    rules.push(...agentSiteRules);
  } else {
    rules.push(...teamSiteRules);
  }

  // Property page mode (based on selected setup)
  rules.push(...getPropertyPageRules(profile.propertyPageMode));

  // Additional selected pages
  rules.push(...getAdditionalPageRules(profile.additionalPages));

  // Brokerage rules
  rules.push(...getBrokerageRules(profile.brokerage, profile.brokerageOtherName));

  // State + MLS compliance
  rules.push(
    ...getStateMlsRules(profile.stateOrRegion, profile.mls, profile.mlsOtherName)
  );

  // Visual QA human review (lightweight, always included)
  rules.push(...getVisualQaRules(profile.siteType));

  // Text quality checks
  rules.push(...getTextQualityRules());

  return rules;
}
