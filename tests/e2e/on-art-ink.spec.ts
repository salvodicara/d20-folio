/**
 * E2E GUARD: on-art ink legibility — EVERY surface, light theme.
 *
 * **The defect class this guard kills (owner, 2026-06-12):** the candlelit
 * backdrop art (`body::after`) is DARK in BOTH themes, but light theme's
 * standard ink is dark — so any text/control rendered DIRECTLY on the raw
 * backdrop (not inside a card/surface) silently ships unreadable dark-on-dark.
 * It happened repeatedly (the read-only member-sheet back button, wizard "0/2"
 * counters); per-element fixes don't prevent the NEXT instance. This probe
 * does, generically:
 *
 *   1. Walk every visible text-bearing element on the surface (after
 *      `ready`/`prepare`, so overlays/wizard steps are included).
 *   2. Decide whether it sits on the RAW backdrop: an element is "on art" iff
 *      NO node from itself up to <body> paints an opaque-enough background
 *      (background-color alpha ≥ 0.5, or any background-image — cards paint
 *      with gradients). The daylight-sibling panel/card material (DESIGN.md §13)
 *      paints its ivory fill on a full-bleed `inset:0` negative-z `::before`
 *      pseudo (so the candlelit backdrop glows through uniformly) and leaves the
 *      element's own `background:none` — so the surface check probes the material
 *      PSEUDO too, but only a genuine BACKING layer (generated + positioned +
 *      full-bleed). The art layer itself is `body::after` (z:-1) — the ONE
 *      full-bleed pseudo that is NEVER a surface (it IS the backdrop this guard
 *      protects), so <body>/<html> pseudos are excluded — a fully transparent
 *      ancestor chain means the art is what's behind it.
 *   3. Assert the element's computed text ink is light-legible on the dark
 *      art: relative luminance ≥ 0.45. The canonical on-art inks pass with
 *      huge margin (`--text-on-backdrop` #f8f1de ≈ 0.88, gold-leaf-100
 *      ≈ 0.65); every standard light-theme ink fails hard (#342912 ≈ 0.03) —
 *      so the threshold cleanly separates "took the on-art treatment" from
 *      "inherited card ink onto the art".
 *
 * PRECISION: text inside any card/leaf/chip/input (opaque bg in its chain) is
 * never probed — no false positives on normal card text. Gradient-painted
 * surfaces count as surfaces via the background-image test. Elements using
 * background-clip:text (gilt gradient lettering) carry a background-image and
 * are therefore skipped as self-surfaces, which is correct — they are styled
 * deliberately, not inheriting field ink.
 *
 * GILT-COIN DISC PROBE (2026-06-30, closes a FALSE NEGATIVE): the skip-on-
 * background-image rule above has a hole — a gilt "coin" (the disclosure KNOB)
 * filled with a TRANSLUCENT gradient
 * (`color-mix(…, transparent)`) carries a background-image yet does NOT actually
 * back its ink, so the generic walk skipped it while the dark backdrop bled
 * through and the deep-gold numeral read BROWN (owner-reported, recurring). So a
 * second pass probes these coins directly: a coin that sits on the raw backdrop
 * (ancestors only — its own faint fill must not count) must EITHER paint a
 * genuinely OPAQUE disc (background-color alpha ≥ MIN_DISC_ALPHA) OR carry a
 * light-legible ink. This makes the whole CLASS un-shippable when illegible.
 *
 * The fix for a failure is NEVER a per-element colour: put the region in the
 * canonical `.on-art-scope` (folio.css) or give the element the `.on-art` /
 * `.btn.ghost.on-art` treatment — see DESIGN.md § On-art ink. The fix for a coin
 * failure is to strike it as a self-backed OPAQUE gilt disc (DESIGN §10).
 *
 * ── THE DARK LEG (and why the light-only premise was wrong) ─────────────────
 * This battery shipped LIGHT-ONLY on the premise "the art is dark, so light ink is
 * safe". The premise is false: our backdrops carry large BRIGHT regions, and
 * measured against the real composited pixels dark's own `--text-muted` read
 * **1.64:1** on the campaign hub's section counts, its gold rubric 1.95:1, and the
 * treasury's gp-total chip 1.46:1. A whole theme was un-probed for a whole class of
 * defect.
 *
 * So a SECOND probe runs in BOTH themes and measures CONTRAST rather than identity:
 *
 *   1. Collect every on-art text element as above (in-viewport only, so its box maps
 *      to screenshot pixels).
 *   2. Screenshot the page with ALL text painted transparent — that composite IS the
 *      ground: the art, the scrim, the grain, every plate, exactly as shipped. The
 *      probe never restates what it thinks is behind the text; it looks.
 *   3. Decide the element's GROUND. A tight, near-opaque halo (`--on-art-halo`: an
 *      innermost stop at ≤2px blur, alpha ≥ 0.8) IS the ground — that is the entire
 *      point of the treatment, and it is what an auditor credits as the backing. An
 *      element with no such halo is grounded by the backdrop, at its WORST sampled
 *      pixel (brightest for light ink, darkest for dark ink).
 *   4. Assert AA (4.5:1) against that ground.
 *
 * WHAT THIS PROBE CANNOT SEE, stated so the next reader does not assume otherwise:
 *   · **Text outside the viewport.** Boxes must map to screenshot pixels, so anything
 *     below the fold at 1440×2400 is not measured on that surface.
 *   · **The halo's own compositing.** A halo is credited at its declared colour; a
 *     1px 0.95-alpha edge over a bright patch is ~95% of that colour, not 100%.
 *   · **Sub-pixel glyph coverage.** It measures the ink COLOUR against the ground, not
 *     the antialiased edge of a hairline serif at 10px.
 *   · **AN EDGE.** A dashed affordance or a chip outline dissolving across the bright
 *     half of the art is INVISIBLE to this probe — a halo grounds ink and this probe
 *     credits it, but nothing here can see a border. Deleting the `--on-art-plate`
 *     recipe from the two self-backing on-art controls leaves this leg GREEN. That is
 *     why a control loose on the scene must self-back by RECIPE, and why the plate is
 *     pinned in `chrome-system.guard.test.ts` rather than measured here.
 *   · **Anything an ancestor clips or a later paint covers** — it samples the box the
 *     range reports, not the visible remainder of it.
 *
 * Desktop-only: ink colours don't vary by viewport.
 */

