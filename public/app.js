import { marked } from "/vendor/marked/marked.esm.js";

const $ = (s, el = document) => el.querySelector(s);
const messagesEl = $("#messages");
const input = $("#input");
const sendBtn = $("#send");
const side = $("#side-content");

let session = null;
let busy = false;
let timerHandle = null;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ------------------------------------------------------------------ rendering
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const md = (s) => marked.parse(escapeHtml(s).replace(/&gt;/g, ">"), { breaks: true });

const WHO = { interviewer: "Interviewer", candidate: "You", coach: "Coach", system: "" };
const COLORS = ["#1f4e79", "#d98a2b", "#4c9a6a", "#9b5aa8"];

function renderExhibit(ex) {
  const wrap = document.createElement("div");
  wrap.className = "exhibit";
  const unit = ex.unit && !ex.title.includes(ex.unit) ? ` <span class="hint-muted">(${escapeHtml(ex.unit)})</span>` : "";
  let body = "";
  if (ex.kind === "table") {
    body = `<table><thead><tr>${(ex.columns || []).map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${(ex.rows || [])
      .map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(typeof c === "number" ? c.toLocaleString("en-IN") : c)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  } else {
    body = chartSvg(ex);
  }
  wrap.innerHTML = `<h4>Exhibit: ${escapeHtml(ex.title)}${unit}</h4>${body}${ex.note ? `<div class="note">${escapeHtml(ex.note)}</div>` : ""}`;
  return wrap;
}

function chartSvg(ex) {
  const cats = ex.categories || [];
  const series = ex.series || [];
  const W = 640, H = 260, L = 44, R = 12, T = 12, B = 44;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 0) * 1.12 || 1;
  const min = Math.min(0, ...all);
  const y = (v) => T + (H - T - B) * (1 - (v - min) / (max - min));
  const bandW = (W - L - R) / Math.max(1, cats.length);
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4;
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" stroke-opacity=".12"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${+v.toFixed(1)}</text>`;
  }
  cats.forEach((c, i) => {
    g += `<text x="${L + bandW * (i + 0.5)}" y="${H - B + 16}" text-anchor="middle">${escapeHtml(c.length > 22 ? c.slice(0, 21) + "…" : c)}</text>`;
  });
  if (ex.kind === "bar") {
    const bw = (bandW * 0.7) / Math.max(1, series.length);
    series.forEach((s, si) => {
      s.values.forEach((v, i) => {
        const x = L + bandW * i + bandW * 0.15 + bw * si;
        g += `<rect x="${x}" y="${y(Math.max(v, 0))}" width="${bw - 2}" height="${Math.abs(y(v) - y(0))}" fill="${COLORS[si % 4]}" rx="2"><title>${escapeHtml(s.name)}: ${v}</title></rect>`;
        g += `<text x="${x + (bw - 2) / 2}" y="${y(Math.max(v, 0)) - 4}" text-anchor="middle">${v}</text>`;
      });
    });
  } else {
    series.forEach((s, si) => {
      const pts = s.values.map((v, i) => `${L + bandW * (i + 0.5)},${y(v)}`).join(" ");
      g += `<polyline points="${pts}" fill="none" stroke="${COLORS[si % 4]}" stroke-width="2.5"/>`;
      s.values.forEach((v, i) => {
        g += `<circle cx="${L + bandW * (i + 0.5)}" cy="${y(v)}" r="3.5" fill="${COLORS[si % 4]}"><title>${escapeHtml(s.name)}: ${v}</title></circle><text x="${L + bandW * (i + 0.5)}" y="${y(v) - 8}" text-anchor="middle">${v}</text>`;
      });
    });
  }
  const legend = `<div class="legend">${series.map((s, i) => `<span style="--c:${COLORS[i % 4]}">${escapeHtml(s.name)}</span>`).join("")}</div>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${escapeHtml(ex.title)}">${g}</svg>${legend}`;
}

function renderItem(it) {
  if (it.role === "exhibit") return renderExhibit(it.exhibit);
  const div = document.createElement("div");
  div.className = `msg ${it.role}`;
  const who = WHO[it.role] ?? "";
  const body = it.role === "candidate" ? escapeHtml(it.text) : md(it.text);
  const sources = it.sources?.length ? `<div class="sources">Sources: ${it.sources.map(escapeHtml).join(" · ")}</div>` : "";
  div.innerHTML = `${who ? `<div class="who">${who}</div>` : ""}<div class="bubble">${body}${sources}</div>`;
  return div;
}

