"use client";

import { useState, useEffect } from "react";
import { AlertCircle, ShieldCheck, Clock, X } from "lucide-react";
import { AuditForm } from "@/components/AuditForm";
import { AuditResults } from "@/components/AuditResults";
import type { AuditProfile } from "@/lib/audit/profile";
import type { AuditResult } from "@/lib/audit/types";

type AuditResultFull = AuditResult & { markdownReport?: string; csvReport?: string };

type AppState =
  | { phase: "idle" }
  | { phase: "loading"; loadingMsg: string }
  | { phase: "result"; result: AuditResultFull }
  | { phase: "error"; message: string };

/** Local history item stored in localStorage. */
interface HistoryItem {
  auditId: string;
  url: string;
  clientName: string;
  scannedAt: string;
  overallScore: number;
  result: AuditResultFull;
}

const HISTORY_KEY = "lp-qa-scanner-history";
const MAX_HISTORY = 5;

function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch {}
}

const LOADING_MESSAGES = [
  "Fetching homepage…",
  "Crawling priority pages…",
  "Parsing HTML and extracting data…",
  "Running context-aware QA rules…",
  "Scoring and generating report…",
];

export default function Home() {
  const [state, setState] = useState<AppState>({ phase: "idle" });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  async function handleSubmit(profile: AuditProfile) {
    setState({ phase: "loading", loadingMsg: LOADING_MESSAGES[0] });
    let idx = 0;
    const interval = setInterval(() => {
      idx = Math.min(idx + 1, LOADING_MESSAGES.length - 1);
      setState((s) =>
        s.phase === "loading" ? { phase: "loading", loadingMsg: LOADING_MESSAGES[idx] } : s
      );
    }, 5000);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

      clearInterval(interval);
      const json = await res.json();

      if (!res.ok) {
        setState({ phase: "error", message: json.error ?? `Server error ${res.status}` });
        return;
      }

      const result = json as AuditResultFull;
      setState({ phase: "result", result });

      // Save to local history
      const item: HistoryItem = {
        auditId: result.auditId,
        url: result.url,
        clientName: profile.clientName,
        scannedAt: result.scannedAt,
        overallScore: result.overallScore,
        result,
      };
      const updated = [item, ...loadHistory().filter((h) => h.auditId !== result.auditId)];
      saveHistory(updated);
      setHistory(updated.slice(0, MAX_HISTORY));
    } catch (err) {
      clearInterval(interval);
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Network error — check your connection",
      });
    }
  }

  function openHistoryItem(item: HistoryItem) {
    setState({ phase: "result", result: item.result });
    setShowHistory(false);
  }

  function clearHistory() {
    saveHistory([]);
    setHistory([]);
  }

  return (
    <div className="min-h-screen bg-[#FDFAF5]">
      {/* Header */}
      <header className="border-b border-[#E8DFD0] bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-amber-700" />
            <span className="font-bold text-gray-900 text-sm">LP Site Auditor</span>
          </div>
          <div className="flex items-center gap-3">
            {history.length > 0 && (
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Clock size={13} />
                Recent ({history.length})
              </button>
            )}
            <span className="text-xs text-gray-400 hidden sm:block">Pre-QA · Luxury Presence internal</span>
          </div>
        </div>

        {/* History dropdown */}
        {showHistory && history.length > 0 && (
          <div className="max-w-3xl mx-auto px-4 pb-3">
            <div className="rounded-xl border border-gray-100 bg-white shadow-md overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-600">Recent Scans (this device)</p>
                <button onClick={clearHistory} className="text-xs text-red-500 hover:text-red-700">
                  Clear all
                </button>
              </div>
              {history.map((item) => (
                <button
                  key={item.auditId}
                  onClick={() => openHistoryItem(item)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 border-b border-gray-50 last:border-0 transition-colors"
                >
                  <span
                    className={`text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                      item.result.findings.filter((f) => f.status === "fail" || f.status === "warning").length === 0
                        ? "bg-emerald-50 text-emerald-700"
                        : item.result.findings.filter((f) => f.severity === "CRITICAL" && (f.status === "fail" || f.status === "warning")).length > 0
                        ? "bg-red-50 text-red-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {item.result.findings.filter((f) => f.status === "fail" || f.status === "warning").length === 0
                      ? "✓ OK"
                      : `${item.result.findings.filter((f) => f.status === "fail" || f.status === "warning").length} issues`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-700 truncate">{item.clientName}</p>
                    <p className="text-xs text-gray-400 truncate">{item.url}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(item.scannedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        {/* Hero — only shown when not in result state */}
        {state.phase !== "result" && (
          <div className="text-center max-w-xl mx-auto">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3 tracking-tight">
              LP Site Auditor
            </h1>
            <p className="text-base text-gray-500 leading-relaxed">
              Pre-QA orientation tool for Luxury Presence Website Builders. Provide site context,
              scan a staging URL, and get a contextual report of avoidable passback risks — before submitting to QA.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-700 font-medium">
              <AlertCircle size={12} />
              Does not replace QA team review
            </div>
          </div>
        )}

        {/* Form */}
        {(state.phase === "idle" || state.phase === "error") && (
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <AuditForm onSubmit={handleSubmit} loading={false} />
            {state.phase === "error" && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                <X size={16} className="shrink-0 mt-0.5" />
                <div>
                  <strong>Error:</strong> {state.message}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {state.phase === "loading" && (
          <div className="rounded-2xl border border-gray-100 bg-white p-10 shadow-sm text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-amber-200 border-t-amber-700 animate-spin" />
            </div>
            <p className="text-sm font-medium text-gray-700">{state.loadingMsg}</p>
            <p className="text-xs text-gray-400">Scanning up to 10 pages — typically 15–45 seconds</p>
          </div>
        )}

        {/* Results */}
        {state.phase === "result" && (
          <AuditResults result={state.result} onReset={() => setState({ phase: "idle" })} />
        )}
      </main>

      <footer className="border-t border-[#E8DFD0] mt-16 py-6 text-center text-xs text-gray-400">
        LP Site Auditor · Internal tool for Luxury Presence Website Builders ·
        Doubts or feedback? Ping the TL team on Slack
      </footer>
    </div>
  );
}
