# Case Practice Buddy

An AI case-interview practice partner for IIM Bangalore SIP consulting prep. It behaves like an experienced consultant or strong IIMB consulting senior running a real interviewer-led case. **You** drive the case. It holds the data, answers only what you ask, pushes back, gives graduated hints only when you're genuinely stuck, and saves the feedback for a specific debrief afterwards.

```
npm install
cp .env.example .env         # add ANTHROPIC_API_KEY (or use a logged-in `claude` CLI)
npm start                    # http://localhost:3000
```

## What you can say

| You say | What happens |
|---|---|
| "Give me a case" / "a hard market entry case" / "a short case in healthcare" | **Interviewer mode**: a case is selected for you (type, difficulty, diversity, your weak skills) |
| "Mock interview me" | **Mock mode**: stricter and terse. No coaching or reassurance ("Keep going."). Full feedback only at the end |
| "Give me a guesstimate" | **Guesstimate mode**: graded on scoping, segmentation, assumptions, arithmetic, sanity check and interpretation, not just the final number |
| "Test my prioritisation / structuring / math / hypothesis / synthesis / clarification", "Give me an exhibit" | **Micro-skill mode**: short focused drills. Math problems are generated with exact answers |
| "Teach me market entry" / mid-case: "Teach me", "Show me the framework" | **Teaching mode** (level-4 intervention). Only on explicit request, grounded in your source documents |
| "How am I progressing?" | **Progress review**: patterns, trends and next practice. Never a single score |
| "Redo my weakest skill" / "Redo last case" | Targeted case or drill from your learner history, or a *transfer variant* of the case (new client and numbers, same learning objective) |
| "PM case" | **Separate PM module** with its own prompts, cases, sources and profile section |
| "end case" | Ends the case and runs the debrief |

The buttons in the top bar do the same things.

## How it works

```
                        ┌───────────────┐
 candidate message ───▶ │ Router        │ explicit commands (regex) → LLM fallback
                        └──────┬────────┘
                               ▼
┌──────────────┐   ┌──────────────────────────┐   ┌───────────────────┐
│ Case manager │──▶│ Case-state analyzer (LLM) │──▶│ Intervention      │
│ (selection,  │   │ sees the FULL hidden case │   │ policy (code)     │
│  generation) │   │ → structured assessment   │   │ • hint ladder 0-3 │
└──────────────┘   └──────────────────────────┘   │ • release caps    │
                                                  │ • directive       │
                                                  └────────┬──────────┘
                                                           ▼
                                      ┌────────────────────────────────────┐
                                      │ Interviewer (LLM)                  │
                                      │ sees ONLY opening + revealed facts │
                                      │ + this turn's directive            │
                                      └────────┬───────────────────────────┘
                                               ▼
                                      Leak guard (code) → candidate
                        case complete ─▶ Coach (LLM) debrief ─▶ Learner profile
```

- **Separation of hidden and visible information is architectural.** The interviewer model never receives the reference solution, key insights or unreleased data, so it can't leak them. The analyzer (which sees everything) decides what to release; code validates the ids, caps releases (≤1 exhibit, ≤3 data items per turn) and records them in the case state. A deterministic leak guard then checks the interviewer's reply for unreleased numbers or phrases from the insights. If it finds any, it regenerates the reply, or falls back to a probe.
- **Graduated intervention is enforced in code** (`server/engine/policy.js`): level 0 no help → 1 probe → 2 small hint → 3 stronger hint, escalating at most one step per turn within a stuck episode. Level 3 needs two consecutive stuck turns. Mock mode caps at level 2. Level 4 (teaching) happens only on an explicit "teach me" request, and it's recorded, so the debrief knows.
- **Frameworks are not scripts.** The analyzer flags generic framework dumps. The interviewer is then told not to praise them and to ask which branch, why, and what the hypothesis is for this client. Valid alternative paths are assessed on their logic, not against the casebook path.
- **Quant**: arithmetic is checked against the case data. A wrong number first gets "walk me through it" (self-correction); a second miss gets a pointer to the step. A correct number without interpretation gets "So what does that tell you?".
- **Exhibits** are rendered by the UI from structured data (tables and SVG bar/line charts). The interviewer only hands them over ("What stands out?"). It never interprets them.
- **Debrief** (`server/prompts/coach.js`): biggest takeaway, what you did well, biggest problem, what you missed, a stronger approach, next skill, redo or move on, and a next-case reminder. Every point must reference what you actually said. The coach also tags skills categorically (strength / adequate / gap) and uses a fixed set of mistake tags.
- **Learner profile** (`var/profile.json`): per-skill observation history, recurring mistake tags, hint usage, case mix and redo flags. **No overall score.** Difficulty adapts **per dimension** (structuring, ambiguity, quant, exhibit, prioritisation, hypothesis, communication, industry unfamiliarity). A strength in quant makes the next cases heavier on quant. A weakness in prioritisation is handled by *selecting cases that stress it*, not by making everything easier.
- **Case selection** (`server/cases/selector.js`) filters on your request, never repeats a completed case (it writes a new one with the generator instead), penalises recently seen types and industries, matches difficulty dimensions to your targets, and boosts cases that test your weak skills.

