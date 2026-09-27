import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared vocabularies
// ---------------------------------------------------------------------------
export const SKILLS = [
  "problem_understanding",
  "clarification",
  "structuring",
  "hypothesis",
  "prioritization",
  "analysis",
  "quantitative",
  "exhibit_interpretation",
  "business_judgment",
  "synthesis",
  "recommendation",
  "communication",
  // guesstimate-specific
  "scoping",
  "decomposition",
  "assumptions",
  "sanity_check",
];

export const SKILL_LABELS = {
  problem_understanding: "Problem understanding",
  clarification: "Clarifying questions",
  structuring: "Structuring",
  hypothesis: "Hypothesis formation",
  prioritization: "Prioritization",
  analysis: "Analysis / driving the case",
  quantitative: "Quantitative reasoning",
  exhibit_interpretation: "Exhibit interpretation",
  business_judgment: "Business judgment",
  synthesis: "Synthesis",
  recommendation: "Recommendation",
  communication: "Communication",
  scoping: "Guesstimate scoping",
  decomposition: "Decomposition / segmentation",
  assumptions: "Assumptions",
  sanity_check: "Sanity checking",
};

export const MISTAKE_TAGS = [
  "framework_dump",
  "no_hypothesis",
  "weak_prioritization",
  "ignored_evidence",
  "arithmetic_error",
  "unit_error",
  "no_sanity_check",
  "no_so_what",
  "missed_exhibit_insight",
  "recommendation_not_actionable",
  "recommendation_disconnected",
  "poor_clarification",
  "over_clarification",
  "not_mece",
  "overlong_structure",
  "ignored_risks",
  "lost_objective",
  "passive_driving",
  "unsupported_assumption",
  "rigid_casebook_path",
];

export const DIFFICULTY_DIMS = [
  "structuring",
  "ambiguity",
  "quantitative",
  "exhibit",
  "prioritization",
  "hypothesis",
  "communication",
  "industry_unfamiliarity",
];

export const CASE_TYPES = [
  "profitability",
  "growth",
  "market_entry",
  "mna",
  "operations",
  "pricing",
  "strategy",
  "unconventional",
  "guesstimate",
];

export const PHASES = [
  "opening",
  "clarification",
  "structuring",
  "prioritization",
  "analysis",
  "quantitative",
  "exhibit",
  "synthesis",
  "complete",
];

// ---------------------------------------------------------------------------
// Case object (seed, casebook-extracted, or generated)
// ---------------------------------------------------------------------------
const dim = z.number().min(1).max(5);

export const ExhibitSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["table", "bar", "line"]),
  unit: z.string().nullable().optional(),
  columns: z.array(z.string()).nullable().optional(), // table
  rows: z.array(z.array(z.union([z.string(), z.number()]))).nullable().optional(), // table
  categories: z.array(z.string()).nullable().optional(), // bar/line
  series: z
    .array(z.object({ name: z.string(), values: z.array(z.number()) }))
    .nullable()
    .optional(),
  note: z.string().nullable().optional(),
  release_when: z.string(),
  takeaways: z.array(z.string()), // hidden
});

