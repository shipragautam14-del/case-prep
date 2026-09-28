import express from "express";
import path from "node:path";
import { config, ROOT } from "./config.js";
import { sessions } from "./store.js";
import { handleMessage, handleAction, publicView } from "./engine/session.js";
import { loadProfile, historyView, skillStatus } from "./learner/profile.js";
import { loadLibrary } from "./cases/library.js";
import { buildIndex } from "./knowledge/ingest.js";
import { sourceStatus, resetRetrievalCache } from "./knowledge/retrieval.js";

const app = express();

// Optional password lock for hosted deployments: set APP_PASSWORD (any username works).
if (process.env.APP_PASSWORD) {
  app.use((req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization || "").split(" ");
    const pass = scheme === "Basic" && encoded ? Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":") : null;
    if (pass === process.env.APP_PASSWORD) return next();
    res.set("WWW-Authenticate", 'Basic realm="Case Practice Buddy"').status(401).send("Password required");
  });
}
app.use(express.json({ limit: "200kb" }));
app.use(express.static(path.join(ROOT, "public")));
app.use("/vendor/marked", express.static(path.join(ROOT, "node_modules", "marked", "lib")));

const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || String(e) });
  }
};

app.post("/api/message", wrap(async (req) => publicView(await handleMessage(req.body))));
app.post("/api/action", wrap(async (req) => publicView(await handleAction(req.body))));
app.get("/api/session/:id", wrap(async (req) => publicView(sessions.get(req.params.id))));
app.get("/api/history", wrap(async () => historyView(loadProfile())));
app.get("/api/profile", wrap(async () => {
  const p = loadProfile();
  return { skills: skillStatus(p), cases: p.cases.filter((c) => c.completed).length, drills: p.drills.length };
}));
app.get("/api/status", wrap(async () => {
  const lib = loadLibrary();
  const cases = [...lib.cases.values()];
  return {
    provider: config.provider,
    model: config.model,
    library: {
      total: cases.length,
      bySource: cases.reduce((m, c) => {
        const k = c.source.startsWith("seed") ? "seed" : c.source.split(":")[0];
        m[k] = (m[k] || 0) + 1;
        return m;
      }, {}),
      invalid: lib.errors.length,
    },
    sources: sourceStatus(),
  };
}));

export async function start() {
  // Refresh the source index on boot (cheap when nothing changed).
  try {
    const r = await buildIndex({ log: (m) => console.log(`[ingest] ${m}`) });
    if (r.changed) resetRetrievalCache();
    console.log(`[ingest] ${r.docs} source document(s), ${r.chunks} chunk(s) indexed`);
  } catch (e) {
    console.warn(`[ingest] skipped: ${e.message}`);
  }
  const lib = loadLibrary();
  console.log(`[library] ${lib.cases.size} case(s) loaded`);
  if (config.provider === "claude-cli") console.log("[llm] no ANTHROPIC_API_KEY found — using the local `claude` CLI as the model provider");
  return app.listen(config.port, () => console.log(`Case Practice Buddy running at http://localhost:${config.port} (provider: ${config.provider}, model: ${config.model})`));
}

if (import.meta.url === `file://${process.argv[1]}`) start();

export { app };
