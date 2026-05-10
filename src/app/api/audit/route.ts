import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateUrl, crawlSite } from "@/lib/audit/scanner";
import { ALL_RULES } from "@/lib/audit/rules";
import { computeOverallScore, computeCategoryScores } from "@/lib/audit/scoring";
import type { AuditResult, AuditContext, Finding } from "@/lib/audit/types";
import { generateMarkdownReport, generateCsvReport } from "@/lib/audit/report";
import { randomUUID } from "crypto";

export const maxDuration = 60;

const RequestSchema = z.object({
  url: z.string().min(1, "URL is required"),
  expected: z
    .object({
      clientName: z.string().optional(),
      brokerage: z.string().optional(),
      market: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional().or(z.literal("")),
      pages: z.array(z.string()).optional(),
      agents: z.array(z.string()).optional(),
      neighborhoods: z.array(z.string()).optional(),
    })
    .optional()
    .default({}),
  format: z.enum(["json", "markdown", "csv"]).optional().default("json"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { url: rawUrl, expected, format } = parsed.data;

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

  const ctx: AuditContext = {
    url: startUrl.toString(),
    pages,
    expected: expected ?? {},
    startUrl,
  };

  const allFindings: Finding[] = [];
  for (const rule of ALL_RULES) {
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

  const succeeded = pages.filter((p) => !p.error && p.statusCode >= 200 && p.statusCode < 400);
  const failed = pages.filter((p) => p.error || p.statusCode === 0 || p.statusCode >= 400);

  const result: AuditResult & { markdownReport?: string; csvReport?: string } = {
    auditId: randomUUID(),
    url: startUrl.toString(),
    scannedAt: new Date().toISOString(),
    overallScore,
    categoryScores,
    pagesScanned: pages.map((p) => ({
      url: p.url,
      title: p.title,
      statusCode: p.statusCode,
    })),
    findings: scoredFindings,
    humanReviewItems,
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
