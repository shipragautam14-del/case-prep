// Lightweight BM25 retrieval over ingested source chunks plus the built-in notes.
// Callers must always pass a module ("consulting" | "pm") so the two never mix, and
// can exclude kinds (e.g. casebook material is excluded while a live case is running).
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { varPath, readJSON } from "../store.js";
import { chunkText } from "./ingest.js";

const STOP = new Set(
  "a an the and or of to in on for with is are was were be been it this that as at by from how what why which who do does did i you we they your our their can should would could will not no if then than so into about over under more most less very just also".split(
    " ",
  ),
);

export function tokenize(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%₹$ ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => t.replace(/(ies|es|s)$/, (m) => (m === "ies" ? "y" : "")));
}

let cache = null;

function builtinChunks() {
  const dir = path.join(config.dataDir, "knowledge");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const module = f.startsWith("pm-") ? "pm" : "consulting";
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    chunkText(text, { size: 1600, overlap: 100 }).forEach((t, i) =>
      out.push({ id: `builtin/${f}#${i}`, doc: `builtin/${f}`, title: `Built-in notes: ${f.replace(/\.md$/, "")}`, module, kind: "builtin", text: t }),
    );
  }
  return out;
}

function load() {
  const indexFile = varPath("index.json");
  const mtime = fs.existsSync(indexFile) ? fs.statSync(indexFile).mtimeMs : 0;
  if (cache && cache.mtime === mtime) return cache;
  const index = readJSON(indexFile, { chunks: [] });
  const chunks = [...index.chunks, ...builtinChunks()];
  const df = new Map();
  const docs = chunks.map((c) => {
    const toks = tokenize(`${c.title} ${c.text}`);
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    return { chunk: c, tf, len: toks.length };
  });
  const avgLen = docs.reduce((a, d) => a + d.len, 0) / Math.max(1, docs.length);
  cache = { mtime, docs, df, avgLen, n: docs.length, sourceDocs: index.docs || {} };
  return cache;
}

export function resetRetrievalCache() {
  cache = null;
}

/**
 * @param {string} query
 * @param {{module: "consulting"|"pm", k?: number, excludeKinds?: string[], onlyKinds?: string[]}} opts
 */
export function retrieve(query, { module, k = 5, excludeKinds = [], onlyKinds = null } = {}) {
  if (!module) throw new Error("retrieve() requires a module");
  const { docs, df, avgLen, n } = load();
  const q = tokenize(query);
  const k1 = 1.4, b = 0.75;
  const scored = [];
  for (const d of docs) {
    const c = d.chunk;
    if (c.module !== module) continue;
    if (excludeKinds.includes(c.kind)) continue;
    if (onlyKinds && !onlyKinds.includes(c.kind)) continue;
    let score = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (n - df.get(t) + 0.5) / (df.get(t) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen)));
    }
    // Prefer real source material over built-in notes when both match.
    if (c.kind === "builtin") score *= 0.8;
    if (score > 0) scored.push({ score, chunk: c });
  }
  scored.sort((a, b2) => b2.score - a.score);
  return scored.slice(0, k).map((s) => s.chunk);
}

export function formatSnippets(chunks, maxChars = 7000) {
  let out = "";
  for (const c of chunks) {
    const block = `--- [${c.title}] ---\n${c.text.trim()}\n\n`;
    if (out.length + block.length > maxChars) break;
    out += block;
  }
  return out.trim();
}

export function sourceStatus() {
  const { sourceDocs } = load();
  const list = Object.entries(sourceDocs).map(([rel, d]) => ({ file: rel, ...d }));
  return {
    documents: list.length,
    consulting: list.filter((d) => d.module === "consulting").length,
    pm: list.filter((d) => d.module === "pm").length,
    list,
  };
}
