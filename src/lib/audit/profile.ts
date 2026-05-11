import { z } from "zod";

// ── AuditProfile ─────────────────────────────────────────────────────────────
// The full context the user provides before running a scan.
// All fields are required; AuditProfile is validated by the API route.

export const AuditProfileSchema = z.object({
  url: z
    .string()
    .min(1, "URL is required")
    .refine((v) => {
      try {
        const u = new URL(v.trim());
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }, "Must be a valid http:// or https:// URL"),

  siteType: z.enum(["agent", "team"], {
    required_error: "Site type is required",
  }),

  stateOrRegion: z.string().min(1, "State / Region is required"),

  brokerage: z.string().min(1, "Brokerage is required"),
  brokerageOtherName: z.string().optional(),

  mls: z.string().min(1, "MLS is required"),
  mlsOtherName: z.string().optional(),

  clientName: z.string().min(1, "Client name is required"),

  clientMainEmail: z
    .string()
    .min(1, "Client email is required")
    .email("Must be a valid email address"),

  clientMainPhone: z.string().min(1, "Client phone is required"),

  propertyPageMode: z.enum(["portfolio", "separate-sale-sold"], {
    required_error: "Property page setup is required",
  }),

  additionalPages: z.array(z.string()).default([]),
  additionalPageOtherNames: z.array(z.string()).optional(),

  format: z.enum(["json", "markdown", "csv"]).optional().default("json"),
});

export type AuditProfile = z.infer<typeof AuditProfileSchema>;

/** Returns the effective brokerage display name (resolves "Other"). */
export function effectiveBrokerageName(profile: AuditProfile): string {
  if (profile.brokerage === "Other" && profile.brokerageOtherName) {
    return profile.brokerageOtherName;
  }
  return profile.brokerage;
}

/** Returns the effective MLS display name (resolves "Other"). */
export function effectiveMlsName(profile: AuditProfile): string {
  if (profile.mls === "Other" && profile.mlsOtherName) {
    return profile.mlsOtherName;
  }
  return profile.mls;
}

/** Normalizes a phone number to digits only for comparison. */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
