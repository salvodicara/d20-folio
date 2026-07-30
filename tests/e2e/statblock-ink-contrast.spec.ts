/**
 * statblock-ink-contrast — REAL-Chromium proof that every ink the bestiary
 * statblock paints clears WCAG-AA 4.5:1 on the carved `--bg-recessed` plaque, in
 * BOTH themes.
 *
 * WHY A BROWSER PROBE AND NOT axe: on this app axe's `color-contrast` rule is
 * INERT. The parchment backdrop (`body::after`) and the plate pseudo-elements
 * mean axe cannot resolve a background for prose — on this very surface it
 * reports 121 nodes "incomplete" and ZERO violations, `.rt-adv` among them. An
 * a11y gate that can never fail is not a gate, so the ink families need a probe
 * that resolves the composited ground itself. (The inertness is APP-WIDE, not a
 * property of this page — see DESIGN.md → "Self-enforcing gates".)
 *
 * WHY NOT THE UNIT GUARD ALONE: `tests/unit/verdict-ink-contrast.test.ts` pairs
 * TOKENS out of the stylesheet. It cannot see the CASCADE — `.mon-entry strong`
 * (0,1,1) once out-specified the grammar's single-class rules and repainted
 * Advantage/Disadvantage/dice gilt, so the tokens the unit guard certified were
 * not the colours the browser painted.
 *
 * A CONTRAST RATIO ALONE DOES NOT CATCH THAT. Re-injecting
 * `.mon-entry strong { color: var(--accent-text) }` leaves this spec at ZERO
 * failures, because gilt measures 6.875:1 on the plaque — comfortably AA, and
 * comfortably the wrong colour. So the spec asserts IDENTITY as well as ratio:
 * each token-driven arm's computed colour must EQUAL the token it is declared
 * to ride, and no arm may be painted the gilt lead's `--accent-text`. That is
 * the assertion that fails the moment a specificity regression lands.
 *
 * AND THE GROUND MUST BE REAL. The ancestor walk claims to find "the pixel
 * behind the glyphs"; a check for "not fully transparent" does not deliver that.
 * A translucent ancestor (`rgba(205,187,142,.35)`) would be treated as opaque
 * and the ratio computed against a colour nothing paints, and an element with NO
 * painted ancestor would fall through to `""` → black, which every dark ink
 * passes against. Both now FAIL LOUDLY, naming the node.
 *
 * The leaf is `mimic`: the one SRD statblock whose prose fires every arm of the
 * rules-text grammar (`.rt-adv` · `.rt-dis` · `.rt-cond` · `.rt-dmg` ·
 * `.rt-value`) AND carries a damage-ledger run (`.mon-dmg`, Acid immunity).
 *
 * BLIND SPOT — ONE LEAF IS ONE FACT PER RAMP. The damage and condition inks are
 * PER-FACT: this leaf prints Acid, so Acid is the only `--dmg-*-ink` this spec
 * can measure, and `cold` shipped at 4.49:1 on the plaque (the Imp's
 * "Resistances Cold") with this spec green. The ramps as a WHOLE are pinned on
 * the plaque's derived ground by `tests/unit/verdict-ink-contrast.test.ts`; this
 * spec owns what token pairing cannot see — the cascade, the identity, and the
 * composited ground.
 */

import { test, expect } from "@playwright/test";
import { seedUI, seedLang, freezeMotion, type Theme } from "./surfaces";

const AA = 4.5;
/** Every ink register the plaque paints. All must be PRESENT on the leaf — an
 *  absent arm means the fixture went blind, which is how `.rt-adv` shipped at
 *  4.156:1 behind a `skeleton` leaf that never says "Advantage". */
const INK_CLASSES = ["rt-adv", "rt-dis", "rt-cond", "rt-dmg", "rt-value", "mon-dmg"];

/** The token each token-driven arm is DECLARED to ride (folio.css). `.rt-dmg` /
 *  `.rt-cond` / `.mon-dmg` carry a per-fact inline `style` colour instead, so
 *  they have no single token to pin — they are covered by the `--accent-text`
 *  prohibition below. */
const ARM_TOKEN: Readonly<Record<string, string>> = {
  "rt-adv": "--semantic-success",
  "rt-dis": "--semantic-danger",
  "rt-value": "--text-special",
};

interface Measured {
  cls: string;
  text: string;
  fg: string;
  bg: string;
  /** Alpha of the ground we resolved. Anything below 1 means the walk did NOT
   *  find the pixel behind the glyphs. `null` = no painted ancestor at all. */
  bgAlpha: number | null;
  /** Human-readable descriptor of the ancestor we took the ground from. */
  bgNode: string;
  ratio: number;
}

interface Probe {
  measured: Measured[];
  /** Each `ARM_TOKEN` value resolved to a computed `rgb(...)` off the root. */
  tokens: Record<string, string>;
  /** The gilt lead's colour — no grammar arm may equal it. */
  accentText: string;
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