import { test, expect } from "@playwright/test";
import { SURFACES, DESKTOP, seedUI, seedLang, freezeMotion } from "./surfaces";

/** One illegible-ink offender found by the in-page probe. */
interface Offender {
  /** Compact locator path (3 ancestors of tag.class). */
  path: string;
  /** First chars of the offending text. */
  text: string;
  /** The computed ink. */
  color: string;
  /** Its relative luminance (0..1). */
  luminance: number;
}

/** Inks below this relative luminance are unreadable on the dark art. The
 *  canonical on-art inks sit ≥ 0.65; standard light ink sits ≤ 0.25. */
const MIN_ON_ART_LUMINANCE = 0.45;

/**
 * A gilt COIN (the struck count medallion + disclosure knob) on the backdrop must
 * paint a disc at least this opaque to genuinely carry its deep-gold ink. The old
 * translucent fill (`color-mix(…, transparent)`, alpha ≈ 0.16–0.30) let the dark
 * art bleed through; the fixed opaque disc paints alpha 1. The threshold cleanly
 * separates a real struck disc from a faint gilt glaze.
 */
const MIN_DISC_ALPHA = 0.8;

/** The gilt "coin" that may sit on the candlelit backdrop in light theme — it
 *  must be self-backed opaque discs, never reliant on what is painted behind them. */
const GILT_COINS = ".section-disclosure-knob";

/** Two offender classes the one probe collects: dark loose ink on the art, and a gilt
 *  coin whose translucent disc fails to carry its ink on the art. */
interface ProbeResult {
  ink: Offender[];
  coins: Offender[];
}

/**
 * The whole probe runs in ONE page.evaluate so a 35-surface sweep stays fast.
 * Returns the offender lists (both empty = the surface is clean).
 */
