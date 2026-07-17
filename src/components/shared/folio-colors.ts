/**
 * folio-colors — the canonical token-based colour contract for card surfaces.
 *
 * This is the SINGLE UI-layer seam for card colour. Every value here resolves to
 * a folio CSS custom property defined + themed in
 * `src/index.css` — `--at-*` (action economy), `--dmg-*` (damage types),
 * `--sl-*` (spell levels). NOTHING here is a hard-coded hex; both themes stay
 * correct because the tokens are themed at the index.css layer, and the locked
 * palette decisions stay authoritative.
 *
 * USAGE GUIDE for the page builders + the cleanup phase
 * ─────────────────────────────────────────────────────
 * Prefer the folio CSS attribute/class recipes over re-deriving colour in TS:
 *
 *  • Action-type LEFT BORDER (3px accent on a card row):
 *      <UniversalCard slot={type} … />            // sets data-slot → --at-c
 *      …or on a bare element: data-slot={type} with a `.uc`-style rule.
 *
 *  • Action-type TONAL CHIP / filter pill:
 *      <span className="at-chip" data-at={type}>…</span>   (folio.css `.at-chip`)
 *
 *  • Spell-level chromatic SEAL / badge / pip:
 *      <UniversalCard spellLevel={level} … />      // chromatic level seal
 *      …or `.sl-chip` / `.uc-slotpips .sp` driven by `--sl` (see folio.css).
 *
 *  • Damage-type VERDICT chip (the one at-a-glance outcome chip):
 *      <UniversalCard verdictOutcome="fire" verdict="2d6 Fire" … />
 *      // the `.uc-verdict[data-o=…]` recipe already keys to --dmg-*.
 *
 * Action-type and damage-type colour is recipe-only (the data-attr rules above).
 * The ONLY colour a builder sets from TS is the spell-level token, via the
 * `spellLevelVar()` / `spellLevelInkVar()` helpers below — they return the
 * `var(--sl-*)` STRING for an inline custom property (e.g.
 * `style={{ "--sl": spellLevelVar(level) }}`); never inline a Tailwind
 * `bg-[#…]` / `text-[#…]` literal.
 */

/**
 * The folio `var(--sl-*)` token for a spell level (0 = cantrip → `--sl-c`,
 * 1..9 → `--sl-1`..`--sl-9`). Clamped to the defined 0–9 range.
 */
export function spellLevelVar(level: number): string {
  if (level <= 0) return "var(--sl-c)";
  const clamped = Math.min(9, Math.round(level));
  return `var(--sl-${clamped})`;
}

/** The AA-safe ink token paired with {@link spellLevelVar} (foreground on the gem). */
export function spellLevelInkVar(level: number): string {
  if (level <= 0) return "var(--sl-c-ink)";
  const clamped = Math.min(9, Math.round(level));
  return `var(--sl-${clamped}-ink)`;
}
