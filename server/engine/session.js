// SESSION MANAGER — orchestrates one practice session at a time:
//   router → case manager → [analyzer (case state) → policy → interviewer → leak guard] → coach → learner profile
import * as llm from "../llm.js";
import { sessions, newId } from "../store.js";
import { getCase, allCases, saveGeneratedCase } from "../cases/library.js";
import { selectCase } from "../cases/selector.js";
import { generateCase, generateTransferVariant } from "../cases/generator.js";
import { ANALYZER_SYSTEM, analyzerInput } from "../prompts/analyzer.js";
import { INTERVIEWER_SYSTEM, MOCK_ADDENDUM, interviewerCaseBrief } from "../prompts/interviewer.js";
import { AnalyzerSchema, SKILL_LABELS } from "../schemas.js";
import { decideIntervention, filterReleases, buildDirective, turnBudget } from "./policy.js";
import { checkLeak } from "./leakGuard.js";
import { detectInCaseCommand, detectStartCommand, detectMidCaseSwitch, routeFreeText } from "./router.js";
import { runDebrief, renderDebrief, teach, progressReview } from "./coaching.js";
import { pickDrill, drillIntro, drillTurn, DRILL_TO_SKILL } from "./drills.js";
import { pickPmCase, pmTurn, pmDebrief } from "./pm.js";
import {
  loadProfile, saveProfile, recordCase, recordAbandoned, recordDrill, weakestSkill, focusSkills, historyView,
} from "../learner/profile.js";

const CASE_MODES = ["interview", "mock", "guesstimate"];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function item(role, text, extra = {}) {
  return { id: newId("m"), role, text, ts: new Date().toISOString(), ...extra };
}

function publicExhibit(e) {
  if (!e) return null;
  const { release_when, takeaways, ...pub } = e;
  return pub;
}

function newCaseState() {
  return {
    phase: "opening",
    turn: 0,
    structure: null,
    hypothesis: null,
    branch: null,
    revealed: { clarifications: [], data: [], exhibits: [] },
    improvised: [],
    hints: [],
    ladder: 0,
    stuckStreak: 0,
    calcErrorStreak: 0,
    askedForRecommendation: false,
    observations: [],
    calcChecks: [],
    taughtAt: null,
    endedBy: null,
    leaks: [],
  };
}

const OPENERS = {
  interview: ["Alright, here's your case.", "Okay, let's get into it.", "Here's the situation."],
  mock: ["Let's begin."],
  guesstimate: ["Here's a guesstimate for you.", "Let's do a quick estimation."],
};

function createCaseSession(caseObj, mode, extra = {}) {
  const openers = OPENERS[mode] || OPENERS.interview;
  const opener = openers[Math.floor(Math.random() * openers.length)];
  const session = {
    id: newId("s"),
    kind: "case",
    mode,
    caseId: caseObj.id,
    status: "live",
    createdAt: new Date().toISOString(),
    state: newCaseState(),
    transcript: [item("interviewer", `${opener} ${caseObj.opening}`)],
    debrief: null,
    ...extra,
  };
  if (extra.intro) session.transcript.unshift(item("system", extra.intro));
  sessions.save(session);
  return session;
}

// ---------------------------------------------------------------------------
// public view (never includes hidden case content)
// ---------------------------------------------------------------------------
export function publicView(session) {
  if (!session) return null;
  const view = { id: session.id, kind: session.kind, mode: session.mode, status: session.status, transcript: session.transcript };
  if (session.kind === "case") {
    const c = getCase(session.caseId);
    const over = session.status === "debriefed" || session.status === "abandoned";
    view.header = {
      industry: c?.industry,
      label: session.mode === "mock" ? "Mock interview" : session.mode === "guesstimate" ? "Guesstimate" : "Case practice",
      title: over ? c?.title : null,
      type: over ? c?.type : null,
      startedAt: session.createdAt,
    };
    view.exhibits = session.state.revealed.exhibits.map((id) => publicExhibit(c?.exhibits.find((e) => e.id === id)));
    view.debrief = session.debrief;
  }
  if (session.kind === "drill") view.header = { label: `Micro-skill: ${session.drill.skill}` };
  if (session.kind === "pm") view.header = { label: "PM practice (separate module)" };
  if (session.kind === "teach") view.header = { label: "Teaching" };
  return view;
}

