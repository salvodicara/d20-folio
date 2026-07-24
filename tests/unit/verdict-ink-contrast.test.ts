/**
 * Verdict-chip INK contrast guard (design round 2).
 *
 * The `.uc-verdict` chip is the single most-important "what does it do" cue on
 * every spell/feature card. Its TEXT must clear WCAG-AA 4.5:1 in both themes.
 * The saturated `--dmg-*` palette was tuned for chips/icons (3:1 graphic
 * threshold) and FAILED AA as body text for several outcomes (dark: fire 3.98,
 * necrotic 3.62, force 4.68; light: lightning 3.78, acid 3.77, radiant 4.21).
 *
 * The fix introduced AA-safe `--dmg-*-ink` ON-TEXT variants. This test reads
 * those tokens straight from index.css and asserts each clears 4.5:1 against the
 * verdict chip's effective surface (surface-1 closed / surface-2 open) per theme.
 * It is a static token-pairing guard — no DOM/render needed.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../src/index.css"), "utf8");

/** Extract the `[data-theme="<theme>"] { … }` first block body. */
function themeBlock(theme: "dark" | "light"): string {
  const start = css.indexOf(`[data-theme="${theme}"]`);
  expect(start, `theme block ${theme} present`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  // Find the matching closing brace (blocks here are flat — no nested braces).
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated ${theme} theme block`);
}

function readVar(block: string, name: string): string {
  const m = block.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!m?.[1]) throw new Error(`${name} not defined in theme block`);
  return m[1];
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(fg: string, bg: string): number {
  const l1 = relLuminance(hexToRgb(fg));
  const l2 = relLuminance(hexToRgb(bg));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const INK_TOKENS = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;

const AA = 4.5;

/** Mix two hexes in sRGB at `pct`% of `a` over `b` (matches CSS color-mix close
 *  enough for a luminance guard — the chip tint is `mix(--co pct%, surface)`). */
function mix(a: string, b: string, pct: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const f = pct / 100;
  const r = Math.round(ar * f + br * (1 - f));
  const g = Math.round(ag * f + bg * (1 - f));
  const bl = Math.round(ab * f + bb * (1 - f));
  return `#${[r, g, bl].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const CONDITIONS = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const;

const SPELL_LEVELS = ["c", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

describe("verdict-chip ink tokens clear WCAG-AA", () => {
  for (const theme of ["dark", "light"] as const) {
    const block = themeBlock(theme);
    // The verdict chip renders on the card surface (surface-1 collapsed,
    // surface-2 when open). The 13% colour tint barely shifts luminance, so we
    // verify against BOTH base surfaces — the worst case for each theme.
    const surfaces = [readVar(block, "--bg-surface-1"), readVar(block, "--bg-surface-2")];

    for (const name of INK_TOKENS) {
      it(`${theme}: --dmg-${name}-ink ≥ ${AA}:1 on card surfaces`, () => {
        const ink = readVar(block, `--dmg-${name}-ink`);
        for (const surface of surfaces) {
          expect(
            contrast(ink, surface),
            `${name}-ink on ${surface}`
          ).toBeGreaterThanOrEqual(AA);
        }
      });
    }
  }
});

/**
 * COMPENDIUM-LUX — the 8-school enamel set behind the codex spell chip
 * (`.cmp-verdict`, folio.css). The chip has NO separate ink token: its TEXT is
 * `color-mix(school 62%, --text-primary)` in dark / `mix(school 55%,
 * --text-primary)` in light, over a `mix(school 12–18%, row surface)` tint.
 * This replays that exact math (sRGB ≈ oklab, close enough for a luminance
 * guard) so every school stays AA in both themes — and pins that every
 * `SpellSchool` id HAS a token in both theme blocks (a spec `var()` that
 * resolves to nothing would silently drop the hue).
 */
const SPELL_SCHOOLS = [
  "abjuration",
  "conjuration",
  "divination",
  "enchantment",
  "evocation",
  "illusion",
  "necromancy",
  "transmutation",
] as const;

describe("spell-school enamel chips clear WCAG-AA (both themes, .cmp-verdict math)", () => {
  for (const theme of ["dark", "light"] as const) {
    const block = themeBlock(theme);
    const textPrimary = readVar(block, "--text-primary");
    const surface1 = readVar(block, "--bg-surface-1");
    const surface2 = readVar(block, "--bg-surface-2");
    // Dark's `--accent-primary` is `var(--gold-leaf-500)` (not a literal hex),
    // so resolve the ramp stop directly; light overrides with a literal.
    const accent =
      theme === "dark"
        ? readVar(css, "--gold-leaf-500")
        : readVar(block, "--accent-primary");
    // The codex row ground inside the tome: mix(accent 13%, surface-2) dark /
    // mix(accent 9%, surface-2) light (folio.css `.cmp-tome … .pick-row`).
    const rowGround =
      theme === "dark" ? mix(accent, surface2, 13) : mix(accent, surface2, 9);
    const inkMixPct = theme === "dark" ? 62 : 55;
    const tintPct = theme === "dark" ? 12 : 18;

    for (const school of SPELL_SCHOOLS) {
      it(`${theme}: --school-${school} chip text ≥ ${AA}:1 on its tinted chip`, () => {
        const hue = readVar(block, `--school-${school}`); // throws if missing
        const ink = mix(hue, textPrimary, inkMixPct);
        // Worst case across the grounds the chip can sit on (tome row, bare surfaces).
        for (const ground of [rowGround, surface1, surface2]) {
          const chip = mix(hue, ground, tintPct);
          expect(
            contrast(ink, chip),
            `${school} text on ${chip} (${theme})`
          ).toBeGreaterThanOrEqual(AA);
        }
      });
    }
  }
});

describe("condition-chip ink tokens clear WCAG-AA on the 19% tint", () => {
  for (const theme of ["dark", "light"] as const) {
    const block = themeBlock(theme);
    // The chip surface is mix(--cond 19%, surface-2) (22% in light). Use the
    // larger tint as the worst case so the guard is conservative.
    const surface2 = readVar(block, "--bg-surface-2");
    const tintPct = theme === "light" ? 22 : 19;

    for (const cond of CONDITIONS) {
      it(`${theme}: --cond-${cond}-ink ≥ ${AA}:1 on its chip tint`, () => {
        // Falls back to the base hue where no -ink is defined.
        let ink: string;
        try {
          ink = readVar(block, `--cond-${cond}-ink`);
        } catch {
          ink = readVar(block, `--cond-${cond}`);
        }
        const base = readVar(block, `--cond-${cond}`);
        const tint = mix(base, surface2, tintPct);
        expect(contrast(ink, tint), `${cond}-ink on ${tint}`).toBeGreaterThanOrEqual(AA);
      });
    }
  }
});

/**
 * RULES-TEXT colour grammar (`highlightRulesText`, DESIGN.md "Rules-text colour
 * grammar") — its tokens render as INLINE PROSE INK on the raw card surfaces
 * (surface-1 closed cards / surface-2 open cards + the compendium reading
 * pane), not on a hue tint. The `--dmg-*-ink` ramp is already pinned on those
 * grounds above; this pins the grammar's OTHER inks there: every
 * `--cond-*-ink` (`.rt-cond`) and the semantic success/danger pair
 * (`.rt-adv`/`.rt-dis`). `--text-special` (`.rt-value`) is pinned in its own
 * describe below.
 */
describe("rules-prose grammar inks clear WCAG-AA on the prose grounds", () => {
  for (const theme of ["dark", "light"] as const) {
    const block = themeBlock(theme);
    const surfaces = [readVar(block, "--bg-surface-1"), readVar(block, "--bg-surface-2")];

    for (const cond of CONDITIONS) {
      it(`${theme}: --cond-${cond}-ink ≥ ${AA}:1 as prose ink`, () => {
        const ink = readVar(block, `--cond-${cond}-ink`);
        for (const surface of surfaces) {
          expect(
            contrast(ink, surface),
            `${cond}-ink on ${surface}`
          ).toBeGreaterThanOrEqual(AA);
        }
      });
    }

    it(`${theme}: semantic success/danger ≥ ${AA}:1 as prose ink`, () => {
      // Dark aliases the semantic pair to ramp stops (var(--verdigris-300) /
      // var(--vermilion-300)); resolve through the ramp when not a literal.
      for (const name of ["--semantic-success", "--semantic-danger"] as const) {
        const raw = block.match(new RegExp(`${name}:\\s*var\\((--[a-z-0-9]+)\\)`))?.[1];
        const ink = raw ? readVar(css, raw) : readVar(block, name);
        for (const surface of surfaces) {
          expect(contrast(ink, surface), `${name} on ${surface}`).toBeGreaterThanOrEqual(
            AA
          );
        }
      }
    });
  }
});

describe("muted/faint text clears WCAG-AA on the DEEPEST recessed surface", () => {
  // The prior guard only covered up to surface-3, but --bg-recessed is one step
  // darker (light: #d6c8a0) and carries muted/faint text (the search-spells
  // placeholder, slot labels, etc.). A latent footgun — assert both clear 4.5:1
  // on --bg-recessed in BOTH themes so a placeholder never silently fails AA.
  for (const theme of ["dark", "light"] as const) {
    const block = themeBlock(theme);
    const recessed = readVar(block, "--bg-recessed");
    for (const name of ["--text-muted", "--text-faint"] as const) {
      it(`${theme}: ${name} ≥ ${AA}:1 on --bg-recessed`, () => {
        const fg = readVar(block, name);
        expect(contrast(fg, recessed), `${name} on ${recessed}`).toBeGreaterThanOrEqual(
          AA
        );
      });
    }
  }
});

describe("special emphasis text clears WCAG-AA on the card surfaces", () => {
  // --text-special is the BG3 "lit emphasis" register (active/selected titles)
  // and renders on the card tiers — assert it clears 4.5:1 on surface-2 AND the
  // darker/deeper surface-3 in BOTH themes (it sits far above AA by design; the
  // guard pins that a retune can never drop it below the floor).
  for (const theme of ["dark", "light"] as const) {
    const block = themeBlock(theme);
    for (const surf of ["--bg-surface-2", "--bg-surface-3"] as const) {
      it(`${theme}: --text-special ≥ ${AA}:1 on ${surf}`, () => {
        const special = readVar(block, "--text-special");
        const surface = readVar(block, surf);
        expect(
          contrast(special, surface),
          `--text-special on ${surface}`
        ).toBeGreaterThanOrEqual(AA);
      });
    }
    // --text-special is the "lit emphasis" register: in BOTH themes it must read
    // as the MORE-LUMINOUS ink beside --text-primary (dark lights a title by
    // going brighter than the cream body; the light rebuild lights it with a
    // gilt-espresso that is more luminous + gold-cast than the neutral-brown
    // body ink). This locks the register floor so a retune can never sink the
    // special ink to or below body-ink luminance.
    it(`${theme}: --text-special is the more-luminous lit register vs --text-primary`, () => {
      const special = relLuminance(hexToRgb(readVar(block, "--text-special")));
      const primary = relLuminance(hexToRgb(readVar(block, "--text-primary")));
      expect(special, `${theme}: special lighter than primary`).toBeGreaterThan(primary);
    });
  }
});

describe("ritual amethyst-ink clears WCAG-AA on the dark cards", () => {
  // The RIT badge text reads from --amethyst-ink on dark (amethyst-300 as text
  // was ~3.7:1). Assert it clears 4.5:1 on both dark card surfaces. (Light uses
  // amethyst-700, ~11.7:1, covered by the badge's own light override.)
  const block = themeBlock("dark");
  // --amethyst-ink is `var(--amethyst-100)`; the palette hex lives in :root, so
  // resolve the alias against the full stylesheet.
  const amethyst100 = readVar(css, "--amethyst-100");
  for (const surf of ["--bg-surface-1", "--bg-surface-2"] as const) {
    it(`dark: amethyst ink ≥ ${AA}:1 on ${surf}`, () => {
      const surface = readVar(block, surf);
      expect(
        contrast(amethyst100, surface),
        `amethyst-ink on ${surface}`
      ).toBeGreaterThanOrEqual(AA);
    });
  }
});

describe("candlelit translucency composite floor (dark --panel-alpha)", () => {
  // T3 (BG3 identity epic): the OUTERMOST dark surfaces (.folio-panel material,
  // .page-head.framed, .rail) render at --panel-alpha so the candlelit backdrop
  // glows through them. The floor: text ink on the BRIGHTEST translucent-surface
  // tone, composited over the BRIGHTEST backdrop region, must still clear AA.
  //
  // Worst-case backdrop sample (provenance): public/assets/backgrounds/
  // home-hero.webp (1672×941) downscaled to 96px wide with sharp — each sample
  // ≈ a glyph-sized (~15px at 1440 render width) region — brightest region
  // rgb(190,128,49) (#be8031), a candelabra flame at ~(28%, 41%). The absolute
  // brightest RAW pixel is rgb(232,184,89), but a single flame pixel is
  // sub-glyph scale; the region sample is the honest text-background worst case.
  // Re-derive with scratchpad sharp sampling if the asset is ever regenerated.
  //
  // Panel-material ceiling: the .folio-panel sandwich tops out at --bg-surface-2
  // (the gradient's light end; the leather texture's brightest glyph-scale
  // region is rgb(29,21,12) — at/below surface-2 — and sits under a 62% veil).
  // The framed page-head's brightest stop is mix(accent 13%, surface-1); it
  // carries only title/hint ink, so its guarded ink is --text-secondary
  // (text-muted is not used on the framed band).
  const WORST_ART_REGION = "#be8031";
  const AA_FLOOR = 4.5;

  const block = themeBlock("dark");
  const readNum = (name: string): number => {
    const m = block.match(new RegExp(`${name}\\s*:\\s*([0-9.]+)`));
    if (!m?.[1]) throw new Error(`${name} not defined in dark theme block`);
    return Number(m[1]);
  };
  const alpha = readNum("--panel-alpha");
  const artOpacity = readNum("--app-bg-art-opacity");
  const bgPage = readVar(block, "--bg-page");
  // body::after paints the art at --app-bg-art-opacity over the page field.
  const backdrop = mix(WORST_ART_REGION, bgPage, artOpacity * 100);

  it("dark: --text-muted ≥ 4.5:1 on the folio-panel's brightest composite", () => {
    // Rail rubrics (.rail-head h5) are text-muted directly on the panel field.
    const comp = mix(readVar(block, "--bg-surface-2"), backdrop, alpha * 100);
    expect(
      contrast(readVar(block, "--text-muted"), comp),
      `text-muted on panel composite ${comp} (alpha ${alpha})`
    ).toBeGreaterThanOrEqual(AA_FLOOR);
  });

  it("dark: --text-muted ≥ 4.5:1 on the game-rail composite", () => {
    const comp = mix(bgPage, backdrop, alpha * 100);
    expect(
      contrast(readVar(block, "--text-muted"), comp),
      `text-muted on rail composite ${comp} (alpha ${alpha})`
    ).toBeGreaterThanOrEqual(AA_FLOOR);
  });

  it("dark: --text-secondary ≥ 4.5:1 on the framed head's brightest composite", () => {
    // --accent-primary is var(--gold-leaf-500); resolve the palette literal.
    const accent = readVar(css, "--gold-leaf-500");
    const brightStop = mix(accent, readVar(block, "--bg-surface-1"), 13);
    const comp = mix(brightStop, backdrop, alpha * 100);
    expect(
      contrast(readVar(block, "--text-secondary"), comp),
      `text-secondary on framed-head composite ${comp} (alpha ${alpha})`
    ).toBeGreaterThanOrEqual(AA_FLOOR);
  });
});

describe("spell-level seal digit ink clears WCAG-AA on the seal body", () => {
  for (const theme of ["dark", "light"] as const) {
    const block = themeBlock(theme);
    for (const lvl of SPELL_LEVELS) {
      it(`${theme}: --sl-${lvl}-ink ≥ ${AA}:1 on the seal gem body`, () => {
        const ink = readVar(block, `--sl-${lvl}-ink`);
        const base = readVar(block, `--sl-${lvl}`);
        // The radial gem darkens toward its lower-right (circle at 35% 28%), and
        // the digit sits at the bottom-centre — i.e. over the DARK end
        // (mix(--sl 88% black)). The light-end is the lit highlight, not under
        // the digit. So the digit's worst case is the dark gem end; assert the
        // ink clears AA there.
        const darkEnd = mix(base, "#000000", 88);
        expect(
          contrast(ink, darkEnd),
          `sl-${lvl}-ink on ${darkEnd}`
        ).toBeGreaterThanOrEqual(AA);
      });
    }
  }
});

describe("monster CR-seal digit ink clears WCAG-AA on the gilt gem body", () => {
  // The compendium Monsters row (+ the EntryView masthead) strike the CR on a
  // `.lvl-seal` gem tinted by the folio gilt (`--sl: var(--accent-primary)`) with
  // the seal's OWN theme-inverse ink (`--sl-ink: var(--text-inverse)` — near-black
  // on the light-gold gem in dark, cream on the dark-umber gem in light). The gilt
  // `--accent-text` washed the numeral gold-on-gold in dark (~1.4:1); this replays
  // the spell-seal worst case (the digit sits over the gem's dark end,
  // mix(--sl 88% black)) so it can never regress.
  for (const theme of ["dark", "light"] as const) {
    const block = themeBlock(theme);
    it(`${theme}: CR-seal ink ≥ ${AA}:1 on the gilt gem's dark end`, () => {
      // Dark's `--accent-primary` aliases `var(--gold-leaf-500)` (resolve the ramp);
      // light overrides it with a literal.
      const gem =
        theme === "dark"
          ? readVar(css, "--gold-leaf-500")
          : readVar(block, "--accent-primary");
      const ink = readVar(block, "--text-inverse");
      const darkEnd = mix(gem, "#000000", 88);
      expect(
        contrast(ink, darkEnd),
        `CR-seal ink ${ink} on gem dark end ${darkEnd}`
      ).toBeGreaterThanOrEqual(AA);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Combat top-bar pip — the "carved dark socket" control class.
//
// This is the class the fixed-token-pair guards above CANNOT see: a control that
// HARDCODES a dark pill in `folio.css` and paints its text with a THEME-FLIPPING
// ink token. In dark that ink is light → readable; in LIGHT the same token flips
// to a dark espresso and vanishes on the still-dark pill (~1.3:1). The pip's
// "Open {hero}" destination chip (`.cp-dest-chip`) shipped exactly that bug
// (owner: "Apri Lyra ›" unreadable in light).
//
// So this guard does NOT pin a hand-picked token pair — it READS the actual
// `.cp-dest-chip` declaration out of `folio.css`, resolves whatever `color` +
// `background` tokens it references against EACH theme block, and asserts the
// text clears AA on the chip's darkest stop in BOTH themes. Reverting the ink to
// `var(--text-secondary)` (or darkening the socket) re-fails this test — the
// regression the original static guard was blind to.
const folioCss = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");

/** Raw value of a `--name: …;` decl in `block` (or undefined). Unlike `readVar`,
 *  it returns the RAW rhs (a hex OR a `var(--other)` alias), not just a hex. */
function rawVar(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  return m?.[1]?.trim();
}

/** Resolve a CSS color value to a concrete hex, chasing `var()` aliases through
 *  the theme block first, then the `:root` palette. Depth-capped. */
function resolveColor(value: string, block: string, depth = 0): string {
  const v = value.trim();
  if (v.startsWith("#")) return v;
  const m = v.match(/var\(\s*(--[\w-]+)\s*\)/);
  if (m?.[1] && depth < 8) {
    const alias = rawVar(block, m[1]) ?? rawVar(css, m[1]);
    if (alias) return resolveColor(alias, block, depth + 1);
  }
  throw new Error(`cannot resolve color: ${value}`);
}

/** The first-occurrence base rule body for `selector` (flat — no nested braces). */
function ruleBody(cssText: string, selector: string): string {
  const start = cssText.indexOf(`${selector} {`);
  expect(start, `${selector} rule present`).toBeGreaterThan(-1);
  const open = cssText.indexOf("{", start);
  const close = cssText.indexOf("}", open);
  return cssText.slice(open + 1, close);
}

/** A declaration's value (`prop: value;`) from a rule body. */
function decl(body: string, prop: string): string {
  const m = body.match(new RegExp(`(?:^|\\n)\\s*${prop}\\s*:\\s*([^;]+);`));
  if (!m?.[1]) throw new Error(`no ${prop} declaration`);
  return m[1].trim();
}

describe("combat top-bar dest-chip ink clears WCAG-AA on the carved socket", () => {
  const chip = ruleBody(folioCss, ".cp-dest-chip");
  const colorValue = decl(chip, "color");
  const bgValue = decl(chip, "background");
  // Every color stop the chip paints its background with (literal hex OR token).
  const bgStops = [...bgValue.matchAll(/#[0-9a-fA-F]{3,8}|var\(\s*--[\w-]+\s*\)/g)].map(
    (m) => m[0]
  );
  expect(bgStops.length, "chip background has ≥1 color stop").toBeGreaterThan(0);

  for (const theme of ["dark", "light"] as const) {
    it(`${theme}: .cp-dest-chip text ≥ ${AA}:1 on its darkest background stop`, () => {
      const block = themeBlock(theme);
      const ink = resolveColor(colorValue, block);
      // Worst case: the DARKEST resolved stop under the label.
      const darkest = bgStops
        .map((s) => resolveColor(s, block))
        .reduce((a, b) =>
          relLuminance(hexToRgb(a)) < relLuminance(hexToRgb(b)) ? a : b
        );
      expect(
        contrast(ink, darkest),
        `dest-chip ink ${ink} on darkest stop ${darkest}`
      ).toBeGreaterThanOrEqual(AA);
    });
  }
});
