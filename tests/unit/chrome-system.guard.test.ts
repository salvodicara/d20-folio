import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * THE CHROME SYSTEM — the plate material and the two tiers (DESIGN.md §4 "The
 * plate material"; tokens in `src/index.css` §05a, recipes in
 * `src/styles/folio.css`).
 *
 * The chrome is ONE material, measured off the reference rather than invented. A
 * plate is four tonal events — moat → metal → groove → body — plus ONE specular
 * dome, in one of exactly TWO tiers that differ only in light. This guard pins the
 * facts a later wave could quietly undo:
 *
 *   · THE PRIMITIVES EXIST IN BOTH THEMES. A dark-only material adapted to light
 *     is how the light theme became an inversion instead of a different room.
 *
 *   · THERE IS NO CREAM INNER LIP. The reference puts DARKNESS inside a frame;
 *     the plate brightens away from its edge because of the dome, not because of
 *     a highlight. Four independent systems used to contribute a 1px cream line
 *     under a top border, and the light masthead resolved THREE of them on one
 *     1px edge. The groove is the only thing immediately inside the frame.
 *
 *   · ONE DOME, IN BOTH THEMES, AT (50%, 30%). Its falloff IS the vignette and IS
 *     the basin — a second darkening layer (a smoke vignette, a `--plate-basin`
 *     ring, an inset haze) is the duplication that produced the ten-term card
 *     shadow.
 *
 *   · TWO TIERS, AND THE EARNED REGISTERS WEAR THE FAR ONE (Constitution §4.16).
 *     Quiet: 1px metal + the near seat. Earned: 2px metal + the far seat. The
 *     difference is LIGHT ONLY — never a radius, never a size, never a position.
 *
 *   · THE TWO GRAMMARS MAY NEVER COEXIST ON ONE ELEMENT. `box-shadow` is a
 *     REPLACED property, so a state rule that sets it without composing the plate
 *     tokens back in silently strips a plate of its material — and a rule that
 *     composes BOTH an `--edge-*` and an `--elev-*` term is the literal lasagna:
 *     two independently-authored bevels doing the same job in the same place.
 *     (`--elev-*` survives only on the controls the state-grammar phase has yet to
 *     reach; it may never touch a plate.)
 */

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(resolve(here, "../../src/index.css"), "utf8");
const folioCss = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");
/** folio.css with comments stripped + whitespace flattened, for selector probes. */
const folio = folioCss.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");

