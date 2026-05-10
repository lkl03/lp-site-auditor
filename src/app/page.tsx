"use client";

import { useState } from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { AuditForm } from "@/components/AuditForm";
import { AuditResults } from "@/components/AuditResults";
import type { AuditRequest, AuditResult } from "@/lib/audit/types";

type AppState =
  | { phase: "idle" }
  | { phase: "loading"; loadingMsg: string }
  | { phase: "result"; result: AuditResult & { markdownReport?: string; csvReport?: string } }
  | { phase: "error"; message: string };

const LOADING_MESSAGES = [
  "Fetching homepage…",
  "Crawling priority pages…",
  "Parsing HTML and extracting data…",
  "Running QA rules…",
  "Scoring and generating report…",
];

export default function Home() {
  const [state, setState] = useState<AppState>({ phase: "idle" });
  const [msgIdx, setMsgIdx] = useState(0);

  async function handleSubmit(data: AuditRequest) {
    setState({ phase: "loading", loadingMsg: LOADING_MESSAGES[0] });
    let idx = 0;
    const interval = setInterval(() => {
      idx = Math.min(idx + 1, LOADING_MESSAGES.length - 1);
      setMsgIdx(idx);
      setState((s) =>
        s.phase === "loading"
          ? { phase: "loading", loadingMsg: LOADING_MESSAGES[idx] }
          : s
      );
    }, 4000);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      clearInterval(interval);
      const json = await res.json();

      if (!res.ok) {
        setState({
          phase: "error",
          message: json.error ?? `Server error ${res.status}`,
        });
        return;
      }

      setState({ phase: "result", result: json });
    } catch (err) {
      clearInterval(interval);
      setState({
        phase: "error",
        message:
          err instanceof Error
            ? err.message
            : "Network error — check your connection and try again",
      });
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFAF5]">
      {/* Header */}
      <header className="border-b border-[#E8DFD0] bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-amber-700" />
            <span className="font-bold text-gray-900 text-sm">LP Draft QA Scanner</span>
          </div>
          <span className="text-xs text-gray-400 hidden sm:block">
            Pre-QA guidance · Luxury Presence internal tool
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        {/* Hero */}
        {state.phase !== "result" && (
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3 tracking-tight">
              LP Draft QA Scanner
            </h1>
            <p className="text-base text-gray-500 leading-relaxed">
              Pre-QA guidance to reduce passback notes before QA handoff. Paste a staging URL
              and get an instant orientation report — scores, findings, and suggested corrections.
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-700 font-medium">
              <AlertCircle size={12} />
              This tool does not replace QA team review
            </div>
          </div>
        )}

        {/* Form */}
        {(state.phase === "idle" || state.phase === "error") && (
          <div className="max-w-2xl mx-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <AuditForm onSubmit={handleSubmit} loading={false} />
            {state.phase === "error" && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <strong>Error:</strong> {state.message}
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {state.phase === "loading" && (
          <div className="max-w-2xl mx-auto rounded-2xl border border-gray-100 bg-white p-10 shadow-sm text-center space-y-4">
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-full border-4 border-amber-200 border-t-amber-700 animate-spin" />
            </div>
            <p className="text-sm font-medium text-gray-700">{state.loadingMsg}</p>
            <p className="text-xs text-gray-400">
              Scanning up to 10 pages — this usually takes 15–45 seconds
            </p>
          </div>
        )}

        {/* Results */}
        {state.phase === "result" && (
          <AuditResults
            result={state.result}
            onReset={() => setState({ phase: "idle" })}
          />
        )}
      </main>

      <footer className="border-t border-[#E8DFD0] mt-16 py-6 text-center text-xs text-gray-400">
        LP Draft QA Scanner · Internal tool for Luxury Presence Website Builders ·
        Doubts or feedback? Ping the TL team on Slack
      </footer>
    </div>
  );
}