// ---------------------------------------------------------------------------
// starting things
// ---------------------------------------------------------------------------
async function startCase({ mode = "interview", caseType = "any", industry = null, difficulty = "normal", short = false, focus = null, requireSkill = null, intro = null }) {
  const profile = loadProfile();
  const req = {
    caseType: mode === "guesstimate" ? "guesstimate" : caseType,
    industry,
    difficulty,
    short,
    focusSkills: focus ?? focusSkills(profile),
    requireSkill,
  };
  let { case: picked, usingRepeats } = selectCase(req, profile);
  if (!picked || usingRepeats) {
    // Nothing fresh fits: write a new case rather than repeating one.
    try {
      const generated = await generateCase({
        caseType: req.caseType,
        industry,
        difficulty: profile.difficultyTargets,
        short,
        avoidTitles: allCases().map((c) => c.title),
        focusSkills: req.focusSkills,
      });
      saveGeneratedCase(generated);
      picked = generated;
    } catch (e) {
      console.error("[startCase] generation failed:", e.message);
      if (!picked) {
        const fallback = selectCase({ ...req, industry: null, caseType: req.caseType === "guesstimate" ? "guesstimate" : "any" }, profile);
        picked = fallback.case;
      }
    }
  }
  if (!picked) throw new Error("No case available. Add cases to data/cases/seed or configure the LLM for generation.");
  return createCaseSession(picked, mode, intro ? { intro } : {});
}

async function startDrill(skill) {
  const profile = loadProfile();
  const drill = pickDrill(skill, profile);
  const session = {
    id: newId("s"),
    kind: "drill",
    mode: "drill",
    status: "live",
    createdAt: new Date().toISOString(),
    drill,
    transcript: [item("interviewer", drillIntro(drill))],
  };
  if (drill.exhibit) session.transcript.push(item("exhibit", "", { exhibit: publicExhibit(drill.exhibit), exhibitId: drill.exhibit.id }));
  sessions.save(session);
  return session;
}

async function startPm() {
  const profile = loadProfile();
  const pmCase = pickPmCase(profile);
  const session = {
    id: newId("s"),
    kind: "pm",
    mode: "pm",
    status: "live",
    createdAt: new Date().toISOString(),
    pmCaseId: pmCase.id,
    transcript: [
      item("system", "PM practice mode. This module is separate from consulting case practice and uses its own material and feedback."),
      item("interviewer", pmCase.prompt),
    ],
  };
  sessions.save(session);
  return session;
}

async function startTeaching(topic) {
  const { text, sources } = await teach({ topic });
  const session = {
    id: newId("s"),
    kind: "teach",
    mode: "teach",
    status: "live",
    createdAt: new Date().toISOString(),
    transcript: [item("candidate", topic), item("coach", text, { sources })],
  };
  sessions.save(session);
  return session;
}

async function startReview() {
  const profile = loadProfile();
  const { markdown } = await progressReview(profile);
  const session = {
    id: newId("s"),
    kind: "review",
    mode: "review",
    status: "done",
    createdAt: new Date().toISOString(),
    transcript: [item("coach", markdown)],
  };
  sessions.save(session);
  return session;
}

async function startRedoCase() {
  const profile = loadProfile();
  const last = [...profile.cases].reverse().find((c) => c.completed && c.redo?.recommend) || [...profile.cases].reverse().find((c) => c.completed);
  if (!last) return systemOnly("There's no completed case to redo yet. Try a case first.");
  const original = getCase(last.caseId);
  const prevSession = sessions.get(last.sessionId);
  let variant = null;
  try {
    variant = await generateTransferVariant(original, prevSession?.debrief?.data);
    saveGeneratedCase(variant);
  } catch (e) {
    console.error("[redo] variant generation failed:", e.message);
  }
  const intro = variant
    ? `Redo of "${original.title}". It's a new client, but it tests the same thing you struggled with last time. Don't try to replay the old path; solve this one on its own terms.`
    : `Redo of "${original.title}". Try a different route from last time.`;
  return createCaseSession(variant || original, "interview", { intro, redoOf: original.id });
}