/** Extract the `[data-theme="<theme>"] { … }` first block body from index.css. */
function themeBlock(theme: "dark" | "light"): string {
  const start = indexCss.indexOf(`[data-theme="${theme}"]`);
  expect(start, `theme block ${theme} present`).toBeGreaterThan(-1);
  const open = indexCss.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < indexCss.length; i++) {
    if (indexCss[i] === "{") depth++;
    else if (indexCss[i] === "}") {
      depth--;
      if (depth === 0) return indexCss.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated ${theme} theme block`);
}

/** Read one custom property's raw value out of a block (comments stripped). */
function readToken(block: string, name: string): string {
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, "");
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(clean);
  expect(m, `${name} defined`).not.toBeNull();
  return (m?.[1] ?? "").replace(/\s+/g, " ").trim();
}

/** The material's closed set. Adding a seventh needs an owner ruling. */
const PRIMITIVES = [
  "--plate-face",
  "--plate-face-veil",
  "--plate-dome",
  "--plate-grain",
  "--edge-metal",
  "--edge-metal-earned",
  "--edge-groove",
  "--edge-seat",
  "--edge-seat-earned",
] as const;

describe("the chrome system — the material's tokens", () => {
  it("defines every primitive, and defines them in BOTH themes where the theme differs", () => {
    // The whole delta between the two themes is FOUR colour roles: the dome, the
    // grain, the groove and the cast. Everything else — all geometry, all
    // structure — is shared, so it is defined once at the root.
    const perTheme = [
      "--plate-dome",
      "--plate-grain",
      "--edge-groove",
      "--edge-seat",
      "--edge-seat-earned",
      "--plate-face-veil",
    ] as const;
    const root = indexCss.slice(0, indexCss.indexOf('[data-theme="light"]'));
    for (const name of PRIMITIVES) {
      expect(
        new RegExp(`${name}\\s*:`).test(root.replace(/\/\*[\s\S]*?\*\//g, "")),
        `MISSING ${name} at the root. The plate material is ONE closed set of nine ` +
          `primitives; a recipe that reaches past them is a new grammar.`
      ).toBe(true);
    }
    const light = themeBlock("light").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const name of perTheme) {
      expect(
        new RegExp(`${name}\\s*:`).test(light),
        `MISSING the LIGHT strike of ${name}. The light theme is a different room, ` +
          `not an inversion — it re-derives the dome, the grain, the groove and the cast.`
      ).toBe(true);
    }
  });

  it("puts DARKNESS inside the frame — never a cream inner lip", () => {
    for (const theme of ["dark", "light"] as const) {
      const groove = readToken(themeBlock(theme), "--edge-groove");
      // Two inset terms: the 1px line hard against the frame, then the ramp.
      expect(
        /^inset 0 0 0 1px \S.*, inset 0 0 20px 2px \S/.test(groove),
        `${theme}: --edge-groove must be \`inset 0 0 0 1px <dark>, inset 0 0 20px 2px <dark>\` ` +
          `— the darkness immediately inside the frame, then its ramp into the body.`
      ).toBe(true);
      // Dark grooves in black, light in warm umber (a black groove on cream reads
      // as grime on vellum). Neither may ever be a light value.
      expect(
        theme === "dark"
          ? /rgba\(0, 0, 0,/.test(groove)
          : /rgba\(74, 56, 20,/.test(groove),
        `${theme}: the groove must be ${theme === "dark" ? "black" : "warm umber"}.`
      ).toBe(true);
    }
    // The four cream-lip systems stay dead. `inset 0 1px 0 <near-white>` on a
    // PLATE is the banned idiom; the surviving `--elev-*` controls are not plates.
    for (const plate of [
      "\\.ch-card",
      "\\.info-card",
      "\\.party-card",
      "\\.modal",
      "\\.page-head\\.framed",
      "\\.folio-panel",
      "\\.tome-leaf-surface",
    ]) {
      const rules = [...folio.matchAll(new RegExp(`${plate} \\{([^}]*)\\}`, "g"))];
      for (const [, body] of rules) {
        expect(
          /inset 0 1px 0 (rgba\(2[0-9][0-9]|var\(--emboss)/.test(body ?? ""),
          `A cream inner lip re-appeared on a plate (${plate}). Inside a frame is ` +
            `darkness; the plate brightens AWAY from the edge because of the dome.`
        ).toBe(false);
      }
    }
  });

  it("domes every plate with ONE pool at (50%, 30%), in BOTH themes", () => {
    for (const theme of ["dark", "light"] as const) {
      const dome = readToken(themeBlock(theme), "--plate-dome");
      expect(
        /^radial-gradient\( ellipse \d+% \d+% at 50% \d+%,/.test(dome),
        `${theme}: --plate-dome must be ONE elliptical pool centred at 50% horizontally ` +
          `(the reference's specular sits at (50%, ~30%) — high and centred).`
      ).toBe(true);
      // Exactly two stops: the peak and its falloff to nothing. A third stop is a
      // second lighting event.
      expect(
        (dome.match(/rgba\(/g) ?? []).length,
        `${theme}: --plate-dome must have exactly TWO colour stops (peak → nothing).`
      ).toBe(2);
    }
    // Dark ships the dome too — the whole point of the material. (It used to be
    // `none` in dark, so the flagship theme's plates were undomed.)
    expect(readToken(themeBlock("dark"), "--plate-dome")).toContain("radial-gradient");
    // …and the ink compensation that pays for it is in place. The composite floor
    // itself is computed in verdict-ink-contrast.test.ts, WITH the dome term.
    expect(readToken(themeBlock("dark"), "--text-muted")).toBe("#ae9f7e");
    // No second darkening layer anywhere: the dome's falloff IS the vignette and
    // IS the basin.
    expect(indexCss).not.toMatch(/--plate-basin/);
    expect(folioCss).not.toMatch(/--plate-basin/);
    expect(folio).not.toMatch(/\.folio-panel::before \{[^}]*radial-gradient\(130%/);
  });

  it("wears TWO tiers, and the earned registers take the far one", () => {
    const QUIET: [string, string][] = [
      [".ch-card", "\\.ch-card \\{"],
      [".info-card", "\\.info-card \\{"],
      [".party-card", "\\.party-card \\{"],
      [".folio-panel", "\\.folio-panel \\{"],
    ];
    for (const [label, open] of QUIET) {
      expect(
        new RegExp(`${open}[^}]*var\\(--edge-seat\\)`).test(folio),
        `MISSING the QUIET seat on \`${label}\`. Ordinary plates are the reference's ` +
          `sibling panels: the same geometry as the active one, quieter light.`
      ).toBe(true);
      expect(
        new RegExp(`${open}[^}]*border: 1px solid var\\(--edge-metal\\)`).test(folio),
        `\`${label}\` must bind 1px of \`var(--edge-metal)\` — the quiet tier's metal.`
      ).toBe(true);
    }
    const EARNED: [string, string][] = [
      [".modal", "\\.modal \\{"],
      [".page-head.framed", "\\.page-head\\.framed \\{"],
      [".folio-panel.gilt-frame", "\\.folio-panel\\.gilt-frame \\{"],
      [".tome-leaf-surface", "\\.tome-leaf-surface \\{"],
    ];
    for (const [label, open] of EARNED) {
      expect(
        new RegExp(`${open}[^}]*var\\(--edge-seat-earned\\)`).test(folio),
        `MISSING the EARNED seat on \`${label}\`. The earned registers out-light the ` +
          `quiet plates — and that IS the whole tier difference (light, never geometry).`
      ).toBe(true);
    }
    // 2px of the earned metal on the earned registers. (`.gilt-frame` sets its
    // border-width + colour separately, since it composes onto `.folio-panel`.)
    for (const open of [
      "\\.modal \\{",
      "\\.page-head\\.framed \\{",
      "\\.tome-leaf-surface \\{",
    ]) {
      expect(
        new RegExp(`${open}[^}]*border: 2px solid var\\(--edge-metal-earned\\)`).test(
          folio
        ),
        `An earned register must bind 2px of \`var(--edge-metal-earned)\` (${open}). ` +
          `Frame thickness scales with the plate: 1px on cards, 2px on dialogs and bands.`
      ).toBe(true);
    }
    expect(folio).toMatch(/\.gilt-frame \{[^}]*border-width: 2px;[^}]*/);
    expect(folio).toMatch(/\.gilt-frame \{[^}]*border-color: var\(--edge-metal-earned\)/);
  });

  it("the ACTIVE combatant plate keeps its material", () => {
    // `box-shadow` is REPLACED, so a state rule that forgets the plate tokens
    // makes a card silently shed its substance the moment it becomes current.
    expect(
      /\.combat-current \{[^}]*var\(--edge-groove\), var\(--edge-seat-earned\)/.test(
        folio
      ),
      "MISSING the plate material on `.combat-current`. Whoever's turn it is IS the " +
        "active plate, so it takes the earned seat — and a state change must never cost " +
        "a surface its substance."
    ).toBe(true);
  });

  it("never lets the two bevel grammars coexist on one element", () => {
    const offenders: string[] = [];
    for (const [, selector, body] of folio.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decls = body ?? "";
      if (/var\(--edge-(groove|seat)/.test(decls) && /var\(--elev-/.test(decls)) {
        offenders.push((selector ?? "").trim());
      }
    }
    expect(
      offenders,
      "These rules compose BOTH the plate edge and the old elevation stack — two " +
        "independently-authored bevels doing the same job in the same place, which is " +
        "exactly the doubling that produced the ten-term card shadow. Pick one:\n  " +
        offenders.join("\n  ")
    ).toEqual([]);
  });

  it("never lets a rule silently strip a plate's material", () => {
    /** Subject compounds that ARE a plate (the last compound of a selector). */
    const PLATE = [
      /\.folio-panel(?![\w-])/,
      /\.info-card(?![\w-])/,
      /\.ch-card(?![\w-])/,
      /\.party-card(?![\w-])/,
      /\.combat-current(?![\w-])/,
      /\.page-head\.framed(?![\w-])/,
      /\.modal(?![\w-])/,
      /\.tome-leaf-surface(?![\w-])/,
    ];
    /**
     * Deliberate exemptions, documented at their sites in folio.css:
     *  - `.info-card.tip` (both themes) — the quiet creation-wizard note sheds the
     *    drop (`box-shadow: none`) so it does not read as a second cartouche.
     *    Allowlisted by SELECTOR, never by value;
     *  - a `::before` / `::after` subject — a pseudo is a CHILD box, so its shadow
     *    cannot replace the host plate's. (`.folio-panel::before` is where the one
     *    groove is drawn, because a negative-z child paints over the host's own
     *    inset shadows.)
     */
    const EXEMPT = [/::/, /\.info-card\.tip$/];

    /** Split a selector list on TOP-LEVEL commas only (`:not(:where(a, b))`). */
    const topLevelParts = (list: string): string[] => {
      const parts: string[] = [];
      let depth = 0;
      let buf = "";
      for (const ch of list) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === "," && depth === 0) {
          parts.push(buf);
          buf = "";
        } else buf += ch;
      }
      parts.push(buf);
      return parts;
    };

    const offenders: string[] = [];
    for (const [, rawSelector, body] of folio.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decls = body ?? "";
      if (!/box-shadow\s*:/.test(decls)) continue;
      const value = /box-shadow\s*:\s*([^;]+)/.exec(decls)?.[1]?.trim() ?? "";
      if (/var\(--edge-/.test(value)) continue;
      for (const part of topLevelParts(rawSelector ?? "")) {
        const subject =
          part
            .trim()
            .split(/\s*[\s>+~]\s*/)
            .pop() ?? "";
        if (!PLATE.some((re) => re.test(subject))) continue;
        if (EXEMPT.some((re) => re.test(subject))) continue;
        offenders.push(`${part.trim()} → box-shadow: ${value}`);
      }
    }
    expect(
      offenders,
      `These rules SET box-shadow on a plate-bearing selector without composing the ` +
        `plate's own \`--edge-*\` tokens, so they silently strip the material ` +
        `(box-shadow is REPLACED, never merged). Compose \`var(--edge-groove)\` + the ` +
        `tier's seat back in — a bare \`none\` does NOT excuse it (only the documented ` +
        `EXEMPT selectors opt out):\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
});
