// CASE SELECTION + DIFFICULTY MANAGER.
// Picks a case from the library given an (optional) request and the learner profile:
//  - hard filters from the request (type, industry, short)
//  - never repeats a completed case unless nothing else fits
//  - diversity: penalise recent case types and industries
//  - multidimensional difficulty: each dimension is matched to the learner's per-dimension
//    target, and cases that stress the learner's weak skills get a bonus.
import { allCases } from "./library.js";
import { DIFFICULTY_DIMS } from "../schemas.js";

// Which difficulty dimension trains which skill.
export const SKILL_TO_DIM = {
  structuring: "structuring",
  problem_understanding: "ambiguity",
  clarification: "ambiguity",
  quantitative: "quantitative",
  exhibit_interpretation: "exhibit",
  prioritization: "prioritization",
  hypothesis: "hypothesis",
  synthesis: "communication",
  communication: "communication",
  recommendation: "communication",
  business_judgment: "ambiguity",
  analysis: "prioritization",
  decomposition: "structuring",
  assumptions: "ambiguity",
  sanity_check: "quantitative",
  scoping: "ambiguity",
};

const TYPE_ALIASES = {
  profitability: ["profitability", "profit", "margin", "losses", "declining profit"],
  growth: ["growth", "grow", "revenue growth", "expand revenue"],
  market_entry: ["market entry", "enter", "entry", "new market", "launch in"],
  mna: ["m&a", "merger", "acquisition", "acquire", "mna", "m & a", "private equity", "pe deal"],
  operations: ["operations", "operational", "ops", "supply chain", "capacity", "utilization", "utilisation"],
  pricing: ["pricing", "price"],
  strategy: ["strategy", "strategic"],
  unconventional: ["unconventional", "public policy", "social sector", "abstract", "unusual", "non-traditional"],
  guesstimate: ["guesstimate", "market size", "market sizing", "estimate", "estimation"],
};

export function detectCaseType(text) {
  const t = ` ${text.toLowerCase()} `;
  for (const [type, words] of Object.entries(TYPE_ALIASES)) {
    if (words.some((w) => t.includes(` ${w}`))) return type;
  }
  return null;
}

/**
 * @param {object} req  { caseType, industry, difficulty: easier|normal|harder, short, focusSkills, requireSkill, excludeTypes }
 * @param {object} profile learner profile
 * @returns {{case: object|null, reason: string, candidates: number}}
 */
export function selectCase(req = {}, profile) {
  const cases = allCases();
  const done = new Set(profile.cases.filter((c) => c.completed).map((c) => c.caseId));
  const recent = profile.cases.slice(-4);
  const recentTypes = recent.map((c) => c.type);
  const recentIndustries = recent.map((c) => (c.industry || "").toLowerCase());
  const targets = { ...profile.difficultyTargets };
  const shift = req.difficulty === "harder" ? 1 : req.difficulty === "easier" ? -1 : 0;
  for (const d of DIFFICULTY_DIMS) targets[d] = Math.min(5, Math.max(1, (targets[d] ?? 2.5) + shift));

  let pool = cases.filter((c) => (req.caseType === "guesstimate" ? c.type === "guesstimate" : c.type !== "guesstimate"));
  if (req.caseType && req.caseType !== "any" && req.caseType !== "guesstimate") {
    pool = pool.filter((c) => c.type === req.caseType || c.secondary_types.includes(req.caseType));
  }
  if (req.industry) {
    const needle = req.industry.toLowerCase();
    pool = pool.filter((c) => c.industry.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle));
  }
  if (req.short) pool = pool.filter((c) => c.format === "short" || c.duration_min <= 15);
  if (req.excludeTypes?.length) pool = pool.filter((c) => !req.excludeTypes.includes(c.type));
  if (req.requireSkill) {
    const withSkill = pool.filter((c) => c.skills_tested.includes(req.requireSkill));
    if (withSkill.length) pool = withSkill;
  }
  if (!pool.length) return { case: null, reason: "no case in the library matches the request", candidates: 0 };

  const fresh = pool.filter((c) => !done.has(c.id));
  const usingRepeats = fresh.length === 0;
  const candidates = usingRepeats ? pool : fresh;
  const focus = req.focusSkills || [];

  const scored = candidates.map((c) => {
    let score = 0;
    // multidimensional difficulty fit
    for (const d of DIFFICULTY_DIMS) score -= Math.abs((c.difficulty[d] ?? 3) - targets[d]) * 0.6;
    // weakness targeting: case must stress the weak skill, at or above target on that dimension
    for (const skill of focus) {
      if (c.skills_tested.includes(skill)) score += 3;
      const dim = SKILL_TO_DIM[skill];
      if (dim && (c.difficulty[dim] ?? 3) >= targets[dim]) score += 1;
    }
    // diversity
    const typeRepeats = recentTypes.filter((t) => t === c.type).length;
    score -= typeRepeats * (req.caseType && req.caseType !== "any" ? 0 : 2.5);
    if (recentIndustries.includes(c.industry.toLowerCase())) score -= 2;
    if (usingRepeats) {
      const last = profile.cases.filter((x) => x.caseId === c.id).at(-1);
      score -= last ? 5 : 0;
    }
    // tiny jitter so equal cases rotate
    score += Math.random() * 0.3;
    return { c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return {
    case: scored[0].c,
    reason: usingRepeats ? "all matching cases already completed; reusing the least-recent" : "selected",
    candidates: candidates.length,
    usingRepeats,
  };
}
