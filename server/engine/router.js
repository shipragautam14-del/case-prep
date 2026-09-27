// MODE ROUTER. Deterministic patterns first (fast, predictable), LLM classification as a fallback
// for free text when no live session is capturing the message.
import * as llm from "../llm.js";
import { ROUTER_SYSTEM } from "../prompts/others.js";
import { RouteSchema } from "../schemas.js";
import { detectCaseType } from "../cases/selector.js";

const INDUSTRIES = [
  "fmcg", "retail", "banking", "bank", "insurance", "fintech", "pharma", "healthcare", "hospital", "telecom",
  "automobile", "auto", "ev", "cement", "steel", "energy", "power", "solar", "oil", "airline", "aviation",
  "hotel", "hospitality", "edtech", "education", "logistics", "e-commerce", "ecommerce", "quick commerce",
  "saas", "technology", "media", "entertainment", "sports", "agriculture", "dairy", "food", "restaurant",
  "real estate", "infrastructure", "railways", "metro", "public sector", "government", "chemicals", "textile",
  "apparel", "beauty", "cosmetics", "diagnostics", "consumer durables", "gaming", "tea",
];

export function extractFilters(text) {
  const t = text.toLowerCase();
  const industry = INDUSTRIES.find((i) => new RegExp(`\\b${i.replace(/[-]/g, "\\-")}\\b`).test(t)) || null;
  return {
    case_type: detectCaseType(t) || "any",
    industry,
    difficulty: /\b(hard|harder|difficult|tough|challenging|advanced)\b/.test(t) ? "harder" : /\b(easy|easier|simple|beginner|basic)\b/.test(t) ? "easier" : "normal",
    length: /\b(short|quick|brief|10.?min|15.?min)\b/.test(t) ? "short" : "normal",
  };
}

const DRILL_WORDS = {
  structuring: /structur/,
  prioritization: /prioriti[sz]/,
  math: /\b(math|maths|mental math|calculation|arithmetic|numbers?|quant)\b/,
  hypothesis: /hypothes/,
  synthesis: /synthes|summari[sz]/,
  clarification: /clarif/,
  exhibit: /exhibit|chart|graph|data interpretation/,
};

/** In-case commands that must work while a case is running. */
export function detectInCaseCommand(text) {
  const t = text.toLowerCase().trim();
  if (/\b(teach me|show me the framework|explain what i should have done|walk me through (it|this|the case|the solution|how to solve)|what should i have done)\b/.test(t))
    return { command: "teach" };
  if (/^(\/end|end( the)? case|end this case|stop the case|finish the case|let'?s end( here)?|i('?m| am) done with (this|the) case|end interview|end the mock)\b/.test(t))
    return { command: "end" };
  if (/^\/?(continue|resume)( the)?( case| interview)?\b/.test(t)) return { command: "continue" };
  return null;
}

/** Top-level commands that start something new (also valid mid-case: they abandon the case). */
export function detectStartCommand(text) {
  const t = text.toLowerCase().trim();
  const f = extractFilters(t);
  if (/\b(pm|product management|product manager|product sense|product design) (case|interview|question|practice)\b|^pm\b|\bsigma\b/.test(t)) return { mode: "pm", ...f };
  if (/\bmock( interview)?\b/.test(t) && /\b(me|start|give|run|do|full|let'?s)\b/.test(t)) return { mode: "mock", ...f };
  if (/\bredo\b.*\bweak/.test(t) || /\bweakest skill\b/.test(t)) return { mode: "redo_weakest", ...f };
  if (/\bredo\b/.test(t) && /\b(case|last|this|previous|that)\b/.test(t)) return { mode: "redo_case", ...f };
  if (/\b(how am i (doing|progressing)|my progress|review (my )?(performance|progress)|progress review|where do i stand)\b/.test(t)) return { mode: "review", ...f };
  if (/\b(case history|my history|past cases|show history)\b/.test(t)) return { mode: "history", ...f };
  if (/\b(test my|drill|practi[cs]e my|quiz me on)\b/.test(t) || /\bgive me an? (exhibit|chart)\b/.test(t)) {
    const skill = Object.entries(DRILL_WORDS).find(([, re]) => re.test(t))?.[0];
    if (skill) return { mode: "drill", drill_skill: skill, ...f };
  }
  if (/\b(guesstimate|guess-?timate|market siz(e|ing)|estimate the|estimation)\b/.test(t) && /\b(give|another|new|start|me|do|let'?s|a)\b/.test(t))
    return { mode: "guesstimate", ...f };
  if (/\b(teach me|explain|how (do|should) i (approach|solve|structure|tackle)|what is|help me understand|walk me through)\b/.test(t) && !/\b(give|start) me a\b/.test(t))
    return { mode: "teach", topic: text, ...f };
  if (/\b(give|start|run|do|another|new|next|let'?s do|want)\b.*\b(case|one)\b|^(case|new case|next case|another one)\b/.test(t)) return { mode: "case", ...f };
  return null;
}

/**
 * While a case is live, only unambiguous "start something else" requests may interrupt it.
 * ("Am I doing okay?" or "let me explain my structure" must stay inside the case.)
 */
export function detectMidCaseSwitch(text) {
  const t = text.toLowerCase().trim();
  if (/^(ok(ay)?,? )?(give me|start|let'?s (do|start)|i want) (a |an )?(new|another|different|fresh) (case|guesstimate|one)\b/.test(t)) return detectStartCommand(t.replace(/^(ok(ay)?,? )/, "")) || { mode: "case", ...extractFilters(t) };
  if (/\bmock interview me\b|^start (a )?mock\b/.test(t)) return { mode: "mock", ...extractFilters(t) };
  if (/^(give me |start )?(a )?pm (case|interview)\b/.test(t)) return { mode: "pm", ...extractFilters(t) };
  return null;
}

export async function routeFreeText(text) {
  const quick = detectStartCommand(text);
  if (quick) return quick;
  try {
    return await llm.json({ role: "router", system: ROUTER_SYSTEM, messages: [{ role: "user", content: text }], schema: RouteSchema });
  } catch {
    return { mode: "chat" };
  }
}
