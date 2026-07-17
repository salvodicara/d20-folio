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
 * background-image rule above has a hole — a gilt "coin" (the section count
 * MEDALLION `.sec-count`, the disclosure KNOB) filled with a TRANSLUCENT gradient
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
 * Dark theme needs no probe: its standard ink is already light. Desktop-only:
 * ink colours don't vary by viewport.
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

/** Gilt "coin" objects that may sit on the candlelit backdrop in light theme — they
 *  must be self-backed opaque discs, never reliant on what is painted behind them. */
const GILT_COINS = ".sec-count, .section-disclosure-knob";

/** Two offender classes the one probe collects: dark loose ink on the art, and gilt
 *  coins whose translucent disc fails to carry their ink on the art. */
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
