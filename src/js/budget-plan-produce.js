// Budget · Plan · Produce (/budget-plan-produce/)
//
// Alle varianten staan al in de HTML (8 producties, 3 stappen, 24 verhalen).
// Dit script houdt alleen de toestand bij en zet `hidden` op wat niet bij die
// toestand hoort, plus `data-cur` op de wortel voor de kolomkleur in CSS.
//
//   prod    gekozen productietype (tabs bovenaan)
//   sec     vastgezette stap; loopt vanzelf door (10 s) tenzij gepauzeerd
//   hover   stap waar de muis op staat; wint van sec, zet niets vast
//   paused  na een klik op een kolom: 15 s geen automatische wissel
(function () {
  const root = document.querySelector("[data-bpp]");
  if (!root) return;

  const STEPS = ["budget", "plan", "produce"];
  const state = { prod: root.dataset.prod, sec: root.dataset.cur || "budget", hover: null, paused: false };
  const variants = root.querySelectorAll("[data-for-prod], [data-for-step]");
  const tabs = root.querySelectorAll("[data-prod-tab]");
  let resume = 0;

  function apply() {
    const cur = state.hover || state.sec;
    root.dataset.prod = state.prod;
    root.dataset.cur = cur;
    variants.forEach((el) => {
      const forProd = el.dataset.forProd;
      const forStep = el.dataset.forStep;
      el.hidden = (forProd !== undefined && forProd !== state.prod) || (forStep !== undefined && forStep !== cur);
    });
    tabs.forEach((tab) => tab.setAttribute("aria-pressed", String(tab.dataset.prodTab === state.prod)));
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.prod = tab.dataset.prodTab;
      state.sec = "budget";
      apply();
    });
  });

  root.querySelectorAll("[data-step]").forEach((col) => {
    const step = col.dataset.step;
    col.addEventListener("mouseenter", () => { state.hover = step; apply(); });
    col.addEventListener("mouseleave", () => { state.hover = null; apply(); });
    col.addEventListener("click", () => {
      state.sec = step;
      state.paused = true;
      clearTimeout(resume);
      resume = setTimeout(() => { state.paused = false; }, 15000);
      apply();
    });
  });

  // Automatisch doorlopen: Budget → Plan → Produce → Budget. Uit te zetten met
  // data-autoloop="false" op de wortel. Staat het tabblad op de achtergrond,
  // dan blijft de stap staan.
  if (root.dataset.autoloop !== "false") {
    setInterval(() => {
      if (state.hover || state.paused || document.hidden) return;
      state.sec = STEPS[(STEPS.indexOf(state.sec) + 1) % STEPS.length];
      apply();
    }, 10000);
  }

  apply();
})();
