/**
 * Static compliance knowledge layer for LP Site Auditor.
 *
 * HOW TO UPDATE FROM CODA:
 * 1. Export the "Compliance Overview" table from Coda as CSV or JSON.
 *    URL: https://coda.io/d/_dp5vOd136pk/Compliance-Overview_suZ0fgRv
 * 2. Map each row to the ComplianceRule shape below.
 * 3. Add/update entries in COMPLIANCE_RULES.
 * 4. Commit and deploy — no database needed.
 *
 * WHY NOT RUNTIME CODA SCRAPING:
 * - Coda requires auth tokens and API calls would fail silently in production.
 * - Scraping a live doc at scan time is fragile and creates latency.
 * - A static file is auditable, reviewable in PRs, and zero-cost.
 */

export type ComplianceSeverity = "critical" | "required" | "verify" | "human_review";

export interface ComplianceRule {
  id: string;
  scope: {
    states?: string[];
    brokerages?: string[];
    mls?: string[];
    siteTypes?: ("agent" | "team")[];
  };
  title: string;
  description: string;
  severity: ComplianceSeverity;
  /** Lowercase strings to search for in page text to auto-detect compliance. */
  detectablePatterns?: string[];
  /** Prompt shown in the human-review item when auto-detection is not reliable. */
  humanReviewPrompt?: string;
  recommendation: string;
}

