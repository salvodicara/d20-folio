/**
 * Combat-card verdict composers — extracted from `PlayTab.tsx` (a component
 * file must only export a component — React Fast-Refresh) so the chip-budget
 * guard can walk the REAL composer over every resolved action in both locales
 * (the same pattern as `spell-card-helpers.ts` / `inventory-card-helpers.ts`).
 *
 * Every branch routes through the `chipText` omit-not-wrap gate (CHIP_BUDGET):
 * a chip is a single-line token BY CONSTRUCTION — when the labelled composition
 * ("1d10+5 Heal") exceeds the budget the label drops (the chip colour carries
 * the semantics); when even the core token exceeds (unbounded custom content)
 * the chip is omitted entirely. Never mid-word, never multi-line.
 */
import type { TFunction } from "i18next";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { VerdictOutcome } from "@/components/shared/UniversalCard";
import type { GatedSlot } from "@/lib/condition-effects";
import { chipText } from "@/lib/views/combat-action-view";

/**
 * Base action IDs whose verdict chip conveys no information beyond the card's
 * own name or a synonym of it — suppressed at the presenter level (golden rule
 * 16: every element must earn its place). The card's effect sentence lives in
 * the gloss instead. Only the genuinely terse / non-name-derivable tokens are
 * kept: Dash → "+Speed" (a quantity, not the name), Disengage → "No OA" (a
 * rule consequence, not the name). Opportunity Attack is a reaction and lives
 * in its own section, so its chip is doubly redundant.
 *
 * The {@link BASE_ACTIONS_NO_CHIP} guard test (chip-budget.guard.test.ts) pins
 * this: every base action's emitted chip must NOT equal (normalized) the action
 * name or the section label, so a new verdict that slips back to name-restatement
 * fails CI.
 */
export const BASE_ACTIONS_NO_CHIP: ReadonlySet<string> = new Set([
  "base-dodge", // "Defend" / "Difesa" — synonym of "Dodge" / "Schivata"
  "base-help", // "Aid" / "Aiuto" — synonym / same word in IT
  "base-hide", // "Hide" / "Nascondi" — same root as "Hide" / "Nascondersi"
  "base-ready", // "Ready" / "Pronto" — same root as "Ready" / "Prepararsi"
  "base-search", // "Seek" / "Cerca" — synonym of "Search" / "Cercare"
  "base-grapple", // "Grapple" / "Afferra" — same root as "Grapple" / "Afferrare"
  "base-shove", // "Shove" / "Spingi" — same root as "Shove" / "Spingere"
  "base-opportunity-attack", // "Strike" / "Colpisci" — synonym; section = reactions
]);

/** The ten chromatic damage outcomes the §11 palette colours; physical types
 *  (bludgeoning/piercing/slashing) and unknowns fold to "physical". */
const CHROMATIC_DAMAGE: ReadonlySet<string> = new Set([
  "fire",
  "cold",
  "lightning",
  "acid",
  "thunder",
  "poison",
  "necrotic",
  "radiant",
  "force",
  "psychic",
]);

/**
 * The ONE verdict chip outcome (colour key, no hex) for a combat action.
 * Damage keys to the §11 chromatic palette; healers/buffs/debuffs/utility use
 * semantic colours — mirrors the Spells page `spellVerdictOutcome`.
 */
export function combatVerdictOutcome(summary: ResolvedAction["summary"]): VerdictOutcome {
  if (summary.damageType) {
    return CHROMATIC_DAMAGE.has(summary.damageType)
      ? (summary.damageType as VerdictOutcome)
      : "physical";
  }
  if (summary.healing) return "heal";
  if (summary.attackBonus != null) return "physical";
  if (summary.saveDC != null) return "debuff";
  return "utility";
}

/**
 * The verdict chip TEXT — a TIGHT at-a-glance OUTCOME token (1–3 words), never a
 * full effect sentence (cf. the p01-combat mock: Dash = verdict "+Speed" + the
 * sentence in the GLOSS). Order: damage formula + CURATED short type, then
 * healing, then a known short verdict word for base actions (Dash → "+Speed").
 * Returns "" when there's no tight token — the long effect sentence then lives
 * in the gloss (`combatGloss`), not crammed into a fixed-width chip.
 */
