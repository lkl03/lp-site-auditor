# LP Draft QA Scanner

An internal pre-QA web tool for Luxury Presence Website Builders. Paste a staging URL and get an automated orientation report — scores, findings, evidence, and suggested corrections — before submitting a draft to the QA team.

> **This tool does not replace QA team review.** It is a pre-flight assistant to help catch obvious issues before handoff. All findings require human confirmation.

---

## What it does

- Crawls up to 10 pages of a staging site using `fetch` + Cheerio (server-side, no browser required)
- Runs 30+ deterministic QA rules across 18 categories
- Returns an overall score (0–100), per-category scores, and a full findings list
- Flags items that cannot be verified automatically (human-review section)
- Exports the report as Markdown, JSON, or CSV

## What it does NOT do

- Does not submit forms or interact with JavaScript-driven elements
- Does not take visual screenshots (Playwright is a planned future enhancement)
- Does not replace the QA team's review process
- Cannot verify color accuracy, font correctness, lead routing, or image quality/relevance
- Cannot confirm that all onboarding hub requests were implemented

---

## Running locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Running tests

```bash
npm test
```

### Building for production

```bash
npm run build
npm start
```

---

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the project at [vercel.com/new](https://vercel.com/new)
3. Framework preset: **Next.js** (auto-detected)
4. No environment variables required for MVP
5. Click **Deploy**

> **Timeout note:** Vercel Hobby has a 10s function limit. The API route sets `maxDuration = 60` which requires a Pro/Team plan. On Hobby, scans will time out after 10s — enough for 1–2 pages. Upgrade to Vercel Pro or set `maxDuration` to 10 for Hobby.

---

## Environment variables

None required for MVP. See `.env.example` for a template.

---

## Architecture

```
src/
├── app/
│   ├── layout.tsx          Root layout
│   ├── page.tsx            Main page (form + results)
│   ├── globals.css         Global styles (Tailwind v4)
│   └── api/audit/
│       └── route.ts        POST /api/audit
├── components/
│   ├── AuditForm.tsx       URL + context input form
│   ├── AuditResults.tsx    Score, category grid, findings, export
│   ├── FindingCard.tsx     Expandable finding card
│   └── ScoreBadge.tsx      Score ring + severity/status badges
└── lib/audit/
    ├── types.ts            All TypeScript types
    ├── rubric.ts           QA principles, score weights, priority paths
    ├── scanner.ts          URL validator + Cheerio crawler
    ├── rules.ts            All audit rule implementations
    ├── scoring.ts          Score calculation
    ├── report.ts           Markdown + CSV report generation
    └── audit.test.ts       Vitest unit tests
```

---

## How to add a new rule

All rules live in `src/lib/audit/rules.ts`. Implement `AuditRule` and add it to `ALL_RULES`:

```typescript
export const myRule: AuditRule = {
  id: "my-rule-id",
  category: "SEO",            // must match AuditCategory
  title: "My rule title",
  severity: "REQUIRED",       // CRITICAL | REQUIRED | VERIFY | CONDITIONAL | HUMAN_REVIEW
  evaluate(ctx) {
    // ctx.pages[] — all scanned PageData
    // ctx.expected — user-provided context
    return [/* Finding objects */];
  },
};

// At bottom of rules.ts:
export const ALL_RULES = [...existingRules, myRule];
```

### Severity → score impact

| Severity | Impact per fail |
|---|---|
| CRITICAL | −10 |
| REQUIRED | −5 |
| VERIFY | −2 |
| CONDITIONAL | −3 |
| HUMAN_REVIEW | 0 (human review section) |

---

## Known limitations

- **JS-rendered content:** Cheerio parses static HTML. Nav/footer rendered via JS may appear missing.
- **Password-protected staging:** Will fail with a network error.
- **Visual checks:** Color, spacing, font — require Playwright (planned).
- **Lead routing:** Cannot verify without submitting a real test lead.
- **Scan coverage:** Bounded to 10 pages. JS-only routes may not be discovered.

---

## Built by

LP Website Builder Team — Luxury Presence  
Automated URL scanner rebuilt from the manual QA checklist by the WB TL team.
