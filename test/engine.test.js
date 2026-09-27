// Deterministic tests (no model calls): run with `npm test`.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.CASE_BUDDY_PROVIDER = "mock";
process.env.CASE_BUDDY_VAR_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "casebuddy-"));

const { mock } = await import("../server/llm.js");
const { loadLibrary, getCase } = await import("../server/cases/library.js");
const { selectCase } = await import("../server/cases/selector.js");
const router = await import("../server/engine/router.js");
const policy = await import("../server/engine/policy.js");
const { checkLeak } = await import("../server/engine/leakGuard.js");
const sessionMod = await import("../server/engine/session.js");
const profileMod = await import("../server/learner/profile.js");
const { generateMathProblem } = await import("../server/engine/drills.js");
const { retrieve } = await import("../server/knowledge/retrieval.js");
const { INTERVIEWER_SYSTEM } = await import("../server/prompts/interviewer.js");
const { PM_SYSTEM } = await import("../server/prompts/others.js");

function analysis(over = {}) {
  return {
    candidate_intent: "other",
    phase: "analysis",
    candidate_state: "progressing",
    generic_framework_dump: false,
    structure_summary: null,
    hypothesis_summary: null,
    current_branch: null,
    release_clarification_ids: [],
    release_data_ids: [],
    release_exhibit_ids: [],
    improvised_answer: null,
    calculation: { present: false, correct: null, error_description: null, interpreted: null },
    exhibit_reading: { present: false, found_key_takeaway: null },
    unsupported_claim: null,
    valid_alternative_path: false,
    hint_ladder: { probe: "What are you trying to establish?", small_hint: "Think demand vs supply.", strong_hint: "Break revenue into its drivers." },
    next_move: "Let the candidate continue.",
    ready_for_recommendation: false,
    case_complete: false,
    observations: [],
    ...over,
  };
}

function debrief(over = {}) {
  return {
    biggest_takeaway: "You found the F&B drop but not the conversion driver.",
    did_well: ["Split revenue by stream in turn 2."],
    biggest_problem: "Spent two turns on footfall after seeing ticket revenue flat.",
    missed: ["Conversion collapse after the April price increase."],
    stronger_approach: "Decompose F&B into conversion × spend per buyer.",
    next_skill: "prioritization",
    next_skill_reason: "You explored low-value branches after evidence ruled them out.",
    redo: { recommend: true, reason: "Central insight missed." },
    next_case_reminder: "State a hypothesis before asking for data.",
    skill_ratings: [
      { skill: "prioritization", rating: "gap", evidence: "Kept exploring footfall." },
      { skill: "quantitative", rating: "strength", evidence: "Break-even math correct." },
    ],
    mistake_tags: ["weak_prioritization"],
    guesstimate_notes: null,
    ...over,
  };
}

before(() => mock.clear());

