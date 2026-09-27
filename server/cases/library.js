// CASE MANAGER (storage side): loads seed cases, casebook-extracted cases and generated cases.
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { CaseSchema } from "../schemas.js";
import { varPath, writeJSON } from "../store.js";

let cache = null;

function loadDir(dir, into, errors) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const c of Array.isArray(raw) ? raw : [raw]) {
      const parsed = CaseSchema.safeParse(c);
      if (parsed.success) into.set(parsed.data.id, parsed.data);
      else errors.push(`${f}:${c.id ?? "?"}: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    }
  }
}

export function loadLibrary({ reload = false } = {}) {
  if (cache && !reload) return cache;
  const cases = new Map();
  const errors = [];
  loadDir(path.join(config.dataDir, "cases", "seed"), cases, errors);
  loadDir(varPath("cases", "extracted"), cases, errors);
  loadDir(varPath("cases", "generated"), cases, errors);
  if (errors.length) console.warn(`[library] ${errors.length} invalid case(s) skipped:\n  ${errors.join("\n  ")}`);
  cache = { cases, errors };
  return cache;
}

export function getCase(id) {
  return loadLibrary().cases.get(id) || null;
}

export function allCases() {
  return [...loadLibrary().cases.values()];
}

export function saveGeneratedCase(caseObj) {
  writeJSON(varPath("cases", "generated", `${caseObj.id}.json`), caseObj);
  loadLibrary().cases.set(caseObj.id, caseObj);
}
