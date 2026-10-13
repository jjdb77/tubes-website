// Klantportaal van de Budget Planner (/resources/budget-planner/portal/).
// Praat alleen met de eigen server: /api/portal (account) en /api/portal/v1
// (producties, dezelfde API als de desktop-app, hier met de sessiecookie).
// Elke wijzigende aanroep stuurt X-Requested-With mee; zonder die header
// weigert de server een sessie-aanroep (CSRF).
(() => {
  const root = document.querySelector("[data-bp-portal]");
  if (!root) return;

  const BASE = "/api/portal";
  const API = `${BASE}/v1`;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n, cur) => (n == null ? "-" : `${cur || ""} ${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`.trim());
  const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");
  const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  const LABELS = {
    format: { feature_film: "Feature film", short_film: "Short film", documentary: "Documentary", drama_series: "Drama series", commercial: "Commercial", other: "Other" },
    budget_level: { modest: "Modest", mid: "Mid", high: "High" },
    start_phase: { development: "Development", preproduction: "Pre-production", shoot: "Shoot", post: "Post-production" },
    status: { submitted: ["Submitted", "chip-amber"], in_progress: ["In progress", "chip-blue"], delivered: ["Delivered", "chip-mint"] },
    kind: { script: "Script", treatment: "Treatment", synopsis: "Synopsis", brief: "Brief", other: "Other" },
  };

  async function call(path, { method = "GET", body, form } = {}) {
    const headers = { "X-Requested-With": "portal" };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(path, { method, headers, body: payload, credentials: "same-origin" });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* geen JSON */
    }
    if (!res.ok) throw new Error((data && data.error) || `Something went wrong (${res.status}).`);
    return data;
  }

  const state = { company: null, apiKey: null, jobs: [], revealed: null, notice: null, showForm: false, pendingDocs: [] };

  // ---------- Weergave ----------

  function render() {
    root.innerHTML = state.company ? portalHtml() : authHtml();
    bind();
    root.querySelectorAll("[data-bp-downloads]").forEach((el) => window.BudgetPlannerDownloads?.mount(el));
  }

  function authHtml() {
    return `
<div class="bp-auth">
  <div class="bp-card" id="signup">
    <h2>Create an account</h2>
    <p class="bp-card-intro">One account per company. You get a connection code for the app and a place where your productions and budgets come back.</p>
    <form class="bp-form" data-bp-form="signup">
      <label>Company name <span class="req">(required)</span><input type="text" name="company" required maxlength="200" autocomplete="organization"></label>
      <label>Contact name <span class="req">(required)</span><input type="text" name="contact" required maxlength="200" autocomplete="name"></label>
      <label>Email address <span class="req">(required)</span><input type="email" name="email" required maxlength="200" autocomplete="email"></label>
      <label>Password <span class="req">(at least 10 characters)</span><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
      <label class="bp-check"><input type="checkbox" name="consent" value="1" required> I agree that Tubes stores my company details, the documents I upload and the budgets that come back, as described in the <a href="/privacy/">privacy notice</a>.</label>
      <div class="button-row"><button type="submit" class="button button-primary">Create account</button></div>
      <p class="bp-status" data-bp-status></p>
    </form>
  </div>
  <div class="bp-card" id="login">
    <h2>Log in</h2>
    <p class="bp-card-intro">Already have an account? Log in to see your productions.</p>
    <form class="bp-form" data-bp-form="login">
      <label>Email address<input type="email" name="email" required maxlength="200" autocomplete="email"></label>
      <label>Password<input type="password" name="password" required autocomplete="current-password"></label>
      <div class="button-row"><button type="submit" class="button button-primary">Log in</button></div>
      <p class="bp-status" data-bp-status></p>
    </form>
    <p class="bp-small">Forgot your password? Email <a href="mailto:contact@tubes.media">contact@tubes.media</a> and we reset it for you.</p>
  </div>
</div>`;
  }

  function portalHtml() {
    const c = state.company;
    return `
<div class="bp-head">
  <div><h1>${esc(c.company)}</h1><p>${esc(c.contact)}, ${esc(c.email)}</p></div>
  <div class="bp-head-actions">
    <button type="button" class="button button-primary" data-bp-action="new">New production</button>
    <button type="button" class="button button-secondary" data-bp-action="logout">Log out</button>
  </div>
</div>
${state.notice ? `<div class="bp-banner ${state.notice.tone || ""}"><span>${esc(state.notice.text)}</span><button type="button" class="bp-link-button" data-bp-action="dismiss">Close</button></div>` : ""}
${c.verified ? "" : `<div class="bp-banner"><span>Your email address is not confirmed yet. Check your inbox for the confirmation link.</span><button type="button" class="bp-link-button" data-bp-action="resend">Send the link again</button></div>`}
<div class="bp-layout">
  <div class="bp-main">
    ${state.showForm ? newJobHtml() : ""}
    <h2 style="margin:0">Productions</h2>
    <div class="bp-jobs">
      ${state.jobs.length ? state.jobs.map(jobHtml).join("") : `<div class="bp-empty">No productions yet. Start with <strong>New production</strong>: upload your script, treatment or brief and tell us what you are making.</div>`}
    </div>
  </div>
  <aside class="bp-side">
    <div class="bp-card">
      <h3>Connection code</h3>
      <p class="bp-card-intro">Paste this code in the Budget Planner app (Settings, Portal) so the app can pick up your productions and return the budgets.</p>
      ${state.apiKey ? `<p>Current code: <span class="bp-key-id">bp_${esc(state.apiKey.id)}_&hellip;</span><br><small class="bp-help">Created ${esc(when(state.apiKey.created_at))}</small></p>` : `<p class="bp-help">No connection code yet.</p>`}
      ${state.revealed ? `<div class="bp-key-reveal"><p>Copy this code now. It is shown once; after that only its first part stays visible.</p><code data-bp-key>${esc(state.revealed)}</code><button type="button" class="button button-secondary" data-bp-action="copy">Copy</button></div>` : ""}
      <div class="button-row"><button type="button" class="button button-secondary" data-bp-action="regenerate">${state.apiKey ? "Generate a new code" : "Generate a code"}</button></div>
      ${state.apiKey ? `<p class="bp-small">A new code replaces the current one; the app then needs the new code.</p>` : ""}
    </div>
    <div class="bp-card bp-help">
      <h3>How it works</h3>
      <ol>
        <li>Submit a production with your documents.</li>
        <li>The Budget Planner app picks it up with your connection code and builds the budget, on your computer or on ours.</li>
        <li>The result comes back here: a budget file, a Tubes export and a summary. You can leave a remark on each one.</li>
      </ol>
    </div>
    <div class="bp-card" data-bp-downloads data-bp-gate="session">
      <h3>Download the app</h3>
      <p class="bp-card-intro">The Budget Planner for your computer. Logged in, so no download password needed.</p>
      <div data-bp-downloads-slot><p class="bp-help">Loading...</p></div>
    </div>
  </aside>
</div>`;
  }

  function newJobHtml() {
    const opt = (map, sel) => Object.entries(map).map(([v, l]) => `<option value="${v}"${v === sel ? " selected" : ""}>${l}</option>`).join("");
    return `
<div class="bp-card" id="new-production">
  <h3>New production</h3>
  <p class="bp-card-intro">Only the title is required. The more you give (documents, a few numbers, notes), the better the budget.</p>
  <form class="bp-form" data-bp-form="job">
    <label>Title <span class="req">(required)</span><input type="text" name="title" required maxlength="200"></label>
    <div class="bp-grid-3">
      <label>Format<select name="format">${opt(LABELS.format, "feature_film")}</select></label>
      <label>Genre<input type="text" name="genre" maxlength="120" placeholder="Drama, comedy, ..."></label>
      <label>Language of the budget<select name="language"><option value="en">English</option><option value="nl">Dutch</option></select></label>
    </div>
    <div class="bp-grid-4">
      <label>Length (minutes)<input type="number" name="length_minutes" min="0" step="1"></label>
      <label>Episodes<input type="number" name="episodes" min="0" step="1"></label>
      <label>Shooting days<input type="number" name="shooting_days" min="0" step="1" placeholder="If known"></label>
      <label>Currency<select name="currency"><option>EUR</option><option>GBP</option><option>USD</option><option>CHF</option><option>SEK</option><option>NOK</option><option>DKK</option></select></label>
    </div>
    <div class="bp-grid-4">
      <label>Budget level<select name="budget_level">${opt(LABELS.budget_level, "mid")}</select></label>
      <label>Target total<input type="number" name="target_total" min="0" step="1000" placeholder="e.g. 250000"></label>
      <label>Start at<select name="start_phase">${opt(LABELS.start_phase, "development")}</select></label>
      <label>Start date<input type="date" name="start_date"></label>
    </div>
    <div class="bp-grid-2">
      <label>Deadline<input type="date" name="deadline"></label>
      <label>Documents <span class="req">(.fdx, .pdf, .txt, .md; up to 20 MB each)</span><input type="file" data-bp-files multiple accept=".fdx,.pdf,.txt,.md"></label>
    </div>
    <ul class="bp-docs" data-bp-docs>${state.pendingDocs.map((d, i) => `<li><span class="bp-doc-name">${esc(d.file.name)}<small>${kb(d.file.size)}</small></span><select data-bp-kind="${i}">${opt(LABELS.kind, d.kind)}</select><button type="button" class="bp-remove" data-bp-remove="${i}" aria-label="Remove">&times;</button></li>`).join("")}</ul>
    <label>Notes<textarea name="notes" maxlength="5000" placeholder="What should the planner know? Locations you already have, crew you bring, things to leave out."></textarea></label>
    <div class="button-row"><button type="submit" class="button button-primary">Submit production</button><button type="button" class="button button-secondary" data-bp-action="cancel">Cancel</button></div>
    <p class="bp-status" data-bp-status></p>
  </form>
</div>`;
  }

  function jobHtml(j) {
    const [statusLabel, statusClass] = LABELS.status[j.status] || [j.status, "chip-slate"];
    const b = j.brief || {};
    const meta = [
      LABELS.format[b.format] || b.format,
      b.genre,
      b.length_minutes != null ? `${b.length_minutes} min` : null,
      b.episodes ? `${b.episodes} episodes` : null,
      b.shooting_days != null ? `${b.shooting_days} shooting days` : null,
      b.target_total != null ? `target ${money(b.target_total, b.currency)}` : null,
      LABELS.budget_level[b.budget_level] ? `${LABELS.budget_level[b.budget_level]} budget` : null,
      LABELS.start_phase[b.start_phase] ? `from ${LABELS.start_phase[b.start_phase].toLowerCase()}` : null,
      b.start_date ? `start ${b.start_date}` : null,
      b.deadline ? `deadline ${b.deadline}` : null,
    ].filter(Boolean);
    const r = j.result;
    const s = r && r.summary;
    return `
<article class="bp-job" data-job="${esc(j.id)}">
  <div class="bp-job-head">
    <div><h3>${esc(j.title)}</h3><p class="bp-job-meta">${esc(meta.join(" · "))}<br>Submitted ${esc(when(j.created_at))}${j.updated_at !== j.created_at ? `, updated ${esc(when(j.updated_at))}` : ""}</p></div>
    <span class="chip ${statusClass}">${statusLabel}</span>
  </div>
  ${b.notes ? `<p class="bp-job-notes">${esc(b.notes)}</p>` : ""}
  ${j.documents.length ? `<ul class="bp-job-docs">${j.documents.map((d) => `<li><a href="${API}/jobs/${esc(j.id)}/documents/${esc(d.id)}">${esc(d.name)} <small>${esc(LABELS.kind[d.kind] || d.kind)}, ${kb(d.size)}</small></a></li>`).join("")}</ul>` : ""}
  ${r ? `
  <div class="bp-result">
    <div class="bp-tiles">
      <div class="bp-tile"><small>Total</small><strong>${esc(money(s.total, s.currency || b.currency))}</strong></div>
      <div class="bp-tile"><small>Activities</small><strong>${s.activities ?? "-"}</strong></div>
      <div class="bp-tile"><small>Shooting days</small><strong>${s.shooting_days ?? "-"}</strong></div>
      <div class="bp-tile"><small>Budget lines</small><strong>${s.lines ?? "-"}</strong></div>
    </div>
    ${s.verdict ? `<p class="bp-verdict">Review: ${esc(s.verdict)}</p>` : ""}
    ${s.summary_text ? `<p class="bp-summary-text">${esc(s.summary_text)}</p>` : ""}
    <div class="button-row">
      <a class="button button-primary" href="${esc(r.downloads.budget)}">Download budget file</a>
      <a class="button button-secondary" href="${esc(r.downloads.tubes)}">Download Tubes export</a>
      ${r.downloads.pdf ? `<a class="button button-secondary" href="${esc(r.downloads.pdf)}">Download PDF</a>` : ""}
    </div>
    <p class="bp-help" style="margin:10px 0 0">Delivered ${esc(when(r.delivered_at))}. Open the budget file in the Budget Planner app; the Tubes export imports into Tubes.</p>
    <form class="bp-form bp-feedback" data-bp-form="feedback" data-job="${esc(j.id)}">
      <label>Your remark on this budget<textarea name="feedback" maxlength="5000" placeholder="What is off, what should change in a next run?">${esc(j.feedback || "")}</textarea></label>
      <div class="bp-feedback-row"><button type="submit" class="button button-secondary">Send remark</button><span class="bp-status" data-bp-status></span></div>
    </form>
  </div>` : `<p class="bp-help" style="margin:14px 0 0">${j.status === "in_progress" ? "The planner is working on this production." : "Waiting to be picked up by the Budget Planner app."}</p>`}
  <div class="bp-job-foot"><button type="button" class="bp-link-button is-danger" data-bp-delete="${esc(j.id)}">Delete production</button></div>
</article>`;
  }

  // ---------- Gedrag ----------

  const setStatus = (form, text, tone) => {
    const el = form.querySelector("[data-bp-status]");
    if (!el) return;
    el.textContent = text || "";
    el.className = `bp-status${tone ? ` is-${tone}` : ""}`;
  };
  const busy = (form, on) => form.querySelectorAll("button").forEach((b) => (b.disabled = on));

  async function refresh() {
    const s = await call(`${BASE}/session`);
    state.company = s.company;
    state.apiKey = s.apiKey || null;
    state.jobs = s.company ? await call(`${API}/jobs`) : [];
  }

  function bind() {
    root.querySelectorAll("form[data-bp-form]").forEach((form) => form.addEventListener("submit", onSubmit));
    root.querySelectorAll("[data-bp-action]").forEach((el) => el.addEventListener("click", onAction));
    root.querySelectorAll("[data-bp-delete]").forEach((el) => el.addEventListener("click", onDelete));
    const files = root.querySelector("[data-bp-files]");
    if (files) {
      files.addEventListener("change", () => {
        for (const f of files.files) state.pendingDocs.push({ file: f, kind: guessKind(f.name) });
        files.value = "";
        rerenderDocs();
      });
    }
    bindDocs();
  }
  function bindDocs() {
    root.querySelectorAll("[data-bp-kind]").forEach((sel) => sel.addEventListener("change", () => (state.pendingDocs[Number(sel.dataset.bpKind)].kind = sel.value)));
    root.querySelectorAll("[data-bp-remove]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.pendingDocs.splice(Number(btn.dataset.bpRemove), 1);
        rerenderDocs();
      })
    );
  }
  function rerenderDocs() {
    const list = root.querySelector("[data-bp-docs]");
    if (!list) return;
    const opt = (sel) => Object.entries(LABELS.kind).map(([v, l]) => `<option value="${v}"${v === sel ? " selected" : ""}>${l}</option>`).join("");
    list.innerHTML = state.pendingDocs.map((d, i) => `<li><span class="bp-doc-name">${esc(d.file.name)}<small>${kb(d.file.size)}</small></span><select data-bp-kind="${i}">${opt(d.kind)}</select><button type="button" class="bp-remove" data-bp-remove="${i}" aria-label="Remove">&times;</button></li>`).join("");
    bindDocs();
  }
  const guessKind = (name) => {
    const n = name.toLowerCase();
    if (/\.fdx$/.test(n) || /script|scenario|screenplay/.test(n)) return "script";
    if (/treatment/.test(n)) return "treatment";
    if (/synopsis|logline/.test(n)) return "synopsis";
    if (/brief|briefing/.test(n)) return "brief";
    return "other";
  };

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const kind = form.dataset.bpForm;
    const fd = new FormData(form);
    setStatus(form, "");
    busy(form, true);
    try {
      if (kind === "signup" || kind === "login") {
        const body = Object.fromEntries(fd.entries());
        if (kind === "signup") body.consent = Boolean(fd.get("consent"));
        const r = await call(`${BASE}/${kind}`, { method: "POST", body });
        state.notice = kind === "signup" ? { text: r.verificationMailed ? "Account created. We sent a confirmation link to your email address." : "Account created. Generate a connection code for the app and submit your first production.", tone: "is-ok" } : null;
        await refresh();
        render();
        return;
      }
      if (kind === "job") {
        if (!String(fd.get("title") || "").trim()) throw new Error("Give the production a title.");
        for (const d of state.pendingDocs) {
          if (d.file.size > 20 * 1024 * 1024) throw new Error(`${d.file.name} is larger than 20 MB.`);
          fd.append("documents", d.file, d.file.name);
          fd.append("documents_kind", d.kind);
        }
        setStatus(form, state.pendingDocs.length ? "Uploading..." : "Sending...");
        await call(`${API}/jobs`, { method: "POST", form: fd });
        state.pendingDocs = [];
        state.showForm = false;
        state.notice = { text: "Production submitted. You get an email as soon as the budget is ready.", tone: "is-ok" };
        await refresh();
        render();
        return;
      }
      if (kind === "feedback") {
        await call(`${API}/jobs/${form.dataset.job}/feedback`, { method: "POST", body: { feedback: fd.get("feedback") } });
        setStatus(form, "Remark saved.", "success");
        const job = state.jobs.find((j) => j.id === form.dataset.job);
        if (job) job.feedback = String(fd.get("feedback") || "");
      }
    } catch (err) {
      setStatus(form, err.message, "error");
    } finally {
      busy(form, false);
    }
  }

  async function onAction(e) {
    const action = e.currentTarget.dataset.bpAction;
    try {
      if (action === "logout") {
        await call(`${BASE}/logout`, { method: "POST" });
        Object.assign(state, { company: null, apiKey: null, jobs: [], revealed: null, notice: null, showForm: false, pendingDocs: [] });
        render();
      } else if (action === "new") {
        state.showForm = true;
        render();
        root.querySelector("#new-production input[name=title]")?.focus();
      } else if (action === "cancel") {
        state.showForm = false;
        state.pendingDocs = [];
        render();
      } else if (action === "dismiss") {
        state.notice = null;
        render();
      } else if (action === "resend") {
        const r = await call(`${BASE}/verify/resend`, { method: "POST" });
        state.notice = { text: r.verified ? "Your email address is already confirmed." : r.mailed ? "We sent the confirmation link again." : "Mail is not available right now; the portal works without confirmation.", tone: "is-ok" };
        render();
      } else if (action === "regenerate") {
        if (state.apiKey && !window.confirm("Generate a new connection code? The current code stops working and the app needs the new one.")) return;
        const r = await call(`${BASE}/api-key`, { method: "POST" });
        state.apiKey = { id: r.apiKey.id, created_at: r.apiKey.created_at };
        state.revealed = r.apiKey.key;
        render();
      } else if (action === "copy") {
        const code = root.querySelector("[data-bp-key]")?.textContent || "";
        try {
          await navigator.clipboard.writeText(code);
          e.currentTarget.textContent = "Copied";
        } catch {
          window.getSelection()?.selectAllChildren(root.querySelector("[data-bp-key]"));
        }
      }
    } catch (err) {
      state.notice = { text: err.message, tone: "is-error" };
      render();
    }
  }

  async function onDelete(e) {
    const btn = e.currentTarget;
    const id = btn.dataset.bpDelete;
    if (!btn.dataset.armed) {
      btn.dataset.armed = "1";
      btn.textContent = "Really delete? Click again";
      setTimeout(() => {
        if (btn.isConnected) {
          delete btn.dataset.armed;
          btn.textContent = "Delete production";
        }
      }, 4000);
      return;
    }
    try {
      await call(`${API}/jobs/${id}`, { method: "DELETE" });
      state.jobs = state.jobs.filter((j) => j.id !== id);
      render();
    } catch (err) {
      state.notice = { text: err.message, tone: "is-error" };
      render();
    }
  }

  // ---------- Start ----------
  const params = new URLSearchParams(location.search);
  if (params.get("verified") === "1") state.notice = { text: "Your email address is confirmed.", tone: "is-ok" };
  if (params.get("verified") === "0") state.notice = { text: "That confirmation link is not valid any more. Log in and ask for a new one.", tone: "is-error" };
  refresh()
    .catch(() => {})
    .then(() => {
      render();
      if (location.hash === "#signup" || location.hash === "#login") document.querySelector(location.hash)?.scrollIntoView({ block: "start" });
    });
})();
