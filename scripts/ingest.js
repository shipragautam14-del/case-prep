// npm run ingest            -> extract text from sources/ and rebuild the retrieval index
// npm run ingest -- --cases -> also convert casebook documents into interactive case objects (uses the LLM)
import crypto from "node:crypto";
import { buildIndex } from "../server/knowledge/ingest.js";
import { varPath, readJSON, writeJSON } from "../server/store.js";
import { extractCasesFromText, normalizeGenerated } from "../server/cases/generator.js";

const withCases = process.argv.includes("--cases");

const summary = await buildIndex({ log: (m) => console.log(m) });
console.log(`Indexed ${summary.docs} document(s) into ${summary.chunks} chunk(s).`);

if (!withCases) {
  console.log('Tip: run "npm run extract-cases" to turn casebook documents into interactive cases.');
  process.exit(0);
}

const index = readJSON(varPath("index.json"), { docs: {}, chunks: [] });
const casebooks = Object.entries(index.docs).filter(([, d]) => d.module === "consulting" && d.kind === "casebook");
if (!casebooks.length) {
  console.log("No casebook documents found. Name files with 'casebook', 'case book', 'ICON' or 'transcript' so they are recognised.");
  process.exit(0);
}

const WINDOW = 14000, OVERLAP = 3000;
for (const [rel, doc] of casebooks) {
  const slug = rel.replace(/[^a-z0-9]+/gi, "_");
  const outFile = varPath("cases", "extracted-meta", `${slug}.json`);
  const casesFile = varPath("cases", "extracted", `${slug}.json`);
  const existing = readJSON(outFile, null);
  if (existing?.hash === doc.hash) {
    console.log(`${rel}: already extracted (${existing.cases.length} cases)`);
    continue;
  }
  const text = index.chunks.filter((c) => c.doc === rel).map((c) => c.text).join("\n\n");
  const seen = new Set();
  const cases = [];
  for (let start = 0, w = 0; start < text.length; start += WINDOW - OVERLAP, w++) {
    const windowText = text.slice(start, start + WINDOW);
    process.stdout.write(`${rel}: window ${w + 1}/${Math.ceil(text.length / (WINDOW - OVERLAP))} … `);
    try {
      const found = await extractCasesFromText(doc.title, windowText);
      let added = 0;
      for (const raw of found) {
        const key = raw.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seen.has(key)) continue;
        seen.add(key);
        const id = `cb-${crypto.createHash("sha1").update(rel + key).digest("hex").slice(0, 10)}`;
        try {
          const { source_excerpt_start, ...rest } = raw;
          cases.push(normalizeGenerated(rest, { id, source: `casebook:${doc.title}` }));
          added++;
        } catch (e) {
          console.log(`\n  ! skipped "${raw.title}": ${e.message.slice(0, 200)}`);
        }
      }
      console.log(`${added} case(s)`);
    } catch (e) {
      console.log(`failed: ${e.message.slice(0, 200)}`);
    }
  }
  writeJSON(outFile, { hash: doc.hash, source: rel, cases: cases.map((c) => c.id) });
  writeJSON(casesFile, cases);
  console.log(`${rel}: ${cases.length} interactive case(s) written`);
}
