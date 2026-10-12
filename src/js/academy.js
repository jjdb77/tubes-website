// Tubes Academy (/academy/): aanmelden met e-mail + code, en de kopieerknop
// voor de licentiekey. Endpoints in lib/academy.js.
(function () {
  "use strict";
  var emailForm = document.querySelector('[data-ac-step="email"]');
  var codeForm = document.querySelector('[data-ac-step="code"]');
  var email = "";

  function status(form, text, kind) {
    var el = form.querySelector("[data-ac-status]");
    el.textContent = text || "";
    el.className = "form-status" + (kind ? " is-" + kind : "");
  }
  function post(url, data) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(data),
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok || !body.ok) throw new Error(body.error || "Something went wrong. Please try again.");
        return body;
      });
    });
  }
  function busy(form, on) {
    var b = form.querySelector('button[type="submit"]');
    if (b) b.disabled = on;
  }

  if (emailForm && codeForm) {
    emailForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var value = emailForm.elements.email.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(value)) return status(emailForm, "Enter a valid email address.", "error");
      busy(emailForm, true);
      status(emailForm, "Sending...");
      post("/api/academy/code", { email: value, company_website: emailForm.elements.company_website.value })
        .then(function () {
          email = value;
          status(emailForm, "");
          codeForm.querySelector("[data-ac-sent-to]").textContent = value;
          emailForm.hidden = true;
          codeForm.hidden = false;
          codeForm.elements.code.focus();
        })
        .catch(function (err) { status(emailForm, err.message, "error"); })
        .then(function () { busy(emailForm, false); });
    });

    codeForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var code = codeForm.elements.code.value.replace(/\s+/g, "");
      if (!/^\d{6}$/.test(code)) return status(codeForm, "Enter the 6 digit code from the email.", "error");
      busy(codeForm, true);
      status(codeForm, "Checking...");
      post("/api/academy/verify", {
        email: email,
        code: code,
        name: codeForm.elements.name.value,
        company: codeForm.elements.company.value,
        role: codeForm.elements.role.value,
      })
        .then(function () { window.location.replace("/academy/#ac-signin"); window.location.reload(); })
        .catch(function (err) { status(codeForm, err.message, "error"); busy(codeForm, false); });
    });

    codeForm.querySelector("[data-ac-back]").addEventListener("click", function () {
      codeForm.hidden = true;
      emailForm.hidden = false;
      status(codeForm, "");
      emailForm.elements.email.focus();
    });
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-ac-copy]") : null;
    if (!btn) return;
    var src = document.getElementById(btn.getAttribute("data-ac-copy"));
    if (!src || !navigator.clipboard) return;
    navigator.clipboard.writeText(src.textContent.trim()).then(function () {
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = "Copy"; }, 2000);
    });
  });
})();
