/// <reference types="node" />
/**
 * Guard: owner-reported light-theme legibility + layout fixes on the candlelit
 * backdrop (2026-06-07, Img #3/#4/#5/#6). Each assertion pins a recipe that, if
 * deleted, re-breaks a surface the owner explicitly flagged. Checks the MECHANISM
 * (selector + key declaration), not exact values, so a legitimate refactor passes.
 *
 *   #3 — the login auth-error retry is a ghost button that sits on the dark login
 *        art in BOTH themes; in light it flipped to dark ink + a faint border and
 *        vanished. `.btn.ghost.on-art` repaints it with the on-backdrop gilt ink.
 *   #4 — the "unlocks at level N" subclass hint (`.field-help`) is loose text on the
 *        backdrop; it must be in the `.on-art-scope` flip so it takes the cream ink.
 *   #5 — the class tip was an ad-hoc `bg-accent/5` (5%) wash the dark art bled
 *        through; it now reuses the OPAQUE `.info-card` surface (`.info-card.tip`).
 *   #6 — the 10-step guided rail ran wider than a narrow viewport and forced a
 *        PAGE-level horizontal scroll; the wizard-F orbs WRAP so they never do.
 *   #7 — the section count MEDALLION (`.sec-count`) + disclosure KNOB shipped a
 *        TRANSLUCENT gilt fill that let the candlelit backdrop bleed through, so the
 *        deep-gold numeral read BROWN on the campaign-hub art (recurring, owner
 *        2026-06-30). In light they must strike a genuinely OPAQUE struck disc
 *        (opaque `--gold-leaf` background-color base) so the ink self-backs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8").replace(
  /\s+/g,
  " "
);

describe("light-theme backdrop legibility + layout guards (Img #3/#4/#5/#6)", () => {
  it("#3 — ghost buttons on the art read in light theme (leaf `.on-art` AND `.on-art-scope`)", () => {
    // ONE recipe, two ways in (ON-ART-INK, 2026-06-12): the explicit
    // `.btn.ghost.on-art` leaf (login retry) and AUTOMATICALLY for a ghost
    // button loose inside the canonical `.on-art-scope` (the read-only
    // member-sheet back button) — with the surface exclusion so a card-bound
    // ghost is never touched. Pins both arms + the gilt ink.
    const rule =
      /\[data-theme="light"\]\s*:is\(\s*\.btn\.ghost\.on-art,\s*\.on-art-scope\s*\.btn\.ghost:not\(\s*:where\([^)]*\.info-card[^)]*\[class\*="bg-"\][^{]*\{[^}]*color:\s*var\(--text-on-backdrop-title\)/;
    expect(
      rule.test(css),
      "MISSING: `[data-theme=light] :is(.btn.ghost.on-art, .on-art-scope .btn.ghost:not(:where(…surfaces…) *)) " +
        "{ color: var(--text-on-backdrop-title) }`. Without it ghost buttons on the dark art " +
        "(login retry, member-sheet back) are invisible in light theme."
    ).toBe(true);
  });

  it("#4 — `.field-help` is in the on-art-scope backdrop-ink flip", () => {
    // The flip's loose-text :is(...) group must include .field-help so the
    // subclass-unlock hint takes the cream on-backdrop ink in light theme.
    const rule =
      /\.on-art-scope\s*:is\([^)]*\.field-help[^)]*\)\s*:not\(\s*:where\([^)]*\.info-card/;
    expect(
      rule.test(css),
      "MISSING: `.field-help` in the `.on-art-scope :is(…):not(:where(…surfaces…))` flip. " +
        "Without it the 'Si sblocca al livello N' hint is unreadable on the backdrop in light theme."
    ).toBe(true);
  });

  it("#5 — `.info-card.tip` is built on the OPAQUE info-card surface (no translucent wash)", () => {
    // The tip must reuse the opaque parchment surface so the dark art can't bleed
    // through. Assert the variant exists and re-paints an opaque --bg-surface-2 base.
    const rule = /\.info-card\.tip\s*\{[^}]*--bg-surface-2[^}]*\}/;
    expect(
      rule.test(css),
      "MISSING: `.info-card.tip { … --bg-surface-2 … }`. The class tip must be an opaque " +
        "info-card surface, not the old `bg-accent/5` wash the dark backdrop bled through."
    ).toBe(true);
  });

  it("#6 — the wizard-F orbs WRAP on mobile so the page never overflows horizontally", () => {
    const rule = /\.wiz-orbs\s*\{[^}]*flex-wrap:\s*wrap/;
    expect(
      rule.test(css),
      "MISSING: `.wiz-steprail { … overflow-x: auto … }`. Without it the 10-step guided " +
        "rail forces a page-level horizontal scroll on narrow viewports (clipped topbar, Img #6)."
    ).toBe(true);
  });

  it("#7 — light gilt coins (count medallion + disclosure knob) strike an OPAQUE disc", () => {
    // The deep-gold numeral self-backs ONLY if the coin paints an opaque struck base;
    // a translucent fill lets the candlelit backdrop bleed through (the brown medallion).
    // Pin the MECHANISM: a `[data-theme=light]` rule grouping `.sec-count` +
    // `.section-disclosure-knob` that sets an OPAQUE `--gold-leaf` background-color base.
    const rule =
      /\[data-theme="light"\]\s*:is\(\s*\.sec-count\s*,\s*\.section-disclosure-knob\s*\)\s*\{[^}]*background-color:\s*var\(--gold-leaf-/;
    expect(
      rule.test(css),
      "MISSING: `[data-theme=light] :is(.sec-count, .section-disclosure-knob) " +
        "{ background-color: var(--gold-leaf-…) }`. Without an opaque struck disc the " +
        "deep-gold count numeral reads BROWN on the candlelit campaign-hub backdrop."
    ).toBe(true);
  });

  it("#8 — the settings row inks are CARD inks, never the on-backdrop flip (light-polish pass)", () => {
    // The settings rows sit INSIDE the ivory `.info-card` since the settings
    // re-seat; a light-scoped on-backdrop flip on `.sr-name`/`.sr-help` paints
    // near-invisible bright ink + the dark halo on the ivory card (the smeared
    // Theme/Language titles bug). The base card inks are the recipe.
    const staleFlip =
      /\[data-theme="light"\]\s*\.sr-(name|help)\s*\{[^}]*--text-on-backdrop/;
    expect(
      staleFlip.test(css),
      "REGRESSION: a `[data-theme=light] .sr-name/.sr-help { color: var(--text-on-backdrop…) }` " +
        "flip is back, but the settings rows live INSIDE the ivory info-card — bright " +
        "on-backdrop ink + the dark halo render the row titles as an unreadable smear there."
    ).toBe(false);
  });

  it("#9 — selected/active gilt surface TINTS (mixing toward --bg-) route through --accent-glow, never --accent-primary (glow ≠ fill)", () => {
    // DESIGN.md §10.3: --accent-primary is the AA-constrained UI-fill/ink gold — a
    // deep umber in light that CANNOT glow; by convention every gilt tint AND bloom
    // routes through the glow-only --accent-glow (identical to --accent-primary in
    // dark, struck gold in light). THIS guard pins only the subset it was written for:
    // base-rule (non-light-scoped) selected/lit surface TINTS mixing toward a surface —
    // `color-mix(var(--accent-primary) N%, var(--bg-…))`. Such a tint ships a gray-umber
    // "selected" state in light (the flat Heroic-Inspiration panel / fork-tab /
    // path-plaque bug); the outer blooms (mixing toward `transparent`) follow the same
    // convention but are not scanned here. Scan the RAW stylesheet rule-by-rule: the
    // pattern may appear ONLY inside `[data-theme="light"]` rules (where a deep tint is
    // a deliberate light choice).
    const raw = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");
    const offenders: string[] = [];
    const rx = /color-mix\(in oklab, var\(--accent-primary\) \d+%, var\(--bg-/g;
    for (let m = rx.exec(raw); m; m = rx.exec(raw)) {
      // The enclosing rule's selector: scan back to the nearest '{', then take the
      // text since the previous '}' (or file start) as the selector header.
      const open = raw.lastIndexOf("{", m.index);
      const prevClose = raw.lastIndexOf("}", open);
      const selector = raw.slice(prevClose + 1, open);
      if (!selector.includes('[data-theme="light"]')) {
        offenders.push((selector.trim().split("\n").pop() ?? selector).trim());
      }
    }
    expect(
      offenders,
      "REGRESSION: base-rule background tints mix --accent-primary toward a surface — " +
        "in light that is the deep AA-ink umber, so the 'selected/lit' state reads as a " +
        "flat gray-brown wash instead of struck gold. Route the tint through " +
        "--accent-glow (dark output is byte-identical). Offending selectors: " +
        offenders.join(" · ")
    ).toEqual([]);
  });

  it("#10 — the long-rest primary CTA wears the light bright-gilt band (no umber slab)", () => {
    // The shared --rc fill resolves to the deep AA-ink gold in light, so without its
    // own light band the highest-consequence CTA on the rest surface ships as a
    // near-black umber slab while its dark twin glows gold. Pin the light override:
    // deep-gold ink on the bright gold-300 gradient (the .btn.primary light recipe).
    const rule =
      /\[data-theme="light"\]\s*\.rest-card\[data-kind="long"\]\s*\.rest-card-cta\s*\{[^}]*color:\s*var\(--accent-text\)[^}]*var\(--gold-leaf-300\)/;
    expect(
      rule.test(css),
      "MISSING: `[data-theme=light] .rest-card[data-kind=long] .rest-card-cta { color: " +
        "var(--accent-text); … var(--gold-leaf-300) … }`. Without it the light Take-Long-Rest " +
        "CTA renders as a dark umber slab instead of the struck bright-gilt primary band."
    ).toBe(true);
  });

  // ── Daylight sibling plates (#11–#13) — the light theme's OWN scene art ──
  const indexCss = readFileSync(resolve(here, "../../src/index.css"), "utf8").replace(
    /\s+/g,
    " "
  );

  it("#11 — the light theme re-points ALL THREE scene-plate tokens to its daylight siblings", () => {
    // The per-theme pair rides ONE token each (dark in :root, light re-points);
    // dropping any light value silently hands light users the night plate again
    // (and re-couples both themes to one download).
    for (const [token, file] of [
      ["--asset-home-hero", "home-hero-light.webp"],
      ["--asset-login", "login-light.webp"],
      ["--asset-campaign-backdrop", "campaign-backdrop-light.webp"],
    ] as const) {
      const light = new RegExp(
        `\\[data-theme="light"\\][^{]*\\{[^}]*${token}: url\\("/assets/backgrounds/${file}"\\)`
      );
      expect(
        light.test(indexCss),
        `MISSING: the light theme block must re-point ${token} to ${file} — without it ` +
          "light borrows the dark night plate and the sibling-plates direction regresses."
      ).toBe(true);
    }
  });

  it("#12 — the light custom-art veil exists (glaze + harmonizer on data-app-bg-custom)", () => {
    // User uploads are ANY image; the veil (a --bg-page glaze layered in
    // body::after + a gentle desaturation) is what keeps a pure-white / neon /
    // pitch-black banner harmonious under the light chrome.
    const veil =
      /\[data-theme="light"\]\[data-app-bg-custom\] body::after \{[^}]*color-mix\(in srgb, var\(--bg-page\)[^}]*saturate\(/;
    expect(
      veil.test(indexCss),
      "MISSING: `[data-theme=light][data-app-bg-custom] body::after` with the --bg-page " +
        "glaze + saturate() harmonizer — without it an arbitrary DM upload (neon, pure " +
        "white, pitch black) shouts against the light chrome."
    ).toBe(true);
  });

  it("#13 — morning-light translucency: the light panel material consumes panel-light at the light --panel-alpha", () => {
    // The light sibling of dark's candlelit T3: light defines its own gentler
    // --panel-alpha and the light .folio-panel sandwich lays the owner-P8 cream
    // grain under the ivory gradient at that alpha.
    expect(
      /\[data-theme="light"\][^{]*\{[^}]*--panel-alpha: 0\.9[0-9]/.test(indexCss),
      "MISSING: a light-theme --panel-alpha (the morning-light translucency value)."
    ).toBe(true);
    const sandwich =
      /\[data-theme="light"\] \.folio-panel::before \{[^}]*opacity: var\(--panel-alpha\)[^}]*var\(--asset-panel-light\)/;
    expect(
      sandwich.test(css),
      "MISSING: `[data-theme=light] .folio-panel::before` rendering the panel-light " +
        "sandwich at var(--panel-alpha) — the light material story (owner P8) regresses " +
        "to a flat opaque gradient without it."
    ).toBe(true);
  });
});

/**
 * Guard: the "Ember Penumbra" light-material grammar (owner-ratified 2026-07-11,
 * "I definitely go ember penumbra, I love it"). On the bright vellum field a lit
 * gilt control cannot bloom, so it reads as HEAT: a saturated struck-gilt fill over
 * a warm burnt-umber shadow pooling BELOW it. Each assertion pins the MECHANISM (the
 * ember token + a representative consumer), not exact values, so a legitimate refactor
 * passes while a silent revert to the old dim-beige / symmetric-bright-bloom light
 * treatment fails. Dark is untouched by construction — every rule is light-scoped and
 * the ember token lives only in the light block.
 */
