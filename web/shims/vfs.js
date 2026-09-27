// In-memory virtual filesystem for the browser build. Static files (seed cases, drills,
// notes) are embedded at build time; runtime writes (profile, sessions, generated cases)
// go to memory and are mirrored to persistent storage by web/persist.js.
import FILES from "virtual:files";

const mem = new Map(Object.entries(FILES));
let version = 1;
let onWrite = () => {};

export const norm = (p) => String(p).replace(/\\/g, "/").replace(/^\.?\/+/, "").replace(/\/+/g, "/").replace(/\/$/, "");

export function setWriteListener(fn) { onWrite = fn; }
export function loadFile(p, text) { mem.set(norm(p), text); version++; }
export function writeFile(p, text) {
  p = norm(p);
  mem.set(p, text);
  version++;
  onWrite(p, text);
}
export function readFile(p) {
  p = norm(p);
  if (!mem.has(p)) {
    const e = new Error(`ENOENT: ${p}`);
    e.code = "ENOENT";
    throw e;
  }
  return mem.get(p);
}
export function exists(p) {
  p = norm(p);
  if (mem.has(p)) return true;
  for (const k of mem.keys()) if (k.startsWith(p + "/")) return true;
  return false;
}
export function list(p) {
  p = norm(p);
  const out = new Map();
  for (const k of mem.keys()) {
    if (!k.startsWith(p + "/")) continue;
    const rest = k.slice(p.length + 1);
    const [name, ...more] = rest.split("/");
    out.set(name, more.length > 0);
  }
  return [...out.entries()].map(([name, isDir]) => ({ name, isDir }));
}
export function stamp() { return version; }
