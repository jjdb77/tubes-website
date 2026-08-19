// Mobiel menu
const toggle = document.querySelector(".nav-toggle");
if (toggle) {
  toggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

// Spotlaag in donkere en blauwe secties (de spots dwalen zelf, via CSS)
for (const section of document.querySelectorAll(".section.theme-dark, .section.theme-teal")) {
  const layer = document.createElement("span");
  layer.className = "spot-layer";
  layer.setAttribute("aria-hidden", "true");
  section.prepend(layer);
}

// Levende pipeline: chips lichten om de beurt op
if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  for (const row of document.querySelectorAll(".chip-row")) {
    const chips = row.querySelectorAll(".chip");
    if (chips.length < 2) continue;
    let i = 0;
    chips[0].classList.add("is-current");
    setInterval(() => {
      chips[i].classList.remove("is-current");
      i = (i + 1) % chips.length;
      chips[i].classList.add("is-current");
    }, 2200);
  }
}

// Module-tour: tabs wisselen
for (const tour of document.querySelectorAll("[data-tour]")) {
  const tabs = tour.querySelectorAll(".tour-tab");
  const panels = tour.querySelectorAll(".tour-panel");
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t, j) => {
        t.classList.toggle("is-active", i === j);
        t.setAttribute("aria-selected", i === j ? "true" : "false");
      });
      panels.forEach((p, j) => {
        p.classList.toggle("is-active", i === j);
        if (i === j) { p.removeAttribute("hidden"); } else { p.setAttribute("hidden", ""); }
      });
    });
  });
}

// Secties zachtjes laten opkomen bij het scrollen (niet bij reduced motion)
if (!matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
  // Artikelen doen niet mee: hun tekst is één heel lang blok, en die mag niet
  // van JavaScript afhangen om zichtbaar te worden.
  const targets = document.querySelectorAll(".section:not(.section-hero):not(.article) .container");
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    }
  }, { rootMargin: "0px 0px -60px 0px", threshold: 0.05 });
  for (const el of targets) {
    el.classList.add("reveal");
    io.observe(el);
  }
}

// Contactformulier: verstuurt naar form_endpoint (bijv. Formspree/Web3Forms).
// Zonder endpoint valt het terug op een mailto-link.
for (const form of document.querySelectorAll(".contact-form")) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = form.querySelector(".form-status");
    const data = new FormData(form);
    const endpoint = form.dataset.endpoint;

    if (!endpoint) {
      const subject = encodeURIComponent("Demo request via tubes.media");
      const body = encodeURIComponent(
        `Name: ${data.get("first_name")} ${data.get("last_name")}\n` +
        `Email: ${data.get("email")}\n` +
        `Phone: ${data.get("phone") || "-"}\n\n` +
        `${data.get("message")}`
      );
      window.location.href = `mailto:${form.dataset.email}?subject=${subject}&body=${body}`;
      return;
    }

    status.textContent = "Sending…";
    status.className = "form-status";
    data.set("page", location.pathname);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: new URLSearchParams(data),
        headers: { Accept: "application/json" }
      });
      if (res.ok) {
        form.reset();
        status.textContent = "Thank you! We'll get back to you shortly.";
        status.className = "form-status is-success";
      } else {
        throw new Error("Request failed");
      }
    } catch (err) {
      status.textContent = "Something went wrong. Please email us directly at " + form.dataset.email;
      status.className = "form-status is-error";
    }
  });
}

