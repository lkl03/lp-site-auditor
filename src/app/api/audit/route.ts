import { NextRequest, NextResponse } from "next/server";
import { AuditProfileSchema, effectiveBrokerageName } from "@/lib/audit/profile";
import { validateUrl, crawlSite } from "@/lib/audit/scanner";
import { BASE_RULES } from "@/lib/audit/rules";
import { selectContextRules } from "@/lib/audit/context-rules";
import { computeOverallScore, computeCategoryScores } from "@/lib/audit/scoring";
import type { AuditResult, AuditContext, Finding } from "@/lib/audit/types";
import { generateMarkdownReport, generateCsvReport } from "@/lib/audit/report";
import { randomUUID } from "crypto";

export const maxDuration = 60;

/** Sort non-passing findings by severity for top recommendations. */
function buildTopRecommendations(findings: Finding[]): Finding[] {
  const ORDER: Record<string, number> = { CRITICAL: 0, REQUIRED: 1, VERIFY: 2, CONDITIONAL: 3, HUMAN_REVIEW: 4 };
  const actionable = findings.filter(
    (f) => f.status === "fail" || f.status === "warning"
  );
  return [...actionable].sort(
    (a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9)
  ).slice(0, 8);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate full AuditProfile
  const parsed = AuditProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const profile = parsed.data;
  const { url: rawUrl, format } = profile;

  const urlCheck = validateUrl(rawUrl);
  if (!urlCheck.ok) {
    return NextResponse.json({ error: urlCheck.error }, { status: 400 });
  }

  const startUrl = urlCheck.url;
  const startedAt = Date.now();

  let pages;
  try {
    pages = await crawlSite(startUrl);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to crawl site",
        detail: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 }
    );
  }

  // Build context — populate expected from profile for backward-compat rules
  const ctx: AuditContext = {
    url: startUrl.toString(),
    pages,
    expected: {
      clientName: profile.clientName,
      brokerage: effectiveBrokerageName(profile),
      market: profile.stateOrRegion,
      phone: profile.clientMainPhone,
      email: profile.clientMainEmail,
      pages: profile.additionalPages.filter((p) => p !== "Other"),
    },
    profile,
    startUrl,
  };

  // Run base rules + context rules
  const allRules = [...BASE_RULES, ...selectContextRules(ctx)];
  const allFindings: Finding[] = [];
  for (const rule of allRules) {
    try {
      const results = rule.evaluate(ctx);
      allFindings.push(...results);
    } catch {
      // Skip rules that throw — keep audit going
    }
  }

  const humanReviewItems = allFindings.filter((f) => f.severity === "HUMAN_REVIEW");
  const scoredFindings = allFindings.filter((f) => f.severity !== "HUMAN_REVIEW");

  const overallScore = computeOverallScore(scoredFindings);
  const categoryScores = computeCategoryScores(allFindings);
  const topRecommendations = buildTopRecommendations(scoredFindings);

  const succeeded = pages.filter((p) => !p.error && p.statusCode >= 200 && p.statusCode < 400);
  const failed = pages.filter((p) => p.error || p.statusCode === 0 || p.statusCode >= 400);

  const result: AuditResult & { markdownReport?: string; csvReport?: string } = {
    auditId: randomUUID(),
    url: startUrl.toString(),
    scannedAt: new Date().toISOString(),
    overallScore,
    categoryScores,
    topRecommendations,
    pagesScanned: pages.map((p) => ({
      url: p.url,
      title: p.title,
      statusCode: p.statusCode,
    })),
    findings: scoredFindings,
    humanReviewItems,
    profile: {
      siteType: profile.siteType,
      clientName: profile.clientName,
      brokerage: effectiveBrokerageName(profile),
      stateOrRegion: profile.stateOrRegion,
      mls: profile.mls === "Other" ? (profile.mlsOtherName ?? "Other") : profile.mls,
    },
    metadata: {
      durationMs: Date.now() - startedAt,
      pagesAttempted: pages.length,
      pagesSucceeded: succeeded.length,
      pagesFailed: failed.length,
    },
  };

  if (format === "markdown") {
    result.markdownReport = generateMarkdownReport(result);
  } else if (format === "csv") {
    result.csvReport = generateCsvReport(result);
  } else {
    result.markdownReport = generateMarkdownReport(result);
    result.csvReport = generateCsvReport(result);
  }

  return NextResponse.json(result, { status: 200 });
}