async function startRedoWeakest() {
  const profile = loadProfile();
  const weak = weakestSkill(profile);
  if (!weak) {
    return startCase({ mode: "interview", intro: "I don't have enough history yet to see a recurring weakness, so here's a well-rounded case to build a baseline." });
  }
  const label = SKILL_LABELS[weak.skill];
  const drillSkill = Object.entries(DRILL_TO_SKILL).find(([, s]) => s === weak.skill)?.[0];
  const lastWasCase = profile.cases.at(-1)?.completed && profile.cases.at(-1)?.nextSkill === weak.skill;
  // Alternate: if the last full case already surfaced this weakness, do a focused drill first.
  if (drillSkill && lastWasCase) {
    const s = await startDrill(drillSkill);
    s.transcript.unshift(item("system", `Targeting your recurring gap: **${label}**. ${weak.status?.lastEvidence ? `(Last time: ${weak.status.lastEvidence})` : ""}`));
    sessions.save(s);
    return s;
  }
  return startCase({
    mode: "interview",
    focus: [weak.skill],
    requireSkill: weak.skill,
    intro: `Targeting your recurring gap: **${label}**. This case leans on it.`,
  });
}

/** Start a specific case by id (used by the simulator and for "practice case X" flows). */
export function startSpecificCase(caseId, mode = "interview") {
  const c = getCase(caseId);
  if (!c) throw new Error(`Unknown case ${caseId}`);
  return createCaseSession(c, mode);
}

function systemOnly(text) {
  const session = { id: newId("s"), kind: "info", mode: "info", status: "done", createdAt: new Date().toISOString(), transcript: [item("system", text)] };
  sessions.save(session);
  return session;
}

const HELP = `I'm your case practice buddy. Try:
- **"Give me a case"** (or "a hard market entry case", "a short case in healthcare")
- **"Mock interview me"** for strict interview conditions
- **"Give me a guesstimate"**
- **"Test my prioritisation"** / structuring / math / hypothesis / synthesis / clarification, or **"Give me an exhibit"**
- **"Teach me market entry"**
- **"How am I progressing?"** or **"Redo my weakest skill"**
- **"PM case"** for the separate product-management module`;

export async function startFromRoute(route, text = "") {
  switch (route.mode) {
    case "case":
      return startCase({ mode: "interview", caseType: route.case_type, industry: route.industry, difficulty: route.difficulty, short: route.length === "short" });
    case "mock":
      return startCase({ mode: "mock", caseType: route.case_type, industry: route.industry, difficulty: route.difficulty === "easier" ? "normal" : route.difficulty, short: route.length === "short" });
    case "guesstimate":
      return startCase({ mode: "guesstimate", industry: route.industry, difficulty: route.difficulty, short: route.length === "short" });
    case "drill":
      return startDrill(route.drill_skill && route.drill_skill !== "none" ? route.drill_skill : "structuring");
    case "teach":
      return startTeaching(route.topic || text);
    case "review":
      return startReview();
    case "redo_weakest":
      return startRedoWeakest();
    case "redo_case":
      return startRedoCase();
    case "pm":
      return startPm();
    case "history": {
      const h = historyView(loadProfile());
      return systemOnly(h.length ? "Your case history is in the **History** panel." : "No cases yet. Say \"give me a case\" to start.");
    }
    default:
      return systemOnly(HELP);
  }
}

// ---------------------------------------------------------------------------
// live case turn
// ---------------------------------------------------------------------------
function interviewerMessages(session, caseObj, directive) {
  const msgs = [{ role: "user", content: "(The interview begins. Deliver the case opening.)" }];
  const history = session.transcript.filter((t) => t.role !== "system").slice(-40);
  const lastCandidateIdx = history.map((t) => t.role).lastIndexOf("candidate");
  history.forEach((t, i) => {
    let role, content;
    if (t.role === "candidate") {
      role = "user";
      content = t.text;
    } else if (t.role === "exhibit") {
      role = "assistant";
      content = `[Exhibit handed over: "${caseObj.exhibits.find((e) => e.id === t.exhibitId)?.title}"]`;
    } else if (t.role === "coach") {
      role = "assistant";
      content = "[A teaching break happened here at the candidate's request. The case has now resumed.]";
    } else {
      role = "assistant";
      content = t.text;
    }
    if (i === lastCandidateIdx) {
      content = `${content}\n\n=== CASE SYSTEM NOTE (not said by the candidate; never mention it) ===\n${interviewerCaseBrief(caseObj, session.state)}\n\nDIRECTIVE FOR THIS TURN:\n${directive}`;
    }
    const last = msgs.at(-1);
    if (last.role === role) last.content += `\n\n${content}`;
    else msgs.push({ role, content });
  });
  return msgs;
}