export function combatVerdict(action: ResolvedAction, t: TFunction): string {
  const { summary } = action;
  if (summary.damage) {
    // S12b — a multi-instance spell (Magic Missile 3 darts, Scorching Ray 3 rays)
    // shows "N × {damage}" so the player reads N separate rolls. The per-instance
    // `summary.damage` already folds any flat rider; multiply for display only.
    const damage =
      summary.instances && summary.instances > 1
        ? t("spells.multiInstance", { count: summary.instances, dice: summary.damage })
        : summary.damage;
    if (summary.damageType) {
      // Curated bilingual short word — the SAME lookup the Spells page uses
      // (srd.damageShort_* → "Prc"/"Psy"/"Thndr", falling back to srd.damage_*),
      // so the verdict reads identically across the four card pages. NOT a blind
      // character slice ("Piercing" → "Pie" reads as the dessert).
      const shortType = (dt: string): string => t(`srd.damageShort_${dt}`);
      // A player-CHOSEN damage type (Chromatic Orb; Great Old One Psychic Spells →
      // Force/Psychic; Undead Arcane Necrosis → Force/Necrotic) shows every option
      // joined with "/", so the choice is visible at a glance — not just the first
      // type. "multi" (simultaneous-type) spells keep the single primary chip.
      const typeLabel =
        summary.multiDamageTypeFlavor === "choice" &&
        summary.damageTypes &&
        summary.damageTypes.length > 1
          ? summary.damageTypes.map(shortType).join("/")
          : shortType(summary.damageType);
      // A second simultaneous instance (Ice Storm/Ice Knife/Meteor Swarm) appends
      // "+ {dice} {type}"; the chip gate keeps the primary alone if it overflows.
      const secondary = summary.secondaryDamage
        ? ` + ${summary.secondaryDamage.dice} ${shortType(summary.secondaryDamage.damageType)}`
        : "";
      return chipText(damage, `${damage} ${typeLabel}${secondary}`) ?? "";
    }
    return chipText(damage) ?? "";
  }
  if (summary.healing) {
    return chipText(summary.healing, `${summary.healing} ${t("combat.heal")}`) ?? "";
  }
  // Base SRD actions: only emit a chip when the verdict text adds information
  // BEYOND the card's own name or a synonym of it (golden rule 19). The two
  // genuinely informative tokens are: Dash → "+Speed" (a quantity) and Disengage
  // → "No OA" (a rule consequence). All others are suppressed — their effect
  // sentence lives in the gloss, where it already belongs.
  if (action.id.startsWith("base-")) {
    if (BASE_ACTIONS_NO_CHIP.has(action.id)) return "";
    return chipText(t(`combat.verdict_${action.id}`)) ?? "";
  }
  // Control / debuff fallback — a save-forcing action with no damage/heal (e.g.
  // Suggestion, Hypnotic Pattern, Fear) is precisely the spell whose whole point
  // is a status effect, yet it would otherwise carry NO verdict chip and read as
  // an uneven blank beside the damage rows. Mirror the Spells page so the same
  // spell looks consistent on both surfaces: if a short status word is present
  // (summary.effect, e.g. "Charmed" / "Frightened") prefer it; otherwise fall
  // back to the SAME generic save token the Spells route uses
  // (t("spells.saveBadge") → EN "Save" / IT "TS"). Kept 1–3 words; the full
  // sentence stays in the gloss.
  if (summary.saveAbility) {
    // An over-budget effect sentence falls back to the generic save token (the
    // save spell keeps a chip; the sentence lives in the gloss/accordion).
    return (
      (summary.effect ? chipText(summary.effect) : undefined) ??
      chipText(t("spells.saveBadge")) ??
      ""
    );
  }
  return "";
}

/**
 * Why a card's CTA is unavailable RIGHT NOW (B2 — the BG3 at-a-glance can/cannot),
 * as a discriminated reason BEFORE any tap (the post-tap toast stays a backstop).
 * Pure + table-testable: maps the card's economy `slot`, the condition-blocked
 * slot set, and whether the action's pool is depleted to ONE reason — `null`
 * when the card is freely usable. A SPENT economy token is NOT a reason here:
 * spent-ness reads on the CTA itself (the disabled "Used" state,
 * {@link combatCtaState}), never as a duplicated inline line.
 *
 * Precedence (most specific first): a depleted resource > a condition-blocked
 * slot. `condition` carries the blocking reason as `slot` (the kind:
 * action/bonus/reaction) so PlayTab can name the culprit condition (derived
 * from the active set) for the inline line; `depleted` is self-naming. The
 * reason is a DISPLAY state, never a hard lock (override-first) — a
 * condition-blocked card stays tappable and the toast guard remains the backstop.
 */
