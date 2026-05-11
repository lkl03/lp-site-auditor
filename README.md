# LP Site Auditor

**Internal pre-QA tool for Luxury Presence Website Builders.**

Paste a staging URL, fill in site context (brokerage, state, MLS, page types), and get a contextual report of common passback risks — before submitting to QA.

> ⚠️ This tool does NOT replace the QA team review. It is a pre-flight orientation tool only.

---

## What It Does

The auditor crawls your staging site (up to 20 pages), runs a set of context-aware rules, and returns:

- **Critical & Required Fixes** — things that will likely fail QA (missing pages, broken links, off-market terms)
- **Recommended Checks** — things to verify manually (IDX disclaimer, license numbers)
- **Human Review Checklist** — visual items that cannot be automated (headshot crop, section spacing, mobile overflow)
- **Full Scan Details** — all findings, filterable by category

No score is shown. The goal is a clear list of things to fix, not a number.

---

## LP-Specific Route Mapping

The scanner uses LP-standard URL paths when determining if expected pages exist:

| Page Type | Expected LP URL(s) |
|---|---|
| Home Search / IDX | `/home-search` |
| Portfolio (combined) | `/properties` |
| For Sale (separate mode) | `/properties/sale` |
| Sold / Past Transactions | `/properties/sold` |
| Agent About/Bio | `/about`, `/about-me`, `/bio` |
| Team Page | `/team`, `/our-team`, `/meet-the-team` |
| Buyers Guide | `/buyers`, `/buyers-guide` |
| Sellers Guide | `/sellers`, `/sellers-guide` |
| Blog | `/blog` |
| Videos / Vlog | `/vlog` |
| Mortgage Calculator | `/mortgage-calculator` |
| Press / Media | `/press`, `/press-and-media` |
| Home Valuation | `/home-valuation` |
| Testimonials | `/testimonials` |
| Neighborhoods | `/neighborhoods` |
| Contact | `/contact`, `/contact-us` |
| Developments | `/developments`, `/new-development` |

**Alias logic:** if ANY alias returns HTTP 200, the page is considered found. For example, if the client's buyers page is at `/buyers-guide`, the audit will still pass — it doesn't require `/buyers`.

---

## Agent vs Team Behavior

The `siteType` field controls which rules are active. These rule sets never mix:

**Agent sites** (`siteType: "agent"`) check for:
- About/bio page (`/about`, `/about-me`, `/bio`)
- Agent headshot presence (human review)
- Agent bio content personalization (human review)
- Agent contact form or CTA
- Property/listing section on homepage

**Team sites** (`siteType: "team"`) check for:
- Team page (`/team`, `/our-team`, `/meet-the-team`)
- Team member content detectable
- Team/About link in navigation
- All team headshots present (human review)
- Team contact form or CTA

A team site will never generate "agent about page" findings. An agent site will never generate "team page" findings. This was a common false positive in the original tool.

---

## Property Page Modes

| Mode | What Gets Checked |
|---|---|
| `portfolio` | Single `/properties` page for both active + sold |
| `separate-sale-sold` | Separate `/properties/sale` and `/properties/sold` pages |

In `separate-sale-sold` mode, both pages must exist. A human review item is also generated to verify the sold page is sorted by price descending (LP standard).

---

## Home Search / IDX Check

The `/home-search` page is always scanned. The rule returns:

| Result | Condition |
|---|---|
| ✅ Pass | `/home-search` returns 200 + IDX listing keywords detected in HTML |
| ⚠️ Warning | `/home-search` returns 200 but no listing keywords (likely JS-rendered IDX) |
| ❌ Fail | `/home-search` returns 404, 5xx, or cannot be fetched |

The "warning" case is common because LP IDX widgets (Showcase, Spark) render listings via JavaScript. The scanner can only read static HTML — it will not see JS-rendered content. A manual visit is always required to verify IDX functionality.

---

## Visual QA (Human Review Only)

Visual checks are always presented as human-review items. No automated visual analysis is performed. This is an intentional limitation:

- **Vercel serverless constraint:** Playwright/Chromium cannot run in the Vercel edge runtime
- **Scope:** This tool is a pre-flight helper, not a visual regression suite

The following visual items are always flagged for manual review:
1. Headshot crop (desktop + mobile)
2. Section padding and spacing consistency
3. Mobile horizontal overflow
4. CTA button spacing and tap targets
5. Image crops on desktop and mobile