export const COMPLIANCE_RULES: ComplianceRule[] = [
  // ── Universal ─────────────────────────────────────────────────────────────
  {
    id: "off-market-prohibited",
    scope: {},
    title: '"Off-Market" term is prohibited',
    description: 'The term "Off-Market" or "Off Market" must not appear anywhere on the site.',
    severity: "critical",
    detectablePatterns: ["off-market", "off market"],
    recommendation: 'Remove all instances of "Off-Market" and "Off Market". This term is prohibited site-wide.',
  },
  {
    id: "eho-equal-housing",
    scope: {},
    title: "Equal Housing Opportunity (EHO) present",
    description: "EHO/Equal Housing logo or text should appear in the footer.",
    severity: "required",
    detectablePatterns: ["equal housing", "eho", "equal opportunity"],
    humanReviewPrompt: "Verify the Equal Housing Opportunity logo or text is visible in the footer. Check it is not broken or hidden.",
    recommendation: "Add the Equal Housing Opportunity logo or text to the site footer.",
  },
  {
    id: "realtor-trademark",
    scope: {},
    title: "REALTOR® trademark used correctly",
    description: "If Realtor/REALTOR is used, it must be properly capitalized and marked ®.",
    severity: "human_review",
    humanReviewPrompt: "Verify that 'REALTOR®' is properly capitalized and marked with ® wherever it appears. Lowercase 'realtor' is a trademark violation.",
    recommendation: "Replace any lowercase 'realtor' with 'REALTOR®'.",
  },
  {
    id: "mls-idx-disclaimer",
    scope: {},
    title: "MLS/IDX disclaimer present if IDX enabled",
    description: "Sites with IDX listings must display the required MLS/IDX disclaimer text.",
    severity: "verify",
    detectablePatterns: ["idx", "mls", "broker reciprocity", "listing information", "multiple listing"],
    humanReviewPrompt: "If this site has IDX/MLS listings, verify that the required MLS disclaimer text is present and meets your MLS board's requirements.",
    recommendation: "Add the MLS/IDX disclaimer required by your MLS board. Contact the MLS board for the exact required text.",
  },
  {
    id: "license-number-state",
    scope: {},
    title: "License number displayed where required",
    description: "Many states require real estate license numbers to be displayed on the site.",
    severity: "verify",
    detectablePatterns: ["dre", "lic.", "license #", "license no", "ca dre", "bre", "real estate license"],
    humanReviewPrompt: "Verify that the agent's/team's real estate license number is displayed as required by state law. Format: 'DRE# XXXXXXX' (CA), 'License #XXXXXXXX', etc.",
    recommendation: "Add the required state license number to the footer or about page. Check your state's requirements for exact format and placement.",
  },
  {
    id: "brokerage-disclaimer",
    scope: {},
    title: "Brokerage disclaimer/branding present",
    description: "The site must display required brokerage branding and disclaimers.",
    severity: "human_review",
    humanReviewPrompt: "Verify that all brokerage-required branding, logo lockup, and disclaimer text is present and correctly formatted per the brokerage compliance guide.",
    recommendation: "Refer to your brokerage compliance guidelines for required disclaimer text, logo lockup rules, and placement requirements.",
  },

  // ── Compass ───────────────────────────────────────────────────────────────
  {
    id: "compass-branding",
    scope: { brokerages: ["Compass"] },
    title: "Compass branding references correct",
    description: "Compass-branded sites must reference 'Compass' correctly and not use unauthorized variations.",
    severity: "human_review",
    detectablePatterns: ["compass"],
    humanReviewPrompt: "Verify: (1) 'Compass' appears in the footer/brokerage line. (2) No unauthorized Compass logo variations. (3) Compass font and color requirements met. (4) No placeholder 'Client Name' text remaining.",
    recommendation: "Review the Compass brand guidelines. Ensure logo, fonts, and colors match Compass standards. Check for unreplaced placeholder text.",
  },
  {
    id: "compass-placeholder-text",
    scope: { brokerages: ["Compass"] },
    title: "No placeholder 'Client Name' text",
    description: "Compass templates often contain placeholder 'Client Name' text that must be replaced.",
    severity: "required",
    detectablePatterns: ["client name", "[client", "{{client"],
    humanReviewPrompt: "Search the site for any unreplaced 'Client Name' placeholder text. This is common in Compass templates.",
    recommendation: "Find and replace all instances of placeholder text with the actual client name.",
  },

  // ── Sotheby's ─────────────────────────────────────────────────────────────
  {
    id: "sothebys-branding",
    scope: { brokerages: ["Sotheby's International Realty"] },
    title: "Sotheby's International Realty branding correct",
    description: "SIR-branded sites must use correct SIR logo, navy color, and required branding elements.",
    severity: "human_review",
    detectablePatterns: ["sotheby", "sir"],
    humanReviewPrompt: "Verify: (1) SIR navy (#002349) used correctly. (2) SIR logo correct and unaltered. (3) Required SIR footer text present. (4) 'Each office is independently owned and operated' disclaimer present.",
    recommendation: "Review SIR brand standards. Ensure navy color, logo, and required disclaimers are in place.",
  },
  {
    id: "sothebys-disclaimer",
    scope: { brokerages: ["Sotheby's International Realty"] },
    title: "SIR 'independently owned and operated' disclaimer",
    description: "Sotheby's requires 'Each office is independently owned and operated' in the footer.",
    severity: "required",
    detectablePatterns: ["independently owned", "independently operated"],
    humanReviewPrompt: "Verify the SIR required disclaimer 'Each office is independently owned and operated' appears in the footer.",
    recommendation: "Add 'Each office is independently owned and operated' to the footer as required by Sotheby's International Realty.",
  },

  // ── Coldwell Banker ───────────────────────────────────────────────────────
  {
    id: "coldwell-banker-branding",
    scope: { brokerages: ["Coldwell Banker"] },
    title: "Coldwell Banker branding correct",
    description: "CB-branded sites must use CB logo correctly and follow branding guidelines.",
    severity: "human_review",
    detectablePatterns: ["coldwell banker", "coldwell", "cb realty"],
    humanReviewPrompt: "Verify: (1) Coldwell Banker logo lockup is correct. (2) 'Coldwell Banker' appears correctly — not 'CB Realty' or other abbreviations. (3) Required footer text present.",
    recommendation: "Review Coldwell Banker brand standards. Ensure correct logo lockup and brokerage name usage.",
  },

  // ── Douglas Elliman ───────────────────────────────────────────────────────
  {
    id: "douglas-elliman-branding",
    scope: { brokerages: ["Douglas Elliman"] },
    title: "Douglas Elliman branding compliance",
    description: "Douglas Elliman requires specific branding and disclaimer compliance.",
    severity: "human_review",
    detectablePatterns: ["douglas elliman", "elliman"],
    humanReviewPrompt: "Verify Douglas Elliman branding guidelines are followed. Check logo usage, footer text, and any required disclaimers.",
    recommendation: "Review Douglas Elliman brand guidelines. Ensure all required branding and disclaimer elements are present.",
  },

  // ── The Agency ────────────────────────────────────────────────────────────
  {
    id: "the-agency-branding",
    scope: { brokerages: ["The Agency"] },
    title: "The Agency branding compliance",
    description: "The Agency requires specific red/black branding and compliance elements.",
    severity: "human_review",
    detectablePatterns: ["the agency"],
    humanReviewPrompt: "Verify The Agency branding: correct red/black color scheme, logo usage, and required footer text/disclaimer.",
    recommendation: "Review The Agency brand standards. Ensure color, logo, and required compliance elements are in place.",
  },

  // ── Corcoran ─────────────────────────────────────────────────────────────
  {
    id: "corcoran-branding",
    scope: { brokerages: ["Corcoran"] },
    title: "Corcoran branding compliance",
    description: "Corcoran requires specific branding and compliance elements.",
    severity: "human_review",
    detectablePatterns: ["corcoran"],
    humanReviewPrompt: "Verify Corcoran branding guidelines: logo usage, required disclaimer, and footer elements.",
    recommendation: "Review Corcoran brand standards and ensure all required compliance elements are present.",
  },

  // ── Berkshire Hathaway ────────────────────────────────────────────────────
  {
    id: "bhhs-branding",
    scope: { brokerages: ["Berkshire Hathaway HomeServices"] },
    title: "Berkshire Hathaway HomeServices compliance",
    description: "BHHS requires specific branding, the BHHS symbol, and required disclaimers.",
    severity: "human_review",
    detectablePatterns: ["berkshire hathaway", "bhhs"],
    humanReviewPrompt: "Verify BHHS branding: correct BHHS symbol usage, 'Good to Know®' trademark, required footer disclaimers, and no unauthorized logo variations.",
    recommendation: "Review BHHS brand standards. Ensure the BHHS symbol, trademarks, and required disclaimers are correctly placed.",
  },

  // ── State-specific: California ────────────────────────────────────────────
  {
    id: "ca-dre-license",
    scope: { states: ["California"] },
    title: "CA DRE license number required",
    description: "California requires DRE license numbers to be displayed on real estate websites.",
    severity: "required",
    detectablePatterns: ["dre", "ca dre", "dre #", "dre#", "calbre"],
    humanReviewPrompt: "Verify the California DRE license number (format: DRE# XXXXXXXX) appears in the footer and on the About/agent pages.",
    recommendation: "Add the CA DRE license number to the footer and About page. Format: 'DRE# XXXXXXXX'.",
  },

  // ── State-specific: New York ──────────────────────────────────────────────
  {
    id: "ny-fair-housing",
    scope: { states: ["New York"] },
    title: "NY Fair Housing notice",
    description: "New York requires a Fair Housing notice on real estate websites.",
    severity: "human_review",
    detectablePatterns: ["fair housing", "new york state fair housing"],
    humanReviewPrompt: "Verify the New York State Fair Housing Notice is present. This is required by NY real estate law.",
    recommendation: "Add the New York State Fair Housing Notice as required by NY law.",
  },

  // ── State-specific: Florida ───────────────────────────────────────────────
  {
    id: "fl-brokerage-disclosure",
    scope: { states: ["Florida"] },
    title: "Florida brokerage disclosure",
    description: "Florida requires brokerage name and license information to be disclosed.",
    severity: "human_review",
    detectablePatterns: ["fl lic", "florida lic", "brokerage license"],
    humanReviewPrompt: "Verify Florida brokerage disclosure requirements are met: brokerage name, address, and license number are present.",
    recommendation: "Add Florida brokerage disclosure information as required by Florida real estate law.",
  },

  // ── State-specific: Texas ─────────────────────────────────────────────────
  {
    id: "tx-consumer-protection",
    scope: { states: ["Texas"] },
    title: "Texas Consumer Protection Notice",
    description: "TREC requires the Consumer Protection Notice and Information About Brokerage Services to be linked.",
    severity: "required",
    detectablePatterns: ["trec", "texas real estate commission", "information about brokerage services", "consumer protection notice"],
    humanReviewPrompt: "Verify the TREC Information About Brokerage Services form and Consumer Protection Notice are linked from the site as required by Texas law.",
    recommendation: "Add links to the TREC 'Information About Brokerage Services' and 'Consumer Protection Notice' as required by the Texas Real Estate Commission.",
  },
];

/** Filter compliance rules relevant to the given context. */
export function getApplicableComplianceRules(options: {
  stateOrRegion: string;
  brokerage: string;
  siteType: "agent" | "team";
}): ComplianceRule[] {
  return COMPLIANCE_RULES.filter((rule) => {
    const { scope } = rule;
    const hasStateFilter = scope.states && scope.states.length > 0;
    const hasBrokerageFilter = scope.brokerages && scope.brokerages.length > 0;
    const hasSiteTypeFilter = scope.siteTypes && scope.siteTypes.length > 0;
    const hasNoFilter = !hasStateFilter && !hasBrokerageFilter && !hasSiteTypeFilter;

    if (hasNoFilter) return true;

    const stateMatch = !hasStateFilter || scope.states!.includes(options.stateOrRegion);
    const brokerageMatch = !hasBrokerageFilter || scope.brokerages!.includes(options.brokerage);
    const siteTypeMatch = !hasSiteTypeFilter || scope.siteTypes!.includes(options.siteType);

    return stateMatch && brokerageMatch && siteTypeMatch;
  });
}
