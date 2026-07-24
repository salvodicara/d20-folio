import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * THE PLATE GRAMMAR (DESIGN.md §4 "The plate grammar"; tokens in `src/index.css`
 * §05b, recipes in `src/styles/folio.css`).
 *
 * The BG3 panel-material push (owner, 2026-07-24: "davvero migliorare i bordi
 * delle schede … come Baldur's Gate 3, senza rompere niente"). Studied from the
 * owner's own spellbook crop plus the trade / character-creation / level-up
 * plates: a BG3 panel is cast → MOAT → directional EDGE → body → ornament, and
 * the app shipped everything except the middle two. This guard pins the
 * load-bearing facts of what replaced them, so a later refactor cannot silently
 * flatten a plate back into "a 1px line and a fill":
 *
 *   - the four primitives exist in BOTH themes (never a dark-only material);
 *   - the edge is DIRECTIONAL — one light source, high and slightly left: the
 *     lit inset rides `+1px +1px` (top + left), the shade rides `-1px -1px`
 *     (bottom + right), and the plate sits in an outer 1px MOAT. Flip either
 *     sign and the light model breaks;
 *   - there are exactly TWO tiers and the EARNED registers wear the hero one
 *     (Constitution §4.16) — BG3's active-vs-sibling grammar, expressed only in
 *     light, never in geometry;
 *   - DARK ships NO specular sheen, and that is a MEASURED LIMIT: dark plates are
 *     translucent over painted-darkness art (`--panel-alpha`), where `--text-muted`
 *     on the brightest composite already sits at 4.70:1 against the 4.5 AA floor
 *     (`verdict-ink-contrast.test.ts` → "candlelit translucency composite floor").
 *     A 1.5% sheen costs 0.17 of that and is invisible; a 3% sheen FAILS AA. Light
 *     ships the sheen because its ivory is flat and its ink has ~14:1 headroom;
 *   - the plate grammar rides the HOST'S OWN border box, so the shipped style-A
 *     corner knot (`--frame-ornate`, pinned by `ornament-vocabulary.guard.test.ts`)
 *     keeps its -13.3px registration untouched — the material sits UNDER the
 *     goldwork, never re-seats it.
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

/** Read one custom property's raw value out of a theme block (comments stripped). */
function readToken(block: string, name: string): string {
  const clean = block.replace(/\/\*[\s\S]*?\*\//g, "");
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(clean);
  expect(m, `${name} defined`).not.toBeNull();
  return (m?.[1] ?? "").replace(/\s+/g, " ").trim();
}

const PRIMITIVES = [
  "--plate-rule",
  "--plate-edge",
  "--plate-edge-hero",
  "--plate-sheen",
  "--plate-basin",
] as const;

describe("the plate grammar — tokens", () => {
  for (const theme of ["dark", "light"] as const) {
    const block = themeBlock(theme);

    it(`${theme}: defines every plate primitive`, () => {
      for (const name of PRIMITIVES) {
        expect(
          new RegExp(`${name}\\s*:`).test(block.replace(/\/\*[\s\S]*?\*\//g, "")),
          `MISSING ${name} in the ${theme} theme block. The plate material is designed ` +
            `per theme, never a dark-only treatment adapted to light.`
        ).toBe(true);
      }
    });

    for (const tier of ["--plate-edge", "--plate-edge-hero"] as const) {
      it(`${theme}: ${tier} is directional (lit top-left · shaded bottom-right · outer moat)`, () => {
        const v = readToken(block, tier);
        expect(
          /inset 1px 1px 0/.test(v),
          `${tier} (${theme}) must carry \`inset 1px 1px 0 <lit>\` — the light source is ` +
            `high and slightly LEFT, so the top and left runs catch it. Without it the ` +
            `1px border goes back to reading as a drawn outline instead of a rolled lip.`
        ).toBe(true);
        expect(
          /inset -1px -1px 0/.test(v),
          `${tier} (${theme}) must carry \`inset -1px -1px 0 <shade>\` — the bottom and ` +
            `right runs take the shade. One light, never moving.`
        ).toBe(true);
        expect(
          /(^|,)\s*0 0 0 1px/.test(v),
          `${tier} (${theme}) must carry the outer 1px MOAT (\`0 0 0 1px <dark>\`). BG3's ` +
            `plates sit in their own shadow groove (the owner's crop-panel-edge-mid: black ` +
            `outside, then the lit line); without it a plate reads as a region cut out of ` +
            `the page, not an object laid on it.`
        ).toBe(true);
      });
    }
  }

  it("dark ships NO specular sheen — the composite-floor limit is deliberate", () => {
    // See the file header: dark's brightest panel composite already sits at
    // 4.70:1 for --text-muted; any added highlight spends AA headroom the
    // candlelit translucency does not have.
    expect(
      readToken(themeBlock("dark"), "--plate-sheen"),
      "dark --plate-sheen must stay `none`. The dark flagship's convexity is carried by " +
        "the surface-2 → surface-1 gradient plus the smoke vignette; an added specular " +
        "costs AA headroom the translucent panels do not have (1.5% → 4.53:1, 3% → 4.36:1 " +
        "FAIL). Re-adding one requires re-deriving the composite floor first."
    ).toBe("none");
  });

  it("light DOES ship the sheen — the daylight sibling, designed not adapted", () => {
    expect(
      /radial-gradient/.test(readToken(themeBlock("light"), "--plate-sheen")),
      "light --plate-sheen must be the convex radial specular. Ivory is flat (it cannot " +
        "gradient downward the way the dark surfaces do) and its ink has ~14:1 headroom, " +
        "so the crown highlight is both needed and free there."
    ).toBe(true);
  });
});

describe("the plate grammar — the two-tier register ladder", () => {
  // QUIET tier: the ordinary plates. Selector → the declaration that must carry
  // `var(--plate-edge)` (never the hero token — a resting card is a sibling).
  const QUIET = [".folio-panel", ".info-card", ".ch-card", ".party-card"] as const;
  for (const sel of QUIET) {
    it(`${sel} wears the QUIET plate edge`, () => {
      const re = new RegExp(`\\${sel} \\{[^}]*box-shadow:[^;]*var\\(--plate-edge\\)`, "");
      expect(
        re.test(folio),
        `MISSING \`box-shadow: … var(--plate-edge)\` on \`${sel}\`. Ordinary plates are ` +
          `BG3's sibling panels: same geometry as the active one, quieter light.`
      ).toBe(true);
    });
  }

  // HERO tier: the three earned registers (Constitution §4.16) + the codex leaf.
  const HERO = [
    [".page-head.framed", "\\.page-head\\.framed \\{"],
    [".folio-panel.gilt-frame", "\\.folio-panel\\.gilt-frame \\{"],
    [".modal", "\\.modal \\{"],
    [".tome-leaf-surface", "\\.tome-leaf-surface \\{"],
  ] as const;
  for (const [label, open] of HERO) {
    it(`${label} wears the HERO plate edge`, () => {
      const re = new RegExp(`${open}[^}]*box-shadow:[^;]*var\\(--plate-edge-hero\\)`);
      expect(
        re.test(folio),
        `MISSING \`box-shadow: … var(--plate-edge-hero)\` on \`${label}\`. The earned ` +
          `registers out-light the quiet plates — that IS the state grammar (BG3's active ` +
          `panel wears a richer frame; siblings keep the same shape).`
      ).toBe(true);
    });
  }

  it("the roster card PROMOTES to the hero edge on hover and focus", () => {
    for (const state of ["hover", "focus-visible"]) {
      expect(
        new RegExp(`\\.ch-card:${state} \\{[^}]*var\\(--plate-edge-hero\\)`).test(folio),
        `MISSING the hero-edge promotion on \`.ch-card:${state}\`. Hover/focus is the one ` +
          `moment a resting card becomes the active plate; dropping it also silently ` +
          `DELETES the plate edge, because the state rule replaces the whole box-shadow.`
      ).toBe(true);
    }
  });

  it("the ACTIVE combatant plate keeps its material and takes the hero edge", () => {
    expect(
      /\.combat-current \{[^}]*var\(--plate-edge-hero\)/.test(folio),
      "MISSING `var(--plate-edge-hero)` on `.combat-current`. Whoever's turn it is IS the " +
        "active plate, so it wears the hero edge — and because this rule REPLACES the host's " +
        "whole box-shadow, omitting it makes a card silently shed its material the moment it " +
        "becomes the current combatant. A state change must never cost a surface its substance."
    ).toBe(true);
  });

  it("the plate family's frame LINE is the brass --plate-rule, not --border-medium", () => {
    for (const sel of QUIET) {
      expect(
        new RegExp(`\\${sel} \\{[^}]*border: 1px solid var\\(--plate-rule\\)`).test(
          folio
        ),
        `\`${sel}\` must bind with \`var(--plate-rule)\`. BG3's panel runs are warm brass ` +
          `hairlines clearly lighter than the plate; \`--border-medium\` (#352c1f) was so ` +
          `close to the dark surfaces that the frame all but vanished.`
      ).toBe(true);
    }
  });

  // …but the binding is only the DARK story for the two large-surface recipes.
  // `[data-theme="light"] .folio-panel` / `… .info-card` re-tint the same line at
  // higher specificity, so in LIGHT those two wear a per-recipe gilt edge and the
  // token is inert on them. That is deliberate (each wants its own gilt share, and
  // `--plate-rule` is an INHERITED custom property — re-declaring it per recipe
  // would leak the value into every nested plate), so the guard pins the exception
  // rather than pretending the token governs everywhere.
  const LIGHT_EDGE_OVERRIDE = [".folio-panel", ".info-card"] as const;
  for (const sel of LIGHT_EDGE_OVERRIDE) {
    it(`${sel} takes a deliberate LIGHT gilt edge that out-specifies --plate-rule`, () => {
      expect(
        new RegExp(
          `\\[data-theme="light"\\] \\${sel} \\{[^}]*border-color: color-mix\\([^)]*\\) *[^}]*accent-primary`
        ).test(folio) ||
          new RegExp(
            `\\[data-theme="light"\\] \\${sel} \\{[^}]*border-color: color-mix\\(in oklab, var\\(--border-medium\\)`
          ).test(folio),
        `\`[data-theme="light"] ${sel}\` must keep its gilt \`border-color\`. If it is ever ` +
          `dropped, fold the value into light's \`--plate-rule\` in the SAME commit and delete ` +
          `this case — never leave the light edge to a token the recipe out-specifies.`
      ).toBe(true);
    });
  }
});

/**
 * THE STRUCTURAL LAW — `box-shadow` is a single REPLACED property, not a list that
 * merges. Any rule that sets `box-shadow` on a plate-bearing selector therefore
 * DELETES the whole material (edge + basin) unless it composes the plate tokens
 * back in. That is not a hypothetical: the light `.combat-current`, the light
 * `.ch-card:hover`, the light `.info-card`, the light `.page-head.framed` and
 * `.ch-card[data-selected]` all shipped stripped before this guard existed. The
 * per-selector cases above certify the states we KNOW about; this one certifies
 * the states nobody has thought of yet.
 */
describe("the plate grammar — no rule may replace a plate's box-shadow", () => {
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
   * Deliberate exemptions, both documented at their sites in folio.css:
   *  - `.info-card.tip` (both themes) — the quiet creation-wizard note explicitly
   *    sheds the drop (`box-shadow: none`) so it does not read as a second
   *    cartouche. Allowlisted by SELECTOR, never by value: a bare `none` anywhere
   *    else is exactly the silent strip this guard exists to catch;
   *  - a `::before` / `::after` subject — a pseudo-element is a CHILD box, so its
   *    shadow cannot replace the host plate's. The live instances are the two
   *    `[data-theme] .folio-panel::before` translucency sandwiches (which re-carry
   *    `--elev-resting`'s inset pair because they paint over the host's own insets)
   *    and the light `.ch-card::before` domain crown.
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

  it("every box-shadow set on a plate selector composes a --plate-* token", () => {
    const offenders: string[] = [];
    for (const [, rawSelector, body] of folio.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const decls = body ?? "";
      if (!/box-shadow\s*:/.test(decls)) continue;
      const value = /box-shadow\s*:\s*([^;]+)/.exec(decls)?.[1]?.trim() ?? "";
      if (/var\(--plate-/.test(value)) continue;
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
      `These rules SET box-shadow on a plate-bearing selector without composing a ` +
        `\`--plate-*\` token, so they silently strip the plate material (box-shadow is ` +
        `REPLACED, never merged). Compose \`var(--plate-edge)\`/\`var(--plate-edge-hero)\` ` +
        `+ \`var(--plate-basin)\` back into the list — a bare \`none\` does NOT excuse it ` +
        `(only the documented EXEMPT selectors above opt out):\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
});
