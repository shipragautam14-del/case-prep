// MICRO-SKILL MODE: short focused drills. Prompts come from data/drills.json (with hidden
// reference notes) or, for math, from a deterministic generator with exact answers.
import fs from "node:fs";
import path from "node:path";
import * as llm from "../llm.js";
import { config } from "../config.js";
import { DRILL_SYSTEM } from "../prompts/others.js";
import { DrillTurnSchema } from "../schemas.js";

export const DRILL_TO_SKILL = {
  structuring: "structuring",
  prioritization: "prioritization",
  math: "quantitative",
  hypothesis: "hypothesis",
  synthesis: "synthesis",
  clarification: "clarification",
  exhibit: "exhibit_interpretation",
};

function loadPool() {
  const f = path.join(config.dataDir, "drills.json");
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

const rnd = (min, max, step = 1) => min + step * Math.floor(Math.random() * ((max - min) / step + 1));
const fmt = (n) => Number(n.toFixed(2)).toLocaleString("en-IN");

/** Deterministic math drills with exact answers and a business "so what". */
export function generateMathProblem() {
  const kinds = [
    () => {
      const price = rnd(400, 1200, 50), vc = Math.round(price * rnd(40, 70, 5) / 100), fixed = rnd(20, 90, 5) * 100000;
      const be = fixed / (price - vc);
      const capacity = Math.round(be * rnd(8, 16) / 10 / 1000) * 1000;
      return {
        prompt: `A company is launching a home water purifier service. Each annual subscription is priced at ₹${fmt(price)} with variable cost of ₹${fmt(vc)} per subscriber. Annual fixed costs (service network, marketing) are ₹${fmt(fixed / 100000)} lakh. The launch city can realistically support about ${fmt(capacity)} subscribers in year one.\n\nHow many subscribers are needed to break even, and what does that tell you?`,
        reference: `Contribution per subscriber = ${price} - ${vc} = ₹${price - vc}. Break-even = ${fixed} / ${price - vc} = ${fmt(be)} subscribers (≈${fmt(Math.round(be))}). Realistic year-one ceiling ≈ ${capacity}, i.e. break-even needs ${fmt((be / capacity) * 100)}% of the realistic ceiling. So what: ${be > capacity ? "break-even is not reachable in year one in this city; needs lower fixed cost, higher price, or a multi-city/longer horizon view" : be > 0.7 * capacity ? "break-even needs very high penetration — risky; test pricing and fixed-cost levers" : "break-even looks achievable with moderate penetration"}.`,
      };
    },
    () => {
      const start = rnd(200, 800, 20), years = rnd(3, 5), cagr = rnd(8, 25) / 100;
      const end = Math.round(start * Math.pow(1 + cagr, years));
      return {
        prompt: `A regional snacks brand's revenue went from ₹${start} Cr to ₹${end} Cr over ${years} years. The overall packaged-snacks category grew at about 12% a year over the same period.\n\nWhat is the brand's CAGR, and what does it imply?`,
        reference: `CAGR = (${end}/${start})^(1/${years}) - 1 ≈ ${(cagr * 100).toFixed(1)}% (quick approximation acceptable: rule of 72 or ln approximation). Versus category 12%: ${cagr > 0.12 ? "gaining share" : cagr < 0.12 ? "losing share even though growing" : "holding share"}. So what: ${cagr < 0.12 ? "the growth is market-driven, not share gain — the brand is underperforming the category" : "the brand is outgrowing the category — understand which channel/region drives it"}.`,
      };
    },
    () => {
      const rev = rnd(400, 1500, 50), margin = rnd(8, 18), priceCut = rnd(3, 10), volUp = rnd(5, 20);
      const cost = rev * (1 - margin / 100);
      const newRev = rev * (1 - priceCut / 100) * (1 + volUp / 100);
      const varShare = 0.6;
      const newCost = cost * varShare * (1 + volUp / 100) + cost * (1 - varShare);
      return {
        prompt: `A consumer electronics retailer has revenue of ₹${rev} Cr and an operating margin of ${margin}%. 60% of its costs are variable with volume; the rest are fixed. Management proposes a ${priceCut}% price cut, expecting volumes to rise ${volUp}%.\n\nWhat happens to operating profit? Should they do it?`,
        reference: `Current cost = ${fmt(cost)} Cr, profit = ${fmt(rev - cost)} Cr. New revenue = ${rev} × ${(1 - priceCut / 100).toFixed(2)} × ${(1 + volUp / 100).toFixed(2)} = ${fmt(newRev)} Cr. New cost = variable ${fmt(cost * varShare)}×${(1 + volUp / 100).toFixed(2)} + fixed ${fmt(cost * (1 - varShare))} = ${fmt(newCost)} Cr. New profit = ${fmt(newRev - newCost)} Cr (change ${fmt(newRev - newCost - (rev - cost))} Cr). So what: ${newRev - newCost > rev - cost ? "profit rises — but only if the volume response is real; test it and watch competitor retaliation" : "profit falls — the volume uplift doesn't compensate for the price cut; they'd need a bigger volume response or cost reduction"}.`,
      };
    },
    () => {
      const capex = rnd(20, 80, 5), saving = rnd(4, 15), life = rnd(7, 12);
      return {
        prompt: `A textile mill can install rooftop solar for ₹${capex} Cr. It would cut the electricity bill by ₹${saving} Cr a year. Panels last about ${life} years. The mill's board expects any investment to pay back within 5 years.\n\nWhat is the payback period, and would you recommend it?`,
        reference: `Simple payback = ${capex}/${saving} = ${fmt(capex / saving)} years. Lifetime savings ≈ ${saving * life} Cr vs capex ${capex} Cr. So what: ${capex / saving <= 5 ? "meets the 5-year hurdle; recommend, subject to tariff assumptions and degradation" : "misses the 5-year hurdle even though lifetime savings may exceed capex; explore a leasing/OPEX model (RESCO) or subsidies"}. Strong answers mention time value of money/degradation as a sanity check.`,
      };
    },
    () => {
      const beds = rnd(150, 400, 10), occ = rnd(55, 85), arpob = rnd(20, 45) * 1000;
      const rev = beds * occ / 100 * 365 * arpob / 1e7;
      return {
        prompt: `A hospital has ${beds} beds running at ${occ}% occupancy. Average revenue per occupied bed-day is ₹${fmt(arpob)}.\n\nWhat is its annual in-patient revenue? If occupancy rose to 85%, how much more revenue would it make, and what does that suggest about where to focus?`,
        reference: `Revenue = ${beds} × ${occ}% × 365 × ${arpob} ≈ ₹${fmt(rev)} Cr. At 85%: ₹${fmt(beds * 0.85 * 365 * arpob / 1e7)} Cr, uplift ≈ ₹${fmt(beds * (0.85 - occ / 100) * 365 * arpob / 1e7)} Cr. So what: ${occ < 75 ? "occupancy is a big lever — focus on referral/admissions funnel before adding beds" : "occupancy is already high; growth has to come from ARPOB (case mix, specialties) or capacity"}.`,
      };
    },
  ];
  return kinds[Math.floor(Math.random() * kinds.length)]();
}

export function pickDrill(skill, profile) {
  if (skill === "math") {
    const p = generateMathProblem();
    return { skill, prompt: p.prompt, reference: p.reference, exhibit: null, id: `math-${Date.now()}` };
  }
  const pool = loadPool()[skill] || [];
  if (!pool.length) throw new Error(`No drills for skill ${skill}`);
  const lastUsed = new Map(profile.drills.filter((d) => d.drillId).map((d, i) => [d.drillId, i]));
  const fresh = pool.filter((d) => !lastUsed.has(d.id));
  const pick = fresh.length
    ? fresh[Math.floor(Math.random() * fresh.length)]
    : pool.slice().sort((a, b) => lastUsed.get(a.id) - lastUsed.get(b.id))[0]; // least recently used
  return { skill, id: pick.id, prompt: pick.prompt, reference: pick.reference, exhibit: pick.exhibit ?? null };
}

export function drillIntro(drill) {
  const names = {
    structuring: "Structuring drill",
    prioritization: "Prioritisation drill",
    math: "Math drill",
    hypothesis: "Hypothesis drill",
    synthesis: "Synthesis drill",
    clarification: "Clarification drill",
    exhibit: "Exhibit drill",
  };
  return `**${names[drill.skill]}** (short, focused)\n\n${drill.prompt}`;
}

export async function drillTurn(session) {
  const d = session.drill;
  const transcript = session.transcript
    .map((t) => (t.role === "exhibit" ? `[EXHIBIT SHOWN: ${d.exhibit?.title}]` : `${t.role.toUpperCase()}: ${t.text}`))
    .join("\n");
  const followUps = session.transcript.filter((t) => t.role === "interviewer").length - 1;
  const content = `DRILL SKILL: ${d.skill}
HIDDEN REFERENCE NOTES (never quote them before the candidate answers; use them to judge and for feedback)
${d.reference}
${d.exhibit ? `EXHIBIT DATA: ${JSON.stringify(d.exhibit)}` : ""}
Follow-up questions already asked: ${followUps}. ${followUps >= 1 ? "You must now give feedback and set done=true." : ""}

TRANSCRIPT
${transcript}`;
  return llm.json({ role: "drill", system: DRILL_SYSTEM, messages: [{ role: "user", content }], schema: DrillTurnSchema });
}
