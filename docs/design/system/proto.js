// Prototype helpers: ?mode=explore|combat, ?tip, ?closed, icons, simple toggles. Not app code.
(function () {
  const params = new URLSearchParams(location.search);

  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  ready(() => {
    const mode = params.get("mode");
    if (mode) document.body.className = "mode-" + mode;
    const tab = params.get("tab");
    if (tab) document.body.className = "tab-" + tab;
    const current = document.body.className.match(/tab-(\w+)/);
    if (current)
      document
        .querySelectorAll("[data-tab]")
        .forEach((t) =>
          t.setAttribute("aria-selected", String(t.dataset.tab === current[1]))
        );
    if (params.has("tip"))
      document.getElementById("tip-flame")?.removeAttribute("hidden");
    if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.75 } });

    // aria-pressed groups (segmented filters)
    document.querySelectorAll(".pills").forEach((seg) =>
      seg.addEventListener("click", (e) => {
        const opt = e.target.closest(".pill");
        if (!opt) return;
        seg
          .querySelectorAll(".pill")
          .forEach((o) => o.setAttribute("aria-pressed", String(o === opt)));
      })
    );
    // switches
    document
      .querySelectorAll(".f-switch")
      .forEach((sw) =>
        sw.addEventListener("click", () =>
          sw.setAttribute(
            "aria-checked",
            String(sw.getAttribute("aria-checked") !== "true")
          )
        )
      );
    // tabs
    document.querySelectorAll(".tabs").forEach((tabs) =>
      tabs.addEventListener("click", (e) => {
        const tab = e.target.closest(".tab");
        if (!tab) return;
        tabs
          .querySelectorAll(".tab")
          .forEach((t) => t.setAttribute("aria-selected", String(t === tab)));
      })
    );
    // phones start with these folds closed
    if (matchMedia("(max-width: 760px)").matches || params.has("closed"))
      document.querySelectorAll("[data-collapse-phone]").forEach((btn) => {
        const t = document.getElementById(btn.dataset.toggle);
        if (t) t.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      });
    // [data-toggle="id"] shows/hides a target and flips aria-expanded
    document.querySelectorAll("[data-toggle]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const target = document.getElementById(btn.dataset.toggle);
        if (!target) return;
        const open = target.hidden;
        target.hidden = !open;
        btn.setAttribute("aria-expanded", String(open));
      })
    );
  });
})();