// Prijzen in lokale valuta: land wordt via IP gedetecteerd (ipapi.co), koers
// ligt vast (14-08-2026) i.p.v. live opgehaald. Bezoeker kan de detectie
// overrulen via het valuta-veld onder het bedrag; keuze blijft staan via
// localStorage. Werkt door steeds vanuit de originele (Engelse) HTML met
// €-bedragen te starten, dus wisselen van valuta kan geen rondingsfouten
// opstapelen. Reset-bereik is .plan-price/.plan-price-detail, niet de hele
// kaart: het valutaveld staat zelf ook in de kaart en zou anders bij elke
// omrekening zijn eigen DOM-node (en dus de event listener) vernietigen.
(function () {
  const priceElements = document.querySelectorAll(".plan-price, .plan-price-detail");
  const selects = document.querySelectorAll(".currency-select");
  if (!priceElements.length) return;

  const CURRENCIES = {
    EUR: { rate: 1, format: (n) => `€ ${n}` },
    USD: { rate: 1.1525, format: (n) => `$${n}` },
    GBP: { rate: 0.8541, format: (n) => `£${n}` },
    CAD: { rate: 1.6064, format: (n) => `C$${n}` },
    AUD: { rate: 1.6335, format: (n) => `A$${n}` },
    DKK: { rate: 7.4758, format: (n) => `kr ${n}` },
  };
  // Eurolanden houden € (geen omrekening nodig); GB/AU/CA/DK krijgen hun
  // eigen valuta; alle overige landen vallen terug op dollars.
  const EUROZONE = new Set(["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"]);
  const COUNTRY_CURRENCY = { GB: "GBP", AU: "AUD", CA: "CAD", DK: "DKK" };
  function currencyForCountry(code) {
    if (EUROZONE.has(code)) return "EUR";
    return COUNTRY_CURRENCY[code] || "USD";
  }

  const originalHTML = new Map();
  for (const el of priceElements) originalHTML.set(el, el.innerHTML);

  function convertText(text, code) {
    const currency = CURRENCIES[code];
    return text.replace(/€\s?(\d+)/g, (match, amount) => currency.format(Math.round(parseInt(amount, 10) * currency.rate)));
  }

  function applyCurrency(code) {
    for (const el of priceElements) {
      el.innerHTML = originalHTML.get(el);
      if (code === "EUR") continue;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      let node;
      while ((node = walker.nextNode())) textNodes.push(node);
      for (const textNode of textNodes) {
        if (textNode.nodeValue.includes("€")) textNode.nodeValue = convertText(textNode.nodeValue, code);
      }
    }
  }

  function detectAndApply() {
    const cachedCode = localStorage.getItem("tubes_currency_auto");
    const cachedAt = parseInt(localStorage.getItem("tubes_currency_auto_at") || "0", 10);
    if (cachedCode && Date.now() - cachedAt < 24 * 60 * 60 * 1000) {
      applyCurrency(cachedCode);
      return;
    }
    fetch("https://ipapi.co/json/")
      .then((res) => res.json())
      .then((data) => {
        const code = currencyForCountry(data.country_code);
        localStorage.setItem("tubes_currency_auto", code);
        localStorage.setItem("tubes_currency_auto_at", String(Date.now()));
        applyCurrency(code);
      })
      .catch(() => {}); // geolocatie mislukt: gewoon € laten staan
  }

  for (const select of selects) {
    select.addEventListener("change", () => {
      const choice = select.value;
      localStorage.setItem("tubes_currency_choice", choice);
      for (const other of selects) other.value = choice;
      if (choice === "auto") detectAndApply();
      else applyCurrency(choice);
    });
  }

  const savedChoice = localStorage.getItem("tubes_currency_choice") || "auto";
  for (const select of selects) select.value = savedChoice;
  if (savedChoice === "auto") detectAndApply();
  else applyCurrency(savedChoice);
})();

// Demo-popup: knoppen naar /contact/ openen het formulier als popup
const demoModal = document.getElementById("demo-modal");
if (demoModal && typeof demoModal.showModal === "function") {
  for (const link of document.querySelectorAll('a.button[href$="/contact/"]')) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      demoModal.showModal();
    });
  }
  demoModal.querySelector(".demo-modal-close").addEventListener("click", () => demoModal.close());
  demoModal.addEventListener("click", (e) => {
    if (e.target === demoModal) demoModal.close();
  });
}

// ---------------------------------------------------------------------------
// Gebeurtenissen doorgeven aan de statistieken.
//
// De site heeft geen eigen analytics-platform: als er een GoatCounter-code in
// de instellingen staat, laadt layout.njk dat script. We voegen dus niets
// nieuws toe, we melden alleen gebeurtenissen aan wat er al is (GoatCounter en,
// als iemand later een tagmanager toevoegt, dataLayer). Het CustomEvent maakt
// het bovendien mogelijk om er van buitenaf op te luisteren.
// ---------------------------------------------------------------------------

