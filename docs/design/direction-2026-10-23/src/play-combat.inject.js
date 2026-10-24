(() => {
  let k = null;
  document.querySelectorAll(".atable *").forEach((e) => {
    if (e.classList.contains("agroup")) {
      const s = e.querySelector(".shape");
      k = s ? (s.className.match(/shape--(\w+)/) || [])[1] : null;
      if (k) e.dataset.k = k;
    } else if (e.classList.contains("arow") && k) {
      e.dataset.k = k;
    }
  });
})();
(() => {
  const G =
    "<defs><linearGradient id=hg x1=0 y1=0 x2=0 y2=1><stop offset=0 stop-color=#d4ff9a /><stop offset=.45 stop-color=#46f04a /><stop offset=1 stop-color=#0c8a1c /></linearGradient><linearGradient id=hgh x1=0 y1=0 x2=1 y2=0><stop offset=0 stop-color=#0c8a1c /><stop offset=.5 stop-color=#46f04a /><stop offset=1 stop-color=#d4ff9a /></linearGradient><linearGradient id=tg x1=0 y1=0 x2=0 y2=1><stop offset=0 stop-color=#c8f0ff /><stop offset=.5 stop-color=#33a6ff /><stop offset=1 stop-color=#0a4f9c /></linearGradient><linearGradient id=gold x1=0 y1=0 x2=0 y2=1><stop offset=0 stop-color=#fbe7a1 /><stop offset=.5 stop-color=#c9973e /><stop offset=1 stop-color=#6b4a1c /></linearGradient><filter id=glow x=-50% y=-50% width=200% height=200%><feGaussianBlur stdDeviation=3 result=b /><feMerge><feMergeNode in=b /><feMergeNode in=SourceGraphic /></feMerge></filter></defs>";
  const hpN = document.querySelector(".hp__now");
  hpN.style.cssText += ";color:#7dff7f!important;text-shadow:0 0 14px #46f04a88";
  const m = document.querySelector(".medal");
  m.style.position = "relative";
  const r = m.getBoundingClientRect();
  const D = r.width + 22;
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 100 100");
  s.style.cssText =
    "position:absolute;left:-11px;top:-11px;width:" +
    D +
    "px;height:" +
    D +
    "px;overflow:visible;transform:rotate(-90deg)";
  const C = 2 * Math.PI * 46;
  s.innerHTML =
    G +
    '<circle cx=50 cy=50 r=46 fill=none stroke=#120a07 stroke-width=7 /><circle cx=50 cy=50 r=46 fill=none stroke=url(#hgh) stroke-width=5 stroke-linecap=round stroke-dasharray="' +
    C * 0.82 +
    " " +
    C +
    '" filter=url(#glow) /><circle cx=50 cy=50 r=46 fill=none stroke=url(#tg) stroke-width=5 stroke-dasharray="' +
    C * 0.13 +
    " " +
    C +
    '" stroke-dashoffset="' +
    -C * 0.82 +
    '" filter=url(#glow) /><circle cx=50 cy=50 r=50 fill=none stroke=url(#gold) stroke-width=1.5 /><circle cx=50 cy=50 r=42 fill=none stroke=url(#gold) stroke-width=1 />';
  m.appendChild(s);
  document.querySelector(".hpbar").style.display = "none";
})();
(() => {
  const t = document.querySelector("#act-h");
  const d = document.createElement("div");
  d.className = "bn bn--mine";
  d.innerHTML = "<b>ROUND 2 \u00b7 TOCCA A TE</b>";
  t.after(d);
})();
(() => {
  const lg = document.querySelector(".play__log");
  const t = lg.querySelector("#log-h");
  const d = document.createElement("div");
  d.innerHTML =
    "<h2 class=ftitle id=ini-h>Iniziativa \u00b7 round 2</h2><div class='ir '><span class=ii>18</span><img src='file:///private/tmp/claude-501/-Users-salvatoredicara-Workspace-d20-folio--claude-worktrees-vigorous-chebyshev-be3ae5/61a0ea85-4a2f-42ef-a9f4-984dfc8b7cca/scratchpad/proto/docs/design/system/img/class-rogue.webp'><span class=in>Kaela</span><span class=ih>Ferita leggera</span></div><div class='ir now'><span class=ii>15</span><img src='file:///private/tmp/claude-501/-Users-salvatoredicara-Workspace-d20-folio--claude-worktrees-vigorous-chebyshev-be3ae5/61a0ea85-4a2f-42ef-a9f4-984dfc8b7cca/scratchpad/proto/docs/design/system/img/portrait-selene.webp'><span class=in>Selene (tu)<span class=tg>ORA</span></span><span class=ih>31/38</span></div><div class='ir next'><span class=ii>12</span><span class=mon>\ud83d\udc79</span><span class=in>Goblin \u00d73<span class='tg tg2'>DOPO</span></span><span class=ih>Insanguinato</span></div><div class='ir '><span class=ii>9</span><img src='file:///private/tmp/claude-501/-Users-salvatoredicara-Workspace-d20-folio--claude-worktrees-vigorous-chebyshev-be3ae5/61a0ea85-4a2f-42ef-a9f4-984dfc8b7cca/scratchpad/proto/docs/design/system/img/class-fighter.webp'><span class=in>Brann</span><span class=ih>In forma</span></div><div class='ir '><span class=ii>4</span><img src='file:///private/tmp/claude-501/-Users-salvatoredicara-Workspace-d20-folio--claude-worktrees-vigorous-chebyshev-be3ae5/61a0ea85-4a2f-42ef-a9f4-984dfc8b7cca/scratchpad/proto/docs/design/system/img/class-bard.webp'><span class=in>Tib</span><span class=ih>In forma</span></div><div class=iact><span>\uff0b aggiungi</span><span>\u21b6 indietro</span><span>Fine combattimento</span></div>";
  t.before(...d.childNodes);
})();
(() => {
  const n = document.querySelector(".tabs");
  const t = [...n.querySelectorAll(".tab")];
  const by = (s) => t.find((x) => x.textContent.trim() === s);
  const d = by("Storia").cloneNode(true);
  d.setAttribute("aria-selected", "false");
  d.lastChild.textContent = "Diario";
  const svg = d.querySelector("svg");
  if (svg) {
    const sp = document.createElement("span");
    sp.textContent = "☰";
    sp.style.cssText = "color:#a8946c;margin-right:2px";
    svg.replaceWith(sp);
  }
  ["Gioco", "Incantesimi", "Inventario", "Privilegi", "Storia"].forEach((s) =>
    n.appendChild(by(s))
  );
})();
(() => {
  const ch = document.querySelector(".hero__chips");
  ch.querySelectorAll(".chip:not(.chip--add)").forEach((c) => c.remove());
  const add = ch.querySelector(".chip--add");
  [
    ["buff", "Benedizione \u00b7 9 round \u00b7 concentrazione"],
    ["buff", "Scudo della fede \u00b7 da Brann"],
    ["buff", "Arma spirituale \u00b7 1 min"],
    ["buff", "Aiuto \u00b7 +5 PF max"],
    ["buff", "Velocit\u00e0 \u00b7 da Tib"],
    ["cond", "Accecata"],
    ["cond", "Avvelenata"],
    ["cond", "Prona"],
    ["cond", "Afferrata \u00b7 dal Capitano"],
    ["cond", "Spaventata"],
    ["cond", "Indebolimento 2"],
  ].forEach(([k, t]) => {
    const b = document.createElement("button");
    b.className = "chip chip--" + k;
    b.textContent = t;
    ch.insertBefore(b, add);
  });
  const lg = document.querySelector(".play__log");
  const ini = [...lg.querySelectorAll(".ir")];
  const tmpl = ini[1];
  ini.forEach((r) => r.remove());
  const anchor = lg.querySelector(".iact");
  [
    ["19", "Capitano hobgoblin dell'Artiglio Insanguinato", "Insanguinato"],
    ["18", "Kaela", "Ferita leggera"],
    ["17", "Arciere hobgoblin \u00d74", "In forma"],
    ["15", "Selene (tu)", "31/38"],
    ["14", "Lupo crudele \u00d72", "Insanguinati"],
    ["12", "Goblin \u00d73", "Insanguinati"],
    ["11", "Sciamano bugbear", "In forma"],
    ["9", "Brann", "In forma"],
    ["8", "Lupo di Kaela (compagno)", "In forma"],
    ["6", "Mastino ombra", "Grave"],
    ["4", "Tib", "Grave"],
    ["2", "Ogre", "In forma"],
  ].forEach(([i, n, h]) => {
    const r = tmpl.cloneNode(true);
    r.className = "ir" + (n.startsWith("Selene") ? " now" : "");
    r.querySelector(".ii").textContent = i;
    r.querySelector(".in").childNodes[0].textContent = n;
    if (!n.startsWith("Selene")) {
      const t = r.querySelector(".tg");
      if (t) t.remove();
    }
    r.querySelector(".ih").textContent = h;
    anchor.before(r);
  });
  const rs = document.querySelector("#res-h").parentElement;
  const one = rs.querySelector(".res");
  [
    "Slot di 4\u00b0",
    "Forma selvatica",
    "Ispirazione bardica",
    "Punti stregoneria",
    "Anello: 3 cariche",
    "Bacchetta: 7 cariche",
  ].forEach((n) => {
    const r = one.cloneNode(true);
    r.querySelector(".res__name").textContent = n;
    rs.appendChild(r);
  });
})();
(() => {
  const ch = document.querySelector(".hero__chips");
  const all = [...ch.querySelectorAll(".chip:not(.chip--add)")];
  all.slice(2).forEach((c) => (c.style.display = "none"));
  const m = document.createElement("button");
  m.className = "chip chip-more";
  m.textContent = "+" + (all.length - 2) + " altri ▾";
  ch.insertBefore(m, ch.querySelector(".chip--add"));
  const lg = document.querySelector(".play__log");
  const rows = [...lg.querySelectorAll(".ir")];
  const w = document.createElement("div");
  w.className = "inilist";
  rows[0].before(w);
  rows.forEach((r) => w.appendChild(r));
  w.insertAdjacentHTML("afterend", "<div class=morebar>12 combattenti · scorri ▾</div>");
  const rs = document.querySelector("#res-h").parentElement;
  rs.insertAdjacentHTML(
    "afterend",
    '<div class=morebar style="margin-top:-14px">altre 4 risorse ▾</div>'
  );
})();
(() => {
  const ch = document.querySelector(".hero__chips");
  ch.querySelectorAll(".chip:not(.chip--add)").forEach((c) => c.remove());
  ch.insertAdjacentHTML(
    "afterbegin",
    '<span class="sg conc">◉ Benedizione · 9 round</span><span class="sg buff">✦ Effetti <span class=n>4</span></span><span class="sg cond">⚠ Condizioni <span class=n>6</span></span>'
  );
})();
(() => {
  const a = document.querySelector(".chip--add");
  a.innerHTML = "＋";
  a.title = "Aggiungi uno stato";
  a.style.cssText = "flex:none;padding:6px 10px";
})();
