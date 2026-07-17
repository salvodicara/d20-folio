/**
 * value-breakdown — the ONE generic "where does this number come from?" register.
 *
 * ## Why this exists
 *
 * Weapon DAMAGE already had a tap-for-breakdown tooltip (issue #27): the engine
 * emits per-source parts, a presenter localizes them, and `BreakdownTip` renders
 * them. The owner asked (2026-06-13) to do the SAME for AC "and any other value
 * that varies based on several components". Rather than fork a second tooltip,
 * this module LIFTS that breakdown into ONE value-agnostic register every
 * composite derived stat reuses (golden rule 3): AC, initiative, spell save DC,
 * spell attack, saving throws, passive scores, the weapon to-hit, AND max HP all
 * emit {@link RawBreakdownPart}s through the builders here, the presenter localizes
 * them, and the single `BreakdownTip` renders them. (Max HP is OVERRIDE-GATED, #95:
 * the displayed HP max is a STORED, directly-editable value, so its tip shows ONLY
 * when the stored max still equals the by-the-book composition
 * `computeCharacterMaxHp` — per-class hit-die averages + CON + Tough / Dwarven
 * Toughness …; a hand-pinned or rolled max has no composition to explain and gets
 * no tip, exactly like an `acOverride` suppresses the AC tip. Golden rules 8/6/19.)
 *
 * ## The single-source-of-truth invariant (golden rule 6)
 *
 * A builder NEVER receives a pre-computed total — it receives the PARTS and the
 * displayed total is DERIVED as the sum of the parts ({@link breakdownTotal}).
 * So the number a player sees and the number the tip decomposes can never drift:
 * they are the same arithmetic by construction. The guard test pins
 * `sum(parts) === displayedTotal` across every fixture (golden rule 13).
 *
 * ## The register
 *
 * A {@link RawBreakdownPart} is locale-free (engine-core ↛ i18n, §1.1). Its label
 * is one of:
 *  - a `term` — an APP i18n key the EDGE resolves via `t(...)` ("Base", "Shield",
 *    "Proficiency Bonus", "Exhaustion"); the engine never reads the active locale;
 *  - an `ability` — an {@link AbilityCode} the edge renders as its short name
 *    (`abilities.X_short`), the common modifier case (DEX, the spell ability);
 *  - a `loc` — a {@link LocText} the presenter resolves through `localizeText`
 *    (an SRD feat/feature/item NAME: "Alert", "Aura of Protection", "+1 Plate").
 *
 * `value` is the signed contribution as a number; the part also carries an
 * optional `note` term-key the edge appends ("capped by armor", "while active").
 * This is the SUPERSET of the weapon-damage register's needs: the damage `die`
 * row maps to a `loc`-labelled part whose value is a dice string (see
 * {@link BreakdownLine} for the localized shape the tip renders).
 */
import type { AbilityCode } from "@/data/types";
import type { LocText } from "@/lib/loc-text";

/**
 * One ENGINE-emitted (locale-free) breakdown source. Exactly one label variant.
 * `value` is the signed numeric contribution; `dice` (mutually exclusive with a
 * numeric `value`) carries a damage/heal die string the tip shows verbatim.
 */
export type RawBreakdownPart =
  /** APP-string label (i18n key resolved at the edge): Base, Shield, PB, … */
  | { label: { term: string }; value: number; note?: BreakdownNote }
  /** Ability-modifier source: the edge renders the short ability name. */
  | { label: { ability: AbilityCode }; value: number; note?: BreakdownNote }
  /** SRD NAME label (feat/feature/item) resolved by the presenter. */
  | { label: { loc: LocText }; value: number; note?: BreakdownNote }
  /** A dice row (weapon/heal die): the SRD NAME labels it, `dice` is verbatim. */
  | { label: { loc: LocText }; dice: string; note?: BreakdownNote };

/** A presenter-resolvable annotation appended after a part's label. */
export type BreakdownNote =
  /** An APP i18n key ("capped", "while active"). */
  | { term: string }
  /** The "while-active" toggle note (reuses `combat.whileActiveNote`). */
  | { whileActive: true };

/**
 * One LOCALIZED breakdown line the {@link BreakdownTip} renders. SUPERSEDES the
 * old `DamageBreakdownLine` — damage + heal now emit this shape too. The label is
 * resolved (SRD `loc` → string; `ability`/`term` stay structured for the edge's
 * `t(...)` since the presenter is i18next-free, §2.5); `value` is the formatted
 * contribution ("+3", "10", "2d6", "1d8 + 2"). `note` is the optional annotation.
 */
export type BreakdownLine =
  | { kind: "term"; value: string; term: string; note?: BreakdownNote }
  | { kind: "ability"; value: string; ability: AbilityCode; note?: BreakdownNote }
  | { kind: "loc"; value: string; label: string; note?: BreakdownNote };

/**
 * The displayed total of a breakdown — the SUM of every part's numeric `value`
 * (a `dice` row contributes 0; its die is shown, not summed into the scalar
 * total). This is the ONLY way a breakdown-bearing value's headline number is
 * produced, so the headline equals the sum of the tip's lines by construction
 * (golden rule 6). Callers that already hold a separately-computed total assert
 * it equals this — the guard test enforces that across all fixtures.
 */
export function breakdownTotal(parts: ReadonlyArray<RawBreakdownPart>): number {
  let total = 0;
  for (const p of parts) {
    if ("value" in p) total += p.value;
  }
  return total;
}

/** A part labelled by an APP i18n key (Base, Shield, PB, Exhaustion, …). */
export function termPart(
  term: string,
  value: number,
  note?: BreakdownNote
): RawBreakdownPart {
  return { label: { term }, value, ...(note ? { note } : {}) };
}

/** A part labelled by an ability modifier (DEX, the spellcasting ability, …). */
export function abilityPart(
  ability: AbilityCode,
  value: number,
  note?: BreakdownNote
): RawBreakdownPart {
  return { label: { ability }, value, ...(note ? { note } : {}) };
}

/** A part labelled by an SRD NAME ref (a feat/feature/item the presenter resolves). */
export function locPart(
  label: LocText,
  value: number,
  note?: BreakdownNote
): RawBreakdownPart {
  return { label: { loc: label }, value, ...(note ? { note } : {}) };
}