const pendingEvents = [];

function flushEvents() {
  if (!window.goatcounter || typeof window.goatcounter.count !== "function") return;
  while (pendingEvents.length) {
    const name = pendingEvents.shift();
    window.goatcounter.count({ path: name, title: name, event: true });
  }
}

function track(name, meta) {
  pendingEvents.push(name);
  flushEvents();
  if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: name, ...meta });
  document.dispatchEvent(new CustomEvent("tubes:track", { detail: { name, ...meta } }));
}

// GoatCounter laadt async; wat daarvoor gebeurde sturen we alsnog na.
addEventListener("load", () => {
  flushEvents();
  setTimeout(flushEvents, 1500);
});

// ---------------------------------------------------------------------------
// Health Check: tweestapsformulier (/production-finance-health-check/)
//
// Stap 1 vraagt alleen het zakelijke e-mailadres en slaat dat meteen op, zodat
// een half ingevuld formulier toch een spoor achterlaat. Stap 2 vult de rest
// aan en verwijst met lead_id naar die eerste regel, zodat de beheerpagina er
// één aanvraag van maakt. Beide formulieren op de pagina (hero en slot) lopen
// gelijk op: wie boven begint, ziet onderaan dezelfde stap terug.
// ---------------------------------------------------------------------------

const hcForms = Array.from(document.querySelectorAll("[data-hc-form]"));

