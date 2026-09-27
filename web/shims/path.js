function normalize(p) {
  const out = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}
const path = {
  sep: "/",
  join: (...parts) => normalize(parts.filter((x) => x !== "").join("/")),
  resolve: (...parts) => normalize(parts.join("/")),
  relative: (from, to) => { const f = normalize(from), t = normalize(to); return t.startsWith(f + "/") ? t.slice(f.length + 1) : t; },
  dirname: (p) => normalize(p).split("/").slice(0, -1).join("/"),
  basename: (p, ext) => { const b = normalize(p).split("/").pop() || ""; return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; },
  extname: (p) => { const b = normalize(p).split("/").pop() || ""; const i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; },
};
export default path;
