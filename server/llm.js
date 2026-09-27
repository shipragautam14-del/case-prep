// Thin LLM layer. Every agent role calls either `text()` or `json()`.
// Providers:
//   anthropic  - official SDK (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN)
//   claude-cli - shells out to the `claude` CLI in print mode (uses a logged-in Claude Code install)
//   mock       - scripted responses for deterministic tests
import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "./config.js";

let client = null;
function sdk() {
  if (!client) client = new Anthropic();
  return client;
}

// ---------- mock provider (tests) ----------
const mockQueue = [];
export const mock = {
  push(...responses) { mockQueue.push(...responses); },
  clear() { mockQueue.length = 0; },
  calls: [],
};
function mockNext(kind, args) {
  mock.calls.push({ kind, ...args });
  if (!mockQueue.length) throw new Error(`mock LLM queue empty (${kind} call, role=${args.role})`);
  const next = mockQueue.shift();
  return typeof next === "function" ? next(args) : next;
}

// ---------- helpers ----------
function flatten(messages) {
  // For providers that take a single prompt: render the conversation as a transcript.
  if (messages.length === 1) return messages[0].content;
  return messages
    .map((m) => `<${m.role}>\n${m.content}\n</${m.role}>`)
    .join("\n\n");
}

function runCli(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"], env: process.env });
    let out = "", err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 300_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && !out) return reject(new Error(`claude CLI exited ${code}: ${err.slice(0, 500)}`));
      try {
        const parsed = JSON.parse(out);
        if (parsed.is_error) return reject(new Error(`claude CLI error: ${parsed.result || err}`));
        resolve(parsed);
      } catch (e) {
        reject(new Error(`claude CLI returned non-JSON output: ${out.slice(0, 300)}`));
      }
    });
    child.stdin.end(input);
  });
}

function cliArgs(system, effort, extra = []) {
  return [
    "-p", "--output-format", "json",
    "--system-prompt", system,
    "--tools", "",
    "--no-session-persistence",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--model", config.model,
    "--effort", effort,
    ...extra,
  ];
}

function fallbackParams() {
  return config.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {};
}

function checkStop(res, role) {
  if (res.stop_reason === "refusal") {
    throw new Error(`Model declined the ${role} request (${res.stop_details?.category ?? "unknown"}).`);
  }
}

// ---------- public API ----------

/** Free-text generation. messages: [{role:"user"|"assistant", content:string}] */
export async function text({ role, system, messages, effort, maxTokens = 4000 }) {
  effort = effort || config.effort[role] || "medium";
  if (config.provider === "mock") return mockNext("text", { role, system, messages });
  if (config.provider === "claude-cli") {
    const res = await runCli(cliArgs(system, effort), flatten(messages));
    return String(res.result || "").trim();
  }
  const res = await sdk().beta.messages.create({
    model: config.model,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort },
    system,
    messages,
    ...fallbackParams(),
  });
  checkStop(res, role);
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

/** Structured generation validated against a zod schema. */
export async function json({ role, system, messages, schema, effort, maxTokens = 16000 }) {
  effort = effort || config.effort[role] || "medium";
  if (config.provider === "mock") return schema.parse(mockNext("json", { role, system, messages }));
  if (config.provider === "claude-cli") {
    const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await runCli(
          cliArgs(system, effort, ["--json-schema", JSON.stringify(jsonSchema)]),
          flatten(messages),
        );
        const raw = res.structured_output ?? JSON.parse(res.result);
        return schema.parse(raw);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr;
  }
  const res = await sdk().beta.messages.parse({
    model: config.model,
    max_tokens: maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort, format: zodOutputFormat(schema) },
    system,
    messages,
    ...fallbackParams(),
  });
  checkStop(res, role);
  if (!res.parsed_output) throw new Error(`Structured output for ${role} failed to parse`);
  return res.parsed_output;
}
