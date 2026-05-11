"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { SeverityBadge, StatusBadge } from "./ScoreBadge";
import type { Finding } from "@/lib/audit/types";

interface Props {
  finding: Finding;
  defaultOpen?: boolean;
}

export function FindingCard({ finding, defaultOpen }: Props) {
  const [open, setOpen] = useState(defaultOpen ?? (finding.status === "fail" || finding.status === "warning"));

  const borderColor =
    finding.status === "fail"
      ? "border-l-red-400"
      : finding.status === "warning"
      ? "border-l-amber-400"
      : finding.status === "needs_review"
      ? "border-l-purple-400"
      : "border-l-emerald-400";

  return (
    <div
      className={`rounded-lg border border-gray-100 bg-white shadow-sm border-l-4 ${borderColor} overflow-hidden`}
    >
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <SeverityBadge severity={finding.severity} />
            <StatusBadge status={finding.status} />
            <span className="text-xs text-gray-400">{finding.category}</span>
            {finding.contextLabel && (
              <span className="text-xs rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 px-1.5 py-0.5">
                {finding.contextLabel}
              </span>
            )}
          </div>
          <p className="font-medium text-gray-900 text-sm leading-snug">{finding.title}</p>
          {finding.pageUrl && (
            <a
              href={finding.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={10} />
              {finding.pageUrl.length > 60
                ? finding.pageUrl.slice(0, 60) + "…"
                : finding.pageUrl}
            </a>
          )}
        </div>
        <div className="shrink-0 text-gray-400 mt-0.5">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-50 bg-gray-50/50">
          {finding.evidence.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Evidence
              </p>
              <ul className="text-xs text-gray-700 space-y-0.5">
                {finding.evidence.map((e, i) => (
                  <li key={i} className="font-mono leading-relaxed">{e}</li>
                ))}
              </ul>
            </div>
          )}
          {finding.recommendation && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Recommendation
              </p>
              <p className="text-xs text-gray-700 leading-relaxed">{finding.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
