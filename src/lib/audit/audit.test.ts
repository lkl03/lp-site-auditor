import { describe, it, expect } from "vitest";
import { validateUrl } from "./scanner";
import { computeOverallScore, computeCategoryScores } from "./scoring";
import {
  ruleProhibitedOffMarket,
  ruleNoPlaceholderImages,
  ruleExpectedPagesFound,
  ruleContactInfoConsistency,
  rulePageTitleLength,
  BASE_RULES,
} from "./rules";
import {
  selectContextRules,
  agentSiteRules,
  teamSiteRules,
  getPropertyPageRules,
  getAdditionalPageRules,
  getBrokerageRules,
  getClientNameRule,
} from "./context-rules";
import { AuditProfileSchema, effectiveBrokerageName, effectiveMlsName } from "./profile";
import { getMlsForState } from "./constants";
import type { AuditContext, PageData, Finding } from "./types";
import type { AuditProfile } from "./profile";

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

function makeProfile(overrides: Partial<AuditProfile> = {}): AuditProfile {
  return {
    url: "https://example.com",
    siteType: "agent",
    stateOrRegion: "California",
    brokerage: "Compass",
    mls: "CRMLS (California Regional MLS)",
    clientName: "Jane Smith",
    clientMainEmail: "jane@compass.com",
    clientMainPhone: "(310) 555-0100",
    propertyPageMode: "portfolio",
    additionalPages: [],
    format: "json",
    ...overrides,
  };
}

function makeCtx(overrides: Partial<AuditContext> = {}): AuditContext {
  return {
    url: "https://example.com",
    pages: [makePage()],
    expected: {},
    profile: makeProfile(),
    startUrl: new URL("https://example.com"),
    ...overrides,
  };
}

// ── AuditProfile Schema Validation ───────────────────────────────────────────

describe("AuditProfileSchema", () => {
  const validInput = {
    url: "https://example.com",
    siteType: "agent",
    stateOrRegion: "California",
    brokerage: "Compass",
    mls: "CRMLS (California Regional MLS)",
    clientName: "Jane Smith",
    clientMainEmail: "jane@compass.com",
    clientMainPhone: "(310) 555-0100",
    propertyPageMode: "portfolio",
    additionalPages: [],
  };

  it("accepts a fully valid profile", () => {
    const result = AuditProfileSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing url", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, url: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid url (no protocol)", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, url: "example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects ftp:// url", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, url: "ftp://example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects missing siteType", () => {
    const { siteType: _, ...rest } = validInput;
    const result = AuditProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid siteType", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, siteType: "solo" });
    expect(result.success).toBe(false);
  });

  it("rejects missing stateOrRegion", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, stateOrRegion: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing brokerage", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, brokerage: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing mls", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, mls: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing clientName", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, clientName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing clientMainEmail", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, clientMainEmail: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, clientMainEmail: "notanemail" });
    expect(result.success).toBe(false);
  });

  it("rejects missing clientMainPhone", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, clientMainPhone: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing propertyPageMode", () => {
    const { propertyPageMode: _, ...rest } = validInput;
    const result = AuditProfileSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid propertyPageMode", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, propertyPageMode: "combined" });
    expect(result.success).toBe(false);
  });

  it("defaults additionalPages to empty array if omitted", () => {
    const { additionalPages: _, ...rest } = validInput;
    const result = AuditProfileSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.additionalPages).toEqual([]);
  });

  it("accepts 'team' siteType", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, siteType: "team" });
    expect(result.success).toBe(true);
  });

  it("accepts 'separate-sale-sold' propertyPageMode", () => {
    const result = AuditProfileSchema.safeParse({ ...validInput, propertyPageMode: "separate-sale-sold" });
    expect(result.success).toBe(true);
  });
});

// ── Brokerage "Other" behavior ────────────────────────────────────────────────