async function probeOnArtInk(
  page: import("@playwright/test").Page
): Promise<ProbeResult> {
  return page.evaluate(
    ({ MIN_LUM, MIN_DISC, COINS }) => {
      // ── colour parsing via canvas (handles rgb/oklab/color-mix serializations) ──
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return { ink: [], coins: [] };
      const rgba = (css: string): [number, number, number, number] => {
        ctx.clearRect(0, 0, 1, 1);
        // Reset first: assigning an invalid colour keeps the previous fillStyle.
        ctx.fillStyle = "#000";
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
      };
      const luminance = (r: number, g: number, b: number): number => {
        const lin = (v: number): number => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };

      // ── surface detection: does this node paint its own background? ──
      // A node is a surface if it paints an opaque-enough fill EITHER on the
      // element itself OR on a full-bleed material PSEUDO. The daylight-sibling
      // panel/card material (DESIGN.md §13) renders its ivory fill on an
      // `inset:0` negative-z `::before` (so the candlelit backdrop glows through
      // uniformly) and leaves the element's own `background: none` — so an
      // element-only check reads the panel as raw art and false-flags every rail
      // number inside it. We therefore also probe `::before`/`::after`, but ONLY
      // a genuine BACKING layer: generated, positioned, and FULL-BLEED (all four
      // insets 0) with a real fill. A decorative pseudo (a column divider inset
      // on one side, a small glyph) is not full-bleed and never counts.
      const fillsBox = (pcs: CSSStyleDeclaration): boolean =>
        pcs.content !== "none" &&
        (pcs.position === "absolute" || pcs.position === "fixed") &&
        pcs.top === "0px" &&
        pcs.right === "0px" &&
        pcs.bottom === "0px" &&
        pcs.left === "0px";
      const opaqueFill = (pcs: CSSStyleDeclaration): boolean => {
        if (pcs.backgroundImage !== "none") return true;
        const [, , , a] = rgba(pcs.backgroundColor);
        return a >= 0.5;
      };
      const isSurface = (el: Element): boolean => {
        const cs = getComputedStyle(el);
        if (opaqueFill(cs)) return true;
        // The raw candlelit art IS `body::after` (a full-bleed fixed pseudo) — the
        // very backdrop this guard protects against — so the <body>/<html> pseudos
        // are NEVER a backing surface; every real surface is a non-body element.
        if (el === document.body || el === document.documentElement) return false;
        for (const pseudo of ["::before", "::after"]) {
          const pcs = getComputedStyle(el, pseudo);
          if (fillsBox(pcs) && opaqueFill(pcs)) return true;
        }
        return false;
      };
      /** True iff nothing between el and <body> (inclusive) paints a surface —
       *  i.e. the element sits on the raw backdrop art. */
      const onRawArt = (el: Element): boolean => {
        for (
          let n: Element | null = el;
          n && n !== document.documentElement;
          n = n.parentElement
        ) {
          if (isSurface(n)) return false;
        }
        return true;
      };

      const compactPath = (el: Element): string => {
        const bits: string[] = [];
        for (let n: Element | null = el, i = 0; n && i < 3; n = n.parentElement, i++) {
          const cls = Array.from(n.classList).slice(0, 3).join(".");
          bits.unshift(n.tagName.toLowerCase() + (cls ? `.${cls}` : ""));
        }
        return bits.join(" > ");
      };

      // ── walk every visible text node ──
      const offenders: {
        path: string;
        text: string;
        color: string;
        luminance: number;
      }[] = [];
      const coinOffenders: {
        path: string;
        text: string;
        color: string;
        luminance: number;
      }[] = [];
      const seen = new Set<Element>();
      const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TITLE", "TEMPLATE"]);
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const textNode = walker.currentNode as Text;
        if (!textNode.data.trim()) continue;
        const el = textNode.parentElement;
        if (!el || seen.has(el) || SKIP_TAGS.has(el.tagName)) continue;
        seen.add(el);
        // Visible? (display/visibility/opacity chain + a real text box.)
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
          continue;
        }
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const box = range.getBoundingClientRect();
        if (box.width < 1 || box.height < 1) continue;
        if (!onRawArt(el)) continue;

        const cs = getComputedStyle(el);
        const [r, g, b, a] = rgba(cs.color);
        if (a < 0.1) continue; // invisible ink is not this defect class
        const lum = luminance(r, g, b);
        if (lum < MIN_LUM) {
          offenders.push({
            path: compactPath(el),
            text: textNode.data.trim().slice(0, 48),
            color: cs.color,
            luminance: Math.round(lum * 1000) / 1000,
          });
        }
      }

      // ── gilt-coin disc probe (CLOSES THE FALSE NEGATIVE, owner 2026-06-30) ──
      // The ink walk above SKIPS any element with a background-IMAGE as a "self-
      // surface" — but a gilt coin (the section count medallion, the disclosure
      // knob) filled with a TRANSLUCENT gradient (`color-mix(…, transparent)`) does
      // NOT actually back its deep-gold ink: on the candlelit backdrop the dark art
      // bled through and the numeral read BROWN/illegible, yet the gradient made the
      // generic probe treat the coin as "backed". A gradient fill is therefore NOT
      // proof of legibility. For these coins specifically: if the coin sits on the
      // raw backdrop (walking ANCESTORS only — its OWN faint fill must not count, that
      // translucency IS the bug), it must EITHER paint a genuinely opaque disc
      // (background-color alpha ≥ MIN_DISC, a real struck-metal base that carries the
      // ink) OR carry a light-legible ink that survives directly on the dark art. A
      // coin that does neither is the defect — flag it.
      for (const coin of Array.from(document.querySelectorAll(COINS))) {
        if (!coin.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
          continue;
        }
        const cbox = coin.getBoundingClientRect();
        if (cbox.width < 1 || cbox.height < 1) continue;
        // On the backdrop? Start from the PARENT so the coin's own translucent fill
        // never counts as its backing — only a real ancestor surface does.
        if (!coin.parentElement || !onRawArt(coin.parentElement)) continue;
        const ccs = getComputedStyle(coin);
        const [, , , discAlpha] = rgba(ccs.backgroundColor);
        if (discAlpha >= MIN_DISC) continue; // a genuinely opaque struck disc carries the ink
        const [cr, cg, cb] = rgba(ccs.color);
        if (luminance(cr, cg, cb) >= MIN_LUM) continue; // a light ink survives on the dark art
        coinOffenders.push({
          path: compactPath(coin),
          text: coin.textContent.trim().slice(0, 24) || "(glyph)",
          color: `disc ${ccs.backgroundColor} / ink ${ccs.color}`,
          luminance: Math.round(discAlpha * 1000) / 1000,
        });
      }

      return { ink: offenders, coins: coinOffenders };
    },
    { MIN_LUM: MIN_ON_ART_LUMINANCE, MIN_DISC: MIN_DISC_ALPHA, COINS: GILT_COINS }
  );
}

