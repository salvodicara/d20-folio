/**
 * What a hit can add on the new Play screen (headless), as the classic action card
 * offers it: the on-hit riders (Divine Smite and the like), the weapon's
 * Mastery, the Rogue's Cunning Strike and the learned on-hit maneuvers on a weapon
 * attack. The actions are the classic ones: `spendRider`, `applyCunningStrike` and
 * `executeAction` (a maneuver's own row) from `useTurnEconomy`, and
 * `applyMasteryRider`.
 */
import type { ManeuverDieTarget } from "@/data/maneuvers";
import type { Locale } from "@/lib/locale";
import { resolveCunningStrikeOptions, resolveTrackers } from "@/lib/smart-tracker";
import type { CombatAction } from "@/lib/views/combat-action-view";
import {
  buildCunningStrikeOptions,
  type CunningStrikeVM,
} from "@/lib/views/cunning-strike-view";
import type { MasteryRiderVM } from "@/lib/views/mastery-rider-view";
import type { RiderVM } from "@/lib/views/rider-view";
import type { CharacterDoc } from "@/types/character";

const SNEAK_ATTACK_ID = "rogue-sneak-attack";

/**
 * The Rogue's Cunning Strike catalogue, legal against the live Sneak Attack use and
 * its dice budget (⌈Rogue level / 2⌉ d6): an unaffordable option comes disabled.
 * Empty for a character without Cunning Strike.
 */
export function cunningStrikeOptionsFor(
  doc: CharacterDoc,
  locale: Locale
): CunningStrikeVM[] {
  const { options } = resolveCunningStrikeOptions(doc);
  if (options.length === 0) return [];
  const sneak = resolveTrackers(doc).find((tr) => tr.id === SNEAK_ATTACK_ID);
  const sneakAttackAvailable = sneak ? sneak.total - sneak.used > 0 : false;
  const sneakAttackDice = sneak?.die ? parseInt(sneak.die, 10) || 0 : 0;
  return buildCunningStrikeOptions(
    options,
    { sneakAttackAvailable, sneakAttackDice },
    locale
  );
}

/** One learned maneuver a hit can take: its own engine row, ready for `executeAction`. */
export interface ManeuverOptionVM {
  /** The engine's granted-action row; committing it is `executeAction(action)`. */
  action: CombatAction;
  id: string;
  name: string;
  /** The Superiority Die, e.g. "d8". */
  die: string;
  diceLeft: number;
  diceTotal: number;
  /** The roll the die adds to: the hit's damage or its attack roll. */
  addsTo: ManeuverDieTarget;
  /** The save the target makes, or null. */
  save: { ability: string; dc: number } | null;
  /** No Superiority Die left. */
  disabled: boolean;
}

/**
 * The learned maneuvers that ride a hit, from the character's action rows: the rows
 * with no action of their own («free») whose Superiority Die adds to the attack's
 * damage or attack roll (Trip Attack, Precision Attack and the like). Each costs one
 * die; with none left it comes disabled. Empty for a character without them.
 */
export function maneuverOptionsFor(
  actions: ReadonlyArray<CombatAction>
): ManeuverOptionVM[] {
  return actions.flatMap((action) => {
    const { dieAddsTo, die, uses, saveAbility, saveDC } = action.summary;
    if (action.type !== "free" || !dieAddsTo || !die || !uses) return [];
    return [
      {
        action,
        id: action.id,
        name: action.name,
        die,
        diceLeft: uses.current,
        diceTotal: uses.total,
        addsTo: dieAddsTo,
        save:
          saveAbility && saveDC !== undefined
            ? { ability: saveAbility, dc: saveDC }
            : null,
        disabled: uses.current <= 0,
      },
    ];
  });
}

/** The attack carries the Sneak Attack rider (the engine decides which attacks do). */
export function carriesSneakAttack(action: CombatAction): boolean {
  return (action.weaponFacts?.riders ?? action.riders ?? []).some(
    (rider) =>
      rider.spend?.kind === "tracker" && rider.spend.trackerId === SNEAK_ATTACK_ID
  );
}

export interface AfterHitOptions {
  riders: ReadonlyArray<RiderVM>;
  mastery: MasteryRiderVM[];
  cunningStrike: CunningStrikeVM[];
  maneuvers: ManeuverOptionVM[];
}

/** The options one action offers after a hit. Mastery, Cunning Strike and the
 *  maneuvers ride a weapon; Cunning Strike only an Attack action that deals Sneak Attack. */
export function afterHitOptions(
  action: CombatAction,
  cunningStrike: CunningStrikeVM[],
  maneuvers: ManeuverOptionVM[] = []
): AfterHitOptions {
  const weapon = action.weaponFacts !== undefined;
  return {
    riders: action.weaponFacts?.riders ?? action.riders ?? [],
    mastery: weapon ? (action.masteryRiders ?? []) : [],
    // Cunning Strike rides Sneak Attack (SRD 5.2.1), so only an attack that carries
    // the Sneak Attack rider offers it: a Finesse or Ranged weapon, or whatever a
    // feature lets Sneak Attack ride. Never a plain Club or an Unarmed Strike.
    cunningStrike:
      weapon && action.type === "action" && carriesSneakAttack(action)
        ? cunningStrike
        : [],
    maneuvers: weapon ? maneuvers : [],
  };
}