export type BlockedReason = { kind: "depleted" } | { kind: "condition"; slot: GatedSlot };

export function blockedReasonFor(args: {
  slot: GatedSlot;
  blockedSlots: ReadonlySet<GatedSlot>;
  depleted: boolean;
}): BlockedReason | null {
  if (args.depleted) return { kind: "depleted" };
  if (args.blockedSlots.has(args.slot)) return { kind: "condition", slot: args.slot };
  return null;
}

/**
 * The combat-CTA grammar (owner-ratified 2026-07-11) — ONE rule across every
 * combat card: **the CTA states usability NOW; the session undo system (5 s
 * toast · masthead Undo/Redo · ⌘Z) owns ALL reversal.** No inline cancel
 * affordance exists anywhere.
 *
 * Pure composer so every surface derives the same states by construction
 * (golden rule 6) and the grammar is pinned table-driven:
 *
 *  - `spent`    — the card's economy token is spent (this card committed it,
 *                 its slot is at budget, the Attack action is fully swung, or
 *                 the Reaction is used) → CTA DISABLED, label "Used"; the
 *                 committed occupant additionally wears the recessed treatment
 *                 (`ctaCommitted`) + the card's gold ring, so the turn story
 *                 stays legible. Mid-Attack-action (`attackLive`) the Action
 *                 slot is full but swings remain, so spent does NOT apply.
 *  - `disabled` — spent OR depleted (no uses / no cast route). A hard stop —
 *                 never a tap that toasts "already used".
 *  - `emphasis` — Extra Attack swings remain → the struck-gold live CTA.
 *  - `dimmed`   — condition-soft-blocked (Frightened, unproficient armor…) →
 *                 dimmed + the inline condition line, still TAPPABLE
 *                 (override-first; the post-tap toast is the backstop).
 */
export interface CombatCtaState {
  /** The CTA reads the "Used" label instead of its verb. */
  spent: boolean;
  disabled: boolean;
  emphasis: boolean;
  dimmed: boolean;
}

export function combatCtaState(args: {
  /** This card is a committed occupant of its economy slot this turn. */
  committed: boolean;
  /** The card's economy slot is at budget (free slots are never full). */
  slotFull: boolean;
  /** Pip-attack card with swings remaining in the open Attack action. */
  attackLive: boolean;
  /** The backing resource is out (no uses left / no cast route). */
  depleted: boolean;
  /** An active condition soft-blocks the card's slot. */
  conditionBlocked: boolean;
}): CombatCtaState {
  const spent = (args.committed || args.slotFull) && !args.attackLive;
  return {
    spent,
    disabled: spent || args.depleted,
    emphasis: args.attackLive && !args.depleted,
    dimmed: !spent && !args.depleted && args.conditionBlocked,
  };
}

/**
 * RA-13 — the TWF once-per-turn off-hand cap. The Light property grants exactly
 * ONE extra off-hand attack per turn; **Nick** only changes that attack's ECONOMY
 * (it rides the Attack action, joining the uncapped `free` slot, instead of the
 * Bonus Action). So the slot budget alone can no longer cap a mixed pair — a
 * `free` Nick off-hand + a `bonus` non-Nick off-hand sit in different slots and
 * would both be committable. The cap is enforced directly here: all `offhand`
 * rows are ONE mutually-exclusive per-turn resource — the FIRST off-hand row
 * committed (in either the free OR the bonus slot) claims the turn's extra attack,
 * and every OTHER off-hand row is then marked spent ("Used") via `slotFull`.
 * Returns that committed off-hand's id (or `null` while none is committed); undo
 * clears the commit and restores the others by construction.
 */
export function committedOffHandId(
  actions: ReadonlyArray<{ id: string; offhand?: boolean }>,
  committedIds: ReadonlySet<string>
): string | null {
  return actions.find((a) => a.offhand && committedIds.has(a.id))?.id ?? null;
}
