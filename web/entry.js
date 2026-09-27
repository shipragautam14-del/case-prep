// Browser entry for the hosted (claude.ai artifact) build. The agent code under server/ runs
// unchanged in the page; only storage (web/shims/store.js, vfs.js) and the model
// (web/shims/llm.js → artifact `sample`) are swapped.
import { setWriteListener, loadFile } from "./shims/vfs.js";

const PREFIX = "var/";

function docId(path) {
  return path.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 200);
}

async function makeBackend() {
  const use = (n) => (globalThis.claude?.use ? globalThis.claude.use(n) : Promise.resolve(null));
  const [db, user] = await Promise.all([use("db"), use("user")]);
  const uid = user ? await user.id().catch(() => null) : null;
  if (db && uid) {
    const col = db.collection(`data/users/${uid}`);
    return {
      kind: "your Claude account",
      async load() {
        const snap = await col.limit(1000).get();
        return snap.docs.map((d) => d.data()).filter((d) => d && d.path && typeof d.text === "string");
      },
      async save(path, text) {
        if (text.length > 240000) return; // over the per-document cap; keep it in memory only
        await col.doc(docId(path)).set({ path, text, savedAt: new Date().toISOString() });
      },
      async readOnly() {
        return false;
      },
    };
  }
  // Fallback: this browser only.
  return {
    kind: "this browser",
    async load() {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith("cb:")) out.push({ path: k.slice(3), text: localStorage.getItem(k) });
        }
      } catch {}
      return out;
    },
    async save(path, text) {
      try {
        localStorage.setItem("cb:" + path, text);
      } catch {}
    },
  };
}

// Writes are debounced per file so a busy turn costs one save.
function persister(backend) {
  const pending = new Map();
  return (path, text) => {
    if (!path.startsWith(PREFIX)) return;
    clearTimeout(pending.get(path));
    pending.set(
      path,
      setTimeout(() => {
        pending.delete(path);
        backend.save(path, text).catch((e) => console.warn("save failed", path, e?.code || e));
      }, 600),
    );
  };
}

async function boot() {
  const status = document.getElementById("boot-status");
  let backend;
  try {
    backend = await makeBackend();
    for (const f of await backend.load()) loadFile(f.path, f.text);
  } catch (e) {
    console.warn("storage unavailable", e);
    backend = { kind: "this visit only", load: async () => [], save: async () => {} };
  }
  setWriteListener(persister(backend));
  globalThis.caseBuddyStorage = backend.kind;

  const S = await import("../server/engine/session.js");
  const P = await import("../server/learner/profile.js");
  const { sessions } = await import("./shims/store.js");
  const { loadLibrary } = await import("../server/cases/library.js");

  globalThis.caseBuddyApi = async (method, url, body) => {
    if (url === "/api/message") return S.publicView(await S.handleMessage(body));
    if (url === "/api/action") return S.publicView(await S.handleAction(body));
    if (url.startsWith("/api/session/")) return S.publicView(sessions.get(url.split("/").pop()));
    if (url === "/api/history") return P.historyView(P.loadProfile());
    if (url === "/api/profile") {
      const p = P.loadProfile();
      return { skills: P.skillStatus(p), cases: p.cases.filter((c) => c.completed).length, drills: p.drills.length };
    }
    if (url === "/api/status") {
      const cases = [...loadLibrary({ reload: true }).cases.values()];
      const bySource = {};
      for (const c of cases) {
        const k = c.source.startsWith("seed") ? "seed" : c.source.split(":")[0];
        bySource[k] = (bySource[k] || 0) + 1;
      }
      const sample = globalThis.claude?.use ? await globalThis.claude.use("sample") : null;
      return {
        provider: sample ? "claude.ai" : "unavailable",
        model: "your Claude account",
        storage: backend.kind,
        library: { total: cases.length, bySource, invalid: 0 },
        sources: { documents: 0, consulting: 0, pm: 0, list: [], hosted: true },
      };
    }
    throw new Error(`Unknown request ${url}`);
  };
  status?.remove();
  await import("../public/app.js");
}

boot();
