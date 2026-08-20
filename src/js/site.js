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

// ---------------------------------------------------------------------------
// Landingspagina van de Health Check
//
// Er staat geen formulier meer op deze pagina: de knop gaat rechtstreeks naar
// de vragenlijst, die het e-mailadres vraagt. Wat hier overblijft is de
// paginateller en de vaste knop op mobiel.
// ---------------------------------------------------------------------------

const hcCta = document.getElementById("hc-cta-top");

if (hcCta) {
  track("health-check-page-viewed");

  const sticky = document.getElementById("hc-sticky");
  const finalSection = document.getElementById("hc-final");

  if (sticky && finalSection && "IntersectionObserver" in window) {
    let scrolledPast = false;
    let nearBottom = false;

    const update = () => {
      const show = scrolledPast && !nearBottom;
      if (show) sticky.hidden = false;
      sticky.classList.toggle("is-visible", show);
    };

    new IntersectionObserver(
      ([entry]) => {
        scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        update();
      },
      { threshold: 0 }
    ).observe(hcCta);

    new IntersectionObserver(
      ([entry]) => {
        nearBottom = entry.isIntersecting;
        update();
      },
      { threshold: 0 }
    ).observe(finalSection);
  }
}

// ---------------------------------------------------------------------------
// Vragenlijst op /production-finance-health-check/assessment/
//
// Twee stappen: wie je bent, en hoe je werkt. Daarna verschijnt de agenda met
// daaronder een overzicht van wat er is ingevuld.
//
// Het e-mailadres wordt al vastgelegd bij het doorklikken naar stap 2, niet
// pas bij het versturen: anders laat wie halverwege afhaakt geen spoor na.
// Komt iemand met ?ref binnen, dan kennen we het adres al.
// ---------------------------------------------------------------------------

const assessForm = document.querySelector("[data-hc-assess-form]");