---

## Text Quality Checks

The scanner detects two text quality issues without any external APIs:

- **Lorem Ipsum** (`CRITICAL`): any page containing "lorem ipsum" fails with a critical finding
- **Repeated consecutive words** (`VERIFY`): detects patterns like "the the" or "and and" which indicate copy-paste errors

These supplement the Grammarly/WordTune manual check (human review item).

---

## Email Matching

All email addresses collected during scanning are normalized to lowercase. Profile email comparisons are also lowercase. This prevents false negatives where the site renders `AGENT@DOMAIN.COM` but the profile stores `agent@domain.com`.

---

## Brokerage-Specific Rules

Rules are activated based on the `brokerage` field:

| Brokerage | Additional Automated Check |
|---|---|
| Compass | Scans for unreplaced template text ("client name", "[Client", "{{client") |
| Sotheby's International Realty | Checks for "independently owned and operated" disclaimer |
| All | Human review item for brokerage-specific brand compliance |

Brokerage compliance documentation (logo usage, color codes, required footer text) is referenced from the LP Launch Bible and Coda compliance docs. The tool points to the relevant guide per brokerage.

---

## State / MLS Compliance

State-specific compliance rules are loaded from `src/lib/compliance/compliance-rules.ts`. These include:

- DRE/license number display requirements (CA, TX, FL, NY, etc.)
- State-specific IDX disclaimer text
- Team vs agent MLS attribution rules

A human review item is always generated for MLS-specific compliance, because IDX disclaimer requirements vary by MLS board and cannot be fully automated.

---

## Score Removal Rationale

The tool previously showed an overall score (0–100). This was removed because:

1. **It created false confidence.** A score of 80 felt "good" even when critical items were still open.
2. **It was misleading for human-review-heavy sites.** Sites with many human-review items scored the same as a perfect automated run, because HUMAN_REVIEW items carry no score impact.
3. **WBs optimized for the score, not for the checklist.** The goal is zero issues, not a high number.

The new layout shows counts (critical / required / verify / human review), which communicate urgency without false precision.

---

## Architecture

```
src/
  app/
    api/audit/route.ts      — POST endpoint, orchestrates crawl + rules + scoring
    page.tsx                — Main UI, form → results, localStorage history
  components/
    AuditForm.tsx           — Profile input form (Zod-validated)
    AuditResults.tsx        — Results display (Fix Before QA layout)
    FindingCard.tsx         — Individual finding card component
    ScoreBadge.tsx          — Severity/status badges (no score display)
  lib/
    audit/
      types.ts              — All TypeScript types (AuditContext, PageData, Finding, etc.)
      profile.ts            — AuditProfile Zod schema, effectiveBrokerageName, effectiveMlsName
      scanner.ts            — Crawler (20 pages max, 4 concurrent, 8s timeout per page)
      rules.ts              — BASE_RULES (always run)
      context-rules.ts      — Context-aware rules (activated by profile)
      expected-routes.ts    — LP route mapping (URL aliases per page type)
      rubric.ts             — Scoring weights and rule metadata
      scoring.ts            — Overall + category score computation
      report.ts             — Markdown + CSV report generation
      constants.ts          — State → MLS dropdown mapping
    compliance/
      compliance-rules.ts   — Static state/brokerage compliance rule data
```

### Scanner Behavior

- **Phase 1:** Fetch root URL
- **Phase 2:** Fetch expected URLs from `getExpectedRouteUrls(profile, origin)` — these are the LP-specific routes derived from the profile (all aliases are attempted in parallel)
- **Phase 3:** Fill remaining slots (up to 20 total) from links discovered on the root page

Parallel fetching uses `Promise.all` with `CONCURRENCY = 4`. Max page timeout is 8 seconds. Total pages capped at 20 to stay within Vercel's 60-second function limit.

---

## Development

```bash
npm install
npm run dev          # local dev (Turbopack)
npm test             # Vitest unit tests
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

Tests are in `src/lib/audit/audit.test.ts`. Run after any rules change.

---

## Deployment

Deployed on Vercel. Push to `main` triggers automatic deployment.

```bash
gh pr create --title "..." --body "..."
# merge → Vercel auto-deploys
```

The project is at: **lp-site-auditor-clean** (private repo, Luxury Presence internal).
