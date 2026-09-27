// Browser build: the model is the viewer's own Claude account (artifact `sample` capability).
export const ROOT = "";
export const config = {
  provider: "claude.ai",
  model: "your Claude account",
  effort: {},
  fallbacks: false,
  dataDir: "data",
  sourcesDir: "sources",
  varDir: "var",
};
