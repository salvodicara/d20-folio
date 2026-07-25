/**
 * statblock-ink-contrast — REAL-Chromium proof that every ink the bestiary
 * statblock paints clears WCAG-AA 4.5:1 on the carved `--bg-recessed` plaque, in
 * BOTH themes.
 *
 * WHY A BROWSER PROBE AND NOT axe: on this app axe's `color-contrast` rule is
 * INERT. The parchment backdrop (`body::after`) and the plate pseudo-elements
 * mean axe cannot resolve a background for prose — on this very surface it
 * reports 125 nodes "incomplete" and ZERO violations, `.rt-adv` among them. An
 * a11y gate that can never fail is not a gate, so the ink families need a probe
 * that resolves the composited ground itself.
 *
 * WHY NOT THE UNIT GUARD ALONE: `tests/unit/verdict-ink-contrast.test.ts` pairs
 * TOKENS out of the stylesheet. It cannot see the CASCADE — `.mon-entry strong`
 * (0,1,1) once out-specified the grammar's single-class rules and repainted
 * Advantage/Disadvantage/dice gilt, so the tokens the unit guard certified were
 * not the colours the browser painted. This spec measures `getComputedStyle`, so
 * a specificity regression is caught the moment it lands.
 *
 * The leaf is `mimic`: the one SRD statblock whose prose fires every arm of the
 * rules-text grammar (`.rt-adv` · `.rt-dis` · `.rt-cond` · `.rt-dmg` ·
 * `.rt-value`) AND carries a damage-ledger run (`.mon-dmg`, Acid immunity).
 */

import { test, expect } from "@playwright/test";
import { seedUI, seedLang, freezeMotion, type Theme } from "./surfaces";

const AA = 4.5;
/** Every ink register the plaque paints. All must be PRESENT on the leaf — an
 *  absent arm means the fixture went blind, which is how `.rt-adv` shipped at
 *  4.156:1 behind a `skeleton` leaf that never says "Advantage". */
const INK_CLASSES = ["rt-adv", "rt-dis", "rt-cond", "rt-dmg", "rt-value", "mon-dmg"];

interface Measured {
  cls: string;
  text: string;
  fg: string;
  bg: string;
  ratio: number;
}

for (const theme of ["dark", "light"] as const satisfies readonly Theme[]) {
  test(`${theme}: every statblock ink ≥ ${AA}:1 on the carved plaque`, async ({
    page,
  }) => {
    await seedUI(page, theme, "play");
    await seedLang(page, "en");
    await page.goto("/compendium?type=monster&sel=mimic", {
      waitUntil: "domcontentloaded",
    });
    await page.locator(".beast-ref .rt-adv").first().waitFor({ timeout: 20_000 });
    await freezeMotion(page);

    const measured = JSON.parse(
      await page.evaluate((classes) => {
        const lum = (c: [number, number, number]) => {
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
        };
        const rgb = (s: string): [number, number, number] => {
          const n = (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
          return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0];
        };
        const out = [];
        const sel = classes.map((c) => `.beast-ref .${c}`).join(", ");
        for (const el of document.querySelectorAll<HTMLElement>(sel)) {
          // The composited ground: the nearest ancestor that actually paints an
          // OPAQUE background colour. Everything between is transparent, so this
          // IS the pixel behind the glyphs.
          let node: HTMLElement | null = el.parentElement;
          let bg = "";
          while (node) {
            const c = getComputedStyle(node).backgroundColor;
            if (c && c !== "transparent" && !/,\s*0\)$/.test(c)) {
              bg = c;
              break;
            }
            node = node.parentElement;
          }
          const fg = getComputedStyle(el).color;
          const [hi, lo] = [lum(rgb(fg)), lum(rgb(bg))].sort((a, b) => b - a) as [
            number,
            number,
          ];
          out.push({
            cls: el.className.split(" ")[0],
            text: el.textContent.slice(0, 24),
            fg,
            bg,
            ratio: (hi + 0.05) / (lo + 0.05),
          });
        }
        return JSON.stringify(out);
      }, INK_CLASSES)
    ) as Measured[];

    // The fixture must exercise EVERY register — a silently narrowed leaf is the
    // failure mode this spec exists to prevent.
    const seen = new Set(measured.map((m) => m.cls));
    expect(
      [...INK_CLASSES].filter((c) => !seen.has(c)),
      "every ink arm painted"
    ).toEqual([]);

    const failures = measured
      .filter((m) => m.ratio < AA)
      .map((m) => `${m.cls} "${m.text}" ${m.fg} on ${m.bg} = ${m.ratio.toFixed(3)}:1`);
    expect([...new Set(failures)], `statblock inks below AA (${theme})`).toEqual([]);
  });
}
