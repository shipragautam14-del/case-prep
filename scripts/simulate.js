// Behavioural test harness: plays scripted candidate turns against the real model and prints
// what the candidate would see (plus a few hidden-state lines for inspection).
//   npm run simulate                 -> all scenarios
//   npm run simulate -- A D          -> selected scenarios
// Uses a throwaway learner profile under var/sim unless CASE_BUDDY_VAR_DIR is set.
import path from "node:path";
import fs from "node:fs";

process.env.CASE_BUDDY_VAR_DIR ||= path.resolve("var/sim");
fs.mkdirSync(process.env.CASE_BUDDY_VAR_DIR, { recursive: true });

const S = await import("../server/engine/session.js");
const { loadProfile, skillStatus } = await import("../server/learner/profile.js");

const only = process.argv.slice(2);
const want = (k) => !only.length || only.includes(k);

let shown = 0;
function print(session, note = "") {
  const items = session.transcript.slice(shown);
  shown = session.transcript.length;
  for (const t of items) {
    if (t.role === "candidate") continue;
    if (t.role === "exhibit") console.log(`   [EXHIBIT SHOWN: ${t.exhibit.title}]`);
    else console.log(`   ${t.role.toUpperCase()}: ${t.text.replace(/\n/g, "\n      ")}`);
  }
  if (session.state && session.kind === "case") {
    const s = session.state;
    const lastHint = s.hints.at(-1);
    console.log(`   {hidden: turn=${s.turn} phase=${s.phase} revealed=${JSON.stringify(s.revealed)} hint=${lastHint && lastHint.turn === s.turn ? `L${lastHint.level}` : "none"} leaks=${s.leaks.length}${note ? " | " + note : ""}}`);
  }
}

