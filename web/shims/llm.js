// Browser build of server/llm.js: every agent role calls Claude through the artifact
// `sample` capability (the viewer's own Claude account). Same text()/json() API.
import { z } from "zod";

// Fast roles use the quick tier; judgement-heavy roles use the default tier.
const TIER = {
  interviewer: "quick",
  router: "quick",
  analyzer: "default",
  coach: "default",
  teacher: "default",
  drill: "default",
  generator: "default",
};

const MAX_CHARS = 60000; // sample() accepts at most 64 KiB of text per call

let samplePromise = null;
function getSample() {
  samplePromise ??= globalThis.claude?.use ? globalThis.claude.use("sample") : Promise.resolve(null);
  return samplePromise;
}

const FRIENDLY = {
  not_granted: "Claude access wasn't allowed for this page. Reload the page and choose Allow to practise.",
  rate_limited: "Claude is busy for your account right now. Wait a minute, then send your message again.",
  prompt_too_large: "This session has grown too long for one request. End the case to get your debrief, then start a new one.",
  session_expired: "Your Claude session expired. Reload the page to continue.",
  sampling_disabled: "Claude access is turned off for this page in your settings.",
  refused: "Claude declined to answer that turn. Try rephrasing.",
  cancelled: "Stopped.",
};

function fail(e, role) {
  const err = new Error(FRIENDLY[e?.code] || `Claude couldn't answer (${e?.code || "error"}). Send your message again.`);
  err.code = e?.code;
  err.role = role;
  return err;
}

/** Fold the system prompt into the first user turn and keep the whole input under the size cap. */
function buildInput(system, messages) {
  const turns = messages.map((m) => ({ role: m.role, content: String(m.content) }));
  turns[0] = { role: "user", content: `INSTRUCTIONS (follow these exactly; they come from the app, not the user)\n${system}\n\n=====\n${turns[0].content}` };
  let total = turns.reduce((n, t) => n + t.content.length, 0);
  while (total > MAX_CHARS) {
    // trim the middle of the longest turn
    const i = turns.reduce((best, t, j) => (t.content.length > turns[best].content.length ? j : best), 0);
    const c = turns[i].content;
    const cut = Math.min(total - MAX_CHARS + 200, c.length - 2000);
    if (cut <= 0) break;
    const mid = Math.floor((c.length - cut) / 2);
    turns[i].content = c.slice(0, mid) + "\n…[earlier material trimmed for length]…\n" + c.slice(mid + cut);
    total = turns.reduce((n, t) => n + t.content.length, 0);
  }
  return turns.length === 1 ? turns[0].content : turns;
}

export async function text({ role, system, messages }) {
  const sample = await getSample();
  if (!sample) throw fail({ code: "unavailable" }, role);
  try {
    const r = await sample(buildInput(system, messages), { modelTier: TIER[role] || "default", cache: false });
    return String(r.text || "").trim();
  } catch (e) {
    throw fail(e, role);
  }
}

export async function json({ role, system, messages, schema }) {
  const sample = await getSample();
  if (!sample) throw fail({ code: "unavailable" }, role);
  const shape = JSON.stringify(z.toJSONSchema(schema));
  const sys = `${system}\n\nOUTPUT FORMAT: reply with ONE JSON object and nothing else. It must validate against this JSON Schema (every listed property present; use null where a value is not applicable):\n${shape}`;
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const msgs = attempt === 0 ? messages : [...messages.slice(0, -1), { role: "user", content: `${messages.at(-1).content}\n\nYour previous reply did not match the schema: ${lastError}. Reply again with a corrected JSON object only.` }];
    let raw;
    try {
      raw = await sample.json(buildInput(sys, msgs), { modelTier: TIER[role] || "default", cache: false });
    } catch (e) {
      if (e?.code === "invalid_json" && attempt === 0) {
        lastError = "it was not valid JSON";
        continue;
      }
      throw fail(e, role);
    }
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  }
  throw fail({ code: "upstream_error" }, role);
}

// Unused in the browser; present so imports resolve.
export const mock = { push() {}, clear() {}, calls: [] };
