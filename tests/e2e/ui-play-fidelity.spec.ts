/**
 * E2E: the Play screen keeps the approved prototype's look (docs/design/prototype/x-play.html).
 *
 * The prototype has two style systems, and Play's was once drawn with the campaign one
 * ("not as cool as the prototype", owner, 2026-11-03). This guard pins the computed
 * styles of the elements that carry Play's look to the values the prototype computes
 * at 1440 × 900 (read with Chromium from x-play.html). A change that drifts from them
 * fails here and names the element and the property. Where the owner has since moved the
 * look on («Lume», 2026-11-03: a hairline and a lit edge instead of the filigree and the
 * 3 px caps; the critique's text scale), the value is the new one and says so.
 * The design reset «BG3 craft» (2026-11-26) re-pins the type scale and the button family
 * (one serif, BG3's lit and framed glass); titles, caps and chips move with later slices.
 * Slice 3 (type) re-pins the titles to title case at 20 px, names at 32 px, display weights
 * at 600 and list rows (resource and action names) at the text weight, 400.
 * Slice 4 (surfaces) removes the decorative halos: the Hit Points figure has no glow.
 * Runs on the VITE_NEW_UI preview
 * (the `new-ui` project), with the public mock character.
 */
import { expect, test } from "@playwright/test";

/** [what, selector, CSS property, the prototype's computed value]. */
const EXPECTED: ReadonlyArray<readonly [string, string, string, string]> = [
  // the Play family's base: 16 px / 1.45
  ["base text", ".f-sheet", "font-size", "16px"],
  ["base text", ".f-sheet", "line-height", "23.2px"],
  // the header: depth, the name, the display numbers
  // «Lume»: the drop, the rim light, the vignette below; one hairline
  [
    "header",
    ".f-char",
    "box-shadow",
    "rgba(0, 0, 0, 0.55) 0px 14px 30px 0px, rgba(255, 232, 190, 0.05) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.55) 0px -56px 64px -48px inset",
  ],
  ["header", ".f-char", "border-top-width", "1px"],
  ["header", ".f-char", "border-top-color", "rgba(169, 130, 80, 0.5)"],
  ["name", ".f-char-id h1", "font-size", "32px"],
  ["name", ".f-char-id h1", "font-weight", "600"],
  ["ability modifier", ".f-ability dd b", "font-size", "24px"],
  ["ability modifier", ".f-ability dd b", "font-weight", "600"],
  ["AC", '.f-badge[data-shape="shield"] .f-badge-frame b', "font-size", "24px"],
  ["AC", '.f-badge[data-shape="shield"] .f-badge-frame b', "color", "rgb(255, 255, 255)"],
  [
    "hex value",
    '.f-badge:not([data-shape="shield"]) .f-badge-frame b',
    "font-size",
    "24px",
  ],
  ["Hit Points", ".f-char-hp-v b", "font-size", "52px"],
  ["Hit Points", ".f-char-hp-v b", "font-weight", "600"],
  // the design reset's surfaces (2026-11-27): the figure carries its colour, no halo
  ["Hit Points", ".f-char-hp-v b", "text-shadow", "none"],
  // panels: opaque with depth, the header band's padding
  ["panel", ".f-play .f-pn", "box-shadow", "rgba(0, 0, 0, 0.45) 0px 8px 20px 0px"],
  // the owner's panel material (2026-11-06): a lit top fading down, in place of the flat fill
  [
    "panel",
    ".f-play .f-pn",
    "background-image",
    "linear-gradient(rgba(33, 26, 19, 0.97), rgba(17, 13, 10, 0.97))",
  ],
  ["panel title", ".f-play .f-pnh", "padding-top", "12px"],
  ["resource name", ".f-res-t", "font-weight", "400"],
  ["resource name", ".f-res-t", "color", "rgb(255, 255, 255)"],
  // the centre: the Cinzel tab band, the turn strip, the advice line
  ["tab band", ".f-centre > .f-tabs", "border-top-width", "0px"],
  ["tab band", ".f-centre > .f-tabs", "min-height", "56px"],
  ["tab", ".f-centre > .f-tabs > button", "text-transform", "none"],
  ["tab", ".f-centre > .f-tabs > button", "font-size", "16px"],
  ["turn title", ".f-turn-t", "font-weight", "600"],
  ["turn title", ".f-turn-t", "font-size", "20px"],
  ["advice", ".f-playbook-h", "font-weight", "400"],
  ["advice", ".f-playbook-h", "color", "rgb(201, 187, 163)"],
  // filters as the chip family's pills (design reset «BG3 craft», slice 2): the picked one is
  // BG3's selected tile, a pale-gold line; then group headers, rows, the row button, the slot
  [
    "filter on",
    '.f-filters .f-chip[aria-pressed="true"]',
    "border-top-color",
    "rgb(238, 209, 167)",
  ],
  ["filter on", '.f-filters .f-chip[aria-pressed="true"]', "border-radius", "20px"],
  ["filter on", '.f-filters .f-chip[aria-pressed="true"]', "color", "rgb(244, 240, 234)"],
  ["group header", ".f-act-gh", "font-size", "16px"],
  ["group header", ".f-act-gh", "text-transform", "none"],
  ["action name", ".f-act:not(.f-act-head) .f-row-t", "font-weight", "400"],
  ["action name", ".f-act:not(.f-act-head) .f-row-t", "color", "rgb(255, 255, 255)"],
  [
    "row button",
    ".f-act > .f-btn",
    "background-image",
    "linear-gradient(rgb(45, 35, 24) 0%, rgb(62, 48, 32) 44%, rgb(55, 43, 28) 50%, rgb(55, 43, 28) 70%, rgb(43, 34, 25) 100%)",
  ],
  ["row button", ".f-act > .f-btn", "border-top-color", "rgb(173, 121, 71)"],
  ["row button", ".f-act > .f-btn", "font-weight", "400"],
  ["action slot", ".f-act-slot", "width", "46px"],
];

test("the Play screen keeps the prototype's computed look", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("i18nextLng", "it"));
  await page.goto("/characters/lyra-voss-1");
  await page.locator(".f-char .f-ability").first().waitFor({ timeout: 30000 });
  await page.locator(".f-act-slot").first().waitFor({ timeout: 30000 });
  const drift = await page.evaluate((expected) => {
    const out: string[] = [];
    for (const [what, selector, prop, want] of expected) {
      const el = [...document.querySelectorAll(selector)].find(
        (e) => e.getClientRects().length > 0
      );
      if (!el) {
        out.push(`${what}: no visible ${selector}`);
        continue;
      }
      const got = getComputedStyle(el).getPropertyValue(prop).trim();
      if (got !== want)
        out.push(`${what} (${selector}) ${prop}: ${got}, prototype ${want}`);
    }
    return out;
  }, EXPECTED);
  expect(drift).toEqual([]);
});
