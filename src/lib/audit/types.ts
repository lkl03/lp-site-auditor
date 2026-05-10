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
  error?: string;
}

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
  expected: ExpectedContext;
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
  metadata: {
    durationMs: number;
    pagesAttempted: number;
    pagesSucceeded: number;
    pagesFailed: number;
  };
}

export interface AuditRequest {
  url: string;
  expected?: ExpectedContext;
}
