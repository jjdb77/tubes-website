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
  const targets = document.querySelectorAll(".section:not(.section-hero) .container");
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
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: data,
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
