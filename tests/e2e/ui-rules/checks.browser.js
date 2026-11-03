// Runs inside the page. Returns {check: [failures...]} for one surface at one viewport.
window.__audit = (opts) => {
  const R = {};
  const add = (k, v) => {
    R[k] ||= [];
    if (R[k].length < 12) R[k].push(v);
    else R[k + "__more"] = (R[k + "__more"] || 0) + 1;
  };
  const vis = (e) => {
    if (!e.getClientRects().length || e.closest(".sr,.f-sr")) return false;
    {
      const rr = e.getBoundingClientRect();
      if (rr.width <= 1 && rr.height <= 1) return false;
    }
    const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || +cs.opacity === 0) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const ownText = (e) =>
    [...e.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join("")
      .trim();
  const label = (e) =>
    e.tagName.toLowerCase() +
    (e.className && typeof e.className === "string"
      ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "") +
    " «" +
    (e.innerText || e.getAttribute("aria-label") || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 28) +
    "»";
  const all = [...document.querySelectorAll("body *")].filter(
    (e) => !e.closest("svg") || e.tagName === "svg"
  );
  const W = innerWidth;
  // c14 horizontal scroll
  if (document.documentElement.scrollWidth > W + 1)
    add("hscroll", "page " + document.documentElement.scrollWidth + " > " + W);
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const bgOf = (e) => {
    let cur = e;
    const stack = [];
    while (cur && cur.nodeType === 1) {
      const cs = getComputedStyle(cur);
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 0.99) break;
      }
      cur = cur.parentElement;
    }
    let base = { r: 11, g: 9, b: 7 };
    for (let i = stack.length - 1; i >= 0; i--) {
      const c = stack[i];
      base = {
        r: c.r * c.a + base.r * (1 - c.a),
        g: c.g * c.a + base.g * (1 - c.a),
        b: c.b * c.a + base.b * (1 - c.a),
      };
    }
    return base;
  };
  const clickSel =
    'a,button,[role=button],[role=tab],[role=checkbox],[role=switch],.btn,.chip,.boxtabs span,[tabindex]:not([tabindex="-1"])';
  const gold =
    /rgb\((16[0-9]|17\d|18\d|19\d|2[0-1]\d), (1[2-8]\d), (6\d|7\d|8\d|9\d|1[0-3]\d)\)/;
  const GC = {};
  const cv = document.createElement("canvas").getContext("2d");
  const glyphs = (cs) => {
    const k = cs.fontWeight + cs.fontFamily;
    if (!GC[k]) {
      cv.font = cs.fontWeight + " 100px " + cs.fontFamily;
      const m = (ch) => cv.measureText(ch).actualBoundingBoxAscent / 100;
      GC[k] = { x: m("x"), H: m("H"), d: Math.min(m("1"), m("5"), m("0")) };
    }
    const f = parseFloat(cs.fontSize),
      g = GC[k];
    return { x: g.x * f, H: g.H * f, d: g.d * f };
  };
  for (const e of all) {
    if (!vis(e)) continue;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    if (e.closest("[data-audit-skip]")) continue;
    const t = ownText(e);
    // c4 clipping / ellipsis
    if (
      t &&
      !e.matches(".sr,.f-sr") &&
      cs.overflow !== "visible" &&
      e.scrollWidth > e.clientWidth + 1 &&
      e.clientWidth > 0
    )
      add("clipped", label(e));
    if (t && cs.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1)
      add("ellipsis", label(e));
    if (t && /…$|\.\.\.$/.test(t) && !/[.…]{3}$/.test("x")) {
      if (!/(Cerca|Scrivi|Search|Write)/.test(t) && !e.closest("[aria-busy=true]"))
        add("ellipsis_text", label(e));
    }
    // offscreen
    if (
      r.right > W + 1 &&
      cs.position !== "fixed" &&
      !e.closest(".utabs,.tabs,.f-tabs,.boxtabs,.pills,[data-hscroll]")
    )
      add("offscreen", label(e) + " right=" + Math.round(r.right));
    // c6 min font
    if (t && parseFloat(cs.fontSize) < 12) add("font<12", cs.fontSize + " " + label(e));
    // perceived size: the real glyph height of this font (Alegreya and Cormorant have small x-heights and old-style figures)
    if (t) {
      const g = glyphs(cs);
      const up =
        cs.textTransform === "uppercase" || cs.fontVariantCaps.includes("small-caps");
      const lc = !up && /[a-zà-ÿ]/.test(t),
        dg = /\d/.test(t),
        uc = up || /[A-ZÀ-Þ]/.test(t);
      const lin =
        /lining/.test(cs.fontVariantNumeric) || /lnum/.test(cs.fontFeatureSettings);
      let bad = null;
      if (lc && g.x < 6.2) bad = "x-height " + g.x.toFixed(1);
      else if (dg && g.d < 8) bad = "figures " + g.d.toFixed(1);
      else if (uc && !lc && !dg && g.H < 8) bad = "caps " + g.H.toFixed(1);
      if (bad) add("small-text", bad + "px " + cs.fontSize + " " + label(e));
    }
    // c7 contrast
    if (t && !e.closest("[data-on-image]")) {
      const fg = parse(cs.color);
      if (fg) {
        const bg = bgOf(e);
        const fgc = {
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
        };
        const L1 = lum(fgc),
          L2 = lum(bg);
        const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const big =
          parseFloat(cs.fontSize) >= 24 ||
          (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
        const op = e.closest("[aria-disabled=true],.is-disabled,.dis,.off");
        if (!op && cr < (big ? 3 : 4.5)) add("contrast", cr.toFixed(2) + " " + label(e));
      }
    }
    // c2 grid: paddings and gaps multiple of 4
    for (const k of [
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "rowGap",
      "columnGap",
    ]) {
      const v = parseFloat(cs[k]);
      if (v && Math.abs(v - Math.round(v / 4) * 4) > 0.5) {
        add("grid", k + "=" + v + " " + label(e));
        break;
      }
    }
    // c3 borders and radii
    for (const k of ["borderTopWidth", "borderLeftWidth"]) {
      const v = parseFloat(cs[k]);
      const bc = cs[k.replace("Width", "Color")];
      if (
        v &&
        !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(bc) &&
        ![1, 2, 3].includes(Math.round(v))
      )
        add("border", k + "=" + v + " " + label(e));
    }
    const radS = cs.borderTopLeftRadius;
    const rad = parseFloat(radS);
    if (
      rad &&
      !(radS.endsWith("%") && rad >= 50) &&
      ![2, 4, 6, 8, 10, 12, 16].includes(Math.round(rad)) &&
      !(rad >= Math.min(r.width, r.height) / 2 - 1)
    )
      add("radius", rad + " " + label(e));
    // c10 gold borders outside identity/primary
    const bc = cs.borderTopColor + " " + cs.borderLeftColor;
    if (
      (parseFloat(cs.borderTopWidth) || parseFloat(cs.borderLeftWidth)) &&
      gold.test(bc) &&
      !e.matches(
        ".btn.primary,.f-btn[data-kind=primary],.b1,.btn--primary,.crest,.av,.f-av,.medal,.medal *,.hero,.hero *,[data-identity],[data-identity] *,.cc.on,.stp *,.tile,.wpanel,.welcome *"
      ) &&
      !e.closest("[data-identity],.hero,.frz")
    )
      add("gold", label(e));
    // c8 icons
    if (
      e.tagName === "svg" &&
      r.width >= 10 &&
      !e.querySelector('use[href^="/assets/ui-icons.svg"]') &&
      !e.closest(".frz,.medal,.ring,.f-ring,[data-orn]")
    ) {
      const vb = e.getAttribute("viewBox") || "";
      if (!["0 0 512 512", "0 0 256 256", "0 0 48 48"].includes(vb))
        add("icon-set", vb + " " + label(e.parentElement));
    }
    if (e.hasAttribute("data-lucide") || /lucide/.test(e.getAttribute("class") || ""))
      add("icon-set", "lucide " + label(e.parentElement || e));
    if (
      t &&
      /\p{Extended_Pictographic}/u.test(t.replace(/[◆◇●▲■▬◉✦⚠✓✕×→←↑↓▾▸◂⇄＋✎·]/g, ""))
    )
      add("emoji", label(e));
    // c11 abbreviations: known short forms, or a short word + "." followed by more text in the same phrase
    if (t && !/^\s*$/.test(t)) {
      const tt = t;
      const known = t.match(
        /(?:^|[\s(])(vel|iniz|compet|perc|conc|cont|rad|temp|perf|tagl|liv|lv|mag|sec|pag|ecc|tot|att|dif|prof|comp|mov|ris)\.(?=\s|$|\)|·)/gi
      );
      const mid = t.match(/\b[A-Za-zÀ-ÿ]{1,5}\.(?=\s+[a-zà-ÿ0-9·])/g);
      const bad = [...(known || []), ...(mid || [])]
        .map((x) => x.trim())
        .filter((x) => !/^(St|Sig|Dr)\./.test(x));
      if (bad.length) add("abbrev", bad.join(",") + " " + label(e));
    }
    // c12 touch targets, c5 centring
    if (e.matches(clickSel) && !e.closest("p")) {
      let ew = r.width,
        eh = r.height;
      for (const ps of ["::before", "::after"]) {
        const bf = getComputedStyle(e, ps);
        if (bf.content !== "none" && bf.position === "absolute") {
          const px = (v) => Math.max(0, -parseFloat(v) || 0);
          ew = Math.max(ew, r.width + px(bf.left) + px(bf.right));
          eh = Math.max(eh, r.height + px(bf.top) + px(bf.bottom));
        }
      }
      if (eh < 39.5 || ew < 39.5)
        add("target<40", Math.round(ew) + "x" + Math.round(eh) + " " + label(e));
      if (t || e.innerText) {
        const rg = document.createRange();
        rg.selectNodeContents(e);
        const tr = rg.getBoundingClientRect();
        if (tr.height && tr.height < r.height) {
          const d = Math.abs((tr.top + tr.bottom) / 2 - (r.top + r.bottom) / 2);
          if (d > 2 && r.height <= 64) add("off-centre", d.toFixed(1) + " " + label(e));
        }
      }
    }
  }
  // c1 logo
  const bar = document.querySelector("header,.tb,.top");
  if (bar && vis(bar)) {
    const brand = bar.querySelector('svg[viewBox="0 0 48 48"]');
    const hasBrandSlot = bar.querySelector(".brand,a[href]");
    if (!brand && opts.needsLogo) add("logo", "no logo B in top bar");
  }
  if (document.body.innerHTML.includes("M12 2l8.7 5v10"))
    add("logo", "old outline mark present");
  // c16 overlapping text and text spilling out of its own box
  const leaves = all.filter(
    (e) => vis(e) && ownText(e) && !e.closest("[data-audit-skip],.frz,svg")
  );
  const clipOf = (e) => {
    let L = -1e9,
      T = -1e9,
      Rr = 1e9,
      B = 1e9;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const r = a.getBoundingClientRect();
        L = Math.max(L, r.left);
        T = Math.max(T, r.top);
        Rr = Math.min(Rr, r.right);
        B = Math.min(B, r.bottom);
      }
    }
    return { L, T, Rr, B };
  };
  const rects = leaves
    .filter((e) => !e.matches(".sr,.f-sr"))
    .map((e) => {
      const c = clipOf(e);
      const rg = document.createRange();
      rg.selectNodeContents(e);
      return [
        e,
        [...rg.getClientRects()]
          .map((r) => ({
            left: Math.max(r.left, c.L),
            top: Math.max(r.top, c.T),
            right: Math.min(r.right, c.Rr),
            bottom: Math.min(r.bottom, c.B),
          }))
          .filter((r) => r.right - r.left > 1 && r.bottom - r.top > 1),
      ];
    });
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const [a, ra] = rects[i],
        [b, rb] = rects[j];
      if (a.contains(b) || b.contains(a)) continue;
      const pa = getComputedStyle(a).position,
        pb = getComputedStyle(b).position;
      if (
        a.closest(
          ".toast,.f-toast,.pop,.f-pop,.menu,.f-menu,.dlg,.f-dlg,.side,.f-side,[role=dialog],#sheet,#fab,.f-secbar,.pills,.f-filters"
        ) !==
        b.closest(
          ".toast,.f-toast,.pop,.f-pop,.menu,.f-menu,.dlg,.f-dlg,.side,.f-side,[role=dialog],#sheet,#fab,.f-secbar,.pills,.f-filters"
        )
      )
        continue;
      for (const x of ra)
        for (const y of rb) {
          const ix = Math.min(x.right, y.right) - Math.max(x.left, y.left),
            iy = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
          if (ix > 2 && iy > 2) {
            add("overlap", label(a) + " × " + label(b));
            break;
          }
        }
    }
  for (const [e, rs] of rects) {
    const box = e.closest("button,.btn,.chip,.sg,.choice,.pill,.plate,.tag,.tg");
    if (!box || box === document.body) continue;
    const br = box.getBoundingClientRect();
    const bc = clipOf(box);
    if (br.right > bc.Rr + 1 || br.left < bc.L - 1) continue;
    for (const x of rs)
      if (x.right > br.right + 1 || x.left < br.left - 1) {
        add("spill", label(e) + " out of " + label(box));
        break;
      }
  }
  // c17 cramped: two separate text blocks on the same line closer than 4 px
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const [a, ra] = rects[i],
        [b, rb] = rects[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (
        getComputedStyle(a).display === "inline" &&
        getComputedStyle(b).display === "inline" &&
        a.parentElement === b.parentElement
      )
        continue;
      if (a.closest("p,li") && a.closest("p,li") === b.closest("p,li")) continue;
      if (a.closest(".dw,.f-dw") && a.closest(".dw,.f-dw") === b.closest(".dw,.f-dw"))
        continue;
      if (
        a.closest(
          ".toast,.f-toast,.pop,.f-pop,.menu,.f-menu,.dlg,.f-dlg,.side,.f-side,[role=dialog],#sheet,#mh"
        ) !==
        b.closest(
          ".toast,.f-toast,.pop,.f-pop,.menu,.f-menu,.dlg,.f-dlg,.side,.f-side,[role=dialog],#sheet,#mh"
        )
      )
        continue;
      for (const x of ra)
        for (const y of rb) {
          const vy = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
          if (vy < Math.min(x.bottom - x.top, y.bottom - y.top) * 0.5) continue;
          const gap = Math.max(y.left - x.right, x.left - y.right);
          if (gap > -2 && gap < 4) {
            add("cramped", label(a) + " | " + label(b) + " gap " + gap.toFixed(1));
            break;
          }
        }
    }
  // c18 unexpected wrap: single-line controls and labels must render on one line
  const lines = (e) => {
    const tops = [];
    const w = document.createTreeWalker(e, 4);
    let n;
    while ((n = w.nextNode())) {
      if (!n.textContent.trim() || !vis(n.parentElement)) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (r.width < 1) continue;
        const mid = r.top + r.height / 2;
        if (!tops.some((t) => Math.abs(t - mid) < r.height * 0.6)) tops.push(mid);
      }
    }
    return tops.length;
  };
  const ONE =
    ".btn,.f-btn,button:not(.choice):not(.f-choice):not(.cc):not(.f-cc):not(.row):not(.arow__name):not(.tip__head):not(.abil):not(.badge):not(.plate):not(.f-char-hp-open),.chip,.f-chip,.pill,.tabs>*,.f-tabs>*,.boxtabs span,nav a,.label,.atable__head *,.stats .lbl,.num .lbl,.f-num .f-lbl,.ini .tag,.sg,.plate small,.tg,th,.grp .lbl,.f-grp .f-lbl";
  for (const e of document.querySelectorAll(ONE)) {
    if (!vis(e) || !(e.innerText || "").trim()) continue;
    if (lines(e) > 1) add("wrap", lines(e) + " lines " + label(e));
  }
  // c19 a number and its unit never split across lines
  const UNIT =
    /(\d[\d.,+d×]*)\s+(m|kg|mo|ma|mr|mp|me|PF|punti ferita|round|minuti?|ore|ora|gp|sp|cp|ft|hit points)(?![\wà-ÿ])/g;
  {
    const w = document.createTreeWalker(document.body, 4);
    let n;
    while ((n = w.nextNode())) {
      if (
        !n.parentElement ||
        n.parentElement.closest("script,style,svg") ||
        !vis(n.parentElement)
      )
        continue;
      const t = n.textContent;
      let m;
      UNIT.lastIndex = 0;
      while ((m = UNIT.exec(t))) {
        const rg = document.createRange();
        rg.setStart(n, m.index);
        rg.setEnd(n, m.index + m[0].length);
        const tops = [];
        for (const r of rg.getClientRects())
          if (r.width > 0 && !tops.some((x) => Math.abs(x - r.top) < 4)) tops.push(r.top);
        if (tops.length > 1)
          add("unit-split", "«" + m[0] + "» " + label(n.parentElement));
      }
    }
  }
  // c20 action rows that break unevenly: a lone item on the last line that is not a deliberate full-width row
  for (const c of document.querySelectorAll(
    ".pn-foot,.f-pn-foot,.acts,.f-acts,.iact,.foot .links,.r3,.hero__btns,.state .acts"
  )) {
    if (!vis(c)) continue;
    const kids = [...c.children].filter(vis);
    if (kids.length < 3) continue;
    const rows = [];
    for (const k of kids) {
      const t = k.getBoundingClientRect().top;
      const row = rows.find((r) => Math.abs(r.t - t) < 6);
      if (row) row.n.push(k);
      else rows.push({ t, n: [k] });
    }
    if (rows.length < 2) continue;
    rows.sort((a, b) => a.t - b.t);
    const last = rows[rows.length - 1];
    const cw = c.getBoundingClientRect().width;
    if (
      last.n.length === 1 &&
      rows[0].n.length >= 2 &&
      last.n[0].getBoundingClientRect().width < cw * 0.9
    )
      add(
        "uneven-row",
        label(c) + " → lone «" + (last.n[0].innerText || "").trim().slice(0, 24) + "»"
      );
  }
  // c21 geometry: text inside its element; every element inside its box (nearest bordered/filled ancestor)
  const isBox = (a) => {
    const cs = getComputedStyle(a);
    return (
      (parseFloat(cs.borderTopWidth) > 0 && parseFloat(cs.borderLeftWidth) > 0) ||
      (parseColor(cs.backgroundColor) && parseColor(cs.backgroundColor).a > 0.05)
    );
  };
  const parseColor = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    return { a: p.length > 3 ? p[3] : 1 };
  };
  const skip = (e) =>
    e.closest("svg,.frz,[data-orn],script,style,[aria-hidden=true],.dw") ||
    ["absolute", "fixed"].includes(getComputedStyle(e).position);
  for (const e of all) {
    if (!vis(e) || skip(e) || e.tagName === "svg") continue;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    let a = e.parentElement;
    while (a && a !== document.body && !isBox(a)) {
      const cs = getComputedStyle(a);
      if (/(auto|scroll|hidden)/.test(cs.overflowX + cs.overflowY)) {
        a = null;
        break;
      }
      a = a.parentElement;
    }
    if (!a || a === document.body || a === document.documentElement) continue;
    const cs = getComputedStyle(a);
    if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) continue;
    const b = a.getBoundingClientRect();
    const o = Math.max(
      b.left - r.left,
      r.right - b.right,
      b.top - r.top,
      r.bottom - b.bottom
    );
    if (o > 1.5)
      add("past-box", label(e) + " sticks out " + o.toFixed(0) + "px of " + label(a));
  }
  {
    const w = document.createTreeWalker(document.body, 4);
    let n;
    while ((n = w.nextNode())) {
      const p = n.parentElement;
      if (!p || !n.textContent.trim() || !vis(p) || p.closest("svg,script,style,.frz"))
        continue;
      const pr = p.getBoundingClientRect();
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const x of rg.getClientRects()) {
        if (x.width < 1) continue;
        if (x.right > pr.right + 1.5 || x.left < pr.left - 1.5) {
          add(
            "text-spill",
            "«" + n.textContent.trim().slice(0, 24) + "» out of " + label(p)
          );
          break;
        }
      }
    }
  }
  // c22 per text block (an element's own inline flow): labels ≤ 20 chars stay on one line; no single-word last line
  {
    const inl = (e) => {
      const d = getComputedStyle(e).display;
      return d === "inline" || d === "contents";
    };
    const blocks = new Map();
    const w = document.createTreeWalker(document.body, 4);
    let n;
    while ((n = w.nextNode())) {
      let p = n.parentElement;
      if (
        !p ||
        !n.textContent.trim() ||
        // Text a player wrote is shown as stored: its line breaks are theirs, not our copy.
        p.closest("svg,script,style,.frz,[aria-hidden=true],.sr,.f-sr,[data-user-text]")
      )
        continue;
      while (p && inl(p) && p.parentElement) p = p.parentElement;
      if (!p || !vis(p)) continue;
      if (!blocks.has(p)) blocks.set(p, []);
      blocks.get(p).push(n);
    }
    for (const [blk, nodes] of blocks) {
      const words = [];
      const wtxt = [];
      const wl = [],
        wr = [];
      const sepAt = new Set();
      let text = "";
      for (const tn of nodes) {
        text += tn.textContent;
        if (
          (tn.parentElement.classList.contains("dt") ||
            tn.parentElement.classList.contains("f-dt")) &&
          tn === tn.parentElement.firstChild
        )
          sepAt.add(words.length);
        const re = /\S+/g;
        let m;
        while ((m = re.exec(tn.textContent))) {
          const rg = document.createRange();
          rg.setStart(tn, m.index);
          rg.setEnd(tn, m.index + m[0].length);
          const rs = [...rg.getClientRects()].filter((x) => x.width > 0);
          if (rs.length) {
            words.push(rs[rs.length - 1].top + rs[rs.length - 1].height / 2);
            wtxt.push(m[0]);
            wl.push(rs[0].left);
            wr.push(rs[rs.length - 1].right);
            const tops = [];
            for (const x of rs)
              if (!tops.some((t) => Math.abs(t - x.top) < 4)) tops.push(x.top);
            if (tops.length > 1) add("word-break", "«" + m[0] + "» " + label(blk));
          }
        }
      }
      text = text.replace(/\s+/g, " ").trim();
      const ls = [];
      for (const y of words) if (!ls.some((l) => Math.abs(l - y) < 4)) ls.push(y);
      if (
        ls.length > 1 &&
        text.length <= 20 &&
        !blk.closest(".dlg .pnh,.side .pnh,.f-dlg .f-pnh")
      )
        add("short-wrap", ls.length + " lines «" + text + "» " + label(blk));
      for (let i = 0; i < words.length - 1; i++)
        if (/^[—–]$/.test(wtxt[i]) && Math.abs(words[i] - words[i + 1]) > 4)
          add(
            "dangling-sep",
            "«" + wtxt.slice(Math.max(0, i - 2), i + 2).join(" ") + "» " + label(blk)
          );
      for (let i = 1; i < words.length; i++)
        if (/^[·|]$/.test(wtxt[i]) && Math.abs(words[i] - words[i - 1]) > 4)
          add("dangling-sep", "line starts with «" + wtxt[i] + "» " + label(blk));
      if (ls.length > 1 && words.length >= 5 && !blk.closest(".dots,.f-dots")) {
        const lines = ls.map((y) => {
          const ix = words
            .map((v, i) => (Math.abs(v - y) < 4 ? i : -1))
            .filter((i) => i >= 0);
          return {
            n: ix.length,
            w: Math.max(...ix.map((i) => wr[i])) - Math.min(...ix.map((i) => wl[i])),
          };
        });
        const L = lines[lines.length - 1],
          mx = Math.max(...lines.map((x) => x.w));
        if ((L.n <= 2 && L.w < 0.34 * mx) || (L.n <= 3 && L.w < 0.15 * mx))
          add(
            "short-last",
            "«…" +
              text.slice(-30) +
              "» " +
              Math.round(L.w) +
              "/" +
              Math.round(mx) +
              " " +
              label(blk)
          );
      }
      if (ls.length > 1 && words.length > 2) {
        const last = words[words.length - 1];
        if (
          words.filter((y) => Math.abs(y - last) < 4).length === 1 &&
          !sepAt.has(words.length - 1) &&
          wtxt[wtxt.length - 2] !== "·" &&
          !/·$/.test(wtxt[wtxt.length - 2] || "")
        )
          add("orphan", "«…" + text.slice(-28) + "» " + label(blk));
      }
    }
  }
  // c25 banned terms in any visible text, label or title (product names, internal codes, dev words, AI, "!").
  // Real people's names stay private: the caller passes them as opts.privateTerms.
  {
    const BAN =
      /\b(Owlbear|Discord|Roll20|Foundry|Fantasy Grounds|ChatGPT|GPT|Claude|null|undefined|debug|seed|flag|writer|lorem|TODO|FIXME)\b|D&D Beyond|esempio\.it|FOL-\d|\bIA\b|\bAI\b|[^\s!]!/;
    // Same matching as the licensing guard: bare names word-bounded and case-sensitive, the rest as substrings.
    const people = (opts.privateTerms || []).map((t) => {
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(
        /^[A-Za-zÀ-ÿ]+$/.test(t) ? `(?<![A-Za-zÀ-ÿ])${esc}(?![A-Za-zÀ-ÿ])` : esc
      );
    });
    const seen = new Set();
    const test = (t, where) => {
      const m =
        t.match(BAN) || (people.some((re) => re.test(t)) ? ["a private name"] : null);
      if (m && !seen.has(t)) {
        seen.add(t);
        add("banned", "«" + m[0] + "» in " + where + ": " + t.slice(0, 60));
      }
    };
    const w = document.createTreeWalker(document.body, 4);
    let n;
    while ((n = w.nextNode())) {
      if (n.parentElement.closest("script,style,svg")) continue;
      const t = n.textContent.trim();
      if (t) test(t, "text");
    }
    document
      .querySelectorAll("[aria-label],[title],[placeholder],img[alt]")
      .forEach((e) => {
        for (const a of ["aria-label", "title", "placeholder", "alt"]) {
          const v = e.getAttribute(a);
          if (v) test(v, a);
        }
      });
    test(document.title, "title");
  }
  // c24 right edges: a panel header action ends where the panel body's content ends
  for (const pn of document.querySelectorAll(".pn,.f-pn")) {
    if (!vis(pn)) continue;
    const h = pn.querySelector(":scope>.pnh,:scope>.f-pnh"),
      b = pn.querySelector(":scope>.pnb,:scope>.f-pnb");
    if (!h || !b) continue;
    const x = h.querySelector(":scope>.x,:scope>.f-x");
    if (!x || !vis(x)) continue;
    const kids = [...x.querySelectorAll("*")].filter(
      (e) => vis(e) && (e.matches(".btn,.f-btn") || ownText(e))
    );
    const rx = Math.max(
      ...[
        ...kids.map((e) => {
          if (
            e.matches(".btn,.f-btn") &&
            /rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(e).backgroundColor) &&
            /rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(e).borderRightColor)
          ) {
            const ic = e.querySelector("svg");
            if (ic && !e.querySelector(".lab,.f-lab")?.getClientRects().length)
              return ic.getBoundingClientRect().right;
            const rg = document.createRange();
            rg.selectNodeContents(e);
            return rg.getBoundingClientRect().right;
          }
          return e.getBoundingClientRect().right;
        }),
        x.getBoundingClientRect().right,
      ].filter(Boolean)
    );
    const quietOnly =
      kids.length &&
      kids.every(
        (e) => e.closest(".btn.quiet,.f-btn.f-quiet") || !e.closest(".btn,.f-btn")
      );
    const bc = getComputedStyle(b);
    const br =
      b.getBoundingClientRect().right -
      parseFloat(bc.paddingRight) -
      parseFloat(bc.borderRightWidth);
    const hr =
      h.getBoundingClientRect().right - parseFloat(getComputedStyle(h).paddingRight);
    const ref = Math.abs(hr - br) < 2 ? br : br;
    if (Math.abs(rx - ref) > 3)
      add(
        "header-edge",
        label(h) +
          " action ends at " +
          Math.round(rx) +
          ", body content at " +
          Math.round(ref)
      );
  }
  // c23 one panel header component: 3 px top rule in the panel colour, band starting at 50% of that colour, same height and type, flush with its panel
  for (const h of document.querySelectorAll(".pnh,.f-pnh,.ftitle,.boxtabs")) {
    if (!vis(h) || h.closest(".pop,.f-pop,.menu")) continue;
    const cs = getComputedStyle(h);
    const box = h.parentElement;
    const bcs = getComputedStyle(box);
    const bt = parseFloat(cs.borderTopWidth);
    const col = (cs.borderTopColor.match(/[\d.]+/g) || []).map(Number);
    const st =
      cs.backgroundImage.match(
        /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)\)|rgba?\((\d+), (\d+), (\d+)/
      ) || [];
    let first = null;
    if (st[1]) first = [st[1] * 255, st[2] * 255, st[3] * 255];
    else if (st[4]) first = [+st[4], +st[5], +st[6]];
    const bad = [];
    if (Math.round(bt) !== 3) bad.push("top rule " + bt);
    if (!/clip|hidden/.test(bcs.overflow) && !box.matches(".pop,.f-pop"))
      bad.push("panel does not clip its header");
    if (!first) bad.push("no colour band");
    else if (Math.max(...first.map((v, i) => Math.abs(v - col[i] * 0.55))) > 8)
      bad.push("band not the panel colour");
    const r = h.getBoundingClientRect();
    if (
      Math.abs(Math.round(r.height) - 56) > 3 &&
      !h.closest(".dlg,.f-dlg,.side,.f-side")
    )
      bad.push("height " + Math.round(r.height));
    const fs = parseFloat(cs.fontSize);
    if (![15, 16, 18].includes(Math.round(fs))) bad.push("font " + fs);
    {
      const p = h.parentElement;
      const q = p.getBoundingClientRect();
      const pc = getComputedStyle(p);
      const bl = parseFloat(pc.borderLeftWidth) || 0,
        br = parseFloat(pc.borderRightWidth) || 0,
        btw = parseFloat(pc.borderTopWidth) || 0;
      const first = [...p.children].find(
        (c) => c.getClientRects().length && getComputedStyle(c).display !== "none"
      );
      if (h !== first) bad.push("header is not the first thing in its panel");
      if (
        Math.abs(r.left - q.left) > 0.6 ||
        Math.abs(q.right - r.right) > 0.6 ||
        Math.abs(r.top - q.top) > 0.6
      )
        bad.push("cap does not cover the panel edge");
    }
    if (bad.length) add("header", label(h) + ": " + bad.join(", "));
  }
  // c24 no text is cut by a clipping ancestor (overflow hidden/auto) or hidden behind the page edge
  {
    const w = document.createTreeWalker(document.body, 4);
    let n;
    while ((n = w.nextNode())) {
      const p = n.parentElement;
      if (
        !p ||
        !n.textContent.trim() ||
        !vis(p) ||
        p.closest(
          "svg,script,style,.frz,[aria-hidden=true],.sr,.f-sr,.tabs,.f-tabs,.pills,.boxtabs"
        )
      )
        continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      const rs = [...rg.getClientRects()].filter((x) => x.width > 1);
      for (let a = p; a && a !== document.body; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === "visible" && cs.overflowY === "visible") continue;
        if (/(auto|scroll)/.test(cs.overflowY) && a.scrollHeight > a.clientHeight + 2)
          break;
        const b = a.getBoundingClientRect();
        if (rs.some((x) => x.left < b.left - 1 || x.right > b.right + 1)) {
          add(
            "text-cut",
            "«" + n.textContent.trim().slice(0, 24) + "» cut by " + label(a)
          );
          break;
        }
      }
    }
  }
  return R;
};
