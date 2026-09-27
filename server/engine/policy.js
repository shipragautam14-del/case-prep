// INTERVENTION POLICY (deterministic). The analyzer proposes; this module decides.
//  - graduated intervention: levels 0-3 can only escalate one step at a time within a stuck
//    episode; level 3 needs a genuinely stuck candidate; level 4 (teaching) is never chosen here,
//    only on an explicit request handled by the session manager.
//  - progressive release: validates ids, caps what can be released per turn.
//  - builds the interviewer's per-turn directive from allowed pieces only.

const STATE_TO_LEVEL = { progressing: 0, slightly_off: 1, meaningfully_stuck: 2, completely_stuck: 3 };

export function decideIntervention(analysis, state, { mock = false } = {}) {
  const asksHint = analysis.candidate_intent === "asks_for_hint";
  const asksAnswer = analysis.candidate_intent === "asks_for_answer";
  let desired = STATE_TO_LEVEL[analysis.candidate_state] ?? 0;
  if (asksHint) desired = Math.max(desired, 2);
  if (asksAnswer) desired = Math.max(desired, 1);

  if (desired === 0) {
    return { level: 0, ladder: 0, stuckStreak: 0 };
  }
  const stuckStreak = analysis.candidate_state === "progressing" ? 0 : state.stuckStreak + 1;
  // One step at a time. An explicit hint request may open at level 2 (a small hint), never higher.
  let allowed = state.ladder + 1;
  if (asksHint) allowed = Math.max(allowed, 2);
  let level = Math.min(desired, allowed);
  // Level 3 only for a candidate who has been stuck for at least two consecutive turns.
  if (level >= 3 && stuckStreak < 2) level = 2;
  // Mock interviews stay close to real conditions: probes and small hints at most.
  if (mock) level = Math.min(level, 2);
  // A slightly-off candidate who is still moving gets a probe, not a hint.
  if (analysis.candidate_state === "slightly_off" && !asksHint) level = Math.min(level, 1);
  // Asking for the answer is turned back with a probe; it never earns a bigger hint.
  if (asksAnswer) return { level: 1, ladder: state.ladder, stuckStreak };
  return { level, ladder: Math.max(state.ladder, level), stuckStreak };
}

export function filterReleases(analysis, caseObj, state) {
  if (analysis.candidate_intent === "asks_for_answer") return { clarifications: [], data: [], exhibits: [] };
  const fresh = (ids, pool, already) =>
    [...new Set(ids)].filter((id) => pool.some((x) => x.id === id) && !already.includes(id));
  return {
    clarifications: fresh(analysis.release_clarification_ids, caseObj.clarifications, state.revealed.clarifications).slice(0, 3),
    data: fresh(analysis.release_data_ids, caseObj.data, state.revealed.data).slice(0, 3),
    exhibits: fresh(analysis.release_exhibit_ids, caseObj.exhibits, state.revealed.exhibits).slice(0, 1),
  };
}

export function turnBudget(caseObj) {
  return Math.max(6, Math.round(caseObj.duration_min * 0.8));
}

/**
 * Build the directive the interviewer sees for this turn. It only ever contains:
 * released facts (already added to the visible brief), the chosen hint text, and neutral
 * instructions. Never the reference solution or unreleased data.
 */
