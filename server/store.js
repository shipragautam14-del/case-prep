// JSON-file persistence for a single local learner. Everything lives under var/ (git-ignored).
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

export function varPath(...parts) {
  return path.join(config.varDir, ...parts);
}

export function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
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
