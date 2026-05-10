"use client";

import { useState, useCallback } from "react";
import { Download, Copy, Check, RefreshCw, ExternalLink } from "lucide-react";
import { ScoreBadge } from "./ScoreBadge";
import { FindingCard } from "./FindingCard";
import type { AuditResult, AuditCategory, Finding } from "@/lib/audit/types";

interface Props {
  result: AuditResult & { markdownReport?: string; csvReport?: string };
  onReset: () => void;
}

function scoreLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs Work";
  return "Critical Issues";
}

function scoreDescription(score: number) {
  if (score >= 85) return "Site looks ready for QA handoff — review human items below.";
  if (score >= 70) return "A few items need attention before QA handoff.";
  if (score >= 50) return "Several issues found — address before submitting to QA.";
  return "Critical issues detected. Fix these before QA handoff.";
}

type FilterMode = "all" | "issues" | "review";

export function AuditResults({ result, onReset }: Props) {
  const [copiedMd, setCopiedMd] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [activeCategory, setActiveCategory] = useState<AuditCategory | "all">("all");

  const criticals = result.findings.filter((f) => f.severity === "CRITICAL" && f.status === "fail");
  const required = result.findings.filter((f) => f.severity === "REQUIRED" && f.status === "fail");
  const warnings = result.findings.filter((f) => f.status === "warning" || (f.severity === "VERIFY" && f.status === "fail"));
  const passing = result.findings.filter((f) => f.status === "pass");

  const allFindings = [...result.findings, ...result.humanReviewItems];
  const categories = [...new Set(allFindings.map((f) => f.category))] as AuditCategory[];

  function getVisibleFindings(): Finding[] {
    let pool: Finding[] = [];
    if (filter === "all") pool = [...result.findings, ...result.humanReviewItems];
    else if (filter === "issues") pool = result.findings.filter((f) => f.status !== "pass");
    else if (filter === "review") pool = result.humanReviewItems;

    if (activeCategory !== "all") pool = pool.filter((f) => f.category === activeCategory);
    return pool;
  }

  const copyMarkdown = useCallback(() => {
    if (!result.markdownReport) return;
    navigator.clipboard.writeText(result.markdownReport).then(() => {
      setCopiedMd(true);
      setTimeout(() => setCopiedMd(false), 2000);
    });
  }, [result.markdownReport]);

  function downloadJson() {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qa-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  function downloadCsv() {
    if (!result.csvReport) return;
    const blob = new Blob([result.csvReport], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qa-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const visible = getVisibleFindings();

  return (
    <div className="space-y-8">
      {/* Disclaimer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Pre-QA guidance only.</strong> This automated scan does not replace QA team review.
        It is an orientation tool to help catch obvious issues before handoff. Always complete a full
        manual review before submitting to QA.
      </div>

      {/* Score overview */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <ScoreBadge score={result.overallScore} size="lg" />
          <div className="flex-1 text-center sm:text-left">
            <h2 className="text-xl font-bold text-gray-900">{scoreLabel(result.overallScore)}</h2>
            <p className="text-sm text-gray-500 mt-1">{scoreDescription(result.overallScore)}</p>
            <p className="text-xs text-gray-400 mt-2">
              Orientation score — not an official QA approval
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <ExternalLink size={11} />
                {result.url.slice(0, 60)}{result.url.length > 60 ? "…" : ""}
              </a>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-gray-400">
                {result.metadata.pagesSucceeded}/{result.metadata.pagesAttempted} pages scanned ·{" "}
                {(result.metadata.durationMs / 1000).toFixed(1)}s ·{" "}
                {new Date(result.scannedAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Summary counts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 border-t border-gray-50 pt-5">
          <SummaryCount label="Critical" count={criticals.length} color="text-red-600 bg-red-50" />
          <SummaryCount label="Required Fixes" count={required.length} color="text-orange-600 bg-orange-50" />
          <SummaryCount label="Warnings" count={warnings.length} color="text-amber-600 bg-amber-50" />
          <SummaryCount label="Human Review" count={result.humanReviewItems.length} color="text-purple-600 bg-purple-50" />
        </div>
      </div>

      {/* Category score grid */}
      {result.categoryScores.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Category Breakdown
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.categoryScores.map((cs) => (
              <button
                key={cs.category}
                onClick={() => {
                  setActiveCategory((c) => (c === cs.category ? "all" : cs.category));
                  setFilter("all");
                }}
                className={`rounded-lg border p-3 text-left hover:shadow-sm transition-all ${
                  activeCategory === cs.category
                    ? "border-amber-400 bg-amber-50"
                    : "border-gray-100 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-700 leading-tight">
                    {cs.category}
                  </span>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      cs.score >= 85
                        ? "text-emerald-600"
                        : cs.score >= 70
                        ? "text-amber-600"
                        : "text-red-600"
                    }`}
                  >
                    {cs.score}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      cs.score >= 85
                        ? "bg-emerald-400"
                        : cs.score >= 70
                        ? "bg-amber-400"
                        : "bg-red-400"
                    }`}
                    style={{ width: `${cs.score}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  {cs.passed}✓ {cs.failed > 0 ? `${cs.failed}✗` : ""}{" "}
                  {cs.warnings > 0 ? `${cs.warnings}⚠` : ""}
                  {cs.humanReview > 0 ? ` ${cs.humanReview}🔍` : ""}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Export buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={copyMarkdown}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {copiedMd ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          {copiedMd ? "Copied!" : "Copy Markdown"}
        </button>
        <button
          onClick={downloadJson}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Download size={14} />
          Download JSON
        </button>
        <button
          onClick={downloadCsv}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Download size={14} />
          Download CSV
        </button>
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors ml-auto"
        >
          <RefreshCw size={14} />
          New Scan
        </button>
      </div>

      {/* Findings */}
      <div>
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden text-sm">
            {(["all", "issues", "review"] as FilterMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setFilter(m)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  filter === m
                    ? "bg-amber-700 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {m === "all" ? "All" : m === "issues" ? "Issues" : "Human Review"}
              </button>
            ))}
          </div>
          {activeCategory !== "all" && (
            <button
              onClick={() => setActiveCategory("all")}
              className="text-xs text-amber-700 hover:underline"
            >
              ✕ Clear category filter
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {visible.length} finding{visible.length !== 1 ? "s" : ""}
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-gray-400 text-sm">
            No findings in this filter view.
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((f, i) => (
              <FindingCard key={`${f.id}-${i}`} finding={f} />
            ))}
          </div>
        )}
      </div>

      {/* Pages scanned */}
      {result.pagesScanned.length > 0 && (
        <details className="rounded-xl border border-gray-100 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 rounded-xl select-none">
            Pages Scanned ({result.pagesScanned.length})
          </summary>
          <div className="px-4 pb-3 divide-y divide-gray-50">
            {result.pagesScanned.map((p) => (
              <div key={p.url} className="flex items-center gap-2 py-2">
                <span
                  className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                    p.statusCode >= 200 && p.statusCode < 400
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {p.statusCode || "ERR"}
                </span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline truncate"
                >
                  {p.url}
                </a>
                {p.title && (
                  <span className="text-xs text-gray-400 truncate hidden sm:block">
                    — {p.title}
                  </span>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function SummaryCount({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${color}`}>
      <p className="text-lg font-bold tabular-nums">{count}</p>
      <p className="text-xs font-medium opacity-80">{label}</p>
    </div>
  );
}
