import { readFile, writeFile, exists, list, stamp } from "./vfs.js";
const fs = {
  readFileSync: (p) => readFile(p),
  writeFileSync: (p, d) => writeFile(p, String(d)),
  existsSync: (p) => exists(p),
  readdirSync: (p, opts) => {
    const items = list(p);
    return opts?.withFileTypes ? items.map((i) => ({ name: i.name, isDirectory: () => i.isDir })) : items.map((i) => i.name);
  },
  statSync: () => ({ mtimeMs: stamp() }),
  mkdirSync: () => {},
  renameSync: (a, b) => writeFile(b, readFile(a)),
};
export default fs;
