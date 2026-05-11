/**
 * Context-aware rules that are activated based on AuditProfile fields.
 * These rules only run when the user has selected the relevant context.
 */
import type { AuditRule, AuditContext, Finding, AuditCategory } from "./types";
import { SCORE_IMPACTS } from "./rubric";
import { effectiveBrokerageName, effectiveMlsName } from "./profile";
import { getApplicableComplianceRules } from "../compliance/compliance-rules";

// ── Helper ────────────────────────────────────────────────────────────────────
function allPages(ctx: AuditContext) {
  return ctx.pages.filter((p) => !p.error && p.statusCode >= 200 && p.statusCode < 400);
}

function makeFinding(
  partial: Omit<Finding, "scoreImpact">
): Finding {
  const impact = partial.status === "fail" || partial.status === "warning"
    ? SCORE_IMPACTS[partial.severity] ?? 0
    : 0;
  return { ...partial, scoreImpact: impact };
}

function pageTextAll(ctx: AuditContext): string {
  return ctx.pages.map((p) => p.textSample.toLowerCase()).join(" ");
}

function hasPageWithPath(ctx: AuditContext, slugs: string[]): { found: boolean; url?: string } {
  const scannedUrls = ctx.pages.map((p) => p.url.toLowerCase());
  for (const slug of slugs) {
    const hit = scannedUrls.find((u) => u.includes(slug.toLowerCase()));
    if (hit) return { found: true, url: hit };
  }
  return { found: false };
}

function makeContextLabel(siteType: "agent" | "team"): string {
  return siteType === "agent" ? "Agent-site check" : "Team-site check";
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
      // Try partial match: at least the last name or first word
      const parts = lower.trim().split(/\s+/);
      const allText = pageTextAll(ctx);
      const found = parts.some((part) => part.length > 2 && allText.includes(part));
      return [makeFinding({
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
          : `Add the client name "${clientName}" to the site — homepage headline, about page, footer, and page titles should reference the agent/team name`,
        contextTriggered: true,
        contextLabel: "Client context check",
      })];
    },
  };
}

