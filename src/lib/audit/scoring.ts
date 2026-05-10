import type { Finding, CategoryScore, AuditCategory } from "./types";
import { SCORE_IMPACTS } from "./rubric";

const CATEGORIES: AuditCategory[] = [
  "Client Requests",
  "Branding & Identity",
  "Global Elements",
  "Navigation & Links",
  "Homepage",
  "About / Agent / Team",
  "Property Pages",
  "Neighborhood Pages",
  "Blog / Press / Development",
  "Buyers & Sellers Guide",
  "Brokerage Pages",
  "SEO",
  "Mobile / Responsive",
  "Forms & Lead Routing",
  "Image Quality",
  "Compliance",
  "Final Validation",
  "Handoff Readiness",
];

export function computeOverallScore(findings: Finding[]): number {
  let score = 100;
  for (const f of findings) {
    if (f.severity === "HUMAN_REVIEW") continue;
    if (f.status === "fail" || f.status === "warning") {
      score += f.scoreImpact; // scoreImpact is already negative
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeCategoryScores(findings: Finding[]): CategoryScore[] {
  const map = new Map<AuditCategory, Finding[]>();
  for (const cat of CATEGORIES) {
    map.set(cat, []);
  }
  for (const f of findings) {
    if (!map.has(f.category)) map.set(f.category, []);
    map.get(f.category)!.push(f);
  }

  const scores: CategoryScore[] = [];
  for (const [category, catFindings] of map) {
    if (catFindings.length === 0) continue;
    const nonHuman = catFindings.filter((f) => f.severity !== "HUMAN_REVIEW");
    const passed = nonHuman.filter((f) => f.status === "pass").length;
    const failed = nonHuman.filter((f) => f.status === "fail").length;
    const warnings = nonHuman.filter((f) => f.status === "warning").length;
    const humanReview = catFindings.filter((f) => f.severity === "HUMAN_REVIEW").length;

    let catScore = 100;
    for (const f of nonHuman) {
      if (f.status === "fail" || f.status === "warning") {
        catScore += f.scoreImpact;
      }
    }
    catScore = Math.max(0, Math.min(100, Math.round(catScore)));

    scores.push({
      category,
      score: catScore,
      totalChecks: catFindings.length,
      passed,
      failed,
      warnings,
      humanReview,
    });
  }
  return scores;
}
