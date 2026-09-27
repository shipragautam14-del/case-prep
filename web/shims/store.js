// Browser build of server/store.js: same API over the virtual filesystem.
import path from "./path.js";
import { readFile, writeFile } from "./vfs.js";

export function varPath(...parts) {
  return path.join("var", ...parts);
}
export function readJSON(file, fallback) {
  try {
    return JSON.parse(readFile(file));
  } catch {
    return fallback;
  }
}
export function writeJSON(file, value) {
  writeFile(file, JSON.stringify(value));
}
export const sessions = {
  get(id) {
    return readJSON(varPath("sessions", `${id}.json`), null);
  },
  save(session) {
    session.updatedAt = new Date().toISOString();
    writeJSON(varPath("sessions", `${session.id}.json`), session);
  },
};
export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
