import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env loader (no dependency). Real environment variables win.
const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function pickProvider() {
  const explicit = process.env.CASE_BUDDY_PROVIDER;
  if (explicit) return explicit;
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  return "claude-cli";
}

export const config = {
  port: Number(process.env.PORT || 3000),
  provider: pickProvider(), // anthropic | claude-cli | mock
  model: process.env.CASE_BUDDY_MODEL || "claude-opus-5",
  // Per-role effort. The interviewer should feel snappy; the analyzer and coach need to think.
  effort: {
    interviewer: process.env.CASE_BUDDY_EFFORT_INTERVIEWER || "low",
    analyzer: process.env.CASE_BUDDY_EFFORT_ANALYZER || "medium",
    coach: process.env.CASE_BUDDY_EFFORT_COACH || "high",
    teacher: process.env.CASE_BUDDY_EFFORT_TEACHER || "medium",
    generator: process.env.CASE_BUDDY_EFFORT_GENERATOR || "high",
    router: process.env.CASE_BUDDY_EFFORT_ROUTER || "low",
    drill: process.env.CASE_BUDDY_EFFORT_DRILL || "medium",
  },
  fallbacks: (process.env.CASE_BUDDY_FALLBACKS || "on") !== "off",
  dataDir: path.join(ROOT, "data"),
  sourcesDir: process.env.CASE_BUDDY_SOURCES_DIR || path.join(ROOT, "sources"),
  varDir: process.env.CASE_BUDDY_VAR_DIR || path.join(ROOT, "var"),
};