if (hcForms.length) {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const state = { leadId: "", requestId: "", email: "", step: 1, done: false, emailTracked: false };

  // Wordt verderop gevuld door de vaste knop op mobiel: zodra iemand aan
  // stap 2 begint of klaar is, hoeft die knop er niet meer te staan.
  let refreshSticky = () => {};

  const stepOf = (form, n) => form.querySelector(`[data-hc-step="${n}"]`);
  const statusOf = (form) => form.querySelector(".hc-status");

  function setStatus(form, text, kind) {
    const el = statusOf(form);
    if (!el) return;
    el.textContent = text || "";
    el.className = "form-status hc-status" + (kind ? " is-" + kind : "");
  }

  function showStep(n) {
    state.step = n;
    refreshSticky();
    for (const form of hcForms) {
      stepOf(form, 1).hidden = n !== 1;
      stepOf(form, 2).hidden = n !== 2;
      const email = form.querySelector('input[name="email"]');
      if (email && state.email) email.value = state.email;
      setStatus(form, "");
    }
  }

  function showDone(activeForm) {
    state.done = true;
    document.body.classList.add("hc-submitted");
    for (const form of hcForms) {
      stepOf(form, 1).hidden = true;
      stepOf(form, 2).hidden = true;
      setStatus(form, "");
      const done = form.querySelector("[data-hc-done]");
      if (done) done.hidden = false;
      // De vragenlijst staat op een eigen pagina; met ?ref weet die pagina
      // bij welke aanvraag de antwoorden horen.
      const link = form.querySelector("[data-hc-assess-link]");
      if (link && state.requestId) {
        link.href = "/production-finance-health-check/assessment/?ref=" + encodeURIComponent(state.requestId);
      }
      const privacy = form.querySelector(".hc-privacy");
      if (privacy) privacy.hidden = true;
    }
    refreshSticky();
    const heading = activeForm.querySelector(".hc-done-title");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  function invalid(input, message, form) {
    input.setAttribute("aria-invalid", "true");
    setStatus(form, message, "error");
    input.focus();
  }

  async function post(payload) {
    const body = new URLSearchParams(payload);
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 12000);
    let res;
    try {
      res = await fetch("/api/health-check", {
        method: "POST",
        body,
        signal: stop.signal,
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }
      });
    } finally {
      clearTimeout(timer);
    }
    let data = {};
    try { data = await res.json(); } catch { /* geen JSON terug */ }
    if (!res.ok || !data.ok) throw new Error(data.error || "request-failed");
    return data;
  }

  for (const form of hcForms) {
    const emailInput = form.querySelector('input[name="email"]');

    emailInput.addEventListener("input", () => {
      emailInput.removeAttribute("aria-invalid");
      state.email = emailInput.value.trim();
    });

    // "Email entered": één keer per bezoek, zodra er een bruikbaar adres staat.
    emailInput.addEventListener("blur", () => {
      if (state.emailTracked) return;
      if (!EMAIL_RE.test(emailInput.value.trim())) return;
      state.emailTracked = true;
      track("health-check-email-entered");
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (state.done) return;

      const button = form.querySelector(".hc-step:not([hidden]) .hc-submit");
      const data = new FormData(form);

      // ---- Stap 1: alleen het e-mailadres ----
      if (state.step === 1) {
        const email = String(data.get("email") || "").trim();
        if (!EMAIL_RE.test(email)) {
          invalid(emailInput, "Please enter a valid business email address so we can send your Health Check details.", form);
          return;
        }
        state.email = email;
        if (!state.emailTracked) {
          state.emailTracked = true;
          track("health-check-email-entered");
        }

        if (button) button.disabled = true;
        setStatus(form, "One moment…");
        try {
          const result = await post({
            stage: "email",
            email,
            company_website: String(data.get("company_website") || ""),
            page: location.pathname
          });
          state.leadId = result.id || "";
          track("health-check-email-captured");
        } catch (err) {
          // Opslaan lukte niet. We houden de bezoeker niet tegen: bij stap 2
          // gaat het e-mailadres gewoon opnieuw mee. Er wordt niets bevestigd
          // wat niet is aangekomen, want stap 2 is nog geen bevestiging.
          state.leadId = "";
        }
        if (button) button.disabled = false;
        showStep(2);
        track("health-check-assessment-started");
        const name = form.querySelector('input[name="name"]');
        if (name) name.focus({ preventScroll: true });
        // Stap 2 is hoger dan stap 1; als het formulier daardoor half uit
        // beeld valt, halen we het terug.
        const top = form.getBoundingClientRect().top;
        if (top < 90 || top > window.innerHeight - 160) {
          form.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      // ---- Stap 2: naam, bedrijf en de twee vragen ----
      const name = String(data.get("name") || "").trim();
      const company = String(data.get("company") || "").trim();
      const nameInput = form.querySelector('input[name="name"]');
      const companyInput = form.querySelector('input[name="company"]');

      if (!name) {
        invalid(nameInput, "Please add your name so we know who we are meeting.", form);
        return;
      }
      nameInput.removeAttribute("aria-invalid");
      if (!company) {
        invalid(companyInput, "Please add your company so we can prepare for the session.", form);
        return;
      }
      companyInput.removeAttribute("aria-invalid");

      if (button) button.disabled = true;
      setStatus(form, "Sending your request…");
      try {
        const done = await post({
          stage: "complete",
          lead_id: state.leadId,
          email: state.email,
          company_website: String(data.get("company_website") || ""),
          name,
          company,
          role: String(data.get("role") || "").trim(),
          improve: String(data.get("improve") || ""),
          current_system: String(data.get("current_system") || ""),
          page: location.pathname
        });
        state.requestId = done.id || "";
        track("health-check-requested", { company });
        showDone(form);
      } catch (err) {
        setStatus(
          form,
          "Something went wrong and your request was not sent. Please try again, or email us at contact@tubes.media.",
          "error"
        );
        if (button) button.disabled = false;
      }
    });
  }

  track("health-check-page-viewed");

  // ---- Vaste knop op mobiel, zodra het eerste formulier uit beeld is ----
  const sticky = document.getElementById("hc-sticky");
  const topForm = document.getElementById("hc-form-top");
  const finalSection = document.getElementById("hc-final");

  if (sticky && topForm && finalSection && "IntersectionObserver" in window) {
    let scrolledPast = false;
    let nearBottomForm = false;

    const update = () => {
      const show = scrolledPast && !nearBottomForm && !state.done && state.step === 1;
      if (show) sticky.hidden = false;
      sticky.classList.toggle("is-visible", show);
    };
    refreshSticky = update;

    new IntersectionObserver(
      ([entry]) => {
        scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        update();
      },
      { threshold: 0 }
    ).observe(topForm);

    new IntersectionObserver(
      ([entry]) => {
        nearBottomForm = entry.isIntersecting;
        update();
      },
      { threshold: 0 }
    ).observe(finalSection);

    sticky.querySelector("[data-hc-sticky-cta]").addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.getElementById("hc-form-end");
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      const field = target.querySelector(".hc-step:not([hidden]) input");
      if (field) setTimeout(() => field.focus({ preventScroll: true }), 450);
    });
  }
}