## Source material

Put your documents in `sources/consulting/` (Issac Jojy chapters, ICON IIMB casebook, industry reports, checklists, your cheat sheets) and PM material in `sources/pm/`. PDF, DOCX, PPTX, TXT and MD are supported. Then:

```
npm run ingest          # extract text → chunk → BM25 retrieval index (also runs at server start)
npm run extract-cases   # casebook documents → interactive case objects (uses the LLM)
```

- **Retrieval** is per task and per module. Teaching, debriefs and case generation pull only the few relevant chunks from `consulting`. PM pulls only from `pm`. The live interviewer never gets retrieval, so a live case can't be contaminated by other documents or spoiled by the casebook.
- **Casebook ingestion** converts each case in a casebook (write-up or interviewer/candidate transcript) into a case object: opening, clarifications, progressively released data, exhibits, calculations, the documented solution, *alternative approaches* and interviewer notes. The casebook solution becomes one reference path, not an answer key.
- File names decide how a document is used: `casebook` / `prep book` / `ICON` / `transcript` → casebook; `industry` / `report` / `sector` → industry report; anything else → guide. `sources/` is git-ignored so private course material isn't pushed to this public repository.
- Until you add sources, the app runs on 20 **original seed cases** in `data/cases/seed/`: profitability, operations, growth, market entry, M&A/PE, pricing, strategy, unconventional/public policy and 6 guesstimates, across mostly Indian and non-textbook industries. It also uses built-in practice notes in `data/knowledge/`. The seed cases are written for this app and are not taken from the ICON casebook.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Anthropic API key. If unset, the app uses a locally installed, logged-in `claude` CLI |
| `CASE_BUDDY_PROVIDER` | auto | `anthropic`, `claude-cli` or `mock` (tests) |
| `CASE_BUDDY_MODEL` | `claude-opus-5` | Model for all roles |
| `CASE_BUDDY_EFFORT_*` | interviewer `low`, analyzer `medium`, coach `high` | Per-role effort (`INTERVIEWER`, `ANALYZER`, `COACH`, `TEACHER`, `GENERATOR`, `ROUTER`, `DRILL`) |
| `CASE_BUDDY_FALLBACKS` | `on` | Server-side refusal fallbacks on the Anthropic API |
| `PORT` | `3000` | HTTP port |

Secrets stay on the server; the browser only talks to `/api/*`.

## Development

```
npm test               # deterministic tests (mock model): routing, hint ladder, release gating, leak guard,
                       # hidden-info separation, mock-mode rules, selection, profile adaptation, PM isolation
npm run simulate       # scripted candidate against the real model (behavioural scenarios A–J)
```

Layout: `server/engine/` (session manager, policy, router, coaching, drills, PM), `server/prompts/` (a separate prompt per role), `server/cases/` (library, selector, generator), `server/learner/` (profile), `server/knowledge/` (ingestion, retrieval), `data/` (seed cases, drills, PM questions, built-in notes), `public/` (UI).
