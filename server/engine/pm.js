// PM MODULE — deliberately separate from consulting case practice: separate prompts, separate
// case file (data/pm/cases.json), separate retrieval module ("pm"), separate profile section.
import fs from "node:fs";
import path from "node:path";
import * as llm from "../llm.js";
import { config } from "../config.js";
import { PM_SYSTEM } from "../prompts/others.js";
import { PmDebriefSchema } from "../schemas.js";
import { retrieve, formatSnippets } from "../knowledge/retrieval.js";

export function loadPmCases() {
  return JSON.parse(fs.readFileSync(path.join(config.dataDir, "pm", "cases.json"), "utf8"));
}

export function pickPmCase(profile) {
  const cases = loadPmCases();
  const done = new Set(profile.pm.sessions.map((s) => s.caseId));
  const fresh = cases.filter((c) => !done.has(c.id));
  const pool = fresh.length ? fresh : cases;
  return pool[Math.floor(Math.random() * pool.length)];
}

function toMessages(session) {
  const msgs = [];
  for (const t of session.transcript) {
    const role = t.role === "candidate" ? "user" : "assistant";
    if (!msgs.length && role === "assistant") msgs.push({ role: "user", content: "(The PM interview begins.)" });
    const last = msgs.at(-1);
    if (last && last.role === role) last.content += `\n\n${t.text}`;
    else msgs.push({ role, content: t.text });
  }
  return msgs;
}

export async function pmTurn(session) {
  const pmCase = loadPmCases().find((c) => c.id === session.pmCaseId);
  const system = `${PM_SYSTEM}\n\nHIDDEN BRIEF (for you only)\n${JSON.stringify(pmCase, null, 1)}`;
  const reply = await llm.text({ role: "interviewer", system, messages: toMessages(session) });
  const ended = reply.startsWith("[END]");
  return { reply: reply.replace(/^\[END\]\s*/, ""), ended };
}

export async function pmDebrief(session) {
  const pmCase = loadPmCases().find((c) => c.id === session.pmCaseId);
  const snippets = formatSnippets(retrieve(`${pmCase.type} ${pmCase.title}`, { module: "pm", k: 4 }), 4000);
  const transcript = session.transcript.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join("\n");
  const d = await llm.json({
    role: "coach",
    system: `You are a product management interview coach giving a debrief after a PM interview question. Be specific to what the candidate said and use PM methods only (users, needs, prioritisation, metrics, trade-offs). No scores. Ground your advice in the PM source material if provided.`,
    messages: [{ role: "user", content: `QUESTION BRIEF\n${JSON.stringify(pmCase, null, 1)}\n\n${snippets ? `PM SOURCE MATERIAL\n${snippets}\n\n` : ""}TRANSCRIPT\n${transcript}` }],
    schema: PmDebriefSchema,
  });
  const list = (a) => a.map((x) => `- ${x}`).join("\n");
  return {
    data: d,
    markdown: `## PM debrief — ${pmCase.title}\n\n${d.summary}\n\n**What worked**\n${list(d.did_well)}\n\n**Biggest problem.** ${d.biggest_problem}\n\n**Stronger approach**\n${d.stronger_approach}\n\n**Next focus:** ${d.next_focus}\n\n_PM practice is tracked separately and doesn't affect your consulting profile._`,
  };
}
