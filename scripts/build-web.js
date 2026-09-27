// Builds the hosted single-page version (web/dist/case-buddy.html) for publishing as a
// claude.ai artifact. The agent code in server/ is bundled as-is; web/shims replace the
// Node-only modules (filesystem, storage, model provider).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (...p) => path.join(ROOT, ...p);

// Embed the static data files the agent reads at runtime.
function collect(dir, out = {}) {
  for (const e of fs.readdirSync(rel(dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) collect(p, out);
    else if (/\.(json|md)$/.test(e.name)) out[p] = fs.readFileSync(rel(p), "utf8");
  }
  return out;
}
const FILES = collect("data");

const SHIM = {
  "config.js": "web/shims/config.js",
  "store.js": "web/shims/store.js",
  "llm.js": "web/shims/llm.js",
};

const shimPlugin = {
  name: "case-buddy-shims",
  setup(build) {
    build.onResolve({ filter: /^virtual:files$/ }, () => ({ path: "files", namespace: "virtual" }));
    build.onLoad({ filter: /.*/, namespace: "virtual" }, () => ({ contents: `export default ${JSON.stringify(FILES)};`, loader: "js" }));
    build.onResolve({ filter: /^node:(fs|path|crypto|url|child_process)$/ }, (a) => ({
      path: rel(a.path === "node:fs" ? "web/shims/fs.js" : a.path === "node:path" ? "web/shims/path.js" : "web/shims/empty.js"),
    }));
    build.onResolve({ filter: /\/(config|store|llm)\.js$/ }, (a) => {
      const abs = path.resolve(a.resolveDir, a.path);
      const name = path.basename(abs);
      if (abs.startsWith(rel("server")) && SHIM[name] && abs === rel("server", name)) return { path: rel(SHIM[name]) };
      return undefined;
    });
    build.onResolve({ filter: /^\/vendor\/marked\// }, () => ({ path: rel("node_modules/marked/lib/marked.esm.js") }));
    build.onResolve({ filter: /^(pdf-parse|mammoth|jszip|@anthropic-ai\/sdk.*)$/ }, (a) => ({ path: a.path, external: true }));
  },
};

const result = await esbuild.build({
  entryPoints: [rel("web/entry.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  write: false,
  plugins: [shimPlugin],
  logLevel: "warning",
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// Page markup: reuse public/index.html's body and public/styles.css.
const html = fs.readFileSync(rel("public/index.html"), "utf8");
const body = html.slice(html.indexOf("<body>") + 6, html.indexOf('<script type="module"')).trim();
let css = fs.readFileSync(rel("public/styles.css"), "utf8");

const page = `<title>Case Practice Buddy</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap">
<style>
${css}
</style>
${body.replace('<div id="messages" class="messages" aria-live="polite"></div>', '<div id="messages" class="messages" aria-live="polite"><div id="boot-status" class="msg system"><div class="bubble">Loading your practice history…</div></div></div>')}
<script type="module">
${js}
</script>
`;
fs.mkdirSync(rel("web/dist"), { recursive: true });
fs.writeFileSync(rel("web/dist/case-buddy.html"), page);
console.log(`web/dist/case-buddy.html  ${(page.length / 1024).toFixed(0)} KiB`);