/** One measured on-art ink, with the ground the probe actually found. */
interface Measured {
  path: string;
  text: string;
  color: string;
  /** "halo" when a tight near-opaque outline grounds the ink; else "art". */
  ground: string;
  /** The contrast ratio against that ground. */
  ratio: number;
  /** The sampled backdrop luminance range under the text box. */
  bg: [number, number];
}

/** AA for normal text. On-art labels are 10–13px, so the large-text 3:1 never applies. */
const MIN_ON_ART_CONTRAST = 4.5;

/**
 * Measure every on-art ink against the REAL composited ground.
 *
 * The two halves are deliberately different in kind: the ground comes from a
 * SCREENSHOT (so the art, the scrim, the grain and every plate are included exactly
 * as shipped, with nothing restated in the probe), and the halo comes from the
 * COMPUTED STYLE (so a treatment that is declared but visually subtle is still
 * credited the way an auditor credits it).
 */
async function measureOnArtContrast(
  page: import("@playwright/test").Page
): Promise<Measured[]> {
  const cands = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return [];
    const rgba = (css: string): [number, number, number, number] => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 0) / 255];
    };
    const fillsBox = (p: CSSStyleDeclaration): boolean =>
      p.content !== "none" &&
      (p.position === "absolute" || p.position === "fixed") &&
      p.top === "0px" &&
      p.right === "0px" &&
      p.bottom === "0px" &&
      p.left === "0px";
    const opaqueFill = (p: CSSStyleDeclaration): boolean =>
      p.backgroundImage !== "none" || rgba(p.backgroundColor)[3] >= 0.5;
    const isSurface = (el: Element): boolean => {
      const cs = getComputedStyle(el);
      if (opaqueFill(cs)) return true;
      if (el === document.body || el === document.documentElement) return false;
      for (const pseudo of ["::before", "::after"]) {
        const pcs = getComputedStyle(el, pseudo);
        if (fillsBox(pcs) && opaqueFill(pcs)) return true;
      }
      return false;
    };
    const onRawArt = (el: Element): boolean => {
      for (
        let n: Element | null = el;
        n && n !== document.documentElement;
        n = n.parentElement
      ) {
        if (isSurface(n)) return false;
      }
      return true;
    };
    const compactPath = (el: Element): string => {
      const bits: string[] = [];
      for (let n: Element | null = el, i = 0; n && i < 3; n = n.parentElement, i++) {
        const cls = Array.from(n.classList).slice(0, 3).join(".");
        bits.unshift(n.tagName.toLowerCase() + (cls ? `.${cls}` : ""));
      }
      return bits.join(" > ");
    };
    /** The TIGHT innermost halo stop, if the element declares one. */
    const haloOf = (shadow: string): [number, number, number] | null => {
      const m = /^(rgba?\([^)]*\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/.exec(
        shadow
      );
      if (!m) return null;
      const [r, g, b, a] = rgba(m[1] ?? "");
      if (a < 0.8) return null;
      if (Math.abs(Number(m[2])) > 1 || Math.abs(Number(m[3])) > 1) return null;
      if (Number(m[4]) > 2) return null;
      return [r, g, b];
    };

    const out: {
      path: string;
      text: string;
      color: string;
      rgb: [number, number, number];
      box: { x: number; y: number; w: number; h: number };
      halo: [number, number, number] | null;
    }[] = [];
    const seen = new Set<Element>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const tn = walker.currentNode as Text;
      if (!tn.data.trim()) continue;
      const el = tn.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(tn);
      const bx = range.getBoundingClientRect();
      if (bx.width < 1 || bx.height < 1) continue;
      // In-viewport only: the box has to map to a screenshot pixel.
      if (bx.top < 0 || bx.bottom > innerHeight || bx.left < 0 || bx.right > innerWidth) {
        continue;
      }
      if (!onRawArt(el)) continue;
      const cs = getComputedStyle(el);
      const [r, g, b, a] = rgba(cs.color);
      if (a < 0.1) continue;
      out.push({
        path: compactPath(el),
        text: tn.data.trim().slice(0, 48),
        color: cs.color,
        rgb: [r, g, b],
        box: { x: bx.x, y: bx.y, w: bx.width, h: bx.height },
        halo: haloOf(cs.textShadow),
      });
    }
    return out;
  });

  if (cands.length === 0) return [];

  // The GROUND, straight off the rendered page: every text painted transparent, so
  // what remains is exactly the composite the ink sits on.
  await page.addStyleTag({
    content:
      "*, *::before, *::after { color: transparent !important; " +
      "text-shadow: none !important; -webkit-text-fill-color: transparent !important; }",
  });
  const shot = (await page.screenshot({ type: "png" })).toString("base64");

  return page.evaluate(
    async ({ cands: list, uri }) => {
      const img = new Image();
      img.src = uri;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      if (!g) return [];
      g.drawImage(img, 0, 0);
      const dpr = img.width / innerWidth;
      const lin = (v: number): number => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      const L = (r: number, gg: number, b: number): number =>
        0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b);
      const ratio = (a: number, b: number): number =>
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

      return list.map((cd) => {
        const x = Math.max(0, Math.round(cd.box.x * dpr));
        const y = Math.max(0, Math.round(cd.box.y * dpr));
        const w = Math.max(1, Math.min(Math.round(cd.box.w * dpr), c.width - x));
        const h = Math.max(1, Math.min(Math.round(cd.box.h * dpr), c.height - y));
        const d = g.getImageData(x, y, w, h).data;
        let min = 1;
        let max = 0;
        for (let i = 0; i < d.length; i += 4) {
          const l = L(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0);
          if (l < min) min = l;
          if (l > max) max = l;
        }
        const inkL = L(cd.rgb[0], cd.rgb[1], cd.rgb[2]);
        const haloL = cd.halo ? L(cd.halo[0], cd.halo[1], cd.halo[2]) : null;
        const r =
          haloL !== null
            ? ratio(inkL, haloL)
            : Math.min(ratio(inkL, min), ratio(inkL, max));
        return {
          path: cd.path,
          text: cd.text,
          color: cd.color,
          ground: haloL !== null ? "halo" : "art",
          ratio: Math.round(r * 100) / 100,
          bg: [Math.round(min * 1000) / 1000, Math.round(max * 1000) / 1000] as [
            number,
            number,
          ],
        };
      });
    },
    { cands, uri: `data:image/png;base64,${shot}` }
  );
}

