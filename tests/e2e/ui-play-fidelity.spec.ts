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
  ["name", ".f-char-id h1", "font-size", "36px"],
  ["name", ".f-char-id h1", "font-weight", "700"],
  ["ability modifier", ".f-ability dd b", "font-size", "26px"],
  ["ability modifier", ".f-ability dd b", "font-weight", "700"],
  ["AC", '.f-badge[data-shape="shield"] .f-badge-frame b', "font-size", "34px"],
  ["AC", '.f-badge[data-shape="shield"] .f-badge-frame b', "color", "rgb(255, 255, 255)"],
  [
    "hex value",
    '.f-badge:not([data-shape="shield"]) .f-badge-frame b',
    "font-size",
    "24px",
  ],
  ["Hit Points", ".f-char-hp-v b", "font-size", "64px"],
  ["Hit Points", ".f-char-hp-v b", "font-weight", "700"],
  // the prototype's 0.533 alpha, written as a token to two places
  ["Hit Points", ".f-char-hp-v b", "text-shadow", "rgba(70, 240, 74, 0.53) 0px 0px 14px"],
  // panels: opaque with depth, the header band's padding
  ["panel", ".f-play .f-pn", "box-shadow", "rgba(0, 0, 0, 0.45) 0px 8px 20px 0px"],
  ["panel", ".f-play .f-pn", "background-color", "rgb(26, 22, 17)"],
  ["panel title", ".f-play .f-pnh", "padding-top", "12px"],
  ["resource name", ".f-res-t", "font-weight", "700"],
  ["resource name", ".f-res-t", "color", "rgb(255, 255, 255)"],
  // the centre: the Cinzel tab band, the turn strip, the advice line
  ["tab band", ".f-centre > .f-tabs", "border-top-width", "0px"],
  ["tab band", ".f-centre > .f-tabs", "min-height", "56px"],
  ["tab", ".f-centre > .f-tabs > button", "text-transform", "uppercase"],
  ["tab", ".f-centre > .f-tabs > button", "font-size", "14px"],
  ["turn title", ".f-turn-t", "font-weight", "900"],
  ["turn title", ".f-turn-t", "font-size", "18px"],
  ["advice", ".f-playbook-h", "font-weight", "400"],
  ["advice", ".f-playbook-h", "color", "rgb(201, 187, 163)"],
  // filters as underlined tabs, group headers, rows, the row button, the slot
  [
    "filter on",
    '.f-filters .f-chip[aria-pressed="true"]',
    "box-shadow",
    "rgb(232, 220, 196) 0px -2px 0px 0px inset",
  ],
  ["filter on", '.f-filters .f-chip[aria-pressed="true"]', "border-radius", "0px"],
  ["group header", ".f-act-gh", "font-size", "16px"],
  ["group header", ".f-act-gh", "text-transform", "uppercase"],
  ["action name", ".f-act:not(.f-act-head) .f-row-t", "font-weight", "700"],
  ["action name", ".f-act:not(.f-act-head) .f-row-t", "color", "rgb(255, 255, 255)"],
  [
    "row button",
    ".f-act > .f-btn",
    "background-image",
    "linear-gradient(rgb(37, 30, 23), rgb(33, 27, 21))",
  ],
  ["row button", ".f-act > .f-btn", "border-top-color", "rgb(106, 81, 48)"],
  ["row button", ".f-act > .f-btn", "font-weight", "700"],
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
