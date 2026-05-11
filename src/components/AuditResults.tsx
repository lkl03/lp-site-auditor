"use client";

import { useState, useCallback } from "react";
import {
  Download,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Eye,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { FindingCard } from "./FindingCard";
import type { AuditResult, AuditCategory, Finding } from "@/lib/audit/types";

interface Props {
  result: AuditResult & { markdownReport?: string; csvReport?: string };
  onReset: () => void;
}

export function AuditResults({ result, onReset }: Props) {
  const [copiedMd, setCopiedMd] = useState(false);
  const [showFullDetails, setShowFullDetails] = useState(false);
  const [activeCategory, setActiveCategory] = useState<AuditCategory | "all">("all");

  // Grouped by severity for the "Fix Before QA" sections
  const criticals = result.findings.filter(
    (f) => f.severity === "CRITICAL" && (f.status === "fail" || f.status === "warning")
  );
  const required = result.findings.filter(
    (f) => f.severity === "REQUIRED" && (f.status === "fail" || f.status === "warning")
  );
  const verifyWarnings = result.findings.filter(
    (f) =>
      (f.severity === "VERIFY" || f.severity === "CONDITIONAL") &&
      (f.status === "fail" || f.status === "warning")
  );

  const allIssues = [...criticals, ...required, ...verifyWarnings];
  const allFindings = [...result.findings, ...result.humanReviewItems];
  const categories = [...new Set(allFindings.map((f) => f.category))] as AuditCategory[];

  function getFullDetailsFindings(): Finding[] {
    let pool = [...result.findings, ...result.humanReviewItems];
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

  const { profile } = result;

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Pre-QA orientation only.</strong> This automated scan does not replace QA team review.
        It is a pre-flight tool to help catch avoidable issues before handoff.
        Always complete a full manual review before submitting to QA.
      </div>

      {/* Header — site context + issue counts */}
      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        {/* Title + profile context */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">
              {allIssues.length === 0 ? "No Automated Issues Found" : "Fix Before QA"}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {allIssues.length === 0
                ? "All automated checks passed — review the human checklist before submitting."
                : `${allIssues.length} item${allIssues.length !== 1 ? "s" : ""} need attention before QA handoff.`}
            </p>

            {/* Context tags */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              <Tag label={profile.siteType === "agent" ? "Agent Site" : "Team Site"} color="blue" />
              <Tag label={profile.clientName} color="gray" />
              <Tag label={profile.brokerage} color="gray" />
              <Tag label={profile.stateOrRegion} color="gray" />
              {profile.mls && <Tag label={profile.mls} color="gray" />}
            </div>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <ExternalLink size={11} />
                {result.url.slice(0, 55)}{result.url.length > 55 ? "…" : ""}
              </a>
              <span className="text-xs text-gray-400">
                · {result.metadata.pagesSucceeded}/{result.metadata.pagesAttempted} pages ·{" "}
                {(result.metadata.durationMs / 1000).toFixed(1)}s ·{" "}
                {new Date(result.scannedAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>

        {/* Issue counts */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 border-t border-gray-50 pt-5">
          <SummaryCount label="Critical" count={criticals.length} color="text-red-600 bg-red-50" />
          <SummaryCount label="Required Fixes" count={required.length} color="text-orange-600 bg-orange-50" />
          <SummaryCount label="Verify" count={verifyWarnings.length} color="text-amber-600 bg-amber-50" />
          <SummaryCount
            label="Human Review"
            count={result.humanReviewItems.length}
            color="text-purple-600 bg-purple-50"
            note="manual checks"
          />
        </div>
      </div>

      {/* TOP RECOMMENDATIONS — Critical + Required fixes */}
      {result.topRecommendations.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <XCircle size={16} className="text-red-500" />
            <h3 className="text-sm font-bold text-gray-800">
              Critical & Required Fixes ({result.topRecommendations.length})
            </h3>
          </div>
          <div className="space-y-2">
            {result.topRecommendations.map((f, i) => (
              <FindingCard key={`top-${f.id}-${i}`} finding={f} defaultOpen />
            ))}
          </div>
          {allIssues.length > result.topRecommendations.length && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              +{allIssues.length - result.topRecommendations.length} more items in full details below
            </p>
          )}
        </div>
      )}

      {/* Recommended Checks (VERIFY / CONDITIONAL warnings) — only if not already in topRecommendations */}
      {verifyWarnings.length > 0 &&
        verifyWarnings.some((v) => !result.topRecommendations.find((r) => r.id === v.id)) && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={16} className="text-amber-500" />
              <h3 className="text-sm font-bold text-gray-800">
                Recommended Checks ({verifyWarnings.filter((v) => !result.topRecommendations.find((r) => r.id === v.id)).length})
              </h3>
            </div>
            <div className="space-y-2">
              {verifyWarnings
                .filter((v) => !result.topRecommendations.find((r) => r.id === v.id))
                .map((f, i) => (
                  <FindingCard key={`verify-${f.id}-${i}`} finding={f} />
                ))}
            </div>
          </div>
        )}

      {/* All clear message */}
      {allIssues.length === 0 && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-center text-sm text-emerald-700">
          <strong>No automated issues found!</strong> Review the human-review checklist below before QA handoff.
        </div>
      )}

      {/* Export buttons */}
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={copyMarkdown} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          {copiedMd ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          {copiedMd ? "Copied!" : "Copy Markdown"}
        </button>
        <button onClick={downloadJson} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          <Download size={14} />
          JSON
        </button>
        <button onClick={downloadCsv} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
          <Download size={14} />
          CSV
        </button>
        <button onClick={onReset} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors ml-auto">
          <RefreshCw size={14} />
          New Scan
        </button>
      </div>

      {/* HUMAN REVIEW section */}
      {result.humanReviewItems.length > 0 && (
        <details className="rounded-xl border border-purple-100 bg-purple-50/40">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-purple-800 hover:bg-purple-50 rounded-xl select-none flex items-center gap-2">
            <Eye size={14} />
            Human Review Checklist ({result.humanReviewItems.length} items)
            <span className="text-xs font-normal text-purple-500 ml-1">— manual checks, no score impact</span>
          </summary>
          <div className="px-4 pb-4 space-y-2">
            {result.humanReviewItems.map((f, i) => (
              <FindingCard key={`hr-${f.id}-${i}`} finding={f} />
            ))}
          </div>
        </details>
      )}

      {/* FULL DETAILS (collapsed) */}
      <div className="rounded-xl border border-gray-100 overflow-hidden">
        <button
          onClick={() => setShowFullDetails((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors bg-white"
        >
          <span>
            Full scan details — all {result.findings.length + result.humanReviewItems.length} findings
          </span>
          {showFullDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showFullDetails && (
          <div className="bg-gray-50/50 border-t border-gray-100 p-4 space-y-4">
            {/* Category filter */}
            {result.categoryScores.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filter by Category</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setActiveCategory("all")}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      activeCategory === "all"
                        ? "border-amber-400 bg-amber-50 text-amber-800"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    All
                  </button>
                  {[...new Set(getFullDetailsFindings().map((f) => f.category))].map((cat) => (
                    <button
                      key={cat}
                      onClick={() =>
                        setActiveCategory((c) => (c === cat ? "all" : cat))
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        activeCategory === cat
                          ? "border-amber-400 bg-amber-50 text-amber-800"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* All findings */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                All Findings{activeCategory !== "all" ? ` — ${activeCategory}` : ""} ({getFullDetailsFindings().length})
              </p>
              <div className="space-y-2">
                {getFullDetailsFindings().map((f, i) => (
                  <FindingCard key={`full-${f.id}-${i}`} finding={f} />
                ))}
              </div>
            </div>
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
                  <span className="text-xs text-gray-400 truncate hidden sm:block">— {p.title}</span>
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
  note,
}: {
  label: string;
  count: number;
  color: string;
  note?: string;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${color}`}>
      <p className="text-lg font-bold tabular-nums">{count}</p>
      <p className="text-xs font-medium opacity-80">{label}</p>
      {note && <p className="text-xs opacity-60">{note}</p>}
    </div>
  );
}

function Tag({ label, color }: { label: string; color: "blue" | "gray" }) {
  const cls =
    color === "blue"
      ? "bg-blue-50 border-blue-200 text-blue-700"
      : "bg-gray-100 border-gray-200 text-gray-600";
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