describe("effectiveBrokerageName", () => {
  it("returns the brokerage name directly when not 'Other'", () => {
    const profile = makeProfile({ brokerage: "Compass" });
    expect(effectiveBrokerageName(profile)).toBe("Compass");
  });

  it("returns brokerageOtherName when brokerage is 'Other'", () => {
    const profile = makeProfile({ brokerage: "Other", brokerageOtherName: "My Custom Realty" });
    expect(effectiveBrokerageName(profile)).toBe("My Custom Realty");
  });

  it("returns 'Other' when brokerage is 'Other' but no otherName provided", () => {
    const profile = makeProfile({ brokerage: "Other", brokerageOtherName: undefined });
    expect(effectiveBrokerageName(profile)).toBe("Other");
  });
});

// ── MLS "Other" behavior ──────────────────────────────────────────────────────

describe("effectiveMlsName", () => {
  it("returns the MLS name directly when not 'Other'", () => {
    const profile = makeProfile({ mls: "CRMLS (California Regional MLS)" });
    expect(effectiveMlsName(profile)).toBe("CRMLS (California Regional MLS)");
  });

  it("returns mlsOtherName when mls is 'Other'", () => {
    const profile = makeProfile({ mls: "Other", mlsOtherName: "Local County MLS" });
    expect(effectiveMlsName(profile)).toBe("Local County MLS");
  });

  it("returns 'Other' when mls is 'Other' but no otherName provided", () => {
    const profile = makeProfile({ mls: "Other", mlsOtherName: undefined });
    expect(effectiveMlsName(profile)).toBe("Other");
  });
});

// ── State-to-MLS dependent dropdown ──────────────────────────────────────────

describe("getMlsForState", () => {
  it("returns MLS options for California", () => {
    const options = getMlsForState("California");
    expect(options).toContain("CRMLS (California Regional MLS)");
    expect(options.length).toBeGreaterThan(1);
  });

  it("returns MLS options for New York", () => {
    const options = getMlsForState("New York");
    expect(options.length).toBeGreaterThan(0);
    expect(options).toContain("Other"); // Always includes Other as fallback
  });

  it("returns MLS options for Florida", () => {
    const options = getMlsForState("Florida");
    expect(options.length).toBeGreaterThan(0);
  });

  it("returns MLS options for Texas", () => {
    const options = getMlsForState("Texas");
    expect(options.length).toBeGreaterThan(0);
  });

  it("returns ['Other'] for unknown state", () => {
    const options = getMlsForState("Unknown State XYZ");
    expect(options).toEqual(["Other"]);
  });

  it("returns different options for different states", () => {
    const caOptions = getMlsForState("California");
    const nyOptions = getMlsForState("New York");
    // Not identical — different markets
    expect(caOptions).not.toEqual(nyOptions);
  });

  it("resets correctly when switching states (MLS for old state absent in new state list)", () => {
    const caOptions = getMlsForState("California");
    const txOptions = getMlsForState("Texas");
    // A CA-specific MLS should not appear in TX
    expect(txOptions).not.toContain("SFAR (San Francisco Association of Realtors MLS)");
    expect(caOptions).not.toContain("SABOR"); // TX-specific
  });
});

// ── Agent vs Team rule activation ─────────────────────────────────────────────

describe("selectContextRules — agent vs team", () => {
  it("includes agent-about-page rule for agent siteType", () => {
    const ctx = makeCtx({ profile: makeProfile({ siteType: "agent" }) });
    const rules = selectContextRules(ctx);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("agent-about-page");
    expect(ids).not.toContain("team-page-exists");
  });

  it("includes team-page-exists rule for team siteType", () => {
    const ctx = makeCtx({ profile: makeProfile({ siteType: "team" }) });
    const rules = selectContextRules(ctx);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("team-page-exists");
    expect(ids).not.toContain("agent-about-page");
  });

  it("agent rules do not fire team checks", () => {
    const ctx = makeCtx({ profile: makeProfile({ siteType: "agent" }) });
    const rules = selectContextRules(ctx);
    const teamIds = teamSiteRules.map((r) => r.id);
    const ruleIds = rules.map((r) => r.id);
    for (const tid of teamIds) {
      expect(ruleIds).not.toContain(tid);
    }
  });

  it("team rules do not fire agent checks", () => {
    const ctx = makeCtx({ profile: makeProfile({ siteType: "team" }) });
    const rules = selectContextRules(ctx);
    const agentIds = agentSiteRules.map((r) => r.id);
    const ruleIds = rules.map((r) => r.id);
    for (const aid of agentIds) {
      expect(ruleIds).not.toContain(aid);
    }
  });
});

