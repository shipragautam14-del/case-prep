// Source ingestion: extracts text from documents under sources/<module>/, chunks it and writes
// a retrieval index to var/index.json. Modules keep consulting and PM material separate.
//
//   sources/consulting/**   -> module "consulting"
//   sources/pm/**           -> module "pm"  (Sigma PM etc. — never used by consulting prompts)
//
// Document "kind" is inferred from the file name so retrieval can filter it:
//   casebook  (casebook / case book / ICON / transcripts)  - excluded from live-case retrieval
//   industry  (industry report)
//   guide     (everything else: Issac Jojy chapters, checklists, frameworks, cheat sheets)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";
import { varPath, readJSON, writeJSON } from "../store.js";

const EXTS = [".pdf", ".docx", ".pptx", ".txt", ".md"];

export function listSourceFiles() {
  const out = [];
  for (const module of ["consulting", "pm"]) {
    const dir = path.join(config.sourcesDir, module);
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (EXTS.includes(path.extname(entry.name).toLowerCase()) && entry.name.toLowerCase() !== "readme.md")
          out.push({ file: p, module });
      }
    };
    walk(dir);
  }
  return out;
}

export function inferKind(fileName) {
  const n = fileName.toLowerCase();
  // "ICON Industry Reports" is an industry report, "ICON Consult Prep Book" is a casebook.
  if (/industry|report|sector/.test(n) && !/case/.test(n)) return "industry";
  if (/case\s*-?book|casebook|prep\s*book|icon|transcript|interview experiences?/.test(n)) return "casebook";
  return "guide";
}

export async function extractText(file) {
  const ext = path.extname(file).toLowerCase();
  const buf = fs.readFileSync(file);
  if (ext === ".txt" || ext === ".md") return buf.toString("utf8");
  if (ext === ".pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    try {
      const res = await parser.getText();
      return res.text;
    } finally {
      await parser.destroy?.();
    }
  }
  if (ext === ".docx") {
    const mammoth = (await import("mammoth")).default;
    const res = await mammoth.extractRawText({ buffer: buf });
    return res.value;
  }
  if (ext === ".pptx") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
    const parts = [];
    for (const [i, name] of slides.entries()) {
      const xml = await zip.file(name).async("string");
      const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" ");
      parts.push(`[Slide ${i + 1}] ${decodeXml(text)}`);
    }
    return parts.join("\n\n");
  }
  return "";
}

function decodeXml(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function chunkText(text, { size = 1400, overlap = 200 } = {}) {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  const paras = clean.split(/\n\n+/);
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) {
      chunks.push(cur);
      cur = cur.slice(-overlap) + "\n\n" + p;
    } else cur = cur ? cur + "\n\n" + p : p;
    while (cur.length > size * 1.5) {
      chunks.push(cur.slice(0, size));
      cur = cur.slice(size - overlap);
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

export function titleFromFile(file) {
  return path.basename(file, path.extname(file)).replace(/[_]+/g, " ").trim();
}

/** Build (or incrementally refresh) the retrieval index. Returns a summary. */
export async function buildIndex({ log = () => {} } = {}) {
  const indexFile = varPath("index.json");
  const prev = readJSON(indexFile, { docs: {}, chunks: [] });
  const files = listSourceFiles();
  const docs = {};
  const chunks = [];
  let changed = false;
  for (const { file, module } of files) {
    const rel = path.relative(config.sourcesDir, file);
    const hash = crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
    if (prev.docs[rel]?.hash === hash) {
      docs[rel] = prev.docs[rel];
      chunks.push(...prev.chunks.filter((c) => c.doc === rel));
      continue;
    }
    changed = true;
    log(`extracting ${rel}`);
    let text = "";
    try {
      text = await extractText(file);
    } catch (e) {
      log(`  ! failed to extract ${rel}: ${e.message}`);
    }
    const title = titleFromFile(file);
    const kind = inferKind(rel);
    const pieces = chunkText(text);
    docs[rel] = { hash, title, module, kind, chars: text.length, chunks: pieces.length };
    pieces.forEach((t, i) => chunks.push({ id: `${rel}#${i}`, doc: rel, title, module, kind, text: t }));
    if (text.trim().length < 200) log(`  ! very little text extracted from ${rel} (scanned PDF? OCR it first)`);
  }
  if (Object.keys(prev.docs).some((k) => !docs[k])) changed = true;
  const index = { builtAt: new Date().toISOString(), docs, chunks };
  if (changed || !fs.existsSync(indexFile)) writeJSON(indexFile, index);
  return { docs: Object.keys(docs).length, chunks: chunks.length, changed };
}
