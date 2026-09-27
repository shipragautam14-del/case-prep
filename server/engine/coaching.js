// COACH (post-case debrief), TEACHER (explicit level-4 teaching) and PROGRESS REVIEWER.
import * as llm from "../llm.js";
import { COACH_SYSTEM, coachInput } from "../prompts/coach.js";
import { TEACHER_SYSTEM, PROGRESS_SYSTEM } from "../prompts/others.js";
import { DebriefSchema, ProgressSchema, SKILL_LABELS } from "../schemas.js";
import { retrieve, formatSnippets } from "../knowledge/retrieval.js";
import { summarizeForPrompt, skillStatus } from "../learner/profile.js";

const TYPE_QUERY = {
  profitability: "profitability case revenue cost drivers approach",
  growth: "growth strategy case organic inorganic approach",
  market_entry: "new market entry case attractiveness feasibility approach",
  mna: "mergers acquisitions case synergies valuation approach",
  operations: "operations case capacity process bottleneck",
  pricing: "pricing case cost based value based competitor pricing",
  strategy: "strategy case approach",
  unconventional: "unconventional case approach",
  guesstimate: "guesstimate approach segmentation assumptions sanity check",
};

export async function runDebrief(caseObj, session, profile) {
  const snippets = formatSnippets(
    retrieve(`${TYPE_QUERY[caseObj.type] ?? caseObj.type} ${caseObj.industry}`, { module: "consulting", k: 4, excludeKinds: ["casebook"] }),
    4500,
  );
  return llm.json({
    role: "coach",
    system: COACH_SYSTEM,
    messages: [{ role: "user", content: coachInput(caseObj, session, summarizeForPrompt(profile), snippets) }],
    schema: DebriefSchema,
  });
}

export function renderDebrief(d, caseObj) {
  const list = (arr) => arr.map((x) => `- ${x}`).join("\n");
  return `## Debrief — ${caseObj.title}

**Biggest takeaway.** ${d.biggest_takeaway}

**What you did well**
${list(d.did_well)}

**Biggest problem.** ${d.biggest_problem}

**What you missed**
${list(d.missed)}

**What a stronger approach would have looked like**
${d.stronger_approach}
${d.guesstimate_notes ? `\n**Guesstimate logic**\n${d.guesstimate_notes}\n` : ""}
**Next skill to practise:** ${SKILL_LABELS[d.next_skill]}. ${d.next_skill_reason}

**Redo or move on?** ${d.redo.recommend ? "Redo." : "Move on."} ${d.redo.reason}

**Next-case reminder:** _${d.next_case_reminder}_`;
}

/** Explicit teaching (level 4). With a case: walk through it. Without: teach the topic from sources. */
export async function teach({ topic, caseObj = null, session = null, history = [] }) {
  const query = caseObj ? `${TYPE_QUERY[caseObj.type] ?? caseObj.type} ${caseObj.industry} ${topic ?? ""}` : topic;
  const chunks = retrieve(query, { module: "consulting", k: 6, excludeKinds: caseObj ? ["casebook"] : [] });
  const snippets = formatSnippets(chunks, 8000);
  let context = "";
  if (caseObj && session) {
    const transcript = session.transcript
      .filter((t) => t.role !== "exhibit")
      .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
      .join("\n");
    context = `THE CASE THE CANDIDATE IS WORKING ON (full file, you may now reveal it)\n${JSON.stringify({ ...caseObj, source: undefined }, null, 1)}\n\nTRANSCRIPT SO FAR\n${transcript}\n\n`;
  }
  const request = history.length ? history.at(-1).content : topic;
  const messages = [
    ...history.slice(0, -1),
    {
      role: "user",
      content: `${context}${snippets ? `SOURCE MATERIAL (retrieved)\n${snippets}\n\n` : "SOURCE MATERIAL: none retrieved for this topic.\n\n"}CANDIDATE'S REQUEST\n${request}`,
    },
  ];
  const text = await llm.text({ role: "teacher", system: TEACHER_SYSTEM, messages, maxTokens: 6000 });
  return { text, sources: [...new Set(chunks.map((c) => c.title))] };
}

export async function progressReview(profile) {
  const completed = profile.cases.filter((c) => c.completed);
  const status = skillStatus(profile);
  if (!completed.length && !profile.drills.length) {
    return {
      markdown:
        "You haven't completed any cases yet, so there are no patterns to read. Do two or three full cases (ideally different types, e.g. one profitability, one market entry, one guesstimate) to build a baseline. After that I can point out what's becoming reliable and what keeps recurring.",
      data: null,
    };
  }
  const r = await llm.json({
    role: "coach",
    system: PROGRESS_SYSTEM,
    messages: [{ role: "user", content: `LEARNER PROFILE\n${summarizeForPrompt(profile)}\n\nSKILL STATUS\n${JSON.stringify(status, null, 1)}` }],
    schema: ProgressSchema,
  });
  const list = (a) => (a.length ? a.map((x) => `- ${x}`).join("\n") : "- (not enough evidence yet)");
  const markdown = `## Progress review

${r.one_line_summary}

**Recent strengths**
${list(r.recent_strengths)}

**Recurring gaps**
${list(r.recurring_gaps)}

**Trends**
${list(r.trends)}

**Next practice**
${list(r.next_practice)}

_Based on ${completed.length} completed case(s) and ${profile.drills.length} drill(s). There's no overall score by design: the patterns above are what matter._`;
  return { markdown, data: r };
}