if (assessForm) {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const ref = new URLSearchParams(location.search).get("ref") || "";

  const emailInput = assessForm.querySelector('input[name="email"]');
  const emailBlock = assessForm.querySelector("[data-hc-email]");
  const nameInput = assessForm.querySelector('input[name="name"]');
  const companyInput = assessForm.querySelector('input[name="company"]');
  const roleInput = assessForm.querySelector('input[name="role"]');
  const status = assessForm.querySelector(".hc-status");
  const blocks = Array.from(assessForm.querySelectorAll("[data-hc-block]"));
  const progressLabel = assessForm.querySelector("[data-hc-progress-label]");

  // De vragen staan in de opmaak; hier lezen we ze uit in plaats van ze nog
  // een keer op te schrijven.
  const questions = Array.from(assessForm.querySelectorAll(".hc-question")).map((block) => ({
    key: block.dataset.key,
    label: block.dataset.label,
    picked: () => block.querySelector("input[type=radio]:checked")
  }));

  if (ref && emailBlock) {
    emailBlock.hidden = true;
    emailInput.required = false;
  }

  const setStatus = (text, kind) => {
    status.textContent = text || "";
    status.className = "form-status hc-status" + (kind ? " is-" + kind : "");
  };

  function showStep(n) {
    for (const block of blocks) block.hidden = block.dataset.hcBlock !== String(n);
    // De agenda heeft meer ruimte nodig dan de vragen.
    const modal = document.getElementById("hc-modal");
    if (modal) modal.classList.toggle("is-booking", n === 3);
    // Het rapport hoort nog bij stap 2: de balk blijft daar staan.
    const segment = n >= 2 ? 2 : 1;
    for (const bar of assessForm.querySelectorAll("[data-hc-progress-bar]")) {
      const step = Number(bar.dataset.hcProgressBar);
      bar.classList.toggle("is-current", step === segment);
      bar.classList.toggle("is-done", step < segment);
    }
    if (progressLabel) progressLabel.textContent = n === 3 ? "Almost there" : `Step ${segment} of 2`;
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

  function detailsOk() {
    if (!ref) {
      const email = String(emailInput.value || "").trim();
      if (!EMAIL_RE.test(email)) {
        emailInput.setAttribute("aria-invalid", "true");
        setStatus("Please enter your business email address.", "error");
        emailInput.focus();
        return false;
      }
      emailInput.removeAttribute("aria-invalid");
    }
    for (const [input, melding] of [
      [nameInput, "Please add your name so we know who we are meeting."],
      [companyInput, "Please add your company so we can prepare for the session."],
      [roleInput, "Please add your role, so we can pitch the session at the right level."]
    ]) {
      if (input && !String(input.value || "").trim()) {
        input.setAttribute("aria-invalid", "true");
        setStatus(melding, "error");
        input.focus();
        return false;
      }
      if (input) input.removeAttribute("aria-invalid");
    }
    return true;
  }

  // Zodra iemand voorbij stap 1 is, leggen we het adres alvast vast. Mislukt
  // dat, dan gaat alles bij het versturen alsnog mee.
  let leadId = ref;
  async function captureEmail() {
    if (leadId) return;
    const email = String(emailInput.value || "").trim();
    if (!EMAIL_RE.test(email)) return;
    try {
      const res = await fetch("/api/health-check", {
        method: "POST",
        body: new URLSearchParams({
          stage: "email",
          email,
          company_website: assessForm.querySelector('input[name="company_website"]').value,
          page: location.pathname
        }),
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }
      });
      const data = await res.json();
      if (data.ok && data.id) {
        leadId = data.id;
        track("health-check-email-captured");
      }
    } catch (err) {
      /* stil: het adres gaat bij het versturen alsnog mee */
    }
  }

  for (const button of assessForm.querySelectorAll("[data-hc-next]")) {
    button.addEventListener("click", () => {
      if (!detailsOk()) return;
      captureEmail();
      showStep(Number(button.dataset.hcNext));
      track("health-check-details-done");
    });
  }

  for (const button of assessForm.querySelectorAll("[data-hc-back]")) {
    button.addEventListener("click", () => showStep(Number(button.dataset.hcBack)));
  }

  // Overzicht van wat er is ingevuld, plus waar we mee beginnen.
  function renderResult(answers) {
    const focus = assessForm.querySelector("[data-hc-result-focus]");
    focus.innerHTML = "";
    if (answers.workload) {
      const title = document.createElement("p");
      title.className = "hc-result-focus-title";
      title.textContent = focus.dataset.title || "Where we will start";
      const body = document.createElement("p");
      body.textContent = `You said the most work sits in ${answers.workload.toLowerCase()}. That is where we will start.`;
      focus.append(title, body);
    }

    const list = assessForm.querySelector("[data-hc-result-list]");
    list.innerHTML = "";
    for (const question of questions) {
      const value = answers[question.key];
      if (!value) continue;
      const row = document.createElement("li");
      row.className = "hc-result-row";
      const label = document.createElement("span");
      label.className = "hc-result-label";
      label.textContent = question.label;
      const answer = document.createElement("span");
      answer.className = "hc-result-answer";
      answer.textContent = value;
      row.append(label, answer);
      list.append(row);
    }
  }

  // De boekingspagina leest maar één veld uit de URL: ?plan. Daar zetten we
  // de antwoorden in, zodat ze bij de boeking staan en niemand ze opnieuw
  // hoeft te vertellen. Naam en e-mailadres vóórinvullen kan die pagina niet;
  // daarvoor moet 4Relations parameters gaan accepteren.
  function loadCalendar(answers) {
    const delen = [
      `${nameInput.value.trim()} (${companyInput.value.trim()})`,
      ...questions.map((q) => answers[q.key]).filter(Boolean)
    ];
    const notes = assessForm.querySelector('textarea[name="notes"]').value.trim();
    if (notes) delen.push(`Wants to discuss: ${notes}`);
    const query = "?plan=" + encodeURIComponent(("Health Check · " + delen.join(" · ")).slice(0, 400));

    const frame = assessForm.querySelector(".hc-calendar-frame");
    if (frame && !frame.src) frame.src = frame.dataset.src + query;
    const fallback = assessForm.querySelector("[data-hc-booking-fallback]");
    if (fallback) fallback.href = "/book-a-call/health-check/" + query;
  }

  assessForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!detailsOk()) {
      showStep(1);
      return;
    }

    const answers = {};
    for (const question of questions) {
      const picked = question.picked();
      if (picked) answers[question.key] = picked.value;
    }

    const button = assessForm.querySelector(".hc-submit");
    button.disabled = true;
    setStatus("One moment…");

    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 12000);
    try {
      const res = await fetch("/api/health-check", {
        method: "POST",
        signal: stop.signal,
        body: new URLSearchParams({
          stage: "details",
          lead_id: leadId,
          email: String(emailInput.value || "").trim(),
          name: nameInput.value.trim(),
          company: companyInput.value.trim(),
          role: roleInput.value.trim(),
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

      track("health-check-requested", { answered: Object.keys(answers).length });
      renderResult(answers);
      loadCalendar(answers);
      showStep(3);
    } catch (err) {
      setStatus("That did not come through. Please try again, or email us at contact@tubes.media.", "error");
    } finally {
      clearTimeout(timer);
      // Altijd weer bruikbaar: je kunt terug naar de vragen en opnieuw
      // doorklikken, en na een fout meteen opnieuw proberen.
      button.disabled = false;
    }
  });

  // Op de landingspagina zit dit formulier in een popover; daar telt het
  // openen, niet het laden van de pagina.
  const hcModal = document.getElementById("hc-modal");

  if (hcModal && typeof hcModal.showModal === "function") {
    const open = () => {
      hcModal.showModal();
      track("health-check-assessment-opened", { linked: false });
      const eerste = assessForm.querySelector('[data-hc-block="1"] input');
      if (eerste) setTimeout(() => eerste.focus({ preventScroll: true }), 60);
    };
    for (const link of document.querySelectorAll("[data-hc-open]")) {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        open();
      });
    }
    hcModal.querySelector(".hc-modal-close").addEventListener("click", () => hcModal.close());
    hcModal.addEventListener("click", (e) => {
      if (e.target === hcModal) hcModal.close();
    });
  } else {
    track("health-check-assessment-opened", { linked: Boolean(ref) });
  }
}