async function interviewerReply(session, caseObj, directive, fallbackLine) {
  const system = INTERVIEWER_SYSTEM + (session.mode === "mock" ? MOCK_ADDENDUM : "");
  let reply = await llm.text({ role: "interviewer", system, messages: interviewerMessages(session, caseObj, directive), maxTokens: 1500 });
  let leak = checkLeak(reply, caseObj, session);
  if (leak.leak) {
    session.state.leaks.push({ turn: session.state.turn, ...leak });
    const retryDirective = `${directive}\n\nIMPORTANT: your previous draft contained information the candidate has not been given (${[...leak.numbers, ...leak.phrases].slice(0, 3).join("; ")}). You do not have that information. Do not state it.`;
    reply = await llm.text({ role: "interviewer", system, messages: interviewerMessages(session, caseObj, retryDirective), maxTokens: 1500 });
    leak = checkLeak(reply, caseObj, session);
    if (leak.leak) reply = fallbackLine;
  }
  return reply.replace(/^\s*(interviewer|INTERVIEWER)\s*:\s*/, "").trim();
}

async function finishCase(session, caseObj, endedBy = null) {
  session.state.endedBy = endedBy;
  const profile = loadProfile();
  const data = await runDebrief(caseObj, session, profile);
  const markdown = renderDebrief(data, caseObj);
  session.debrief = { data, markdown };
  session.status = "debriefed";
  session.transcript.push(item("coach", markdown, { kind: "debrief" }));
  recordCase(profile, { session, caseObj, debrief: data });
  saveProfile(profile);
}