// ---------------------------------------------------------------- library
test("seed library loads and every case is internally complete", () => {
  const { cases, errors } = loadLibrary({ reload: true });
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.ok(cases.size >= 18);
  const types = new Set([...cases.values()].map((c) => c.type));
  for (const t of ["profitability", "growth", "market_entry", "mna", "operations", "pricing", "strategy", "unconventional", "guesstimate"]) assert.ok(types.has(t), `missing type ${t}`);
  for (const c of cases.values()) {
    const ids = [...c.clarifications, ...c.data, ...c.exhibits].map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids in ${c.id}`);
    assert.ok(c.reference_solution && c.recommendation && c.key_insights.length, c.id);
  }
});

// ---------------------------------------------------------------- router
test("router maps requests to modes", () => {
  assert.equal(router.detectStartCommand("Give me a case.").mode, "case");
  const hard = router.detectStartCommand("give me a hard market entry case");
  assert.equal(hard.mode, "case");
  assert.equal(hard.case_type, "market_entry");
  assert.equal(hard.difficulty, "harder");
  assert.equal(router.detectStartCommand("Give me a short case").length, "short");
  assert.equal(router.detectStartCommand("Mock interview me.").mode, "mock");
  assert.equal(router.detectStartCommand("Give me a guesstimate").mode, "guesstimate");
  const d = router.detectStartCommand("Test my prioritization.");
  assert.equal(d.mode, "drill");
  assert.equal(d.drill_skill, "prioritization");
  assert.equal(router.detectStartCommand("test my math").drill_skill, "math");
  assert.equal(router.detectStartCommand("Give me an exhibit").drill_skill, "exhibit");
  assert.equal(router.detectStartCommand("Teach me market entry.").mode, "teach");
  assert.equal(router.detectStartCommand("How am I progressing?").mode, "review");
  assert.equal(router.detectStartCommand("Redo my weakest skill.").mode, "redo_weakest");
  assert.equal(router.detectStartCommand("PM case").mode, "pm");
});

test("in-case commands: teaching only on explicit request; 'what's the answer' is not teaching", () => {
  assert.equal(router.detectInCaseCommand("Teach me.")?.command, "teach");
  assert.equal(router.detectInCaseCommand("Show me the framework")?.command, "teach");
  assert.equal(router.detectInCaseCommand("Explain what I should have done")?.command, "teach");
  assert.equal(router.detectInCaseCommand("What's the answer?"), null);
  assert.equal(router.detectInCaseCommand("I'm stuck"), null);
  assert.equal(router.detectInCaseCommand("end case")?.command, "end");
  // mid-case chatter must not switch modes
  assert.equal(router.detectMidCaseSwitch("Am I doing okay?"), null);
  assert.equal(router.detectMidCaseSwitch("Let me explain my structure"), null);
  assert.equal(router.detectMidCaseSwitch("How am I doing so far?"), null);
  assert.equal(router.detectMidCaseSwitch("give me a new case")?.mode, "case");
});

// ---------------------------------------------------------------- policy
test("graduated intervention escalates one level at a time", () => {
  let state = { ladder: 0, stuckStreak: 0 };
  const stuck = analysis({ candidate_state: "completely_stuck" });
  const r1 = policy.decideIntervention(stuck, state);
  assert.equal(r1.level, 1, "first stuck turn gets a probe, never a big hint");
  state = { ladder: r1.ladder, stuckStreak: r1.stuckStreak };
  const r2 = policy.decideIntervention(stuck, state);
  assert.equal(r2.level, 2);
  state = { ladder: r2.ladder, stuckStreak: r2.stuckStreak };
  const r3 = policy.decideIntervention(stuck, state);
  assert.equal(r3.level, 3);
  const ok = policy.decideIntervention(analysis(), { ladder: 3, stuckStreak: 3 });
  assert.deepEqual(ok, { level: 0, ladder: 0, stuckStreak: 0 }, "progress resets the ladder");
});

test("slightly off gets a probe; explicit hint request gets at most a small hint; mock caps at 2", () => {
  assert.equal(policy.decideIntervention(analysis({ candidate_state: "slightly_off" }), { ladder: 0, stuckStreak: 0 }).level, 1);
  const hint = policy.decideIntervention(analysis({ candidate_intent: "asks_for_hint", candidate_state: "meaningfully_stuck" }), { ladder: 0, stuckStreak: 0 });
  assert.equal(hint.level, 2);
  const mock3 = policy.decideIntervention(analysis({ candidate_state: "completely_stuck" }), { ladder: 2, stuckStreak: 4 }, { mock: true });
  assert.equal(mock3.level, 2);
});

test("asking for the answer releases nothing and never reveals", () => {
  const c = getCase("seed-prof-multiplex");
  const a = analysis({ candidate_intent: "asks_for_answer", candidate_state: "meaningfully_stuck", release_data_ids: ["d2"], release_exhibit_ids: ["e1"] });
  const rel = policy.filterReleases(a, c, { revealed: { clarifications: [], data: [], exhibits: [] } });
  assert.deepEqual(rel, { clarifications: [], data: [], exhibits: [] });
  const iv = policy.decideIntervention(a, { ladder: 2, stuckStreak: 3 });
  assert.equal(iv.level, 1, "asking for the answer gets a probe, not an escalated hint");
  assert.equal(iv.ladder, 2);
  const dir = policy.buildDirective({ analysis: a, intervention: iv, releases: rel, caseObj: c, state: { calcErrorStreak: 0 }, mock: false });
  assert.match(dir, /Do not give it/);
  assert.doesNotMatch(dir, /conversion/i);
});

test("release filtering: unknown/repeat ids dropped, one exhibit per turn", () => {
  const c = getCase("seed-prof-multiplex");
  const a = analysis({ release_data_ids: ["d1", "d1", "zz"], release_exhibit_ids: ["e1", "e2"], release_clarification_ids: ["c1"] });
  const rel = policy.filterReleases(a, c, { revealed: { clarifications: ["c1"], data: [], exhibits: [] } });
  assert.deepEqual(rel, { clarifications: [], data: ["d1"], exhibits: ["e1"] });
});

test("generic framework dump is probed, not praised", () => {
  const c = getCase("seed-prof-multiplex");
  const a = analysis({ generic_framework_dump: true, candidate_intent: "structure", candidate_state: "slightly_off" });
  const dir = policy.buildDirective({ analysis: a, intervention: { level: 1 }, releases: { clarifications: [], data: [], exhibits: [] }, caseObj: c, state: { calcErrorStreak: 0 }, mock: false });
  assert.match(dir, /Do NOT praise/);
  assert.match(dir, /prioritise/);
});

test("calculation errors allow self-correction first; correct math without interpretation asks 'so what'", () => {
  const c = getCase("seed-prof-multiplex");
  const none = { clarifications: [], data: [], exhibits: [] };
  const wrong = analysis({ calculation: { present: true, correct: false, error_description: "used 12M instead of 11M", interpreted: false } });
  const first = policy.buildDirective({ analysis: wrong, intervention: { level: 0 }, releases: none, caseObj: c, state: { calcErrorStreak: 0 }, mock: false });
  assert.match(first, /Do NOT correct it/);
  assert.doesNotMatch(first, /12M/);
  const second = policy.buildDirective({ analysis: wrong, intervention: { level: 0 }, releases: none, caseObj: c, state: { calcErrorStreak: 1 }, mock: false });
  assert.match(second, /check that step/);
  const right = analysis({ calculation: { present: true, correct: true, error_description: null, interpreted: false } });
  assert.match(policy.buildDirective({ analysis: right, intervention: { level: 0 }, releases: none, caseObj: c, state: { calcErrorStreak: 0 }, mock: false }), /So what does that tell you/);
});

// ---------------------------------------------------------------- leak guard
test("leak guard flags unreleased numbers and insight phrases, not revealed ones", () => {
  const c = getCase("seed-prof-multiplex");
  const s = { transcript: [], state: { revealed: { clarifications: [], data: [], exhibits: [] }, improvised: [] } };
  assert.equal(checkLeak("Conversion fell from 62% to 41%.", c, s).leak, true);
  s.state.revealed.data.push("d2");
  assert.equal(checkLeak("Conversion fell from 62% to 41%.", c, s).leak, false);
  assert.equal(checkLeak("Okay, go on.", c, s).leak, false);
});

// ---------------------------------------------------------------- full session flow (mock model)
test("live case: interviewer never sees hidden content; releases are tracked; debrief updates profile", async () => {
  mock.clear();
  mock.calls.length = 0;
  let s = await sessionMod.handleAction({ action: "new_case", options: { caseType: "profitability" } });
  assert.equal(s.kind, "case");
  assert.equal(s.status, "live");
  const c = getCase(s.caseId);

  // Turn 1: candidate asks for revenue breakdown -> analyzer releases exhibit e1 (if present) or d1
  const exId = c.exhibits[0]?.id;
  mock.push(analysis({ candidate_intent: "analysis_request", release_exhibit_ids: exId ? [exId] : [], release_data_ids: exId ? [] : [c.data[0].id] }));
  mock.push("Sure. Take a look at this. What stands out?");
  s = await sessionMod.handleMessage({ sessionId: s.id, text: "Can I see how revenue breaks down?" });
  const interviewerCall = mock.calls.filter((x) => x.role === "interviewer").at(-1);
  const everything = interviewerCall.system + JSON.stringify(interviewerCall.messages);
  assert.ok(everything.startsWith(INTERVIEWER_SYSTEM));
  assert.ok(!everything.includes(c.reference_solution), "reference solution leaked to interviewer");
  assert.ok(!everything.includes(c.recommendation), "recommendation leaked to interviewer");
  for (const k of c.key_insights) assert.ok(!everything.includes(k), "key insight leaked to interviewer");
  const unreleased = c.data.filter((d) => !s.state.revealed.data.includes(d.id));
  for (const d of unreleased) assert.ok(!everything.includes(d.content), `unreleased data ${d.id} leaked`);
  if (exId) {
    assert.deepEqual(s.state.revealed.exhibits, [exId]);
    assert.ok(s.transcript.some((t) => t.role === "exhibit" && t.exhibit && !("takeaways" in t.exhibit)), "public exhibit must not carry takeaways");
  }

  // Turn 2: generic framework dump
  mock.push(analysis({ candidate_intent: "structure", generic_framework_dump: true, candidate_state: "slightly_off" }));
  mock.push("Which of those would you look at first, and why?");
  s = await sessionMod.handleMessage({ sessionId: s.id, text: "I'd look at revenue and costs." });
  const dir = JSON.stringify(mock.calls.filter((x) => x.role === "interviewer").at(-1).messages);
  assert.match(dir, /Do NOT praise/);

  // Turn 3: stuck -> hint recorded
  mock.push(analysis({ candidate_intent: "asks_for_hint", candidate_state: "meaningfully_stuck" }));
  mock.push("Think about whether it's a demand-side or a supply-side issue.");
  s = await sessionMod.handleMessage({ sessionId: s.id, text: "I'm not sure where to go. Can I get a hint?" });
  assert.equal(s.state.hints.at(-1).level, 2);

  // Turn 4: recommendation -> case complete -> debrief
  mock.push(analysis({ candidate_intent: "synthesis_or_recommendation", case_complete: true, phase: "complete" }));
  mock.push("Thanks, let's stop there.");
  mock.push(debrief());
  s = await sessionMod.handleMessage({ sessionId: s.id, text: "I recommend rolling back the F&B price increase." });
  assert.equal(s.status, "debriefed");
  const md = s.transcript.at(-1).text;
  for (const h of ["Biggest takeaway", "What you did well", "Biggest problem", "What you missed", "stronger approach", "Next skill", "Redo or move on", "Next-case reminder"]) assert.match(md, new RegExp(h, "i"));
  assert.doesNotMatch(md, /\b\d+(\.\d+)?\s*\/\s*10\b/, "no numeric score");

  const p = profileMod.loadProfile();
  assert.equal(p.cases.filter((x) => x.completed).length, 1);
  assert.equal(p.skills.prioritization.at(-1).rating, "gap");
  assert.equal(profileMod.weakestSkill(p).skill, "prioritization");
});

test("mock interview: 'teach me' does not break the simulation", async () => {
  mock.clear();
  let s = await sessionMod.handleAction({ action: "mock" });
  assert.equal(s.mode, "mock");
  s = await sessionMod.handleMessage({ sessionId: s.id, text: "Teach me." });
  assert.equal(s.status, "live");
  assert.match(s.transcript.at(-1).text, /finish the case first/i);
  assert.equal(mock.calls.filter((x) => x.role === "teacher").length, 0);
});

test("explicit 'teach me' in a normal case switches to teaching (level 4) and marks the case", async () => {
  mock.clear();
  let s = await sessionMod.handleAction({ action: "new_case" });
  mock.push("Here's how to think about it…");
  s = await sessionMod.handleMessage({ sessionId: s.id, text: "Teach me. Show me the framework." });
  assert.equal(s.status, "teaching");
  assert.equal(s.state.taughtAt, 0);
  assert.equal(s.transcript.at(-1).role, "coach");
  s = await sessionMod.handleMessage({ sessionId: s.id, text: "continue" });
  assert.equal(s.status, "live");
});

test("case selection avoids completed cases and targets weaknesses; profile never has an overall score", () => {
  const p = profileMod.emptyProfile();
  p.cases.push({ caseId: "seed-prof-multiplex", completed: true, type: "profitability", industry: "x" });
  for (let i = 0; i < 10; i++) {
    const r = selectCase({ caseType: "profitability" }, p);
    assert.notEqual(r.case.id, "seed-prof-multiplex");
  }
  const focus = selectCase({ focusSkills: ["exhibit_interpretation"], requireSkill: "exhibit_interpretation" }, profileMod.emptyProfile());
  assert.ok(focus.case.skills_tested.includes("exhibit_interpretation"));
  const g = selectCase({ caseType: "guesstimate" }, profileMod.emptyProfile());
  assert.equal(g.case.type, "guesstimate");
  const short = selectCase({ short: true }, profileMod.emptyProfile());
  assert.ok(short.case.format === "short" || short.case.duration_min <= 15);
  assert.ok(!("score" in profileMod.emptyProfile()) && !("overallScore" in profileMod.emptyProfile()));
});

test("difficulty adapts per dimension, not globally", () => {
  const p = profileMod.emptyProfile();
  const c = getCase("seed-prof-multiplex");
  const fakeSession = { id: "s1", mode: "interview", state: { turn: 8, hints: [{ level: 3 }], taughtAt: null } };
  profileMod.recordCase(p, { session: fakeSession, caseObj: c, debrief: debrief() });
  assert.ok(p.difficultyTargets.quantitative > 2.5, "strong math → harder quant");
  assert.ok(p.difficultyTargets.prioritization <= 2.5, "weak prioritisation is not made harder");
  assert.equal(p.difficultyTargets.structuring, 2.5, "untested dims unchanged");
});

test("PM module is isolated from consulting", async () => {
  mock.clear();
  let s = await sessionMod.handleMessage({ text: "PM case" });
  assert.equal(s.kind, "pm");
  mock.push("Who are the users you'd focus on?");
  s = await sessionMod.handleMessage({ sessionId: s.id, text: "Let me clarify the goal first." });
  const call = mock.calls.at(-1);
  assert.ok(call.system.startsWith(PM_SYSTEM));
  assert.ok(!call.system.includes("consulting case interview. You are an experienced consultant"));
  assert.ok(retrieve("product metrics users", { module: "consulting" }).every((c) => c.module === "consulting"));
  assert.ok(retrieve("product metrics users", { module: "pm" }).every((c) => c.module === "pm"));
  assert.equal(profileMod.loadProfile().cases.filter((c) => c.mode === "pm").length, 0);
});

test("math drill generator produces fresh, self-consistent problems", () => {
  for (let i = 0; i < 20; i++) {
    const p = generateMathProblem();
    assert.ok(p.prompt.length > 50 && p.reference.includes("So what"));
    assert.doesNotMatch(p.reference, /NaN|Infinity/);
  }
});
