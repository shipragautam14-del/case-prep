// LEARNER PROFILE: persistent, pattern-based memory of the candidate. No overall score anywhere.
import { varPath, readJSON, writeJSON } from "../store.js";
import { SKILLS, SKILL_LABELS, DIFFICULTY_DIMS, MISTAKE_TAGS } from "../schemas.js";
import { SKILL_TO_DIM } from "../cases/selector.js";

const FILE = () => varPath("profile.json");

export function emptyProfile() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    cases: [], // one entry per case/guesstimate session (completed or abandoned)
    drills: [], // micro-skill drill results
    skills: Object.fromEntries(SKILLS.map((s) => [s, []])), // [{date, sessionId, rating, evidence, source}]
    mistakes: {}, // tag -> [{date, sessionId}]
    difficultyTargets: Object.fromEntries(DIFFICULTY_DIMS.map((d) => [d, 2.5])),
    pm: { sessions: [] }, // PM module is tracked separately and never feeds consulting patterns
  };
}

export function loadProfile() {
  const p = readJSON(FILE(), null);
  if (!p) return emptyProfile();
  const base = emptyProfile();
  return { ...base, ...p, skills: { ...base.skills, ...p.skills }, difficultyTargets: { ...base.difficultyTargets, ...p.difficultyTargets } };
}

export function saveProfile(p) {
  p.updatedAt = new Date().toISOString();
  writeJSON(FILE(), p);
}

const RATING_VALUE = { strength: 1, adequate: 0, gap: -1 };

/** Record a completed case debrief into the profile and adapt difficulty targets. */
export function recordCase(profile, { session, caseObj, debrief }) {
  const date = new Date().toISOString();
  const entry = {
    sessionId: session.id,
    caseId: caseObj.id,
    title: caseObj.title,
    type: caseObj.type,
    industry: caseObj.industry,
    mode: session.mode,
    source: caseObj.source,
    difficulty: caseObj.difficulty,
    date,
    completed: true,
    turns: session.state.turn,
    hintsUsed: session.state.hints.length,
    maxHintLevel: Math.max(0, ...session.state.hints.map((h) => h.level)),
    taught: Boolean(session.state.taughtAt),
    strengths: debrief.did_well.slice(0, 2),
    weakness: debrief.biggest_problem,
    nextSkill: debrief.next_skill,
    redo: debrief.redo,
    mistakeTags: debrief.mistake_tags,
  };
  profile.cases.push(entry);
  for (const r of debrief.skill_ratings) {
    profile.skills[r.skill] ??= [];
    profile.skills[r.skill].push({ date, sessionId: session.id, rating: r.rating, evidence: r.evidence, source: "case" });
  }
  for (const tag of debrief.mistake_tags) {
    profile.mistakes[tag] ??= [];
    profile.mistakes[tag].push({ date, sessionId: session.id });
  }
  adaptDifficulty(profile, debrief, entry);
  return entry;
}

export function recordAbandoned(profile, { session, caseObj }) {
  profile.cases.push({
    sessionId: session.id,
    caseId: caseObj.id,
    title: caseObj.title,
    type: caseObj.type,
    industry: caseObj.industry,
    mode: session.mode,
    date: new Date().toISOString(),
    completed: false,
    turns: session.state.turn,
    hintsUsed: session.state.hints.length,
  });
}

export function recordDrill(profile, { skill, drillId, profileSkill, rating, evidence, mistakeTags, sessionId }) {
  const date = new Date().toISOString();
  profile.drills.push({ date, skill, drillId, rating, evidence, sessionId });
  if (rating && profileSkill) {
    profile.skills[profileSkill] ??= [];
    profile.skills[profileSkill].push({ date, sessionId, rating, evidence, source: "drill" });
  }
  for (const tag of mistakeTags || []) {
    if (!MISTAKE_TAGS.includes(tag)) continue;
    profile.mistakes[tag] ??= [];
    profile.mistakes[tag].push({ date, sessionId });
  }
}

/**
 * Multidimensional adaptation: a dimension moves up when the related skill is a demonstrated
 * strength and only eases slightly when it's a gap *and* heavy hints were needed. Weak skills
 * are handled by focus (selecting cases that stress them), not by making everything easier.
 */
function adaptDifficulty(profile, debrief, entry) {
  const t = profile.difficultyTargets;
  const perDim = {};
  for (const r of debrief.skill_ratings) {
    const dim = SKILL_TO_DIM[r.skill];
    if (!dim) continue;
    (perDim[dim] ??= []).push(RATING_VALUE[r.rating]);
  }
  for (const [dim, vals] of Object.entries(perDim)) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (avg > 0.3) t[dim] = Math.min(5, t[dim] + 0.5);
    else if (avg < -0.3 && (entry.maxHintLevel >= 3 || entry.taught)) t[dim] = Math.max(1.5, t[dim] - 0.25);
  }
  // Industry unfamiliarity grows slowly with experience.
  const completed = profile.cases.filter((c) => c.completed).length;
  t.industry_unfamiliarity = Math.min(5, 2 + completed * 0.25);
}