async function caseTurn(session, text) {
  const caseObj = getCase(session.caseId);
  const mock = session.mode === "mock";
  const cmd = detectInCaseCommand(text);

  // ---- teaching break (level 4) ----
  if (session.status === "teaching") {
    session.transcript.push(item("candidate", text));
    if (cmd?.command === "continue") {
      session.status = "live";
      session.transcript.push(item("interviewer", "Okay, let's pick the case back up. Where would you like to go from here?"));
      return;
    }
    if (cmd?.command === "end") return finishCase(session, caseObj, "candidate ended the case after a teaching break");
    const history = session.transcript
      .filter((t) => t.role === "candidate" || t.role === "coach")
      .slice(-8)
      .map((t) => ({ role: t.role === "candidate" ? "user" : "assistant", content: t.text }));
    const { text: answer, sources } = await teach({ topic: text, caseObj, session, history });
    session.transcript.push(item("coach", answer, { sources, kind: "teaching" }));
    return;
  }

  if (cmd?.command === "teach") {
    session.transcript.push(item("candidate", text));
    if (mock) {
      session.transcript.push(item("interviewer", "Let's finish the case first. We'll go through it properly in the debrief. Where would you like to go next?"));
      return;
    }
    session.state.taughtAt = session.state.turn;
    session.status = "teaching";
    const { text: lesson, sources } = await teach({ topic: text, caseObj, session });
    session.transcript.push(
      item("coach", `${lesson}\n\n---\nSay **continue** to pick the case back up, or **end case** for the debrief.`, { sources, kind: "teaching" }),
    );
    return;
  }

  if (cmd?.command === "end") {
    session.transcript.push(item("candidate", text));
    if (session.state.turn >= 3) return finishCase(session, caseObj, "candidate ended the case early");
    session.status = "abandoned";
    const profile = loadProfile();
    recordAbandoned(profile, { session, caseObj });
    saveProfile(profile);
    session.transcript.push(item("system", "Case ended before there was enough to debrief. Start a new one whenever you're ready."));
    return;
  }

  // ---- normal interview turn ----
  session.transcript.push(item("candidate", text));
  const s = session.state;
  s.turn += 1;

  const analysis = await llm.json({
    role: "analyzer",
    system: ANALYZER_SYSTEM,
    messages: [{ role: "user", content: analyzerInput(caseObj, session, text) }],
    schema: AnalyzerSchema,
  });

  const releases = filterReleases(analysis, caseObj, s);
  const intervention = decideIntervention(analysis, s, { mock });
  const budget = turnBudget(caseObj);
  const forceWrapUp = !s.askedForRecommendation && !analysis.case_complete && s.turn >= Math.round(budget * 1.4);

  const directive = buildDirective({ analysis, intervention, releases, caseObj, state: s, mock, forceWrapUp });

  // update case state (revealed info is committed before the interviewer speaks)
  s.revealed.clarifications.push(...releases.clarifications);
  s.revealed.data.push(...releases.data);
  s.revealed.exhibits.push(...releases.exhibits);
  if (analysis.improvised_answer && !releases.clarifications.length && !releases.data.length) s.improvised.push(analysis.improvised_answer);
  if (analysis.structure_summary) s.structure = analysis.structure_summary;
  if (analysis.hypothesis_summary) s.hypothesis = analysis.hypothesis_summary;
  if (analysis.current_branch) s.branch = analysis.current_branch;
  s.phase = releases.exhibits.length ? "exhibit" : analysis.phase;
  s.ladder = intervention.ladder;
  s.stuckStreak = intervention.stuckStreak;
  if (intervention.level > 0) {
    const hintText = { 1: analysis.hint_ladder.probe, 2: analysis.hint_ladder.small_hint, 3: analysis.hint_ladder.strong_hint }[intervention.level];
    s.hints.push({ turn: s.turn, level: intervention.level, text: hintText, reason: analysis.candidate_state });
  }
  if (analysis.calculation.present) {
    s.calcChecks.push({ turn: s.turn, correct: analysis.calculation.correct, error: analysis.calculation.error_description, interpreted: analysis.calculation.interpreted });
    s.calcErrorStreak = analysis.calculation.correct === false ? s.calcErrorStreak + 1 : 0;
  }
  for (const o of analysis.observations) s.observations.push({ turn: s.turn, ...o });
  if (analysis.generic_framework_dump) s.observations.push({ turn: s.turn, skill: "structuring", kind: "mistake", evidence: "Gave a generic framework without tailoring/prioritising it." });
  if (forceWrapUp || analysis.ready_for_recommendation) s.askedForRecommendation = true;

  const fallback = intervention.level > 0 ? analysis.hint_ladder.probe : "Okay. Go on.";
  const reply = await interviewerReply(session, caseObj, directive, fallback);
  session.transcript.push(item("interviewer", reply));
  for (const exId of releases.exhibits) {
    session.transcript.push(item("exhibit", "", { exhibitId: exId, exhibit: publicExhibit(caseObj.exhibits.find((e) => e.id === exId)) }));
  }

  if (analysis.case_complete) {
    s.phase = "complete";
    await finishCase(session, caseObj);
  }
}

// ---------------------------------------------------------------------------
// other session kinds
// ---------------------------------------------------------------------------
async function drillSessionTurn(session, text) {
  session.transcript.push(item("candidate", text));
  const r = await drillTurn(session);
  session.transcript.push(item(r.done ? "coach" : "interviewer", r.message));
  if (r.done) {
    session.status = "done";
    const profile = loadProfile();
    recordDrill(profile, {
      skill: session.drill.skill,
      drillId: session.drill.id,
      profileSkill: DRILL_TO_SKILL[session.drill.skill],
      rating: r.skill_rating,
      evidence: r.evidence,
      mistakeTags: r.mistake_tags,
      sessionId: session.id,
    });
    saveProfile(profile);
    session.transcript.push(item("system", `Want another? Say "test my ${session.drill.skill}" again, or pick something else.`));
  }
}

async function pmSessionTurn(session, text) {
  session.transcript.push(item("candidate", text));
  const cmd = detectInCaseCommand(text);
  let ended = cmd?.command === "end";
  if (!ended) {
    const r = await pmTurn(session);
    session.transcript.push(item("interviewer", r.reply));
    ended = r.ended;
  }
  if (ended) {
    const d = await pmDebrief(session);
    session.transcript.push(item("coach", d.markdown, { kind: "debrief" }));
    session.status = "done";
    const profile = loadProfile();
    profile.pm.sessions.push({ sessionId: session.id, caseId: session.pmCaseId, date: new Date().toISOString(), nextFocus: d.data.next_focus });
    saveProfile(profile);
  }
}