for (const surface of SURFACES) {
  for (const theme of ["dark", "light"] as const) {
    test(`on-art contrast: ${surface.slug} [${theme}] — loose ink clears AA on the real ground`, async ({
      page,
    }) => {
      // A taller-than-life viewport so a surface's whole loose vocabulary is in the
      // frame (the probe only measures what a screenshot pixel can answer for).
      await page.setViewportSize({ width: DESKTOP.width, height: 2400 });
      await seedUI(page, theme, surface.edit ? "edit" : "play");
      await seedLang(page, "en");
      await page.goto(surface.route, { waitUntil: "domcontentloaded" });
      await surface.ready(page);
      if (surface.prepare) await surface.prepare(page);
      await freezeMotion(page);

      const measured = await measureOnArtContrast(page);
      // THE FLOOR (golden rule 13). `failing` is a FILTER over a derived set, so an
      // empty derivation and a clean surface are the same green — a probe that stops
      // finding on-art text (a walker that throws, a readiness signal that fires
      // before the art paints, a scope that gets renamed) would report perfection.
      expect(
        measured.length,
        `The on-art probe found NO loose ink at all on ${surface.slug} [${theme}]. ` +
          `Every surface in this battery is one that puts text on the candlelit ` +
          `backdrop — zero measurements means the probe stopped reading the page, ` +
          `not that the page is clean.`
      ).toBeGreaterThan(0);
      const failing = measured
        .filter((m) => m.ratio < MIN_ON_ART_CONTRAST)
        .sort((a, b) => a.ratio - b.ratio);

      const summary = failing
        .map(
          (m) =>
            `${m.path}\n  "${m.text}" — ${m.color} on the ${m.ground} ` +
            `(${m.ratio}:1, backdrop luminance ${m.bg[0]}–${m.bg[1]})`
        )
        .join("\n");
      expect(
        failing,
        `Loose ink on the backdrop fails AA against the REAL composited ground in ` +
          `${theme.toUpperCase()} (< ${MIN_ON_ART_CONTRAST}:1). The backdrops carry ` +
          `large BRIGHT regions in both themes, so "the art is dark" grounds nothing. ` +
          `The fix is the canonical treatment, never a one-off colour: put the region ` +
          `in \`.on-art-scope\` so the ink inherits the one \`--on-art-halo\`, and give ` +
          `any CONTROL loose on the scene its own \`--on-art-plate\` (a halo grounds ` +
          `INK; it cannot ground an EDGE). DESIGN.md § On-art ink:\n${summary}`
      ).toEqual([]);
    });
  }
}