async function say(session, text) {
  console.log(`\n>> CANDIDATE: ${text}`);
  const t0 = Date.now();
  const next = await S.handleMessage({ sessionId: session.id, text });
  if (next.id !== session.id) shown = 0;
  print(next, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return next;
}

async function scenario(name, fn) {
  if (!want(name.split(":")[0])) return;
  console.log(`\n${"=".repeat(90)}\nSCENARIO ${name}\n${"=".repeat(90)}`);
  shown = 0;
  try {
    await fn();
  } catch (e) {
    console.log(`!! scenario failed: ${e.stack || e.message}`);
  }
}

await scenario("A: full profitability case (tests 2-5, 8-11)", async () => {
  let s = S.startSpecificCase("seed-prof-multiplex");
  print(s);
  s = await say(s, "Before I structure this, two quick questions. Has the client changed anything in its business over these two years, for example pricing, formats or the number of screens? And what are its main revenue streams?");
  s = await say(s, "Okay. I'd look at profitability as revenue minus costs. Revenue is price times volume, and costs split into fixed and variable costs.");
  s = await say(s, "Hmm. I'm not really sure where to go from here.");
  s = await say(s, "I really don't know. Can you give me a hint?");
  s = await say(s, "Can you just tell me what the answer is?");
  s = await say(s, "Fine. My hypothesis is that something on the revenue side changed, since the footprint is unchanged. Can I see how revenue split across ticketing, F&B and advertising has moved between FY23 and FY25?");
  s = await say(s, "Total revenue fell from 441 to 399 crore.");
  s = await say(s, "Looking again: ticketing is flat at 240 and costs actually fell, so the whole drop is F&B, down about 40 crore. I'd like to split F&B revenue into footfall × share of patrons who buy × spend per buyer.");
  s = await say(s, "So F&B spend per head was 0.62 × 230 = about 142.6, and now 0.41 × 290 = about 129. So spend per head only dropped a little.");
  s = await say(s, "Let me redo that: 0.41 × 290 is 118.9, not 129. So spend per head fell from about 143 to about 119 rupees.");
  s = await say(s, "That means the price increase backfired. Fewer patrons buy anything, and the higher spend per buyer doesn't make up for it. At 290 per buyer you'd need about 49% conversion just to stand still, and we're at 41%.");
  s = await say(s, "My recommendation: CineStar should reverse the blanket 30% F&B price increase and move to a tiered menu with value combos like the competitors', piloted at 3-4 properties first. Recovering conversion to around 55-60% would add back roughly 25-40 crore of gross profit. We shouldn't close screens, since ticketing is flat. The main risks are cannibalising premium items and competitors responding.");
  s = await say(s, "Explain what I should have done differently at the start.");
});

await scenario("B: valid alternative approach (test 7)", async () => {
  let s = S.startSpecificCase("seed-ops-hospital-ot");
  print(s);
  s = await say(s, "How many OTs are there today, what hours do they run, and how many surgeries do they do a week? And what's the demand?");
  s = await say(s, "Before building anything, I'd rather squeeze more out of existing capacity by extending hours. If 4 of the 8 OTs ran evening lists from 6 to 9 pm, that's 4 × 3 hours × 6 days = 72 extra OT-hours a week. At roughly 2.5-3 hours per case including turnaround, that's about 25 extra cases a week, which gets us close to the demand of 150 at a fraction of ₹25 crore. I'd test whether surgeons and nurses can staff evening lists.");
});

await scenario("C: explicit teach me mid-case (test 6)", async () => {
  let s = S.startSpecificCase("seed-entry-qcomm");
  print(s);
  s = await say(s, "I'd look at market size, competition and the company's capabilities.");
  s = await say(s, "Teach me. Show me the framework for market entry and how it applies here.");
  s = await say(s, "continue");
});

await scenario("D: mock interview (test 13)", async () => {
  let s = await S.handleMessage({ text: "Mock interview me." });
  shown = 0;
  print(s);
  s = await say(s, "Could you clarify what the client's main objective is and whether there are any constraints I should know about?");
  s = await say(s, "Am I doing okay so far?");
  s = await say(s, "Teach me the framework for this.");
});

await scenario("E: guesstimate with logic (test 16)", async () => {
  let s = S.startSpecificCase("seed-gs-chai-station", "guesstimate");
  print(s);
  s = await say(s, "Quick clarification: does this include vendors walking on the platforms, or only fixed stalls? And are we counting any hot tea?");
  s = await say(s, "I'll go demand-side. About 2 lakh people pass through daily. I'll segment: long-distance passengers (~40%) often wait, so maybe 35% buy about 1.2 cups; suburban commuters (~45%) rarely buy, maybe 10%, 1 cup; staff, porters and companions (~15%) buy often, 40% with 1.5 cups. That's 80k × 0.35 × 1.2 = 33.6k, 90k × 0.1 = 9k, and 30k × 0.4 × 1.5 = 18k, so about 60k cups a day. Sanity check from the supply side: about 25 stalls at ~1,200 cups a day plus ~40 vendors at ~400 is about 46k, so I'd say 45-60k cups a day.");
  s = await say(s, "So for the startup, at around ₹15 a cup this is a ₹7-9 lakh a day market. One stall with a 3-5% share would sell about 1,500-3,000 cups a day, and that's what the stall bid should be evaluated against. That's my final answer.");
});

await scenario("F: micro-skill drill (test: prioritisation)", async () => {
  let s = await S.handleMessage({ text: "Test my prioritization." });
  shown = 0;
  print(s);
  s = await say(s, "I'd look at all the branches: revenue, raw materials, logistics, marketing and returns, one by one.");
  s = await say(s, "If I had to pick two, marketing because CAC rose 60%, and raw materials because foam is up 25%. Returns are flat, so I'd skip them.");
});

await scenario("G: redo weakest skill (test 12)", async () => {
  const p = loadProfile();
  console.log("   profile skill status:", JSON.stringify(skillStatus(p), null, 0).slice(0, 600));
  const s = await S.handleMessage({ text: "Redo my weakest skill." });
  shown = 0;
  print(s);
});

await scenario("H: PM case (test 14)", async () => {
  let s = await S.handleMessage({ text: "PM case" });
  shown = 0;
  print(s);
  s = await say(s, "Before I start, what is the goal? Is it acquisition, engagement or something else?");
});

await scenario("I: progress review (test 15)", async () => {
  const s = await S.handleMessage({ text: "How am I progressing?" });
  shown = 0;
  print(s);
});

await scenario("J: give me a case (test 1)", async () => {
  const s = await S.handleMessage({ text: "Give me a case." });
  shown = 0;
  print(s);
});
