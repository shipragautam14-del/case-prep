// LEAK GUARD: a deterministic backstop on top of the architectural separation (the interviewer
// never receives hidden content). Flags interviewer text that contains numbers from unreleased
// data or long phrases from the hidden insights/solution.

// Digits glued to letters (FY23, Q1, e1) are labels, not data.
const NUM_RE = /(?<![A-Za-z\d.])(?:₹|\$|rs\.?\s?)?\d[\d,]*(?:\.\d+)?\s?(?:%|cr|crore|lakh|mn|million|bn|billion|k)?(?![A-Za-z]{2})/gi;

function normNum(s) {
  const m = s.toLowerCase().replace(/[₹$,\s]|rs\.?/g, "");
  return m;
}

function numbersIn(text) {
  return (text.match(NUM_RE) || [])
    .map(normNum)
    .filter((n) => {
      const digits = n.replace(/[^\d]/g, "");
      // ignore trivial numbers (1, 2, 10, years are handled as visible context usually)
      return digits.length >= 2 && !/^(19|20)\d\d$/.test(digits);
    });
}

function ngrams(text, n = 7) {
  const words = text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

export function hiddenMaterial(caseObj, state) {
  const hiddenText = [
    ...caseObj.data.filter((d) => !state.revealed.data.includes(d.id)).map((d) => d.content),
    ...caseObj.clarifications.filter((c) => !state.revealed.clarifications.includes(c.id)).map((c) => c.answer),
    ...caseObj.exhibits.filter((e) => !state.revealed.exhibits.includes(e.id)).flatMap((e) => [
      ...(e.rows || []).flat().map(String),
      ...(e.series || []).flatMap((s) => s.values.map(String)),
    ]),
    ...caseObj.quant.map((q) => `${q.solution} ${q.answer}`),
  ].join(" ");
  const insightText = [caseObj.reference_solution, caseObj.recommendation, ...caseObj.key_insights].join(" ");
  return { hiddenNumbers: new Set(numbersIn(hiddenText)), insightGrams: ngrams(insightText) };
}

/**
 * @returns {{leak: boolean, numbers: string[], phrases: string[]}}
 */
export function checkLeak(output, caseObj, session) {
  const { hiddenNumbers, insightGrams } = hiddenMaterial(caseObj, session.state);
  // Anything the candidate has already seen or said is fair game.
  const visible = [
    caseObj.opening,
    ...session.transcript.map((t) => t.text || ""),
    ...caseObj.clarifications.filter((c) => session.state.revealed.clarifications.includes(c.id)).map((c) => c.answer),
    ...caseObj.data.filter((d) => session.state.revealed.data.includes(d.id)).map((d) => d.content),
    ...caseObj.exhibits.filter((e) => session.state.revealed.exhibits.includes(e.id)).flatMap((e) => [
      ...(e.rows || []).flat().map(String),
      ...(e.series || []).flatMap((s) => s.values.map(String)),
    ]),
    ...session.state.improvised,
  ].join(" ");
  const visibleNumbers = new Set(numbersIn(visible));
  const numbers = numbersIn(output).filter((n) => hiddenNumbers.has(n) && !visibleNumbers.has(n));
  const visibleGrams = ngrams(visible);
  const phrases = [...ngrams(output)].filter((g) => insightGrams.has(g) && !visibleGrams.has(g));
  return { leak: numbers.length > 0 || phrases.length > 0, numbers, phrases };
}