export const CaseSchema = z.object({
  id: z.string(),
  source: z.string(),
  title: z.string(),
  industry: z.string(),
  type: z.enum(CASE_TYPES),
  secondary_types: z.array(z.string()).default([]),
  format: z.enum(["standard", "short"]).default("standard"),
  duration_min: z.number(),
  difficulty: z.object(Object.fromEntries(DIFFICULTY_DIMS.map((d) => [d, dim]))),
  skills_tested: z.array(z.enum(SKILLS)),
  unconventional: z.boolean().default(false),
  opening: z.string(),
  client_context: z.string(),
  objective: z.string(),
  clarifications: z.array(z.object({ id: z.string(), topic: z.string(), answer: z.string() })),
  data: z.array(
    z.object({ id: z.string(), label: z.string(), content: z.string(), release_when: z.string() }),
  ),
  exhibits: z.array(ExhibitSchema).default([]),
  quant: z
    .array(z.object({ id: z.string(), question: z.string(), solution: z.string(), answer: z.string() }))
    .default([]),
  analytical_paths: z.array(z.string()),
  key_insights: z.array(z.string()),
  reference_solution: z.string(),
  alternative_approaches: z.array(z.string()),
  recommendation: z.string(),
  interviewer_notes: z.array(z.string()).default([]),
  common_pitfalls: z.array(z.string()).default([]),
  benchmark_range: z.string().nullable().optional(), // guesstimates
  learning_objective: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Case-state analyzer output (one per candidate turn)
// ---------------------------------------------------------------------------
export const AnalyzerSchema = z.object({
  candidate_intent: z.enum([
    "clarifying_question",
    "structure",
    "hypothesis",
    "prioritization",
    "analysis_request",
    "calculation",
    "exhibit_interpretation",
    "synthesis_or_recommendation",
    "asks_for_hint",
    "asks_for_answer",
    "asks_for_feedback",
    "thinking_aloud",
    "off_topic",
    "other",
  ]),
  phase: z.enum(PHASES),
  candidate_state: z.enum(["progressing", "slightly_off", "meaningfully_stuck", "completely_stuck"]),
  generic_framework_dump: z.boolean(),
  structure_summary: z.string().nullable(),
  hypothesis_summary: z.string().nullable(),
  current_branch: z.string().nullable(),
  release_clarification_ids: z.array(z.string()),
  release_data_ids: z.array(z.string()),
  release_exhibit_ids: z.array(z.string()),
  improvised_answer: z.string().nullable(),
  calculation: z.object({
    present: z.boolean(),
    correct: z.boolean().nullable(),
    error_description: z.string().nullable(),
    interpreted: z.boolean().nullable(),
  }),
  exhibit_reading: z.object({
    present: z.boolean(),
    found_key_takeaway: z.boolean().nullable(),
  }),
  unsupported_claim: z.string().nullable(),
  valid_alternative_path: z.boolean(),
  hint_ladder: z.object({ probe: z.string(), small_hint: z.string(), strong_hint: z.string() }),
  next_move: z.string(),
  ready_for_recommendation: z.boolean(),
  case_complete: z.boolean(),
  observations: z.array(
    z.object({ skill: z.enum(SKILLS), kind: z.enum(["strength", "mistake"]), evidence: z.string() }),
  ),
});

// ---------------------------------------------------------------------------
// Coach debrief
// ---------------------------------------------------------------------------
export const DebriefSchema = z.object({
  biggest_takeaway: z.string(),
  did_well: z.array(z.string()),
  biggest_problem: z.string(),
  missed: z.array(z.string()),
  stronger_approach: z.string(),
  next_skill: z.enum(SKILLS),
  next_skill_reason: z.string(),
  redo: z.object({ recommend: z.boolean(), reason: z.string() }),
  next_case_reminder: z.string(),
  skill_ratings: z.array(
    z.object({ skill: z.enum(SKILLS), rating: z.enum(["strength", "adequate", "gap"]), evidence: z.string() }),
  ),
  mistake_tags: z.array(z.enum(MISTAKE_TAGS)),
  guesstimate_notes: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Drills, router, progress
// ---------------------------------------------------------------------------
export const DrillTurnSchema = z.object({
  message: z.string(),
  done: z.boolean(),
  skill_rating: z.enum(["strength", "adequate", "gap"]).nullable(),
  evidence: z.string().nullable(),
  mistake_tags: z.array(z.enum(MISTAKE_TAGS)),
});

export const RouteSchema = z.object({
  mode: z.enum(["case", "mock", "guesstimate", "drill", "teach", "review", "redo_weakest", "redo_case", "pm", "history", "chat"]),
  case_type: z.enum([...CASE_TYPES, "any"]),
  industry: z.string().nullable(),
  difficulty: z.enum(["easier", "normal", "harder"]),
  length: z.enum(["short", "normal"]),
  drill_skill: z
    .enum(["structuring", "prioritization", "math", "hypothesis", "synthesis", "clarification", "exhibit", "none"]),
  topic: z.string().nullable(),
});

export const ProgressSchema = z.object({
  recent_strengths: z.array(z.string()),
  recurring_gaps: z.array(z.string()),
  trends: z.array(z.string()),
  next_practice: z.array(z.string()),
  one_line_summary: z.string(),
});

export const PmDebriefSchema = z.object({
  summary: z.string(),
  did_well: z.array(z.string()),
  biggest_problem: z.string(),
  stronger_approach: z.string(),
  next_focus: z.string(),
});
