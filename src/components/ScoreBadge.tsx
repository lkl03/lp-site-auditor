"use client";

import { clsx } from "clsx";

interface Props {
  score: number;
  size?: "sm" | "md" | "lg";
  label?: string;
}

function scoreColor(score: number) {
  if (score >= 85) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 70) return "text-amber-700 bg-amber-50 border-amber-200";
  if (score >= 50) return "text-orange-700 bg-orange-50 border-orange-200";
  return "text-red-700 bg-red-50 border-red-200";
}

function scoreRing(score: number) {
  if (score >= 85) return "stroke-emerald-500";
  if (score >= 70) return "stroke-amber-500";
  if (score >= 50) return "stroke-orange-500";
  return "stroke-red-500";
}

export function ScoreBadge({ score, size = "md", label }: Props) {
  const r = 40;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;

  const sizeMap = {
    sm: { svg: 80, font: "text-lg", label: "text-xs" },
    md: { svg: 120, font: "text-2xl", label: "text-sm" },
    lg: { svg: 160, font: "text-4xl", label: "text-base" },
  };
  const s = sizeMap[size];

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: s.svg, height: s.svg }}>
        <svg
          width={s.svg}
          height={s.svg}
          viewBox="0 0 100 100"
          className="rotate-[-90deg]"
        >
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            className={clsx("transition-all duration-700", scoreRing(score))}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={clsx("font-bold tabular-nums", s.font, scoreColor(score).split(" ")[0])}>
            {score}
          </span>
          <span className="text-xs text-gray-400">/100</span>
        </div>
      </div>
      {label && (
        <span className={clsx("font-medium text-gray-600", s.label)}>{label}</span>
      )}
    </div>
  );
}

interface SeverityBadgeProps {
  severity: string;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const styles: Record<string, string> = {
    CRITICAL: "bg-red-100 text-red-700 border border-red-200",
    REQUIRED: "bg-orange-100 text-orange-700 border border-orange-200",
    VERIFY: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    CONDITIONAL: "bg-blue-100 text-blue-700 border border-blue-200",
    HUMAN_REVIEW: "bg-purple-100 text-purple-700 border border-purple-200",
  };

  return (
    <span
      className={clsx(
        "inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
        styles[severity] ?? "bg-gray-100 text-gray-600"
      )}
    >
      {severity.replace("_", " ")}
    </span>
  );
}

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const map: Record<string, { label: string; cls: string }> = {
    pass: { label: "✓ Pass", cls: "text-emerald-700 bg-emerald-50" },
    fail: { label: "✗ Fail", cls: "text-red-700 bg-red-50" },
    warning: { label: "⚠ Warning", cls: "text-amber-700 bg-amber-50" },
    needs_review: { label: "🔍 Review", cls: "text-purple-700 bg-purple-50" },
    not_applicable: { label: "N/A", cls: "text-gray-500 bg-gray-50" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", cls)}>
      {label}
    </span>
  );
}
