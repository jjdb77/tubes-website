// Downloadknoppen van de Budget Planner-installers, achter een wachtwoord.
// Gebruikt op de landingspagina (/resources/budget-planner/, met
// wachtwoordveld) en in het portaal (ingelogd = ontgrendeld, geen wachtwoord).
//
// Mountpunt: een element met data-bp-downloads. Het script vraagt
// GET /api/portal/downloads; 401 betekent "nog niet ontgrendeld" en toont dan
// het wachtwoordveld (POST /api/portal/download-access zet een getekende
// cookie van 7 dagen). Daarna staan de drie knoppen er met versie en grootte;
// een installer die nog niet is geüpload staat er als uitgeschakelde knop.
(() => {
  const BASE = "/api/portal";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mb = (n) => (n == null ? "" : `${(n / 1024 / 1024).toFixed(n >= 100 * 1024 * 1024 ? 0 : 1)} MB`);

  async function call(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json", "X-Requested-With": "downloads" } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* geen JSON */
    }
    return { status: res.status, data };
  }

  function buttonsHtml(list) {
    const any = list.some((d) => d.available);
    return `
<div class="bp-downloads">
  ${list
    .map((d, i) => {
      const cls = i === 0 ? "button-primary" : "button-secondary";
      if (!d.available) return `<span class="button ${cls} is-disabled" aria-disabled="true"><span>${esc(d.label)}</span><small>${esc(d.hint)}, not available yet</small></span>`;
      return `<a class="button ${cls}" href="${BASE}/download/${esc(d.id)}" download><span>${esc(d.label)}</span><small>${esc(d.hint)}${d.version ? `, version ${esc(d.version)}` : ""}${d.size ? `, ${mb(d.size)}` : ""}</small></a>`;
    })
    .join("")}
</div>
${any ? "" : `<p class="bp-help" style="margin-top:12px">The installers are being prepared. Check back soon.</p>`}`;
  }

  function gateHtml() {
    return `
<form class="bp-form bp-gate" data-bp-gate-form>
  <label>Download password<input type="password" name="password" required autocomplete="off" placeholder="Password from your invitation"></label>
  <div class="bp-gate-row"><button type="submit" class="button button-primary">Unlock downloads</button><span class="bp-status" data-bp-status></span></div>
</form>`;
  }

  async function mount(el) {
    if (!el || el.dataset.bpMounted) return;
    el.dataset.bpMounted = "1";
    const target = el.querySelector("[data-bp-downloads-slot]") || el;
    const { status, data } = await call(`${BASE}/downloads`);
    if (status === 200 && data?.downloads) {
      target.innerHTML = buttonsHtml(data.downloads);
      return;
    }
    if (el.dataset.bpGate !== "password") {
      target.innerHTML = `<p class="bp-help">Log in to see the downloads.</p>`;
      return;
    }
    target.innerHTML = gateHtml();
    const form = target.querySelector("[data-bp-gate-form]");
    const statusEl = form.querySelector("[data-bp-status]");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      statusEl.textContent = "";
      statusEl.className = "bp-status";
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        const r = await call(`${BASE}/download-access`, { password: new FormData(form).get("password") });
        if (r.status === 200 && r.data?.downloads) {
          target.innerHTML = buttonsHtml(r.data.downloads);
          return;
        }
        statusEl.textContent = r.data?.error || `Something went wrong (${r.status}).`;
        statusEl.className = "bp-status is-error";
      } catch {
        statusEl.textContent = "Could not reach the server.";
        statusEl.className = "bp-status is-error";
      } finally {
        button.disabled = false;
      }
    });
  }

  window.BudgetPlannerDownloads = { mount };
  const start = () => document.querySelectorAll("[data-bp-downloads]").forEach(mount);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