/** Per-skill status from the most recent observations. */
export function skillStatus(profile, { window = 4 } = {}) {
  const out = {};
  for (const [skill, obs] of Object.entries(profile.skills)) {
    if (!obs.length) continue;
    const recent = obs.slice(-window);
    const earlier = obs.slice(-window * 2, -window);
    const score = (arr) => (arr.length ? arr.reduce((a, o) => a + RATING_VALUE[o.rating], 0) / arr.length : null);
    const now = score(recent);
    const before = score(earlier);
    out[skill] = {
      label: SKILL_LABELS[skill],
      observations: obs.length,
      recentGaps: recent.filter((o) => o.rating === "gap").length,
      recentStrengths: recent.filter((o) => o.rating === "strength").length,
      trend: before === null ? "new" : now > before + 0.25 ? "improving" : now < before - 0.25 ? "slipping" : "steady",
      level: now,
      lastEvidence: recent.at(-1)?.evidence,
    };
  }
  return out;
}

/** The skill to target for "redo my weakest skill". */
export function weakestSkill(profile) {
  const status = skillStatus(profile);
  const ranked = Object.entries(status)
    .filter(([, s]) => s.recentGaps > 0 || s.level < 0)
    .sort((a, b) => a[1].level - b[1].level || b[1].recentGaps - a[1].recentGaps);
  if (ranked.length) return { skill: ranked[0][0], status: ranked[0][1] };
  // fall back to recurring mistake tags
  const tags = Object.entries(profile.mistakes).sort((a, b) => b[1].length - a[1].length);
  const TAG_TO_SKILL = {
    weak_prioritization: "prioritization", framework_dump: "structuring", no_hypothesis: "hypothesis",
    arithmetic_error: "quantitative", no_so_what: "synthesis", missed_exhibit_insight: "exhibit_interpretation",
    recommendation_not_actionable: "recommendation", recommendation_disconnected: "recommendation",
    poor_clarification: "clarification", no_sanity_check: "sanity_check", not_mece: "structuring",
  };
  for (const [tag] of tags) if (TAG_TO_SKILL[tag]) return { skill: TAG_TO_SKILL[tag], status: null };
  return null;
}

export function focusSkills(profile, n = 2) {
  const status = skillStatus(profile);
  return Object.entries(status)
    .filter(([, s]) => s.recentGaps >= 1 && s.level <= 0)
    .sort((a, b) => a[1].level - b[1].level)
    .slice(0, n)
    .map(([k]) => k);
}

/** Compact text summary used by the coach and the progress reviewer. */
export function summarizeForPrompt(profile) {
  const completed = profile.cases.filter((c) => c.completed);
  if (!completed.length && !profile.drills.length) return "No previous cases recorded.";
  const status = skillStatus(profile);
  const lines = [];
  lines.push(`Cases completed: ${completed.length} (abandoned: ${profile.cases.length - completed.length}); drills: ${profile.drills.length}`);
  lines.push(`Case mix: ${countBy(completed.map((c) => c.type))}`);
  lines.push(`Industries: ${countBy(completed.map((c) => c.industry))}`);
  const hinty = completed.slice(-5).map((c) => `${c.title}: ${c.hintsUsed} hints (max level ${c.maxHintLevel})${c.taught ? ", taught mid-case" : ""}`);
  if (hinty.length) lines.push(`Recent hint usage: ${hinty.join("; ")}`);
  lines.push("Skill patterns (most recent observations):");
  for (const [skill, s] of Object.entries(status)) {
    lines.push(`- ${s.label}: ${s.recentStrengths} strength / ${s.recentGaps} gap in last ${Math.min(4, s.observations)} obs; trend ${s.trend}. Latest: ${s.lastEvidence ?? ""}`);
  }
  const tags = Object.entries(profile.mistakes).sort((a, b) => b[1].length - a[1].length).slice(0, 6);
  if (tags.length) lines.push(`Recurring mistake tags: ${tags.map(([t, v]) => `${t}×${v.length}`).join(", ")}`);
  const redo = completed.filter((c) => c.redo?.recommend).slice(-3).map((c) => c.title);
  if (redo.length) lines.push(`Cases flagged for redo: ${redo.join("; ")}`);
  return lines.join("\n");
}

function countBy(arr) {
  const m = {};
  for (const x of arr) m[x] = (m[x] || 0) + 1;
  return Object.entries(m).map(([k, v]) => `${k}×${v}`).join(", ") || "none";
}

export function historyView(profile) {
  return profile.cases
    .slice()
    .reverse()
    .map((c) => ({
      sessionId: c.sessionId,
      title: c.title,
      type: c.type,
      industry: c.industry,
      mode: c.mode,
      date: c.date,
      completed: c.completed,
      difficulty: c.difficulty ? describeDifficulty(c.difficulty) : null,
      strengths: c.strengths ?? [],
      weakness: c.weakness ?? null,
      redo: c.redo ?? null,
      hintsUsed: c.hintsUsed,
    }));
}

export function describeDifficulty(d) {
  const high = Object.entries(d).filter(([, v]) => v >= 4).map(([k]) => k.replace(/_/g, " "));
  const avg = Object.values(d).reduce((a, b) => a + b, 0) / Object.values(d).length;
  const overall = avg >= 3.5 ? "demanding" : avg >= 2.6 ? "moderate" : "approachable";
  return high.length ? `${overall}; heavy on ${high.join(", ")}` : overall;
}
