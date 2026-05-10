"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Scan } from "lucide-react";
import type { AuditRequest } from "@/lib/audit/types";

interface Props {
  onSubmit: (data: AuditRequest) => void;
  loading: boolean;
}

export function AuditForm({ onSubmit, loading }: Props) {
  const [url, setUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [clientName, setClientName] = useState("");
  const [brokerage, setBrokerage] = useState("");
  const [market, setMarket] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pages, setPages] = useState("");
  const [agents, setAgents] = useState("");
  const [neighborhoods, setNeighborhoods] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    onSubmit({
      url: url.trim(),
      expected: {
        clientName: clientName || undefined,
        brokerage: brokerage || undefined,
        market: market || undefined,
        phone: phone || undefined,
        email: email || undefined,
        pages: pages ? pages.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        agents: agents ? agents.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        neighborhoods: neighborhoods
          ? neighborhoods.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined,
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          Staging / Draft URL <span className="text-red-500">*</span>
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://client.luxurypresence.com"
          required
          disabled={loading}
          className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:opacity-50 transition"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {showAdvanced ? "Hide advanced options" : "Add expected context (improves accuracy)"}
      </button>

      {showAdvanced && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-4">
          <p className="text-xs text-gray-500">
            Providing context lets the scanner verify client-specific requirements and flag mismatches.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Client / Team Name" value={clientName} onChange={setClientName} placeholder="e.g. Jane Smith Group" disabled={loading} />
            <Field label="Brokerage" value={brokerage} onChange={setBrokerage} placeholder="e.g. Compass" disabled={loading} />
            <Field label="Market / Location" value={market} onChange={setMarket} placeholder="e.g. Beverly Hills, CA" disabled={loading} />
            <Field label="Expected Phone" value={phone} onChange={setPhone} placeholder="e.g. (310) 555-0100" disabled={loading} />
            <Field
              label="Expected Email"
              value={email}
              onChange={setEmail}
              placeholder="e.g. jane@compass.com"
              type="email"
              disabled={loading}
            />
          </div>
          <Field
            label="Expected Pages (comma-separated)"
            value={pages}
            onChange={setPages}
            placeholder="e.g. About, Blog, Neighborhoods, Buyers Guide"
            disabled={loading}
          />
          <Field
            label="Expected Agents (comma-separated)"
            value={agents}
            onChange={setAgents}
            placeholder="e.g. Jane Smith, John Doe"
            disabled={loading}
          />
          <Field
            label="Expected Neighborhoods (comma-separated)"
            value={neighborhoods}
            onChange={setNeighborhoods}
            placeholder="e.g. Bel Air, Pacific Palisades, Santa Monica"
            disabled={loading}
          />
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !url.trim()}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-700 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Scanning site…
          </>
        ) : (
          <>
            <Scan size={16} />
            Run QA Scan
          </>
        )}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:opacity-50 transition"
      />
    </div>
  );
}