// ---------------------------------------------------------------------------
// Vragenlijst op /production-finance-health-check/assessment/
//
// Drie stappen van twee vragen, elk met een eigen thema, en als vierde stap
// de samenvatting van wat iemand zelf heeft ingevuld. De antwoorden gaan weg
// bij de overgang van stap 3 naar 4, dus ze staan vast vóór de samenvatting
// in beeld komt.
//
// Komt iemand van het bedankscherm, dan staat het id van de aanvraag in ?ref
// en hoeft er geen e-mailadres gevraagd te worden. Wie de link los krijgt,
// vult zijn zakelijke e-mailadres in zodat we de antwoorden kunnen koppelen.
// ---------------------------------------------------------------------------

const assessForm = document.querySelector("[data-hc-assess-form]");

if (assessForm) {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

  const ref = new URLSearchParams(location.search).get("ref") || "";
  const identify = assessForm.querySelector("[data-hc-identify]");
  const emailInput = assessForm.querySelector('input[name="email"]');
  const status = assessForm.querySelector(".hc-status");

  // De zes vragen staan in de opmaak; hier lezen we ze uit in plaats van ze
  // nog een keer op te schrijven.
  const questions = Array.from(assessForm.querySelectorAll(".hc-question")).map((block) => ({
    key: block.querySelector("input[type=radio]").name,
    label: block.querySelector(".hc-question-label").textContent.trim(),
    // Korte naam voor de zin in het rapport: de volledige labels bevatten zelf
    // al een "and" en dat leest niet in een opsomming.
    short: block.dataset.short || block.querySelector(".hc-question-label").textContent.trim().toLowerCase(),
    theme: block.dataset.theme || "",
    finding: block.dataset.finding || "",
    reading: block.dataset.readingUrl ? { url: block.dataset.readingUrl, label: block.dataset.readingLabel } : null,
    input: () => block.querySelector("input[type=radio]:checked")
  }));

  // De laatste stap is het rapport; het aantal vraagstappen komt uit de opmaak,
  // die op zijn beurt uit healthcheck.json komt.
  const answeredCount = assessForm.querySelector("[data-hc-answered]");

  const setStatus = (text, kind) => {
    status.textContent = text || "";
    status.className = "form-status hc-status" + (kind ? " is-" + kind : "");
  };

  if (ref && identify) {
    identify.hidden = true;
    emailInput.required = false;
  }

  // Teller naast de stapbalk: hoeveel van de vragen al beantwoord zijn.
  function updateProgress() {
    answeredCount.textContent = String(questions.filter((q) => q.input()).length);
  }
  assessForm.addEventListener("change", updateProgress);
  updateProgress();

  // Eén stap per thema, en het rapport als laatste stap. De stappen komen uit
  // healthcheck.json, dus het aantal wordt hier geteld en niet vastgelegd.
  const blocks = Array.from(assessForm.querySelectorAll("[data-hc-block]"));
  const themePanels = Array.from(document.querySelectorAll("[data-hc-theme]"));
  const RESULT_STEP = blocks.length;

  function showStep(n) {
    for (const block of blocks) block.hidden = block.dataset.hcBlock !== String(n);
    for (const panel of themePanels) panel.hidden = panel.dataset.hcTheme !== String(n);
    for (const bar of assessForm.querySelectorAll("[data-hc-progress-bar]")) {
      const step = Number(bar.dataset.hcProgressBar);
      bar.classList.toggle("is-current", step === n);
      bar.classList.toggle("is-done", step < n);
    }
    if (identify) identify.hidden = Boolean(ref) || n !== 1;
    // De rolvraag hoort bij de eerste stap, niet boven het rapport.
    const role = assessForm.querySelector(".hc-role");
    if (role) role.hidden = n !== 1;
    setStatus("");

    const heading = assessForm.querySelector(`[data-hc-block="${n}"] h2`);
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    const card = assessForm.querySelector(".hc-form-card");
    if (card && card.getBoundingClientRect().top < 80) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  // Het e-mailadres hoort bij stap 1: verder laten gaan zonder zou het pas op
  // het eind laten stuklopen.
  function emailOk() {
    if (ref) return true;
    const email = String(emailInput.value || "").trim();
    if (EMAIL_RE.test(email)) {
      emailInput.removeAttribute("aria-invalid");
      return true;
    }
    emailInput.setAttribute("aria-invalid", "true");
    setStatus("Please enter the business email address you used for your Health Check request.", "error");
    emailInput.focus();
    return false;
  }

  for (const button of assessForm.querySelectorAll("[data-hc-next]")) {
    button.addEventListener("click", () => {
      const next = Number(button.dataset.hcNext);
      if (next === 2 && !emailOk()) return;
      showStep(next);
      track("health-check-assessment-step-" + next);
    });
  }

  for (const button of assessForm.querySelectorAll("[data-hc-back]")) {
    button.addEventListener("click", () => showStep(Number(button.dataset.hcBack)));
  }

  // Het rapport wordt opgebouwd uit de gegeven antwoorden. Geen cijfer en geen
  // oordeel: we geven terug wat iemand zelf invulde, geordend naar waar we
  // mee zouden beginnen.
  const TONE = {};
  for (const option of assessForm.querySelectorAll(".hc-opt")) {
    const input = option.querySelector("input");
    const tone = (option.className.match(/hc-opt-(\w+)/) || [])[1];
    if (input && tone) TONE[input.value] = tone;
  }
  const CHIP = { good: "mint", mid: "amber", low: "lavender" };
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  function renderResult(answers) {
    const answered = questions.filter((q) => answers[q.key]);

    // 1. Per thema: hoe de antwoorden binnen dat thema liggen.
    const themes = [];
    for (const question of questions) {
      let theme = themes.find((t) => t.name === question.theme);
      if (!theme) {
        theme = { name: question.theme, questions: [] };
        themes.push(theme);
      }
      theme.questions.push(question);
    }

    const themeWrap = assessForm.querySelector("[data-hc-result-themes]");
    themeWrap.innerHTML = "";
    for (const theme of themes) {
      // "Not applicable" hoort niet in het balkje: het is geen oordeel over
      // het proces maar een afbakening van wat er speelt.
      const given = theme.questions.filter((q) => answers[q.key] && TONE[answers[q.key]] !== "na");
      const nvt = theme.questions.filter((q) => TONE[answers[q.key]] === "na").length;
      if (!given.length && !nvt) continue;

      const row = el("div", "hc-theme-row");
      row.append(el("p", "hc-theme-row-name", theme.name));

      const bar = el("div", "hc-theme-bar");
      const counts = { good: 0, mid: 0, low: 0 };
      for (const question of given) {
        const tone = TONE[answers[question.key]];
        counts[tone] += 1;
        const segment = el("span", "is-" + tone);
        segment.title = `${question.label}: ${answers[question.key]}`;
        bar.append(segment);
      }
      const parts = [];
      if (counts.low) parts.push(counts.low + (counts.low === 1 ? " opportunity" : " opportunities"));
      if (counts.mid) parts.push(counts.mid + " could improve");
      if (counts.good) parts.push(counts.good + " strong");
      if (nvt) parts.push(nvt + " not applicable");
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", `${theme.name}: ${parts.join(", ")}`);

      if (given.length) row.append(bar);
      row.append(el("p", "hc-theme-row-count", parts.join(" · ")));
      themeWrap.append(row);
    }

    // 2. Waar we mee beginnen: eerst wat als kans is aangemerkt, daarna wat
    //    beter kan. Hoogstens drie, met de bevinding en iets om te lezen.
    const flagged = answered.filter((q) => answers[q.key] === "Opportunity");
    const soft = answered.filter((q) => answers[q.key] === "Could improve");
    const priority = [...flagged, ...soft].slice(0, 3);

    const focus = assessForm.querySelector("[data-hc-result-focus]");
    focus.innerHTML = "";
    focus.append(el("p", "hc-result-focus-title", focus.dataset.title || "Where we will start"));

    if (!priority.length) {
      focus.append(el("p", null, focus.dataset.none || ""));
    } else {
      const named = (items) =>
        items.length === 1
          ? items[0]
          : items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
      const lead = flagged.length
        ? `You marked ${flagged.length === 1 ? "one area" : flagged.length + " areas"} as an opportunity: ${named(flagged.map((q) => q.short))}.`
        : "Nothing stands out as a clear problem, so we will start where you said things could be better.";
      focus.append(el("p", "hc-result-focus-lead", lead));

      const list = el("ol", "hc-finding-list");
      // Vragen binnen één stap delen dezelfde leestip; die dan maar één keer.
      const shown = new Set();
      for (const question of priority) {
        const item = document.createElement("li");
        const head = el("div", "hc-finding-head");
        head.append(el("span", `chip chip-${CHIP[TONE[answers[question.key]]]}`, answers[question.key]));
        head.append(el("p", "hc-finding-label", question.label));
        item.append(head);
        if (question.finding) item.append(el("p", "hc-finding-text", question.finding));
        if (question.reading && !shown.has(question.reading.url)) {
          shown.add(question.reading.url);
          const link = document.createElement("a");
          link.className = "hc-finding-link";
          link.href = question.reading.url;
          link.textContent = question.reading.label;
          item.append(link);
        }
        list.append(item);
      }
      focus.append(list);
    }

    // 3. Alles wat is ingevuld, uitklapbaar.
    const list = assessForm.querySelector("[data-hc-result-list]");
    list.innerHTML = "";
    for (const question of questions) {
      const value = answers[question.key];
      const tone = TONE[value];
      const row = el("li", "hc-result-row" + (value ? (tone === "na" ? " is-na" : "") : " is-empty"));
      row.append(el("span", "hc-result-label", question.label));
      row.append(
        value && CHIP[tone]
          ? el("span", `chip chip-${CHIP[tone]}`, value)
          : el("span", "hc-result-skipped", value || "Not answered")
      );
      list.append(row);
    }
  }

  assessForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const answers = {};
    for (const question of questions) {
      const picked = question.input();
      if (picked) answers[question.key] = picked.value;
    }

    const email = String(emailInput.value || "").trim();
    if (!emailOk()) {
      showStep(1);
      return;
    }

    if (!Object.keys(answers).length) {
      setStatus("Give at least one area a label, then we can use it.", "error");
      return;
    }

    const button = assessForm.querySelector(".hc-submit");
    button.disabled = true;
    setStatus("Sending…");

    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 12000);
    try {
      const res = await fetch("/api/health-check", {
        method: "POST",
        signal: stop.signal,
        body: new URLSearchParams({
          stage: "assessment",
          lead_id: ref,
          email,
          role_group: assessForm.querySelector('select[name="role_group"]')?.value || "",
          notes: assessForm.querySelector('textarea[name="notes"]').value,
          company_website: assessForm.querySelector('input[name="company_website"]').value,
          ...answers,
          page: location.pathname
        }),
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }
      });
      let data = {};
      try { data = await res.json(); } catch { /* geen JSON terug */ }
      if (!res.ok || !data.ok) throw new Error(data.error || "request-failed");

      track("health-check-assessment-completed", { answered: Object.keys(answers).length });
      renderResult(answers);
      showStep(RESULT_STEP);
    } catch (err) {
      setStatus("That did not come through. Please try again, or email us at contact@tubes.media.", "error");
      button.disabled = false;
    } finally {
      clearTimeout(timer);
    }
  });
}