for (const surface of SURFACES) {
  test(`on-art ink: ${surface.slug} [light] — no dark ink on the raw backdrop`, async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await seedUI(page, "light", surface.edit ? "edit" : "play");
    await seedLang(page, "en");
    await page.goto(surface.route, { waitUntil: "domcontentloaded" });
    await surface.ready(page);
    if (surface.prepare) await surface.prepare(page);
    await freezeMotion(page);

    const { ink, coins } = await probeOnArtInk(page);

    const summary = ink
      .map(
        (o) =>
          `${o.path}\n  "${o.text}" — ${o.color} (luminance ${o.luminance} < ${MIN_ON_ART_LUMINANCE})`
      )
      .join("\n");
    expect(
      ink,
      `Dark ink directly on the backdrop art in LIGHT theme (unreadable). ` +
        `Fix via the canonical on-art treatment (.on-art-scope / .on-art / ` +
        `.btn.ghost.on-art — DESIGN.md § On-art ink), never a one-off colour:\n${summary}`
    ).toEqual([]);

    const coinSummary = coins
      .map(
        (o) =>
          `${o.path}\n  "${o.text}" — ${o.color} (disc alpha ${o.luminance} < ${MIN_DISC_ALPHA}, ink not light-legible)`
      )
      .join("\n");
    expect(
      coins,
      `Gilt COIN (count medallion / disclosure knob) on the backdrop art in LIGHT ` +
        `theme whose translucent disc lets the dark art bleed through — the deep-gold ` +
        `numeral reads BROWN/illegible. A premium gilt register must SELF-BACK (DESIGN ` +
        `§10): strike it as an OPAQUE struck disc (opaque background-color base + sheen ` +
        `+ the --accent-glow halo), never reliant on what is behind it:\n${coinSummary}`
    ).toEqual([]);
  });
}