describe("light ember-penumbra grammar guards (owner-ratified 2026-07-11)", () => {
  const rawIndex = readFileSync(resolve(here, "../../src/index.css"), "utf8");
  const indexCss = rawIndex.replace(/\s+/g, " ");

  it("the ember umber is a light-block token (a comma-triplet composed at any alpha)", () => {
    // `--ember-umber` MUST be defined inside the light theme block so dark never sees
    // it — the ember penumbra is a light-only material. A comma triplet so recipes
    // compose it via rgba(var(--ember-umber), α).
    const light =
      /\[data-theme="light"\]\s*\{[\s\S]*?--ember-umber:\s*122,\s*74,\s*16;[\s\S]*?\}/;
    expect(
      light.test(rawIndex),
      "MISSING: `--ember-umber: 122, 74, 16;` in the [data-theme=light] block — the " +
        "shared burnt-umber ember tone the whole light gilt grammar pools below its controls."
    ).toBe(true);
  });

  it("the shared gilt-aura tokens pool the ember below (not a symmetric bright halo)", () => {
    // `--gilt-glow` / `--gilt-glow-sm` are the light-only aura tokens every lit surface
    // (hero bands, portrait wells, caster tiles, seals) rides. Post-rollout they MUST
    // carry the umber ember pool; a revert to the old accent-glow-only symmetric bloom
    // would silently un-ember every one of those surfaces at once.
    for (const token of ["--gilt-glow", "--gilt-glow-sm"] as const) {
      const rule = new RegExp(`${token}:[^;]*rgba\\(var\\(--ember-umber\\)`);
      expect(
        rule.test(indexCss),
        `MISSING: \`${token}\` must pool \`rgba(var(--ember-umber), …)\` below the control ` +
          "— without it every light gilt surface reverts to the dim/symmetric pre-ember glow."
      ).toBe(true);
    }
  });

  it("the held Heroic-Inspiration chip radiates the ember penumbra in light", () => {
    const rule =
      /\[data-theme="light"\] \.insp-chip\.held \{[^}]*rgba\(var\(--ember-umber\)[^}]*\}/;
    expect(
      rule.test(css),
      "MISSING: `[data-theme=light] .insp-chip.held { … rgba(var(--ember-umber) …) }` — " +
        "the flagship ember control must toast its ground, not sit as a flat honey tint."
    ).toBe(true);
  });

  it("the awaiting-level chip is a solid struck-gilt pill over its ember in light", () => {
    // At pill scale a tinted wash vanishes on ivory, so the light chip goes FULL gilt
    // (a solid gold gradient) + the engraved deep-gold caps + the ember pool below.
    const strict =
      /\[data-theme="light"\] \.lvl-chip \{[^}]*background:\s*linear-gradient[^}]*color:\s*var\(--accent-text\)[^}]*rgba\(var\(--ember-umber\)/;
    expect(
      strict.test(css),
      "MISSING: `[data-theme=light] .lvl-chip` as a solid gilt gradient pill with the " +
        "deep-gold (--accent-text) caps over an `rgba(var(--ember-umber) …)` ember."
    ).toBe(true);
  });
});