function renderMessages() {
  messagesEl.innerHTML = "";
  if (!session) {
    messagesEl.appendChild(
      renderItem({
        role: "system",
        text: 'Ready when you are. Say **"give me a case"**, or pick something from the bar above. During a case, drive it like a real interview: clarify, structure, ask for what you need, and give a recommendation. Hints come only when you are genuinely stuck, and feedback comes after the case.',
      }),
    );
  } else {
    for (const it of session.transcript) messagesEl.appendChild(renderItem(it));
  }
  if (busy) {
    const t = document.createElement("div");
    t.className = "typing";
    t.textContent = busyLabel();
    messagesEl.appendChild(t);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function busyLabel() {
  if (session?.kind === "case" && session.status === "live") return "Interviewer is thinking…";
  return "Working on it…";
}

// ------------------------------------------------------------------ side panel
async function renderSide() {
  clearInterval(timerHandle);
  if (session?.kind === "case") {
    const h = session.header || {};
    const live = session.status === "live" || session.status === "teaching";
    let html = `<h3>${escapeHtml(h.label || "Case")}</h3>`;
    if (h.title) html += `<div class="kv"><b>${escapeHtml(h.title)}</b></div>`;
    if (h.industry) html += `<div class="kv">Industry: ${escapeHtml(h.industry)}</div>`;
    if (h.type) html += `<div class="kv">Type: ${escapeHtml(h.type.replace(/_/g, " "))}</div>`;
    if (live) html += `<h3>Elapsed</h3><div class="timer" id="timer">0:00</div>`;
    if (session.exhibits?.length) {
      html += `<h3>Exhibits shown</h3><div class="linklist">${session.exhibits.map((e, i) => `<button data-exhibit="${i}">${escapeHtml(e.title)}</button>`).join("")}</div>`;
    }
    if (live) {
      html += `<h3>Your notes</h3><textarea id="scratch" placeholder="Scratchpad (private, stays in this browser)">${escapeHtml(store.get(`scratch:${session.id}`) || "")}</textarea>`;
      html += `<h3></h3><button id="end-case">End case &amp; get debrief</button>`;
    }
    if (session.status === "debriefed" && session.debrief?.data) {
      const d = session.debrief.data;
      html += `<h3>Next</h3><div class="kv">Practise: <span class="pill">${escapeHtml(d.next_skill.replace(/_/g, " "))}</span></div>`;
      html += `<div class="kv">${d.redo.recommend ? "Redo recommended" : "Move on"}</div>`;
      html += `<div class="linklist" style="margin-top:10px">${d.redo.recommend ? `<button data-action="redo_case">Redo (transfer variant)</button>` : ""}<button data-action="new_case">Next case</button><button data-action="redo_weakest">Work on weakest skill</button></div>`;
      html += `<p class="hint-muted">Ask follow-up questions about this case in the chat, e.g. "walk me through the stronger approach".</p>`;
    }
    side.innerHTML = html;
    if (live) {
      const start = new Date(h.startedAt).getTime();
      const tick = () => {
        const s = Math.floor((Date.now() - start) / 1000);
        const el = $("#timer");
        if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      };
      tick();
      timerHandle = setInterval(tick, 1000);
      $("#scratch")?.addEventListener("input", (e) => store.set(`scratch:${session.id}`, e.target.value));
      $("#end-case")?.addEventListener("click", () => act("end_case"));
    }
    side.querySelectorAll("[data-exhibit]").forEach((b) =>
      b.addEventListener("click", () => {
        const ex = session.exhibits[Number(b.dataset.exhibit)];
        $("#exhibit-dialog-title").textContent = ex.title;
        const body = $("#exhibit-dialog-body");
        body.innerHTML = "";
        body.appendChild(renderExhibit(ex));
        $("#exhibit-dialog").showModal();
      }),
    );
    return;
  }
  if (session?.kind === "drill" || session?.kind === "pm") {
    const live = session.status === "live";
    side.innerHTML = `<h3>${escapeHtml(session.header?.label || "")}</h3><p class="hint-muted">${
      session.kind === "pm" ? "PM practice is a separate module. It doesn't mix with consulting case practice or your consulting profile." : "A short, focused exercise. Answer as you would in an interview."
    }</p>${live && session.kind === "pm" ? `<button id="end-case">End & get feedback</button>` : ""}`;
    $("#end-case")?.addEventListener("click", () => act("end_case"));
    return;
  }
  // idle / other: show the learner profile patterns
  try {
    const [p, status] = await Promise.all([api("GET", "/api/profile"), api("GET", "/api/status")]);
    const rows = Object.values(p.skills)
      .sort((a, b) => a.level - b.level)
      .map((s) => `<div class="skill-row"><span>${escapeHtml(s.label)}</span><span class="trend">${s.recentGaps ? `${s.recentGaps} recent gap${s.recentGaps > 1 ? "s" : ""}` : s.recentStrengths ? "reliable" : "mixed"} · ${s.trend}</span></div>`)
      .join("");
    side.innerHTML = `<h3>Your patterns</h3>${
      rows || `<p class="hint-muted">No completed cases yet. Patterns appear here after a few cases. There's no overall score.</p>`
    }<p class="hint-muted" style="margin-top:10px">${p.cases} case(s) · ${p.drills} drill(s)</p>
    <h3>Setup</h3><div class="hint-muted">Model: ${escapeHtml(status.model)} via ${escapeHtml(status.provider)}<br>Case library: ${status.library.total} cases (${Object.entries(status.library.bySource).map(([k, v]) => `${escapeHtml(k.replace(/ \(.*/, ""))}: ${v}`).join(", ")})<br>Source documents indexed: ${status.sources.consulting} consulting, ${status.sources.pm} PM${status.sources.documents ? "" : '<br><br>No source PDFs ingested yet. Drop them in <code>sources/consulting</code> and <code>sources/pm</code>, then run <code>npm run ingest</code>.'}</div>`;
  } catch {
    side.innerHTML = "";
  }
}

// ------------------------------------------------------------------ API
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function setBusy(v) {
  busy = v;
  sendBtn.disabled = v;
  input.disabled = v;
  renderMessages();
  if (!v) input.focus();
}

function showError(e) {
  const div = document.createElement("div");
  div.className = "error";
  div.textContent = `Something went wrong: ${e.message}`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function adopt(view) {
  if (!view) return;
  session = view;
  store.set("sessionId", view.id);
}

async function send(text) {
  if (!text.trim() || busy) return;
  // optimistic echo
  if (session) session.transcript = [...session.transcript, { role: "candidate", text }];
  else session = { transcript: [{ role: "candidate", text }] };
  setBusy(true);
  try {
    adopt(await api("POST", "/api/message", { sessionId: store.get("sessionId"), text }));
  } catch (e) {
    setBusy(false);
    showError(e);
    return;
  }
  setBusy(false);
  renderSide();
}

async function act(action, options = {}) {
  if (busy) return;
  closeMenus();
  setBusy(true);
  try {
    adopt(await api("POST", "/api/action", { action, sessionId: store.get("sessionId"), options }));
  } catch (e) {
    setBusy(false);
    showError(e);
    return;
  }
  setBusy(false);
  renderSide();
}

// ------------------------------------------------------------------ events
$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value;
  input.value = "";
  send(text);
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("#composer").requestSubmit();
  }
});

function closeMenus() {
  document.querySelectorAll(".dropdown.open").forEach((d) => d.classList.remove("open"));
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return closeMenus();
  if (t.dataset.menu) {
    const dd = document.getElementById(t.dataset.menu);
    const open = dd.classList.contains("open");
    closeMenus();
    if (!open) dd.classList.add("open");
    return;
  }
  if (t.dataset.action) return act(t.dataset.action);
  if (t.dataset.caseType) return act("new_case", { caseType: t.dataset.caseType });
  if (t.dataset.caseVariant === "harder") return act("new_case", { difficulty: "harder" });
  if (t.dataset.caseVariant === "short") return act("new_case", { length: "short" });
  if (t.dataset.drill) return act("drill", { skill: t.dataset.drill });
  if (t.dataset.open === "history") return openHistory();
  if (t.hasAttribute("data-close")) return t.closest("dialog").close();
});

async function openHistory() {
  closeMenus();
  const rows = await api("GET", "/api/history");
  $("#history-body").innerHTML = rows.length
    ? `<table class="history-table"><thead><tr><th>Date</th><th>Case</th><th>Type · industry</th><th>Difficulty</th><th>Strength</th><th>Main weakness</th><th>Redo?</th></tr></thead><tbody>${rows
        .map(
          (r) => `<tr><td>${new Date(r.date).toLocaleDateString()}</td><td>${escapeHtml(r.title)}${r.mode === "mock" ? ' <span class="pill">mock</span>' : ""}${r.completed ? "" : ' <span class="pill">abandoned</span>'}</td><td>${escapeHtml((r.type || "").replace(/_/g, " "))} · ${escapeHtml(r.industry)}</td><td>${escapeHtml(r.difficulty || "")}</td><td>${escapeHtml(r.strengths?.[0] || "")}</td><td>${escapeHtml(r.weakness || "")}</td><td>${r.redo ? (r.redo.recommend ? "Yes" : "No") : ""}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : `<p class="hint-muted">No cases yet.</p>`;
  $("#history").showModal();
}

// ------------------------------------------------------------------ boot
(async () => {
  const id = store.get("sessionId");
  if (id) {
    try {
      const v = await api("GET", `/api/session/${id}`);
      if (v) session = v;
    } catch {}
  }
  renderMessages();
  renderSide();
  input.focus();
})();