// ── Agent Site Rules ──────────────────────────────────────────────────────────
export const agentSiteRules: AuditRule[] = [
  {
    id: "agent-about-page",
    category: "About / Agent / Team",
    title: "Agent about/bio page exists",
    severity: "CRITICAL",
    evaluate(ctx) {
      const r = hasPageWithPath(ctx, ["/about", "/agent", "/bio", "/meet"]);
      return [makeFinding({
        id: "agent-about-page",
        category: "About / Agent / Team",
        title: "Agent about/bio page exists",
        severity: "CRITICAL",
        status: r.found ? "pass" : "fail",
        evidence: r.found
          ? [`About/bio page found: ${r.url}`]
          : ["No about, agent, bio, or meet-the-agent page detected in scanned URLs"],
        recommendation: r.found
          ? ""
          : "Build the About/Bio page. It should include agent name, headshot, bio, credentials, and contact info.",
        contextTriggered: true,
        contextLabel: makeContextLabel("agent"),
        pageUrl: r.url,
      })];
    },
  },
  {
    id: "agent-headshot-likely",
    category: "About / Agent / Team",
    title: "Agent headshot/photo likely present",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      return [makeFinding({
        id: "agent-headshot-likely",
        category: "About / Agent / Team",
        title: "Agent headshot/photo present",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: ["Cannot verify headshot quality or presence from URL alone"],
        recommendation: "Verify a professional headshot of the agent appears on the About page and/or homepage. Headshots must be high-resolution, non-generic, and recently uploaded.",
        contextTriggered: true,
        contextLabel: makeContextLabel("agent"),
      })];
    },
  },
  {
    id: "agent-bio-content",
    category: "About / Agent / Team",
    title: "Agent bio content present",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      const aboutPage = ctx.pages.find((p) =>
        p.url.toLowerCase().includes("/about") || p.url.toLowerCase().includes("/bio")
      );
      return [makeFinding({
        id: "agent-bio-content",
        category: "About / Agent / Team",
        title: "Agent bio content present and personalized",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: aboutPage
          ? [`About page found at ${aboutPage.url} — verify content is personalized`]
          : ["No about page detected — bio content cannot be verified"],
        recommendation: "Verify the agent bio is: (1) personalized to the client, not generic, (2) includes credentials/specialties, (3) written in first or third person consistently, (4) not a Lorem Ipsum or template placeholder.",
        contextTriggered: true,
        contextLabel: makeContextLabel("agent"),
      })];
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
      return [makeFinding({
        id: "agent-contact-form",
        category: "Forms & Lead Routing",
        title: "Agent contact form or CTA present",
        severity: "REQUIRED",
        status: hasForms || hasCTA ? "pass" : "fail",
        evidence: hasForms
          ? ["Contact form detected on one or more pages"]
          : hasCTA
          ? ["CTA element detected — verify it links to a contact form"]
          : ["No contact form or CTA detected on scanned pages"],
        recommendation: hasForms || hasCTA
          ? ""
          : "Add a contact form or clear CTA to the homepage, about page, and/or contact page. Agent sites must have a clear contact path.",
        contextTriggered: true,
        contextLabel: makeContextLabel("agent"),
      })];
    },
  },
  {
    id: "agent-featured-properties",
    category: "Property Pages",
    title: "Featured properties section present",
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
      return [makeFinding({
        id: "agent-featured-properties",
        category: "Property Pages",
        title: "Property/listing section detectable on homepage",
        severity: "REQUIRED",
        status: hasPropertyContent ? "pass" : "warning",
        evidence: hasPropertyContent
          ? ["Property-related content detected on homepage"]
          : ["No property/listing keywords detected on homepage — section may be JS-rendered"],
        recommendation: hasPropertyContent
          ? ""
          : "Ensure the homepage includes a featured listings or portfolio section. This is a core conversion element for agent sites.",
        contextTriggered: true,
        contextLabel: makeContextLabel("agent"),
        pageUrl: root.url,
      })];
    },
  },
];

// ── Team Site Rules ───────────────────────────────────────────────────────────
export const teamSiteRules: AuditRule[] = [
  {
    id: "team-page-exists",
    category: "About / Agent / Team",
    title: "Team page exists",
    severity: "CRITICAL",
    evaluate(ctx) {
      const r = hasPageWithPath(ctx, ["/team", "/about", "/our-team", "/meet-the-team", "/agents"]);
      return [makeFinding({
        id: "team-page-exists",
        category: "About / Agent / Team",
        title: "Team page exists",
        severity: "CRITICAL",
        status: r.found ? "pass" : "fail",
        evidence: r.found
          ? [`Team/about page found: ${r.url}`]
          : ["No team, about, or agents page detected in scanned URLs"],
        recommendation: r.found
          ? ""
          : "Build a team page listing all agents with bios, headshots, and contact info.",
        contextTriggered: true,
        contextLabel: makeContextLabel("team"),
        pageUrl: r.url,
      })];
    },
  },
  {
    id: "team-members-content",
    category: "About / Agent / Team",
    title: "Multiple team members content detectable",
    severity: "REQUIRED",
    evaluate(ctx) {
      const allText = pageTextAll(ctx);
      const teamKeywords = ["team", "agents", "associates", "our team", "meet the team", "team members"];
      const found = teamKeywords.some((kw) => allText.includes(kw));
      return [makeFinding({
        id: "team-members-content",
        category: "About / Agent / Team",
        title: "Team member content detectable",
        severity: "REQUIRED",
        status: found ? "pass" : "warning",
        evidence: found
          ? ["Team-related content keywords detected"]
          : ["Team member keywords not detected — content may be JS-rendered or missing"],
        recommendation: found
          ? ""
          : "Ensure the team page lists all agents with bios, headshots, and individual contact info.",
        contextTriggered: true,
        contextLabel: makeContextLabel("team"),
      })];
    },
  },
  {
    id: "team-nav-link",
    category: "Navigation & Links",
    title: "Team page linked in navigation",
    severity: "REQUIRED",
    evaluate(ctx) {
      const root = allPages(ctx)[0];
      if (!root) return [];
      const navLinks = root.links.map((l) => l.toLowerCase());
      const hasTeamLink = navLinks.some((l) =>
        l.includes("/team") || l.includes("/about") || l.includes("/agents") || l.includes("/meet")
      );
      return [makeFinding({
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
        contextLabel: makeContextLabel("team"),
        pageUrl: root.url,
      })];
    },
  },
  {
    id: "team-headshots-human-review",
    category: "About / Agent / Team",
    title: "All team member headshots present",
    severity: "HUMAN_REVIEW",
    evaluate(ctx) {
      return [makeFinding({
        id: "team-headshots-human-review",
        category: "About / Agent / Team",
        title: "All team member headshots present",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: ["Cannot verify headshot completeness from URL alone"],
        recommendation: "Verify every listed team member has a professional headshot. Missing headshots indicate incomplete builds. Verify images are not placeholder stock photos.",
        contextTriggered: true,
        contextLabel: makeContextLabel("team"),
      })];
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
      return [makeFinding({
        id: "team-contact-form",
        category: "Forms & Lead Routing",
        title: "Team contact form or CTA present",
        severity: "REQUIRED",
        status: hasForms || hasCTA ? "pass" : "fail",
        evidence: hasForms
          ? ["Contact form detected on one or more pages"]
          : hasCTA
          ? ["CTA element detected — verify it links to a contact form"]
          : ["No contact form or CTA detected on scanned pages"],
        recommendation: hasForms || hasCTA
          ? ""
          : "Add a contact form or clear CTA. Team sites must have a clear contact path for each agent and the team overall.",
        contextTriggered: true,
        contextLabel: makeContextLabel("team"),
      })];
    },
  },
];