async function teachSessionTurn(session, text) {
  session.transcript.push(item("candidate", text));
  const history = session.transcript
    .filter((t) => t.role === "candidate" || t.role === "coach")
    .slice(-10)
    .map((t) => ({ role: t.role === "candidate" ? "user" : "assistant", content: t.text }));
  const { text: answer, sources } = await teach({ topic: text, history });
  session.transcript.push(item("coach", answer, { sources }));
}

async function postCaseTurn(session, text) {
  // After the debrief, questions about the case are answered in coaching/teaching mode.
  const caseObj = getCase(session.caseId);
  session.transcript.push(item("candidate", text));
  const history = session.transcript
    .filter((t) => t.role === "candidate" || t.role === "coach")
    .slice(-8)
    .map((t) => ({ role: t.role === "candidate" ? "user" : "assistant", content: t.text }));
  const { text: answer, sources } = await teach({ topic: text, caseObj, session, history });
  session.transcript.push(item("coach", answer, { sources }));
}

// ---------------------------------------------------------------------------
// entry points used by the HTTP layer
// ---------------------------------------------------------------------------
function isLive(session) {
  return session && ["live", "teaching"].includes(session.status);
}

function abandonIfLive(session) {
  if (!session || session.kind !== "case" || !isLive(session)) return;
  const caseObj = getCase(session.caseId);
  session.status = "abandoned";
  session.transcript.push(item("system", "Case abandoned."));
  sessions.save(session);
  if (caseObj && session.state.turn > 0) {
    const profile = loadProfile();
    recordAbandoned(profile, { session, caseObj });
    saveProfile(profile);
  }
}

/** Free-text message from the candidate. Returns the session to display. */
export async function handleMessage({ sessionId, text }) {
  text = String(text || "").trim();
  if (!text) throw new Error("Empty message");
  const current = sessionId ? sessions.get(sessionId) : null;

  if (current && isLive(current)) {
    // Inside a live session only unambiguous switches interrupt it; in a teaching chat any
    // start command except "teach" does (follow-up questions stay in the chat).
    let sw = current.kind === "teach" ? detectStartCommand(text) : detectMidCaseSwitch(text);
    if (sw?.mode === "teach") sw = null;
    if (sw) {
      abandonIfLive(current);
      return startFromRoute(sw, text);
    }
    if (current.kind === "case") await caseTurn(current, text);
    else if (current.kind === "drill") await drillSessionTurn(current, text);
    else if (current.kind === "pm") await pmSessionTurn(current, text);
    else if (current.kind === "teach") await teachSessionTurn(current, text);
    sessions.save(current);
    return current;
  }

  // Not in a live session.
  const route = detectStartCommand(text);
  if (!route && current?.kind === "case" && current.status === "debriefed") {
    await postCaseTurn(current, text);
    sessions.save(current);
    return current;
  }
  return startFromRoute(route || (await routeFreeText(text)), text);
}

/** Button actions from the UI. */
export async function handleAction({ action, sessionId, options = {} }) {
  const current = sessionId ? sessions.get(sessionId) : null;
  if (action === "end_case") {
    if (current && isLive(current)) {
      if (current.kind === "case") await caseTurn(current, "/end");
      else if (current.kind === "pm") await pmSessionTurn(current, "/end");
      else current.status = "done";
      sessions.save(current);
    }
    return current;
  }
  abandonIfLive(current);
  const routes = {
    new_case: { mode: "case", case_type: options.caseType || "any", industry: options.industry || null, difficulty: options.difficulty || "normal", length: options.length || "normal" },
    mock: { mode: "mock", case_type: "any", difficulty: "normal", length: "normal" },
    guesstimate: { mode: "guesstimate", difficulty: "normal", length: "normal" },
    drill: { mode: "drill", drill_skill: options.skill || "structuring" },
    review: { mode: "review" },
    redo_case: { mode: "redo_case" },
    redo_weakest: { mode: "redo_weakest" },
    pm: { mode: "pm" },
    help: { mode: "chat" },
  };
  if (!routes[action]) throw new Error(`Unknown action ${action}`);
  return startFromRoute(routes[action]);
}