export function buildDirective({ analysis, intervention, releases, caseObj, state, mock, forceWrapUp }) {
  const lines = [];
  const newFacts = [
    ...releases.clarifications.map((id) => caseObj.clarifications.find((c) => c.id === id)).map((c) => `(${c.topic}) ${c.answer}`),
    ...releases.data.map((id) => caseObj.data.find((d) => d.id === id)).map((d) => `${d.label}: ${d.content}`),
  ];
  if (analysis.improvised_answer && !releases.clarifications.length && !releases.data.length) {
    newFacts.push(analysis.improvised_answer);
  }
  if (analysis.case_complete) {
    lines.push("The case is over. Close the interview in one or two sentences (e.g. \"Thanks, let's stop there.\"). Do not evaluate the candidate; the debrief follows separately.");
    return lines.join("\n");
  }

  if (newFacts.length) {
    lines.push(`Share this information, only as much as they asked for, in natural spoken form:\n${newFacts.map((f) => `  • ${f}`).join("\n")}`);
  } else if (analysis.candidate_intent === "clarifying_question") {
    lines.push("You have no specific information for this question. Say it isn't important or known, or ask them to make and state an assumption. Do not invent data.");
  }

  if (releases.exhibits.length) {
    const ex = caseObj.exhibits.find((e) => e.id === releases.exhibits[0]);
    lines.push(`An exhibit titled "${ex.title}" is being handed to the candidate now (the system displays it right after your line). Hand it over in one short line and ask what stands out. Do NOT describe or interpret it.`);
  }

  if (analysis.candidate_intent === "asks_for_answer") {
    lines.push("The candidate asked for the answer. Do not give it or hint at it. Stay in role and turn it back to them.");
  }
  if (analysis.candidate_intent === "asks_for_feedback") {
    lines.push(mock ? 'They asked how they are doing. Reply only "Keep going." or "Let\'s continue." and carry on.' : "They asked how they are doing. Don't evaluate them mid-case; say you'll discuss it at the end and move on.");
  }

  if (analysis.generic_framework_dump) {
    lines.push("Their structure is a generic framework that is not yet tailored to this client. Do NOT praise it. Ask which branch they would prioritise and why, what their hypothesis is, or what makes it relevant to this client (pick one or two, keep it short).");
  }

  if (analysis.calculation.present && analysis.calculation.correct === false) {
    const repeated = state.calcErrorStreak >= 1;
    lines.push(
      repeated
        ? `Their calculation still has an error. Without giving the correct number, point them to where to look (for the interviewer's eyes: ${analysis.calculation.error_description}). Phrase it as a nudge like "check that step again".`
        : "Their calculation has an error. Do NOT correct it and do not say it is wrong. Ask them to walk you through the numbers, or to sanity-check the result, so they can catch it themselves.",
    );
  } else if (analysis.calculation.present && analysis.calculation.correct && analysis.calculation.interpreted === false) {
    lines.push('The arithmetic is right but they have not said what it means. Ask for the business implication ("So what does that tell you?").');
  }

  if (analysis.exhibit_reading.present && analysis.exhibit_reading.found_key_takeaway === false && intervention.level <= 1) {
    lines.push("They haven't got to the most important thing in the exhibit yet. Probe; don't explain it (e.g. \"Anything else that stands out?\", \"What would you compare?\").");
  }

  if (analysis.unsupported_claim && !analysis.generic_framework_dump) {
    lines.push(`Challenge this unsupported claim briefly: "${analysis.unsupported_claim}". Ask what supports it.`);
  }

  if (intervention.level === 1 && !analysis.generic_framework_dump) {
    lines.push(`LEVEL 1 (probe). Ask this, in your own words: ${analysis.hint_ladder.probe}`);
  } else if (intervention.level === 2) {
    lines.push(`LEVEL 2 (small hint). Give only this directional nudge, in your own words: ${analysis.hint_ladder.small_hint}`);
  } else if (intervention.level === 3) {
    lines.push(`LEVEL 3 (stronger hint). Give this conceptual pointer, in your own words, and let them do the work: ${analysis.hint_ladder.strong_hint}`);
  }

  if (forceWrapUp || analysis.ready_for_recommendation) {
    lines.push(
      mock
        ? 'Time to wrap up. Ask for their final recommendation now, e.g. "The CEO has two minutes. What do you recommend?"'
        : "It's time for the synthesis. Ask the candidate for their recommendation to the client, e.g. \"Let's say the CEO walks in now. What would you tell her?\"",
    );
  } else if (!lines.length || (intervention.level === 0 && !newFacts.length && !releases.exhibits.length)) {
    lines.push(`Next: ${analysis.next_move}`);
  }

  lines.push(mock ? "Mock mode: be terse. No praise, no coaching." : "Keep it short and natural. No praise.");
  return lines.join("\n");
}
