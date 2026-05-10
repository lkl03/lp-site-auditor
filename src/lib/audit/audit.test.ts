import { describe, it, expect } from "vitest";
import { validateUrl } from "./scanner";
import { computeOverallScore, computeCategoryScores } from "./scoring";
import {
  ruleProhibitedOffMarket,
  ruleNoPlaceholderImages,
  ruleExpectedPagesFound,
  ruleContactInfoConsistency,
  rulePageTitleLength,
} from "./rules";
import type { AuditContext, PageData, Finding } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePage(overrides: Partial<PageData> = {}): PageData {
  return {
    url: "https://example.com/",
    statusCode: 200,
    title: "Test Site | Agent Name",
    metaDescription: "A test meta description",
    h1: ["Welcome"],
    h2: [],
    h3: [],
    links: [],
    externalLinks: [],
    buttons: ["Contact Us"],
    images: [],
    forms: [],
    emails: ["agent@example.com"],
    phones: ["(310) 555-0100"],
    socialLinks: [],
    disclaimers: [],
    prohibitedTerms: [],
    placeholderImages: [],
    favicon: "/favicon.ico",
    canonical: "",
    ogImage: "https://example.com/og.jpg",
    viewportMeta: true,
    textSample: "Welcome to my real estate website",
    inlineFixedWidths: false,
    imagesWithoutSrcset: [],
    licenseNumbers: [],
    hasVideo: false,
    hasHero: true,
    hasCTA: true,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<AuditContext> = {}): AuditContext {
  return {
    url: "https://example.com",
    pages: [makePage()],
    expected: {},
    startUrl: new URL("https://example.com"),
    ...overrides,
  };
}

// ── URL Validation ────────────────────────────────────────────────────────────

describe("validateUrl", () => {
  it("accepts valid https URL", () => {
    const r = validateUrl("https://example.com");
    expect(r.ok).toBe(true);
  });

  it("accepts valid http URL", () => {
    const r = validateUrl("http://staging.example.com");
    expect(r.ok).toBe(true);
  });

  it("rejects localhost", () => {
    const r = validateUrl("http://localhost:3000");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/private|local/i);
  });

  it("rejects private IP", () => {
    const r = validateUrl("http://192.168.1.1");
    expect(r.ok).toBe(false);
  });

  it("rejects ftp protocol", () => {
    const r = validateUrl("ftp://example.com");
    expect(r.ok).toBe(false);
  });

  it("rejects plain string", () => {
    const r = validateUrl("not a url");
    expect(r.ok).toBe(false);
  });

  it("rejects 127.0.0.1", () => {
    const r = validateUrl("http://127.0.0.1");
    expect(r.ok).toBe(false);
  });
});

// ── Scoring ───────────────────────────────────────────────────────────────────

describe("computeOverallScore", () => {
  it("returns 100 for no findings", () => {
    expect(computeOverallScore([])).toBe(100);
  });

  it("deducts 10 for each critical fail", () => {
    const findings: Finding[] = [
      {
        id: "x",
        category: "Compliance",
        title: "Test",
        severity: "CRITICAL",
        status: "fail",
        scoreImpact: -10,
        evidence: [],
        recommendation: "",
      },
    ];
    expect(computeOverallScore(findings)).toBe(90);
  });

  it("deducts 5 for required fail", () => {
    const findings: Finding[] = [
      {
        id: "x",
        category: "SEO",
        title: "Test",
        severity: "REQUIRED",
        status: "fail",
        scoreImpact: -5,
        evidence: [],
        recommendation: "",
      },
    ];
    expect(computeOverallScore(findings)).toBe(95);
  });

  it("does not deduct for HUMAN_REVIEW", () => {
    const findings: Finding[] = [
      {
        id: "x",
        category: "Compliance",
        title: "Test",
        severity: "HUMAN_REVIEW",
        status: "needs_review",
        scoreImpact: 0,
        evidence: [],
        recommendation: "",
      },
    ];
    expect(computeOverallScore(findings)).toBe(100);
  });

  it("clamps at 0", () => {
    const findings: Finding[] = Array.from({ length: 15 }, (_, i) => ({
      id: `x${i}`,
      category: "Compliance" as const,
      title: "Test",
      severity: "CRITICAL" as const,
      status: "fail" as const,
      scoreImpact: -10,
      evidence: [],
      recommendation: "",
    }));
    expect(computeOverallScore(findings)).toBe(0);
  });

  it("does not deduct for passing finds", () => {
    const findings: Finding[] = [
      {
        id: "x",
        category: "SEO",
        title: "Test",
        severity: "REQUIRED",
        status: "pass",
        scoreImpact: 0,
        evidence: [],
        recommendation: "",
      },
    ];
    expect(computeOverallScore(findings)).toBe(100);
  });
});

