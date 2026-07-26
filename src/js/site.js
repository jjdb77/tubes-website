// Mobiel menu
const toggle = document.querySelector(".nav-toggle");
if (toggle) {
  toggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
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
const form = document.querySelector(".contact-form");
if (form) {
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
