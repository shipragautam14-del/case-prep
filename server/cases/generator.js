// CASE GENERATOR: creates new case objects (fresh cases, redo "transfer" variants) and converts
// casebook text into interactive case objects. Separate prompt from the interviewer.
import { z } from "zod";
import * as llm from "../llm.js";
import { GENERATOR_SYSTEM } from "../prompts/others.js";
import { CaseSchema, SKILLS, CASE_TYPES, DIFFICULTY_DIMS } from "../schemas.js";
import { retrieve, formatSnippets } from "../knowledge/retrieval.js";

// Strict variant for structured outputs: every field required, nullable instead of optional.
const GenExhibit = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["table", "bar", "line"]),
  unit: z.string().nullable(),
  columns: z.array(z.string()).nullable(),
  rows: z.array(z.array(z.string())).nullable(),
  categories: z.array(z.string()).nullable(),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).nullable(),
  note: z.string().nullable(),
  release_when: z.string(),
  takeaways: z.array(z.string()),
});

export const CaseGenSchema = z.object({
  title: z.string(),
  industry: z.string(),
  type: z.enum(CASE_TYPES),
  secondary_types: z.array(z.string()),
  format: z.enum(["standard", "short"]),
  duration_min: z.number(),
  difficulty: z.object(Object.fromEntries(DIFFICULTY_DIMS.map((d) => [d, z.number()]))),
  skills_tested: z.array(z.enum(SKILLS)),
  unconventional: z.boolean(),
  opening: z.string(),
  client_context: z.string(),
  objective: z.string(),
  clarifications: z.array(z.object({ id: z.string(), topic: z.string(), answer: z.string() })),
  data: z.array(z.object({ id: z.string(), label: z.string(), content: z.string(), release_when: z.string() })),
  exhibits: z.array(GenExhibit),
  quant: z.array(z.object({ id: z.string(), question: z.string(), solution: z.string(), answer: z.string() })),
  analytical_paths: z.array(z.string()),
  key_insights: z.array(z.string()),
  reference_solution: z.string(),
  alternative_approaches: z.array(z.string()),
  recommendation: z.string(),
  interviewer_notes: z.array(z.string()),
  common_pitfalls: z.array(z.string()),
  benchmark_range: z.string().nullable(),
  learning_objective: z.string().nullable(),
});

export function normalizeGenerated(raw, { id, source }) {
  const clampDim = (v) => Math.min(5, Math.max(1, Math.round(Number(v) || 3)));
  const exhibits = (raw.exhibits || []).map((e) => {
    const out = { ...e };
    // Tables come back as strings; convert numeric-looking cells back to numbers for rendering.
    if (out.rows) out.rows = out.rows.map((r) => r.map((c) => (/^-?\d+(\.\d+)?$/.test(String(c).trim()) ? Number(c) : c)));
    return out;
  });
  return CaseSchema.parse({
    ...raw,
    id,
    source,
    exhibits,
    difficulty: Object.fromEntries(DIFFICULTY_DIMS.map((d) => [d, clampDim(raw.difficulty?.[d])])),
  });
}

/** Generate a brand-new case matching a request. */
export async function generateCase({ caseType = "any", industry = null, difficulty = null, short = false, avoidTitles = [], focusSkills = [] }) {
  const sources = formatSnippets(
    retrieve(`${caseType} case approach structure ${industry ?? ""}`, { module: "consulting", k: 4, excludeKinds: ["casebook"] }),
    5000,
  );
  const prompt = `Write one new case.
Case type: ${caseType === "any" ? "your choice (vary it)" : caseType}
Industry: ${industry ?? "your choice — pick something not in the avoid list, ideally a less textbook industry"}
Target difficulty per dimension (1-5): ${difficulty ? JSON.stringify(difficulty) : "moderate"}
Length: ${short ? "short (≈12-15 minutes, 1 key insight, at most 1 exhibit)" : "standard (≈25 minutes)"}
Skills it should stress: ${focusSkills.length ? focusSkills.join(", ") : "a natural mix"}
Avoid these existing cases: ${avoidTitles.slice(0, 40).join("; ")}

${sources ? `SOURCE MATERIAL (follow its method and terminology):\n${sources}` : ""}`;
  const raw = await llm.json({ role: "generator", system: GENERATOR_SYSTEM, messages: [{ role: "user", content: prompt }], schema: CaseGenSchema });
  return normalizeGenerated(raw, { id: `gen-${Date.now().toString(36)}`, source: "generated" });
}

/**
 * REDO / TRANSFER VARIANT: preserve the learning objective of a case the candidate struggled
 * with, but change the surface (industry, numbers, entry point) so it tests transfer rather
 * than memory.
 */
export async function generateTransferVariant(original, debrief) {
  const prompt = `The candidate struggled with the case below. Write a TRANSFER VARIANT for a redo.
- Preserve the underlying learning objective and the type of central insight they missed.
- Change the client, industry, numbers and the order in which the insight surfaces, so the candidate cannot replay the previous path from memory.
- Keep a similar difficulty profile. Set learning_objective to one sentence naming the skill/insight being retested.

What went wrong last time:
- Biggest problem: ${debrief?.biggest_problem ?? "n/a"}
- Missed: ${(debrief?.missed ?? []).join("; ")}
- Next skill: ${debrief?.next_skill ?? "n/a"}

ORIGINAL CASE (for reference only — do not copy it):
${JSON.stringify({ ...original, source: undefined }, null, 1)}`;
  const raw = await llm.json({ role: "generator", system: GENERATOR_SYSTEM, messages: [{ role: "user", content: prompt }], schema: CaseGenSchema });
  return normalizeGenerated(raw, { id: `redo-${original.id}-${Date.now().toString(36)}`, source: `redo-variant:${original.id}` });
}

/** Casebook ingestion: turn a window of casebook text into interactive case objects. */
export const ExtractionSchema = z.object({ cases: z.array(CaseGenSchema.extend({ source_excerpt_start: z.string() })) });

export async function extractCasesFromText(docTitle, windowText) {
  const prompt = `Below is an excerpt from a consulting casebook ("${docTitle}"). It may contain interview transcripts (interviewer/candidate dialogue), case write-ups, or other material.

Convert every COMPLETE case that STARTS in this excerpt into an interactive case object:
- opening: the prompt as the interviewer first states it.
- clarifications: answers the interviewer gave to clarifying questions.
- data / exhibits: information and tables the interviewer released, each with a release_when condition describing what candidate step earns it.
- quant: calculations performed, with worked solutions.
- reference_solution: the documented solution path. recommendation: the documented recommendation.
- alternative_approaches: other valid ways to crack it, including ones the transcript didn't take. The casebook path is ONE valid path, not the answer key.
- interviewer_notes: observations about what the interviewer was testing or pushed on.
- If the case type in the book doesn't match what the case actually turns into, set type to the real problem and put the book's label in secondary_types.
- Keep the original numbers. Where the transcript omits data a live interviewer would need, add minimal consistent data and say so in interviewer_notes.
- source_excerpt_start: the first ~8 words of the case in the excerpt.
Skip cases that are clearly cut off (they will be caught in the next window). Skip non-case content. Return an empty list if there are none.

EXCERPT:
${windowText}`;
  const res = await llm.json({
    role: "generator",
    system: GENERATOR_SYSTEM,
    messages: [{ role: "user", content: prompt }],
    schema: ExtractionSchema,
    maxTokens: 16000,
  });
  return res.cases;
}