// ── Property Page Rules ───────────────────────────────────────────────────────
export function getPropertyPageRules(mode: "portfolio" | "separate-sale-sold"): AuditRule[] {
  if (mode === "portfolio") {
    return [
      {
        id: "portfolio-page-exists",
        category: "Property Pages",
        title: "Portfolio / combined property page exists",
        severity: "CRITICAL",
        evaluate(ctx) {
          const r = hasPageWithPath(ctx, ["/portfolio", "/properties", "/listings", "/all-listings"]);
          return [makeFinding({
            id: "portfolio-page-exists",
            category: "Property Pages",
            title: "Portfolio / combined property page exists",
            severity: "CRITICAL",
            status: r.found ? "pass" : "fail",
            evidence: r.found
              ? [`Portfolio/properties page found: ${r.url}`]
              : ["No portfolio or combined property page detected in scanned URLs"],
            recommendation: r.found
              ? ""
              : "Build a combined portfolio page that shows both active and sold properties.",
            contextTriggered: true,
            contextLabel: "Portfolio mode check",
            pageUrl: r.url,
          })];
        },
      },
      {
        id: "portfolio-nav-link",
        category: "Navigation & Links",
        title: "Portfolio/properties linked in navigation",
        severity: "REQUIRED",
        evaluate(ctx) {
          const root = allPages(ctx)[0];
          if (!root) return [];
          const navLinks = root.links.map((l) => l.toLowerCase());
          const hasLink = navLinks.some((l) =>
            l.includes("/portfolio") || l.includes("/properties") || l.includes("/listings")
          );
          return [makeFinding({
            id: "portfolio-nav-link",
            category: "Navigation & Links",
            title: "Portfolio/properties linked in navigation",
            severity: "REQUIRED",
            status: hasLink ? "pass" : "warning",
            evidence: hasLink
              ? ["Portfolio/properties link found in navigation"]
              : ["No portfolio/properties link detected in nav — may be JS-rendered"],
            recommendation: hasLink
              ? ""
              : "Add the portfolio/properties page to the main navigation.",
            contextTriggered: true,
            contextLabel: "Portfolio mode check",
            pageUrl: root.url,
          })];
        },
      },
      {
        id: "portfolio-spacing-human-review",
        category: "Property Pages",
        title: "Portfolio layout and spacing review",
        severity: "HUMAN_REVIEW",
        evaluate() {
          return [makeFinding({
            id: "portfolio-spacing-human-review",
            category: "Property Pages",
            title: "Portfolio card spacing and overlay styling",
            severity: "HUMAN_REVIEW",
            status: "needs_review",
            evidence: ["Visual layout cannot be verified from URL alone"],
            recommendation: "Verify: (1) Property cards have 96px spacing as required. (2) Card overlay text is readable. (3) Property images are correctly cropped. (4) 'View Property' buttons link correctly.",
            contextTriggered: true,
            contextLabel: "Portfolio mode check",
          })];
        },
      },
    ];
  }

  // Separate sale/sold pages
  return [
    {
      id: "properties-for-sale-page",
      category: "Property Pages",
      title: "For sale / featured properties page exists",
      severity: "CRITICAL",
      evaluate(ctx) {
        const r = hasPageWithPath(ctx, ["/properties", "/for-sale", "/featured", "/listings", "/active"]);
        return [makeFinding({
          id: "properties-for-sale-page",
          category: "Property Pages",
          title: "For sale / featured properties page exists",
          severity: "CRITICAL",
          status: r.found ? "pass" : "fail",
          evidence: r.found
            ? [`For sale/featured properties page found: ${r.url}`]
            : ["No for-sale or featured properties page detected in scanned URLs"],
          recommendation: r.found
            ? ""
            : "Build a dedicated 'For Sale' or 'Featured Properties' page.",
          contextTriggered: true,
          contextLabel: "Separate pages mode check",
          pageUrl: r.url,
        })];
      },
    },
    {
      id: "sold-past-transactions-page",
      category: "Property Pages",
      title: "Sold / past transactions page exists",
      severity: "CRITICAL",
      evaluate(ctx) {
        const r = hasPageWithPath(ctx, ["/sold", "/past-transactions", "/past-sales", "/closed"]);
        return [makeFinding({
          id: "sold-past-transactions-page",
          category: "Property Pages",
          title: "Sold / past transactions page exists",
          severity: "CRITICAL",
          status: r.found ? "pass" : "fail",
          evidence: r.found
            ? [`Sold/past transactions page found: ${r.url}`]
            : ["No sold or past transactions page detected in scanned URLs"],
          recommendation: r.found
            ? ""
            : "Build a dedicated 'Sold' or 'Past Transactions' page.",
          contextTriggered: true,
          contextLabel: "Separate pages mode check",
          pageUrl: r.url,
        })];
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
        const hasSale = navLinks.some((l) => l.includes("/properties") || l.includes("/for-sale") || l.includes("/featured") || l.includes("/listings"));
        const hasSold = navLinks.some((l) => l.includes("/sold") || l.includes("/past-transactions") || l.includes("/past-sales"));
        const status = hasSale && hasSold ? "pass" : hasSale || hasSold ? "warning" : "fail";
        return [makeFinding({
          id: "both-property-pages-in-nav",
          category: "Navigation & Links",
          title: "Both For Sale and Sold pages in navigation",
          severity: "REQUIRED",
          status,
          evidence: [
            hasSale ? "✓ For Sale/Properties nav link detected" : "✗ No For Sale/Properties nav link detected",
            hasSold ? "✓ Sold/Past Transactions nav link detected" : "✗ No Sold/Past Transactions nav link detected",
          ],
          recommendation: status === "pass"
            ? ""
            : "Add both the 'For Sale/Properties' and 'Sold/Past Transactions' pages to the main navigation.",
          contextTriggered: true,
          contextLabel: "Separate pages mode check",
          pageUrl: root.url,
        })];
      },
    },
    {
      id: "sold-page-sort-human-review",
      category: "Property Pages",
      title: "Sold page sorted descending by price",
      severity: "HUMAN_REVIEW",
      evaluate() {
        return [makeFinding({
          id: "sold-page-sort-human-review",
          category: "Property Pages",
          title: "Sold page sorted descending by price",
          severity: "HUMAN_REVIEW",
          status: "needs_review",
          evidence: ["Sort order cannot be verified from URL alone"],
          recommendation: "Verify the Sold/Past Transactions page is sorted by price descending (highest first). This is the LP standard.",
          contextTriggered: true,
          contextLabel: "Separate pages mode check",
        })];
      },
    },
  ];
}

