"use client";

import { useState, useMemo } from "react";
import { Loader2, Scan, ChevronDown } from "lucide-react";
import type { AuditProfile } from "@/lib/audit/profile";
import {
  STATE_OR_REGION_OPTIONS,
  BROKERAGES,
  ADDITIONAL_PAGE_OPTIONS,
  getMlsForState,
} from "@/lib/audit/constants";

interface Props {
  onSubmit: (profile: AuditProfile) => void;
  loading: boolean;
  defaultUrl?: string;
}

const EMPTY_FORM = {
  url: "",
  siteType: "" as "" | "agent" | "team",
  stateOrRegion: "",
  brokerage: "",
  brokerageOtherName: "",
  mls: "",
  mlsOtherName: "",
  clientName: "",
  clientMainEmail: "",
  clientMainPhone: "",
  propertyPageMode: "" as "" | "portfolio" | "separate-sale-sold",
  additionalPages: [] as string[],
  additionalPageOtherNames: [] as string[],
  additionalOtherText: "",
};

type FormState = typeof EMPTY_FORM;

function isValidUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export function AuditForm({ onSubmit, loading, defaultUrl = "" }: Props) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, url: defaultUrl });

  const mlsOptions = useMemo(
    () => (form.stateOrRegion ? getMlsForState(form.stateOrRegion) : []),
    [form.stateOrRegion]
  );

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Reset MLS when state changes
      if (key === "stateOrRegion") {
        next.mls = "";
        next.mlsOtherName = "";
      }
      return next;
    });
  }

  function togglePage(page: string) {
    setForm((f) => {
      const has = f.additionalPages.includes(page);
      const next = has
        ? f.additionalPages.filter((p) => p !== page)
        : [...f.additionalPages, page];
      // Clear "Other" text if Other is deselected
      const otherText = next.includes("Other") ? f.additionalOtherText : "";
      return { ...f, additionalPages: next, additionalOtherText: otherText };
    });
  }

  // Validity checks
  const urlOk = isValidUrl(form.url);
  const siteTypeOk = form.siteType !== "";
  const stateOk = form.stateOrRegion !== "";
  const brokerageOk = form.brokerage !== "" && (form.brokerage !== "Other" || form.brokerageOtherName.trim() !== "");
  const mlsOk = form.mls !== "" && (form.mls !== "Other" || form.mlsOtherName.trim() !== "");
  const clientNameOk = form.clientName.trim() !== "";
  const emailOk = isValidEmail(form.clientMainEmail);
  const phoneOk = form.clientMainPhone.trim() !== "";
  const propModeOk = form.propertyPageMode !== "";

  const canSubmit = urlOk && siteTypeOk && stateOk && brokerageOk && mlsOk && clientNameOk && emailOk && phoneOk && propModeOk;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;

    const additionalPageOtherNames =
      form.additionalPages.includes("Other") && form.additionalOtherText.trim()
        ? form.additionalOtherText.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

    onSubmit({
      url: form.url.trim(),
      siteType: form.siteType as "agent" | "team",
      stateOrRegion: form.stateOrRegion,
      brokerage: form.brokerage,
      brokerageOtherName: form.brokerage === "Other" ? form.brokerageOtherName.trim() : undefined,
      mls: form.mls,
      mlsOtherName: form.mls === "Other" ? form.mlsOtherName.trim() : undefined,
      clientName: form.clientName.trim(),
      clientMainEmail: form.clientMainEmail.trim(),
      clientMainPhone: form.clientMainPhone.trim(),
      propertyPageMode: form.propertyPageMode as "portfolio" | "separate-sale-sold",
      additionalPages: form.additionalPages,
      additionalPageOtherNames,
      format: "json" as const,
    });
  }

  const inputCls =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100 disabled:opacity-50 transition";
  const labelCls = "block text-xs font-semibold text-gray-600 mb-1";
  const reqStar = <span className="text-red-500 ml-0.5">*</span>;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>All fields are required</strong> before the scan can run. The more context you provide, the more accurate your pre-QA report will be.
      </div>

      {/* 1. Draft URL */}
      <Section title="Site Details">
        <Field>
          <label className={labelCls}>Draft / Staging URL {reqStar}</label>
          <input
            type="url"
            value={form.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://client.luxurypresence.com"
            disabled={loading}
            className={inputCls}
          />
          {form.url && !urlOk && (
            <p className="text-xs text-red-500 mt-1">Must be a valid http:// or https:// URL</p>
          )}
        </Field>

        {/* 2. Site Type */}
        <Field>
          <label className={labelCls}>Site Type {reqStar}</label>
          <div className="flex gap-3">
            {(["agent", "team"] as const).map((v) => (
              <label
                key={v}
                className={`flex-1 flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer text-sm font-medium transition-colors ${
                  form.siteType === v
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="radio"
                  name="siteType"
                  value={v}
                  checked={form.siteType === v}
                  onChange={() => set("siteType", v)}
                  disabled={loading}
                  className="accent-amber-600"
                />
                {v === "agent" ? "Agent Site" : "Team Site"}
              </label>
            ))}
          </div>
        </Field>
      </Section>

      {/* 3. State / Region */}
      <Section title="Market & Brokerage">
        <Field>
          <label className={labelCls}>State / Region {reqStar}</label>
          <SelectField
            value={form.stateOrRegion}
            onChange={(v) => set("stateOrRegion", v)}
            options={["", ...STATE_OR_REGION_OPTIONS]}
            placeholder="Select state or region…"
            disabled={loading}
            className={inputCls}
          />
        </Field>

        {/* 4. MLS (dependent on state) */}
        <Field>
          <label className={labelCls}>
            MLS {reqStar}
            {!form.stateOrRegion && <span className="text-gray-400 font-normal ml-1">(select state first)</span>}
          </label>
          <SelectField
            value={form.mls}
            onChange={(v) => set("mls", v)}
            options={form.stateOrRegion ? ["", ...mlsOptions] : [""]}
            placeholder="Select MLS…"
            disabled={loading || !form.stateOrRegion}
            className={inputCls}
          />
          {form.mls === "Other" && (
            <input
              type="text"
              value={form.mlsOtherName}
              onChange={(e) => set("mlsOtherName", e.target.value)}
              placeholder="Enter MLS name…"
              disabled={loading}
              className={`${inputCls} mt-2`}
            />
          )}
        </Field>

        {/* 5. Brokerage */}
        <Field>
          <label className={labelCls}>Brokerage {reqStar}</label>
          <SelectField
            value={form.brokerage}
            onChange={(v) => set("brokerage", v)}
            options={["", ...BROKERAGES]}
            placeholder="Select brokerage…"
            disabled={loading}
            className={inputCls}
          />
          {form.brokerage === "Other" && (
            <input
              type="text"
              value={form.brokerageOtherName}
              onChange={(e) => set("brokerageOtherName", e.target.value)}
              placeholder="Enter brokerage name…"
              disabled={loading}
              className={`${inputCls} mt-2`}
            />
          )}
        </Field>
      </Section>

      {/* Client Info */}
      <Section title="Client Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field>
            <label className={labelCls}>Client Name {reqStar}</label>
            <input
              type="text"
              value={form.clientName}
              onChange={(e) => set("clientName", e.target.value)}
              placeholder="e.g. Jane Smith or Smith Group"
              disabled={loading}
              className={inputCls}
            />
          </Field>

          <Field>
            <label className={labelCls}>Client Main Email {reqStar}</label>
            <input
              type="email"
              value={form.clientMainEmail}
              onChange={(e) => set("clientMainEmail", e.target.value)}
              placeholder="e.g. jane@compass.com"
              disabled={loading}
              className={inputCls}
            />
            {form.clientMainEmail && !emailOk && (
              <p className="text-xs text-red-500 mt-1">Must be a valid email address</p>
            )}
          </Field>

          <Field className="sm:col-span-2">
            <label className={labelCls}>Client Main Phone {reqStar}</label>
            <input
              type="tel"
              value={form.clientMainPhone}
              onChange={(e) => set("clientMainPhone", e.target.value)}
              placeholder="e.g. (310) 555-0100"
              disabled={loading}
              className={inputCls}
            />
          </Field>
        </div>
      </Section>

      {/* Property Page Setup */}
      <Section title="Property Page Setup">
        <Field>
          <label className={labelCls}>Property Page Mode {reqStar}</label>
          <div className="space-y-2">
            {(
              [
                {
                  value: "portfolio",
                  label: "Portfolio / Combined Sale & Sold Page",
                  desc: "One page showing both active listings and past sales",
                },
                {
                  value: "separate-sale-sold",
                  label: "Separate For Sale & Sold Pages",
                  desc: "Dedicated pages: one for active listings, one for past transactions",
                },
              ] as const
            ).map(({ value, label, desc }) => (
              <label
                key={value}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                  form.propertyPageMode === value
                    ? "border-amber-400 bg-amber-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <input
                  type="radio"
                  name="propertyPageMode"
                  value={value}
                  checked={form.propertyPageMode === value}
                  onChange={() => set("propertyPageMode", value)}
                  disabled={loading}
                  className="mt-0.5 accent-amber-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </Field>
      </Section>

      {/* Additional Pages */}
      <Section title="Additional Pages" subtitle="Optional — check all pages that were built">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ADDITIONAL_PAGE_OPTIONS.map((page) => (
            <label
              key={page}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors ${
                form.additionalPages.includes(page)
                  ? "border-amber-400 bg-amber-50 text-amber-800"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                checked={form.additionalPages.includes(page)}
                onChange={() => togglePage(page)}
                disabled={loading}
                className="accent-amber-600"
              />
              {page}
            </label>
          ))}
        </div>
        {form.additionalPages.includes("Other") && (
          <input
            type="text"
            value={form.additionalOtherText}
            onChange={(e) => set("additionalOtherText", e.target.value)}
            placeholder="Additional page names (comma-separated)"
            disabled={loading}
            className={`${inputCls} mt-2`}
          />
        )}
      </Section>

      {/* Submit */}
      <div>
        {!canSubmit && (
          <p className="text-xs text-gray-400 text-center mb-2">
            Fill all required fields{" "}
            <span className="text-red-400">*</span> to enable scan
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-amber-700 px-6 py-3 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Scanning site…
            </>
          ) : (
            <>
              <Scan size={16} />
              Run Pre-QA Scan
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-4 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${className} appearance-none pr-8`}
      >
        {options.map((opt, i) => (
          <option key={opt || `__empty_${i}`} value={opt} disabled={opt === ""}>
            {opt === "" ? placeholder : opt}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  );
}
