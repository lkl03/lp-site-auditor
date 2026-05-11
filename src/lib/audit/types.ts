import type { AuditProfile } from "./profile";

export type Severity = "CRITICAL" | "REQUIRED" | "VERIFY" | "CONDITIONAL" | "HUMAN_REVIEW";
export type FindingStatus = "pass" | "fail" | "warning" | "needs_review" | "not_applicable";

export type AuditCategory =
  | "Client Requests"
  | "Branding & Identity"
  | "Global Elements"
  | "Navigation & Links"
  | "Homepage"
  | "About / Agent / Team"
  | "Property Pages"
  | "Neighborhood Pages"
  | "Blog / Press / Development"
  | "Buyers & Sellers Guide"
  | "Brokerage Pages"
  | "SEO"
  | "Mobile / Responsive"
  | "Forms & Lead Routing"
  | "Image Quality"
  | "Compliance"
  | "Final Validation"
  | "Handoff Readiness";

export interface Finding {
  id: string;
  category: AuditCategory;
  title: string;
  severity: Severity;
  status: FindingStatus;
  scoreImpact: number;
  evidence: string[];
  recommendation: string;
  pageUrl?: string;
  /** If true, this check was activated because of the user's context selection. */
  contextTriggered?: boolean;
  /** Short label to display explaining why this check ran. e.g. "Agent-site check" */
  contextLabel?: string;
}

export interface CategoryScore {
  category: AuditCategory;
  score: number;
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  humanReview: number;
}

export interface PageData {
  url: string;
  statusCode: number;
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  h3: string[];
  links: string[];
  externalLinks: string[];
  buttons: string[];
  images: { src: string; alt: string; width?: number; height?: number }[];
  forms: { inputs: number; hasSubmit: boolean; labels: number }[];
  emails: string[];
  phones: string[];
  socialLinks: string[];
  disclaimers: string[];
  prohibitedTerms: string[];
  placeholderImages: string[];
  favicon: string;
  canonical: string;
  ogImage: string;
  viewportMeta: boolean;
  textSample: string;
  inlineFixedWidths: boolean;
  imagesWithoutSrcset: string[];
  licenseNumbers: string[];
  hasVideo: boolean;
  hasHero: boolean;
  hasCTA: boolean;
  /** True if the page text contains MLS/listing signals (used for /home-search check). */
  hasListingSignals: boolean;
  /** True if "lorem ipsum" placeholder text is detected on the page. */
  hasLoremIpsum: boolean;
  /** Words that appear consecutively more than once (e.g. "the the"). */
  repeatedWords: string[];
  /** True if any h1/h2/h3 element has empty text. */
  hasEmptyHeadings: boolean;
  error?: string;
}

/** Deprecated: Use AuditProfile fields directly. Kept for backward-compat with existing rules. */
export interface ExpectedContext {
  clientName?: string;
  brokerage?: string;
  market?: string;
  phone?: string;
  email?: string;
  pages?: string[];
  agents?: string[];
  neighborhoods?: string[];
}

export interface AuditContext {
  url: string;
  pages: PageData[];
  /** Derived from profile for backward compatibility with existing rules. */
  expected: ExpectedContext;
  /** Full user-provided context. New rules should read from here. */
  profile: AuditProfile;
  startUrl: URL;
}

export interface AuditRule {
  id: string;
  category: AuditCategory;
  title: string;
  severity: Severity;
  evaluate: (context: AuditContext) => Finding[];
}

export interface AuditResult {
  auditId: string;
  url: string;
  scannedAt: string;
  overallScore: number;
  categoryScores: CategoryScore[];
  pagesScanned: { url: string; title: string; statusCode: number }[];
  findings: Finding[];
  humanReviewItems: Finding[];
  /** Top-priority findings to fix before QA, sorted by severity. */
  topRecommendations: Finding[];
  profile: Pick<AuditProfile, "siteType" | "clientName" | "brokerage" | "stateOrRegion" | "mls">;
  metadata: {
    durationMs: number;
    pagesAttempted: number;
    pagesSucceeded: number;
    pagesFailed: number;
  };
}

/** Shape sent from the form to the API. */
export type AuditRequest = AuditProfile;