describe("agentSiteRules evaluation", () => {
  it("agent-about-page passes when /about page is scanned", () => {
    const ctx = makeCtx({
      profile: makeProfile({ siteType: "agent" }),
      pages: [
        makePage({ url: "https://example.com/" }),
        makePage({ url: "https://example.com/about" }),
      ],
    });
    const rule = agentSiteRules.find((r) => r.id === "agent-about-page")!;
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("agent-about-page fails when no about/bio page found", () => {
    const ctx = makeCtx({
      profile: makeProfile({ siteType: "agent" }),
      pages: [makePage({ url: "https://example.com/" })],
    });
    const rule = agentSiteRules.find((r) => r.id === "agent-about-page")!;
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });

  it("agent-contact-form passes when CTA present", () => {
    const ctx = makeCtx({
      profile: makeProfile({ siteType: "agent" }),
      pages: [makePage({ hasCTA: true })],
    });
    const rule = agentSiteRules.find((r) => r.id === "agent-contact-form")!;
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("agent-contact-form fails when no form and no CTA", () => {
    const ctx = makeCtx({
      profile: makeProfile({ siteType: "agent" }),
      pages: [makePage({ hasCTA: false, forms: [] })],
    });
    const rule = agentSiteRules.find((r) => r.id === "agent-contact-form")!;
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });

  it("agent rules produce contextTriggered: true", () => {
    const ctx = makeCtx({ profile: makeProfile({ siteType: "agent" }) });
    for (const rule of agentSiteRules) {
      const findings = rule.evaluate(ctx);
      for (const f of findings) {
        expect(f.contextTriggered).toBe(true);
      }
    }
  });
});

describe("teamSiteRules evaluation", () => {
  it("team-page-exists passes when /team page is scanned", () => {
    const ctx = makeCtx({
      profile: makeProfile({ siteType: "team" }),
      pages: [
        makePage({ url: "https://example.com/" }),
        makePage({ url: "https://example.com/team" }),
      ],
    });
    const rule = teamSiteRules.find((r) => r.id === "team-page-exists")!;
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("team-page-exists fails when no team page found", () => {
    const ctx = makeCtx({
      profile: makeProfile({ siteType: "team" }),
      pages: [makePage({ url: "https://example.com/" })],
    });
    const rule = teamSiteRules.find((r) => r.id === "team-page-exists")!;
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });
});

// ── Portfolio vs Separate-Sale-Sold rule activation ───────────────────────────

describe("getPropertyPageRules", () => {
  it("portfolio mode returns portfolio-page-exists rule", () => {
    const rules = getPropertyPageRules("portfolio");
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("portfolio-page-exists");
    expect(ids).not.toContain("properties-for-sale-page");
    expect(ids).not.toContain("sold-past-transactions-page");
  });

  it("separate-sale-sold mode returns for-sale and sold rules", () => {
    const rules = getPropertyPageRules("separate-sale-sold");
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("properties-for-sale-page");
    expect(ids).toContain("sold-past-transactions-page");
    expect(ids).not.toContain("portfolio-page-exists");
  });

  it("portfolio-page-exists passes when /portfolio page found", () => {
    const ctx = makeCtx({
      pages: [
        makePage({ url: "https://example.com/" }),
        makePage({ url: "https://example.com/portfolio" }),
      ],
    });
    const rule = getPropertyPageRules("portfolio").find((r) => r.id === "portfolio-page-exists")!;
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("portfolio-page-exists fails when no portfolio page found", () => {
    const ctx = makeCtx({
      pages: [makePage({ url: "https://example.com/" })],
    });
    const rule = getPropertyPageRules("portfolio").find((r) => r.id === "portfolio-page-exists")!;
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });

  it("properties-for-sale-page passes when /for-sale page found", () => {
    const ctx = makeCtx({
      pages: [
        makePage({ url: "https://example.com/" }),
        makePage({ url: "https://example.com/for-sale" }),
      ],
    });
    const rule = getPropertyPageRules("separate-sale-sold").find((r) => r.id === "properties-for-sale-page")!;
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("sold-past-transactions-page passes when /sold page found", () => {
    const ctx = makeCtx({
      pages: [
        makePage({ url: "https://example.com/" }),
        makePage({ url: "https://example.com/sold" }),
      ],
    });
    const rule = getPropertyPageRules("separate-sale-sold").find((r) => r.id === "sold-past-transactions-page")!;
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("selectContextRules uses portfolio rules when propertyPageMode is portfolio", () => {
    const ctx = makeCtx({ profile: makeProfile({ propertyPageMode: "portfolio" }) });
    const rules = selectContextRules(ctx);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("portfolio-page-exists");
    expect(ids).not.toContain("properties-for-sale-page");
  });

  it("selectContextRules uses separate-sale-sold rules when propertyPageMode is separate-sale-sold", () => {
    const ctx = makeCtx({ profile: makeProfile({ propertyPageMode: "separate-sale-sold" }) });
    const rules = selectContextRules(ctx);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("properties-for-sale-page");
    expect(ids).toContain("sold-past-transactions-page");
    expect(ids).not.toContain("portfolio-page-exists");
  });
});

// ── Additional page expected-rule activation ──────────────────────────────────

describe("getAdditionalPageRules", () => {
  it("returns no rules when additionalPages is empty", () => {
    const rules = getAdditionalPageRules([]);
    expect(rules).toHaveLength(0);
  });

  it("returns rules for Buyers page when selected", () => {
    const rules = getAdditionalPageRules(["Buyers"]);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("additional-page-buyers");
  });

  it("returns rules for Sellers page when selected", () => {
    const rules = getAdditionalPageRules(["Sellers"]);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("additional-page-sellers");
  });

  it("returns rules for Neighborhoods page when selected", () => {
    const rules = getAdditionalPageRules(["Neighborhoods"]);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("additional-page-neighborhoods");
  });

  it("returns rules for Blog, Testimonials, and Contact together", () => {
    const rules = getAdditionalPageRules(["Blog", "Testimonials", "Contact"]);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("additional-page-blog");
    expect(ids).toContain("additional-page-testimonials");
    expect(ids).toContain("additional-page-contact");
  });

  it("ignores 'Other' in additionalPages", () => {
    const rules = getAdditionalPageRules(["Other"]);
    expect(rules).toHaveLength(0);
  });

  it("additional page rule passes when URL pattern matches", () => {
    const ctx = makeCtx({
      pages: [
        makePage({ url: "https://example.com/" }),
        makePage({ url: "https://example.com/buyers" }),
      ],
    });
    const rules = getAdditionalPageRules(["Buyers"]);
    const existenceRule = rules.find((r) => r.id === "additional-page-buyers")!;
    const findings = existenceRule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("additional page rule fails when URL pattern not found", () => {
    const ctx = makeCtx({
      pages: [makePage({ url: "https://example.com/" })],
    });
    const rules = getAdditionalPageRules(["Buyers"]);
    const existenceRule = rules.find((r) => r.id === "additional-page-buyers")!;
    const findings = existenceRule.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });

  it("Videos page includes video embed source rule", () => {
    const rules = getAdditionalPageRules(["Videos"]);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("videos-embed-source");
  });

  it("Videos embed rule passes when video pages detected", () => {
    const ctx = makeCtx({
      pages: [
        makePage({ url: "https://example.com/" }),
        makePage({ url: "https://example.com/videos", hasVideo: true }),
      ],
    });
    const rules = getAdditionalPageRules(["Videos"]);
    const embedRule = rules.find((r) => r.id === "videos-embed-source")!;
    const findings = embedRule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("selectContextRules activates Buyers and Sellers rules when selected", () => {
    const ctx = makeCtx({
      profile: makeProfile({ additionalPages: ["Buyers", "Sellers"] }),
    });
    const rules = selectContextRules(ctx);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("additional-page-buyers");
    expect(ids).toContain("additional-page-sellers");
  });
});

// ── Client Name Visibility ────────────────────────────────────────────────────

describe("getClientNameRule", () => {
  it("passes when client name is found in page content", () => {
    const ctx = makeCtx({
      profile: makeProfile({ clientName: "Jane Smith" }),
      pages: [makePage({ textSample: "Welcome — Jane Smith, your Beverly Hills realtor" })],
    });
    const rule = getClientNameRule("Jane Smith");
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("fails when client name is NOT found anywhere in page content", () => {
    const ctx = makeCtx({
      profile: makeProfile({ clientName: "Jane Smith" }),
      pages: [makePage({ textSample: "Welcome to our real estate website" })],
    });
    const rule = getClientNameRule("Jane Smith");
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });

  it("passes on partial match (last name only)", () => {
    const ctx = makeCtx({
      profile: makeProfile({ clientName: "Jane Smith" }),
      pages: [makePage({ textSample: "The Smith Group — Beverly Hills real estate" })],
    });
    const rule = getClientNameRule("Jane Smith");
    const findings = rule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("is included in selectContextRules for all profiles", () => {
    const ctx = makeCtx();
    const rules = selectContextRules(ctx);
    expect(rules.map((r) => r.id)).toContain("client-name-visible");
  });
});

// ── Brokerage Rules ───────────────────────────────────────────────────────────

describe("getBrokerageRules", () => {
  it("returns brokerage-name-present rule for any brokerage", () => {
    const rules = getBrokerageRules("Compass");
    expect(rules.map((r) => r.id)).toContain("brokerage-name-present");
  });

  it("returns Compass-specific placeholder scan rule", () => {
    const rules = getBrokerageRules("Compass");
    expect(rules.map((r) => r.id)).toContain("compass-placeholder-scan");
  });

  it("Compass placeholder rule fails when placeholder text found", () => {
    const ctx = makeCtx({
      pages: [makePage({ textSample: "Welcome, client name — reach out today" })],
    });
    const rules = getBrokerageRules("Compass");
    const placeholderRule = rules.find((r) => r.id === "compass-placeholder-scan")!;
    const findings = placeholderRule.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });

  it("Compass placeholder rule passes when no placeholder text", () => {
    const ctx = makeCtx({
      pages: [makePage({ textSample: "Welcome to Jane Smith Compass realty" })],
    });
    const rules = getBrokerageRules("Compass");
    const placeholderRule = rules.find((r) => r.id === "compass-placeholder-scan")!;
    const findings = placeholderRule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("returns Sotheby's disclaimer rule for SIR brokerage", () => {
    const rules = getBrokerageRules("Sotheby's International Realty");
    expect(rules.map((r) => r.id)).toContain("sothebys-independently-owned");
  });

  it("SIR disclaimer rule fails when disclaimer not found", () => {
    const ctx = makeCtx({
      pages: [makePage({ textSample: "Sotheby's International Realty luxury real estate" })],
    });
    const rules = getBrokerageRules("Sotheby's International Realty");
    const disclaimerRule = rules.find((r) => r.id === "sothebys-independently-owned")!;
    const findings = disclaimerRule.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });

  it("SIR disclaimer rule passes when disclaimer found", () => {
    const ctx = makeCtx({
      pages: [makePage({ textSample: "Each office is independently owned and operated." })],
    });
    const rules = getBrokerageRules("Sotheby's International Realty");
    const disclaimerRule = rules.find((r) => r.id === "sothebys-independently-owned")!;
    const findings = disclaimerRule.evaluate(ctx);
    expect(findings.some((f) => f.status === "pass")).toBe(true);
  });

  it("includes brokerage-compliance-review human review for all brokerages", () => {
    const rules = getBrokerageRules("Keller Williams");
    expect(rules.map((r) => r.id)).toContain("brokerage-compliance-review");
  });

  it("'Other' brokerage uses custom name in rules", () => {
    const rules = getBrokerageRules("Other", "My Custom Realty");
    const nameRule = rules.find((r) => r.id === "brokerage-name-present")!;
    expect(nameRule.title).toContain("My Custom Realty");
  });
});

// ── Off-Market Prohibited Term Detection ─────────────────────────────────────

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

  it("fails when 'off market' (without hyphen) present", () => {
    const ctx = makeCtx({
      pages: [makePage({ prohibitedTerms: ["off market"] })],
    });
    const findings = ruleProhibitedOffMarket.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });

  it("fails when 'pocket listing' present", () => {
    const ctx = makeCtx({
      pages: [makePage({ prohibitedTerms: ["pocket listing"] })],
    });
    const findings = ruleProhibitedOffMarket.evaluate(ctx);
    expect(findings.some((f) => f.status === "fail")).toBe(true);
  });

  it("flags each page individually with the term found", () => {
    const ctx = makeCtx({
      pages: [
        makePage({ url: "https://example.com/", prohibitedTerms: ["off-market"] }),
        makePage({ url: "https://example.com/about", prohibitedTerms: ["pocket listing"] }),
      ],
    });
    const findings = ruleProhibitedOffMarket.evaluate(ctx);
    expect(findings.filter((f) => f.status === "fail").length).toBeGreaterThanOrEqual(2);
  });
});

// ── Meta description findings no longer generated ────────────────────────────

describe("BASE_RULES — meta description rules removed", () => {
  it("does not include ruleMetaDescriptionExists in BASE_RULES", () => {
    const ids = BASE_RULES.map((r) => r.id);
    expect(ids).not.toContain("meta-description-exists");
    expect(ids).not.toContain("meta-description");
    // Make sure no rule ID contains 'meta-desc'
    expect(ids.every((id) => !id.includes("meta-desc"))).toBe(true);
  });

  it("does not include unique meta descriptions rule", () => {
    const ids = BASE_RULES.map((r) => r.id);
    expect(ids.every((id) => !id.includes("unique-meta"))).toBe(true);
  });

  it("does not include H1 rule in BASE_RULES", () => {
    const ids = BASE_RULES.map((r) => r.id);
    // H1 check should not be in base rules (removed in refactor)
    expect(ids.every((id) => !id.toLowerCase().includes("h1-exists"))).toBe(true);
  });
});

// ── Top Recommendations Sorting ───────────────────────────────────────────────

describe("top recommendations sorting", () => {
  const ORDER: Record<string, number> = { CRITICAL: 0, REQUIRED: 1, VERIFY: 2, CONDITIONAL: 3, HUMAN_REVIEW: 4 };

  function buildTopRecommendations(findings: Finding[]): Finding[] {
    const actionable = findings.filter(
      (f) => f.status === "fail" || f.status === "warning"
    );
    return [...actionable].sort(
      (a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9)
    ).slice(0, 8);
  }

  it("sorts CRITICAL before REQUIRED before VERIFY", () => {
    const findings: Finding[] = [
      {
        id: "c", category: "Compliance", title: "Critical", severity: "CRITICAL",
        status: "fail", scoreImpact: -10, evidence: [], recommendation: "",
      },
      {
        id: "v", category: "SEO", title: "Verify", severity: "VERIFY",
        status: "warning", scoreImpact: -2, evidence: [], recommendation: "",
      },
      {
        id: "r", category: "SEO", title: "Required", severity: "REQUIRED",
        status: "fail", scoreImpact: -5, evidence: [], recommendation: "",
      },
    ];

    const top = buildTopRecommendations(findings);
    expect(top[0].severity).toBe("CRITICAL");
    expect(top[1].severity).toBe("REQUIRED");
    expect(top[2].severity).toBe("VERIFY");
  });

  it("excludes passing findings", () => {
    const findings: Finding[] = [
      {
        id: "pass1", category: "SEO", title: "Passing", severity: "REQUIRED",
        status: "pass", scoreImpact: 0, evidence: [], recommendation: "",
      },
      {
        id: "fail1", category: "Compliance", title: "Failing", severity: "CRITICAL",
        status: "fail", scoreImpact: -10, evidence: [], recommendation: "",
      },
    ];
    const top = buildTopRecommendations(findings);
    expect(top).toHaveLength(1);
    expect(top[0].id).toBe("fail1");
  });

  it("limits to 8 recommendations max", () => {
    const findings: Finding[] = Array.from({ length: 15 }, (_, i) => ({
      id: `f${i}`,
      category: "Compliance" as const,
      title: `Finding ${i}`,
      severity: "REQUIRED" as const,
      status: "fail" as const,
      scoreImpact: -5,
      evidence: [],
      recommendation: "",
    }));
    const top = buildTopRecommendations(findings);
    expect(top).toHaveLength(8);
  });

  it("includes warnings as actionable", () => {
    const findings: Finding[] = [
      {
        id: "w1", category: "SEO", title: "Warning", severity: "VERIFY",
        status: "warning", scoreImpact: -2, evidence: [], recommendation: "",
      },
    ];
    const top = buildTopRecommendations(findings);
    expect(top).toHaveLength(1);
  });

  it("excludes needs_review from top recommendations", () => {
    const findings: Finding[] = [
      {
        id: "hr1", category: "Compliance", title: "Human Review", severity: "HUMAN_REVIEW",
        status: "needs_review", scoreImpact: 0, evidence: [], recommendation: "",
      },
    ];
    const top = buildTopRecommendations(findings);
    expect(top).toHaveLength(0);
  });

  it("returns empty array when all findings pass", () => {
    const findings: Finding[] = [
      {
        id: "p1", category: "SEO", title: "Pass", severity: "REQUIRED",
        status: "pass", scoreImpact: 0, evidence: [], recommendation: "",
      },
    ];
    const top = buildTopRecommendations(findings);
    expect(top).toHaveLength(0);
  });
});

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
        id: "x", category: "Compliance", title: "Test", severity: "CRITICAL",
        status: "fail", scoreImpact: -10, evidence: [], recommendation: "",
      },
    ];
    expect(computeOverallScore(findings)).toBe(90);
  });

  it("deducts 5 for required fail", () => {
    const findings: Finding[] = [
      {
        id: "x", category: "SEO", title: "Test", severity: "REQUIRED",
        status: "fail", scoreImpact: -5, evidence: [], recommendation: "",
      },
    ];
    expect(computeOverallScore(findings)).toBe(95);
  });

  it("does not deduct for HUMAN_REVIEW", () => {
    const findings: Finding[] = [
      {
        id: "x", category: "Compliance", title: "Test", severity: "HUMAN_REVIEW",
        status: "needs_review", scoreImpact: 0, evidence: [], recommendation: "",
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

  it("does not deduct for passing findings", () => {
    const findings: Finding[] = [
      {
        id: "x", category: "SEO", title: "Test", severity: "REQUIRED",
        status: "pass", scoreImpact: 0, evidence: [], recommendation: "",
      },
    ];
    expect(computeOverallScore(findings)).toBe(100);
  });
});

describe("computeCategoryScores", () => {
  it("returns score per category", () => {
    const findings: Finding[] = [
      {
        id: "a", category: "SEO", title: "Title", severity: "REQUIRED",
        status: "fail", scoreImpact: -5, evidence: [], recommendation: "",
      },
      {
        id: "b", category: "SEO", title: "H1", severity: "REQUIRED",
        status: "pass", scoreImpact: 0, evidence: [], recommendation: "",
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

// ── Other Base Rules ──────────────────────────────────────────────────────────

describe("ruleNoPlaceholderImages", () => {
  it("passes when no placeholder images", () => {
    const ctx = makeCtx();
    const findings = ruleNoPlaceholderImages.evaluate(ctx);
    expect(findings.every((f) => f.status === "pass")).toBe(true);
  });

  it("fails when placeholder image detected", () => {
    const ctx = makeCtx({
      pages: [makePage({ placeholderImages: ["https://via.placeholder.com/300x200"] })],
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
      pages: [makePage({ title: "The Very Best Luxury Real Estate Agent in Beverly Hills, California and Beyond" })],
    });
    const findings = rulePageTitleLength.evaluate(ctx);
    expect(findings.some((f) => f.status === "warning")).toBe(true);
  });
});