    const probe = JSON.parse(
      await page.evaluate(
        ([classes, tokenNames]) => {
          const lum = (c: [number, number, number]) => {
            const f = (v: number) => {
              const s = v / 255;
              return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
          };
          const nums = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
          const rgb = (s: string): [number, number, number] => {
            const n = nums(s);
            return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0];
          };
          /** Alpha of a computed colour — `rgb(a,b,c)` is 1, `rgba(a,b,c,α)` is α. */
          const alphaOf = (s: string): number => {
            const n = nums(s);
            return n.length >= 4 ? (n[3] ?? 1) : 1;
          };
          /** A token's REAL painted value: let the browser resolve `var()` for us. */
          const resolveToken = (name: string): string => {
            const probeEl = document.createElement("span");
            probeEl.style.color = `var(${name})`;
            probeEl.style.position = "absolute";
            document.documentElement.appendChild(probeEl);
            const c = getComputedStyle(probeEl).color;
            probeEl.remove();
            return c;
          };
          const describeNode = (n: HTMLElement | null) =>
            n
              ? `${n.tagName.toLowerCase()}${n.className ? `.${n.className.trim().split(/\s+/).join(".")}` : ""}`
              : "(none)";

          const measured = [];
          const sel = classes.map((c) => `.beast-ref .${c}`).join(", ");
          for (const el of document.querySelectorAll<HTMLElement>(sel)) {
            // The composited ground: the nearest ancestor that actually paints a
            // background colour. Everything between must be TRANSPARENT for this
            // to be the pixel behind the glyphs — so we record the alpha we found
            // and let the spec refuse anything that is not fully opaque.
            let node: HTMLElement | null = el.parentElement;
            let bg = "";
            let bgAlpha: number | null = null;
            let bgNode = "(none)";
            while (node) {
              const c = getComputedStyle(node).backgroundColor;
              const a = c ? alphaOf(c) : 0;
              if (c && c !== "transparent" && a > 0) {
                bg = c;
                bgAlpha = a;
                bgNode = describeNode(node);
                break;
              }
              node = node.parentElement;
            }
            const fg = getComputedStyle(el).color;
            const [hi, lo] = [lum(rgb(fg)), lum(rgb(bg))].sort((a, b) => b - a) as [
              number,
              number,
            ];
            measured.push({
              cls: el.className.split(" ")[0],
              text: el.textContent.slice(0, 24),
              fg,
              bg,
              bgAlpha,
              bgNode,
              ratio: (hi + 0.05) / (lo + 0.05),
            });
          }
          const tokens: Record<string, string> = {};
          for (const t of tokenNames) tokens[t] = resolveToken(t);
          return JSON.stringify({
            measured,
            tokens,
            accentText: resolveToken("--accent-text"),
          });
        },
        [INK_CLASSES, [...new Set(Object.values(ARM_TOKEN))]] as const
      )
    ) as Probe;
    const { measured, tokens, accentText } = probe;

    // The fixture must exercise EVERY register — a silently narrowed leaf is the
    // failure mode this spec exists to prevent.
    const seen = new Set(measured.map((m) => m.cls));
    expect(
      [...INK_CLASSES].filter((c) => !seen.has(c)),
      "every ink arm painted"
    ).toEqual([]);

    // ── The GROUND must be the pixel behind the glyphs ────────────────────────
    // A translucent ancestor is not a ground: the ratio would be computed
    // against a colour nothing paints. No ancestor at all is worse — it used to
    // fall through to "" → rgb(0,0,0), a black ground the plaque never renders,
    // which every dark ink passes against. Both fail here, naming the node, so
    // the docblock's "this IS the pixel behind the glyphs" is enforced rather
    // than asserted.
    const unsound = measured
      .filter((m) => m.bgAlpha === null || m.bgAlpha < 1)
      .map((m) =>
        m.bgAlpha === null
          ? `${m.cls} "${m.text}" — NO painted ancestor; the ground is unknown, not black`
          : `${m.cls} "${m.text}" — ground ${m.bg} on <${m.bgNode}> is TRANSLUCENT (alpha ${m.bgAlpha}); composite it or make it opaque`
      );
    expect(
      [...new Set(unsound)],
      `statblock grounds that are not a real opaque pixel (${theme})`
    ).toEqual([]);

    // ── IDENTITY: the arm paints the token it is declared to ride ─────────────
    // The ratio check alone cannot see a specificity regression — gilt
    // `--accent-text` measures 6.875:1 on the plaque, so `.mon-entry strong`
    // repainting the whole grammar passes it. Equality cannot be fooled.
    const misinked = measured.flatMap((m) => {
      const out: string[] = [];
      const token = ARM_TOKEN[m.cls];
      if (token && m.fg !== tokens[token])
        out.push(`${m.cls} "${m.text}" paints ${m.fg}, not ${token} (${tokens[token]})`);
      // Every arm, token-driven or inline-styled, must escape the gilt lead.
      if (m.fg === accentText)
        out.push(
          `${m.cls} "${m.text}" paints the gilt lead --accent-text (${accentText})`
        );
      return out;
    });
    expect(
      [...new Set(misinked)],
      `statblock arms painting the wrong token (${theme})`
    ).toEqual([]);

    const failures = measured
      .filter((m) => m.ratio < AA)
      .map((m) => `${m.cls} "${m.text}" ${m.fg} on ${m.bg} = ${m.ratio.toFixed(3)}:1`);
    expect([...new Set(failures)], `statblock inks below AA (${theme})`).toEqual([]);
  });
}