// ── Additional Page Rules ─────────────────────────────────────────────────────
export function getAdditionalPageRules(selectedPages: string[]): AuditRule[] {
  const rules: AuditRule[] = [];

  const pageConfigs: Record<string, {
    slugs: string[];
    category: AuditCategory;
    severity: "CRITICAL" | "REQUIRED";
    contentCheck?: string[];
    humanReviewNote?: string;
  }> = {
    "Buyers": {
      slugs: ["/buyers", "/buyer", "/buyers-guide", "/for-buyers"],
      category: "Buyers & Sellers Guide",
      severity: "CRITICAL",
      contentCheck: ["buyer", "home search", "pre-approval", "mortgage"],
      humanReviewNote: "Verify the Buyers page has relevant GSM/CTA links and no placeholder content.",
    },
    "Sellers": {
      slugs: ["/sellers", "/seller", "/sellers-guide", "/for-sellers", "/sell"],
      category: "Buyers & Sellers Guide",
      severity: "CRITICAL",
      contentCheck: ["seller", "home valuation", "listing", "sell your home"],
      humanReviewNote: "Verify the Sellers page links to a home valuation CTA where relevant.",
    },
    "Mortgage": {
      slugs: ["/mortgage", "/financing", "/home-loan"],
      category: "Buyers & Sellers Guide",
      severity: "REQUIRED",
      humanReviewNote: "Verify mortgage calculator or lender partner links are functional.",
    },
    "Home Valuation": {
      slugs: ["/home-valuation", "/valuation", "/home-value", "/what-is-my-home-worth"],
      category: "Buyers & Sellers Guide",
      severity: "CRITICAL",
      contentCheck: ["valuation", "home value", "estimate", "worth"],
      humanReviewNote: "Verify the home valuation CTA/button is functional and links correctly.",
    },
    "Neighborhoods": {
      slugs: ["/neighborhoods", "/neighborhood", "/areas", "/communities"],
      category: "Neighborhood Pages",
      severity: "CRITICAL",
      contentCheck: ["neighborhood", "community", "area", "district"],
      humanReviewNote: "Verify neighborhood pages have content relevant to the client's market and MLS area.",
    },
    "Testimonials": {
      slugs: ["/testimonials", "/reviews", "/testimonial"],
      category: "Client Requests",
      severity: "REQUIRED",
      contentCheck: ["testimonial", "review", "client said", "worked with"],
      humanReviewNote: "Verify testimonials are real, attributed, and not placeholder text.",
    },
    "Blog": {
      slugs: ["/blog", "/articles", "/news", "/insights"],
      category: "Blog / Press / Development",
      severity: "REQUIRED",
      contentCheck: ["blog", "article", "post", "read more"],
      humanReviewNote: "Verify blog posts are present and not placeholder content.",
    },
    "Press": {
      slugs: ["/press", "/media", "/in-the-news"],
      category: "Blog / Press / Development",
      severity: "REQUIRED",
      humanReviewNote: "Verify press/media mentions are real and links are not broken.",
    },
    "Developments": {
      slugs: ["/developments", "/development", "/new-development", "/projects"],
      category: "Blog / Press / Development",
      severity: "REQUIRED",
      humanReviewNote: "Verify development pages have correct project details and images.",
    },
    "Videos": {
      slugs: ["/videos", "/video", "/media"],
      category: "Blog / Press / Development",
      severity: "REQUIRED",
      contentCheck: ["youtube", "vimeo", "video"],
      humanReviewNote: "Verify video embeds use only YouTube or Vimeo. No other video providers are permitted.",
    },
    "Contact": {
      slugs: ["/contact", "/contact-us", "/get-in-touch"],
      category: "Forms & Lead Routing",
      severity: "CRITICAL",
      humanReviewNote: "Verify contact page has a working form and correct contact details.",
    },
  };

  for (const page of selectedPages) {
    if (page === "Other") continue; // Custom pages can't be checked by URL pattern
    const cfg = pageConfigs[page];
    if (!cfg) continue;

    // Page existence rule
    rules.push({
      id: `additional-page-${page.toLowerCase().replace(/\s+/g, "-")}`,
      category: cfg.category,
      title: `${page} page exists`,
      severity: cfg.severity,
      evaluate(ctx) {
        const r = hasPageWithPath(ctx, cfg.slugs);
        return [makeFinding({
          id: `additional-page-${page.toLowerCase().replace(/\s+/g, "-")}`,
          category: cfg.category,
          title: `${page} page exists`,
          severity: cfg.severity,
          status: r.found ? "pass" : "fail",
          evidence: r.found
            ? [`${page} page found: ${r.url}`]
            : [`No ${page} page detected — expected URL pattern: ${cfg.slugs.join(", ")}`],
          recommendation: r.found
            ? ""
            : `Build the ${page} page. It was marked as selected in the site setup.`,
          contextTriggered: true,
          contextLabel: "Selected page check",
          pageUrl: r.url,
        })];
      },
    });

    // Content/quality human review rule
    if (cfg.humanReviewNote) {
      rules.push({
        id: `additional-page-${page.toLowerCase().replace(/\s+/g, "-")}-quality`,
        category: cfg.category,
        title: `${page} page quality check`,
        severity: "HUMAN_REVIEW",
        evaluate() {
          return [makeFinding({
            id: `additional-page-${page.toLowerCase().replace(/\s+/g, "-")}-quality`,
            category: cfg.category,
            title: `${page} page — quality review needed`,
            severity: "HUMAN_REVIEW",
            status: "needs_review",
            evidence: [`${page} page was selected as a required page`],
            recommendation: cfg.humanReviewNote!,
            contextTriggered: true,
            contextLabel: "Selected page check",
          })];
        },
      });
    }

    // Video embed check
    if (page === "Videos") {
      rules.push({
        id: "videos-embed-source",
        category: "Blog / Press / Development",
        title: "Video embeds use approved sources",
        severity: "REQUIRED",
        evaluate(ctx) {
          const videoPages = ctx.pages.filter((p) => p.hasVideo);
          if (videoPages.length === 0) {
            return [makeFinding({
              id: "videos-embed-source",
              category: "Blog / Press / Development",
              title: "Video embeds detectable",
              severity: "REQUIRED",
              status: "warning",
              evidence: ["No video embeds detected — Videos page was selected"],
              recommendation: "Add video content using YouTube or Vimeo embeds only.",
              contextTriggered: true,
              contextLabel: "Videos page check",
            })];
          }
          return [makeFinding({
            id: "videos-embed-source",
            category: "Blog / Press / Development",
            title: "Video embeds detected",
            severity: "REQUIRED",
            status: "pass",
            evidence: [`${videoPages.length} page(s) with video content detected`],
            recommendation: "Verify all video embeds use YouTube or Vimeo. No other providers are permitted.",
            contextTriggered: true,
            contextLabel: "Videos page check",
          })];
        },
      });
    }
  }

  return rules;
}

