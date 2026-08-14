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