describe("computeCategoryScores", () => {
  it("returns score per category", () => {
    const findings: Finding[] = [
      {
        id: "a",
        category: "SEO",
        title: "Title",
        severity: "REQUIRED",
        status: "fail",
        scoreImpact: -5,
        evidence: [],
        recommendation: "",
      },
      {
        id: "b",
        category: "SEO",
        title: "H1",
        severity: "REQUIRED",
        status: "pass",
        scoreImpact: 0,
        evidence: [],
        recommendation: "",
      },
    ];
    const scores = computeCategoryScores(findings);
    const seoScore = scores.find((s) => s.category === "SEO");
    expect(seoScore).toBeDefined();
    expect(seoScore!.score).toBe(95);
    expect(seoScore!.failed).toBe(1);
    expect(seoScore!.passed).toBe(1);
  });
});

// ── Rules ─────────────────────────────────────────────────────────────────────

describe("ruleProhibitedOffMarket", () => {
  it("passes when term not present", () => {
    const ctx = makeCtx();
    const findings = ruleProhibitedOffMarket.evaluate(ctx);
    expect(findings.every((f) => f.status === "pass")).toBe(true);
  });

  it("fails when 'off-market' present", () => {
    const ctx = makeCtx({
      pages: [makePage({ prohibitedTerms: ["off-market"] })],
    });
    const findings = ruleProhibitedOffMarket.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });
});

describe("ruleNoPlaceholderImages", () => {
  it("passes when no placeholder images", () => {
    const ctx = makeCtx();
    const findings = ruleNoPlaceholderImages.evaluate(ctx);
    expect(findings.every((f) => f.status === "pass")).toBe(true);
  });

  it("fails when placeholder image detected", () => {
    const ctx = makeCtx({
      pages: [
        makePage({
          placeholderImages: ["https://via.placeholder.com/300x200"],
        }),
      ],
    });
    const findings = ruleNoPlaceholderImages.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });
});

describe("ruleExpectedPagesFound", () => {
  it("skips when no expected pages provided", () => {
    const ctx = makeCtx({ expected: {} });
    const findings = ruleExpectedPagesFound.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });

  it("passes when expected page URL matches", () => {
    const ctx = makeCtx({
      pages: [
        makePage({ url: "https://example.com/" }),
        makePage({ url: "https://example.com/about" }),
      ],
      expected: { pages: ["about"] },
    });
    const findings = ruleExpectedPagesFound.evaluate(ctx);
    expect(findings.every((f) => f.status === "pass")).toBe(true);
  });

  it("fails when expected page not found", () => {
    const ctx = makeCtx({
      pages: [makePage({ url: "https://example.com/" })],
      expected: { pages: ["developments"] },
    });
    const findings = ruleExpectedPagesFound.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });
});

describe("ruleContactInfoConsistency", () => {
  it("passes when single email across pages", () => {
    const ctx = makeCtx({
      pages: [
        makePage({ emails: ["agent@example.com"] }),
        makePage({ url: "https://example.com/contact", emails: ["agent@example.com"] }),
      ],
    });
    const findings = ruleContactInfoConsistency.evaluate(ctx);
    expect(findings.every((f) => f.status === "pass")).toBe(true);
  });

  it("warns when many different emails found", () => {
    const ctx = makeCtx({
      pages: [
        makePage({ emails: ["a@x.com", "b@x.com", "c@x.com", "d@x.com"] }),
        makePage({ url: "https://example.com/about", emails: ["e@x.com"] }),
      ],
    });
    const findings = ruleContactInfoConsistency.evaluate(ctx);
    expect(findings.some((f) => f.status === "warning")).toBe(true);
  });
});

describe("rulePageTitleLength", () => {
  it("passes for title in 45–61 chars", () => {
    const ctx = makeCtx({
      pages: [makePage({ title: "Beverly Hills Luxury Real Estate | Jane Smith Group" })], // 51 chars
    });
    const findings = rulePageTitleLength.evaluate(ctx);
    expect(findings.every((f) => f.status === "pass")).toBe(true);
  });

  it("warns for title that is too short", () => {
    const ctx = makeCtx({
      pages: [makePage({ title: "Home" })],
    });
    const findings = rulePageTitleLength.evaluate(ctx);
    expect(findings.some((f) => f.status === "warning")).toBe(true);
  });

  it("warns for title that is too long", () => {
    const ctx = makeCtx({
      pages: [
        makePage({
          title: "The Very Best Luxury Real Estate Agent in Beverly Hills, California and Beyond",
        }),
      ],
    });
    const findings = rulePageTitleLength.evaluate(ctx);
    expect(findings.some((f) => f.status === "warning")).toBe(true);
  });
});