// ── Brokerage-Specific Rules ──────────────────────────────────────────────────
export function getBrokerageRules(brokerage: string, otherName?: string): AuditRule[] {
  const brokerageName = brokerage === "Other" ? (otherName ?? "your brokerage") : brokerage;
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
      // Try partial match for long names
      const nameParts = lowerName.split(/\s+/);
      const found = nameParts.length >= 2
        ? nameParts.slice(0, 2).every((p) => allText.includes(p))
        : allText.includes(lowerName);
      return [makeFinding({
        id: "brokerage-name-present",
        category: "Brokerage Pages",
        title: `Brokerage name "${brokerageName}" detected on site`,
        severity: "REQUIRED",
        status: found ? "pass" : "warning",
        evidence: found
          ? [`Brokerage name "${brokerageName}" detected in page content`]
          : [`Brokerage name "${brokerageName}" not detected — may be in footer image or JS-rendered`],
        recommendation: found
          ? ""
          : `Ensure the brokerage name "${brokerageName}" appears as text in the footer or agent pages.`,
        contextTriggered: true,
        contextLabel: "Brokerage check",
      })];
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
          return [makeFinding({
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
          })];
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
          const found = allText.includes("independently owned") || allText.includes("independently operated");
          return [makeFinding({
            id: "sothebys-independently-owned",
            category: "Compliance",
            title: "SIR 'independently owned and operated' disclaimer",
            severity: "REQUIRED",
            status: found ? "pass" : "fail",
            evidence: found
              ? ["SIR disclaimer detected in page content"]
              : ["Required SIR disclaimer 'independently owned and operated' not detected"],
            recommendation: found
              ? ""
              : "Add 'Each office is independently owned and operated.' to the site footer as required by Sotheby's International Realty.",
            contextTriggered: true,
            contextLabel: "Sotheby's check",
          })];
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
        "Compass": "Check: Compass logo lockup, font requirements (Quincey/Circular), approved color palette, and no unauthorized variations.",
        "Sotheby's International Realty": "Check: SIR navy (#002349), correct logo with 'International Realty' text, required footer text, gallery/button styles.",
        "Coldwell Banker": "Check: CB logo lockup rules, 'Coldwell Banker' not abbreviated as 'CB Realty', required footer text.",
        "Douglas Elliman": "Check: Elliman logo usage, required footer disclaimers, brand color compliance.",
        "eXp Realty": "Check: eXp logo usage, color requirements, required footer text.",
        "SERHANT.": "Check: SERHANT. brand guidelines, period at end of name, logo usage.",
        "The Agency": "Check: The Agency red/black branding, logo usage, required footer elements.",
        "Corcoran": "Check: Corcoran logo, brand colors, required footer text and disclaimers.",
        "Keller Williams": "Check: KW logo lockup, brand guidelines, required footer text.",
        "Berkshire Hathaway HomeServices": "Check: BHHS shield symbol, 'Good to Know®' trademark, required footer disclaimers.",
      };
      const guide = brokerageSpecific[brokerage] ?? `Verify ${brokerageName} brand guidelines: logo, colors, fonts, and required footer text are all compliant.`;
      return [makeFinding({
        id: "brokerage-compliance-review",
        category: "Compliance",
        title: `${brokerageName} compliance human review`,
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: [`Brokerage: ${brokerageName}`],
        recommendation: `${guide} Refer to the LP Launch Bible and Coda compliance docs for ${brokerageName} requirements.`,
        contextTriggered: true,
        contextLabel: "Brokerage compliance",
      })];
    },
  });

  return rules;
}

