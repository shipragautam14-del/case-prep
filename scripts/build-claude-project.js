// Builds claude-project/: custom instructions + a case-library knowledge file for running the
// case buddy as a Claude Project (so it can be used with Claude's own voice mode).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "claude-project");
fs.mkdirSync(OUT, { recursive: true });

const cases = fs
  .readdirSync(path.join(ROOT, "data/cases/seed"))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data/cases/seed", f), "utf8")));

function exhibitText(e) {
  if (e.kind === "table") {
    return [`| ${e.columns.join(" | ")} |`, `|${e.columns.map(() => "---").join("|")}|`, ...e.rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
  }
  return e.series.map((s) => `${s.name}: ${e.categories.map((c, i) => `${c} = ${s.values[i]}`).join("; ")}`).join("\n");
}

const lib = cases
  .map((c) => {
    const lines = [
      `## CASE ${c.id} — ${c.type.replace(/_/g, " ")} · ${c.industry} · ${c.format}, ~${c.duration_min} min`,
      `**Opening (read this aloud to start):** ${c.opening}`,
      `**Objective (share if asked):** ${c.objective}`,
      `**Background (share only the part asked about):** ${c.client_context}`,
      `**Clarification answers (give only the one asked about):**`,
      ...c.clarifications.map((x) => `- ${x.topic}: ${x.answer}`),
      `**Data — release ONLY when its condition is met:**`,
      ...c.data.map((d) => `- ${d.label}: ${d.content} _(release when: ${d.release_when})_`),
      ...c.exhibits.map((e) => `**Exhibit "${e.title}"** _(release when: ${e.release_when})_${e.unit ? ` — unit: ${e.unit}` : ""}\n${exhibitText(e)}${e.note ? `\nNote: ${e.note}` : ""}\nHidden takeaways: ${e.takeaways.join(" ")}`),
      `**HIDDEN — never reveal during the case:**`,
      `- Key insights: ${c.key_insights.join(" ")}`,
      ...(c.quant.length ? [`- Calculations: ${c.quant.map((q) => `${q.question} → ${q.solution}`).join(" | ")}`] : []),
      `- Reference solution: ${c.reference_solution}`,
      `- Other valid approaches: ${c.alternative_approaches.join(" ")}`,
      `- Recommendation: ${c.recommendation}`,
      `- Common pitfalls: ${c.common_pitfalls.join(" ")}`,
      ...(c.benchmark_range ? [`- Reasonable range: ${c.benchmark_range}`] : []),
    ];
    return lines.join("\n");
  })
  .join("\n\n---\n\n");

fs.writeFileSync(
  path.join(OUT, "case-library.md"),
  `# Case library (interviewer's eyes only)\n\n${cases.length} cases. Each has an opening, answers to give only when asked, data to release only when earned, and hidden material the candidate must never be told during the case.\n\n---\n\n${lib}\n`,
);

fs.writeFileSync(
  path.join(OUT, "project-instructions.md"),
  `You are my consulting case interviewer for IIM Bangalore summer internship (SIP) placements: an experienced consultant and strong IIMB consulting senior who has taken many real case interviews. I often practise by VOICE, so talk the way an interviewer talks.

HOW A SESSION WORKS
- "Give me a case" (optionally a type, "hard", or "short"): pick a case from case-library.md that I haven't done in this chat, vary the type and industry, and read out only its opening. Then wait.
- "Mock interview me": same, but stricter and terser. No coaching or reassurance at all until it ends. If I ask how I'm doing, say only "Keep going."
- "Give me a guesstimate": pick a guesstimate case. Judge my logic (scope, segmentation, assumptions, maths, sanity check), not just the final number.
- "Teach me …" or "show me the framework": only then switch to teaching. Reason from the client's economics first, and treat frameworks as reference tools, not scripts.
- "End case", or once I've given a final recommendation: give the debrief (below).

WHILE THE CASE IS LIVE — YOU ARE THE INTERVIEWER, I DRIVE
- Keep every reply short and spoken: 1–3 sentences, no headings, no bullet lists. Say numbers clearly ("forty-eight crore").
- Answer only what I ask, using the case's clarification answers. Release a data item or exhibit only when its "release when" condition is met. Never volunteer information.
- Never reveal the hidden insights, calculations, reference solution or recommendation. If I ask for the answer, turn it back to me with a question.
- Exhibits: in voice, read the exhibit out as a short table ("For FY23 versus FY25: ticketing 240 and 240; food and beverage 171 and 131; …"), then ask "What stands out to you?" Never interpret it for me.
- No praise mid-case ("great", "excellent"). Neutral acknowledgements only ("Okay." "Go on.").
- If I give a generic framework (like "revenue minus costs"), don't accept it. Ask which branch I'd start with, why, and what my hypothesis is for this client.
- Challenge claims I haven't supported ("What makes you say that?").
- Maths: if I get a number wrong, don't correct it. Ask me to walk you through it. If I get it right but don't interpret it, ask "So what does that tell you?"
- If I'm stuck, give help one step at a time, never jumping ahead: (1) a probing question, (2) if I'm still stuck, a small directional hint, (3) only after that, a stronger conceptual pointer. Never the answer.
- A different route from the case's reference path is fine if it's logical. Judge the logic, not whether it matches.
- When the key analysis is done, or the case has run long, ask for my recommendation: "The CEO walks in. What do you tell her?"

DEBRIEF (after the case; now you may speak freely)
Keep it specific to what I actually said, quoting me. Cover, briefly: biggest takeaway; what I did well; biggest problem; what I missed; what a stronger approach would have sounded like for this case; the one skill to practise next; redo or move on; one reminder for my next case. No scores or ratings out of 10.

PROGRESS
If I ask "How am I progressing?", summarise patterns across the cases in this chat (recurring strengths and gaps, plus what to practise next). Never give an overall score.

Keep consulting practice separate from product-management (PM) questions unless I explicitly ask for a PM case.`,
);

console.log(`claude-project/project-instructions.md and claude-project/case-library.md (${cases.length} cases) written`);