// ── State/MLS Compliance Rules ────────────────────────────────────────────────
export function getStateMlsRules(stateOrRegion: string, mls: string, mlsOtherName?: string): AuditRule[] {
  const mlsName = mls === "Other" ? (mlsOtherName ?? "your MLS") : mls;
  const rules: AuditRule[] = [];

  // Apply compliance rules from static layer
  const complianceRules = getApplicableComplianceRules({
    stateOrRegion,
    brokerage: "", // Already handled by getBrokerageRules
    siteType: "agent", // Generic — brokerage rules already filtered by site type
  }).filter((r) => {
    // Only include state-specific or universal rules here
    const hasBrokerageFilter = r.scope.brokerages && r.scope.brokerages.length > 0;
    return !hasBrokerageFilter; // Brokerage rules handled separately
  });

  for (const compRule of complianceRules) {
    rules.push({
      id: `compliance-${compRule.id}`,
      category: "Compliance",
      title: compRule.title,
      severity: compRule.severity === "critical" ? "CRITICAL"
        : compRule.severity === "required" ? "REQUIRED"
        : compRule.severity === "verify" ? "VERIFY"
        : "HUMAN_REVIEW",
      evaluate(ctx) {
        if (compRule.humanReviewPrompt && !compRule.detectablePatterns?.length) {
          // Pure human review — can't auto-detect
          return [makeFinding({
            id: `compliance-${compRule.id}`,
            category: "Compliance",
            title: compRule.title,
            severity: "HUMAN_REVIEW",
            status: "needs_review",
            evidence: [
              `State/Region: ${stateOrRegion}`,
              compRule.description,
            ],
            recommendation: `${compRule.humanReviewPrompt}\n\n${compRule.recommendation}`,
            contextTriggered: true,
            contextLabel: "State/MLS compliance",
          })];
        }

        if (compRule.detectablePatterns?.length) {
          const allText = pageTextAll(ctx);
          const found = compRule.detectablePatterns.some((pattern) => allText.includes(pattern));
          // For prohibited terms: found = fail. For required elements: found = pass.
          const isProhibited = compRule.id === "off-market-prohibited";

          if (isProhibited) {
            // Already handled by ruleProhibitedOffMarket — skip duplicate
            return [];
          }

          const status = found ? "pass" : (compRule.severity === "required" || compRule.severity === "critical") ? "fail" : "warning";
          return [makeFinding({
            id: `compliance-${compRule.id}`,
            category: "Compliance",
            title: compRule.title,
            severity: compRule.severity === "critical" ? "CRITICAL"
              : compRule.severity === "required" ? "REQUIRED"
              : compRule.severity === "verify" ? "VERIFY"
              : "HUMAN_REVIEW",
            status,
            evidence: found
              ? [`Pattern detected: "${compRule.detectablePatterns.find((p) => allText.includes(p))}"`]
              : [`Pattern not detected. State: ${stateOrRegion}. ${compRule.description}`],
            recommendation: found
              ? (compRule.humanReviewPrompt ? `Auto-detected — still verify manually: ${compRule.humanReviewPrompt}` : "")
              : compRule.recommendation,
            contextTriggered: true,
            contextLabel: "State/MLS compliance",
          })];
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
      return [makeFinding({
        id: "mls-compliance-human-review",
        category: "Compliance",
        title: `MLS compliance: ${mlsName}`,
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        evidence: [
          `State/Region: ${stateOrRegion}`,
          `MLS: ${mlsName}`,
        ],
        recommendation: `Verify ${mlsName}-specific IDX disclaimer requirements: (1) Required disclaimer text matches MLS board rules. (2) Data copyright notice is present. (3) "Listing information last updated" date is shown where applicable. (4) Listing provider name meets MLS attribution requirements.`,
        contextTriggered: true,
        contextLabel: "MLS compliance",
      })];
    },
  });

  return rules;
}

// ── Select All Context Rules ──────────────────────────────────────────────────
/**
 * Given an AuditProfile, returns all context-appropriate rules.
 */
export function selectContextRules(ctx: AuditContext): AuditRule[] {
  const { profile } = ctx;
  const rules: AuditRule[] = [];

  // Client name visibility — always checked
  rules.push(getClientNameRule(profile.clientName));

  // Site type specific
  if (profile.siteType === "agent") {
    rules.push(...agentSiteRules);
  } else {
    rules.push(...teamSiteRules);
  }

  // Property page mode
  rules.push(...getPropertyPageRules(profile.propertyPageMode));

  // Additional selected pages
  rules.push(...getAdditionalPageRules(profile.additionalPages));

  // Brokerage rules
  rules.push(...getBrokerageRules(profile.brokerage, profile.brokerageOtherName));

  // State + MLS compliance
  rules.push(...getStateMlsRules(
    profile.stateOrRegion,
    profile.mls,
    profile.mlsOtherName,
  ));

  return rules;
}
