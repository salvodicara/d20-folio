/**
 * What a hit can add on the new Play screen (headless), as the classic action card
 * offers it: the on-hit riders (Divine Smite and the like), the weapon's
 * Mastery, and the Rogue's Cunning Strike on a weapon attack. The actions are the
 * classic ones: `spendRider` and `applyCunningStrike` from `useTurnEconomy`, and
 * `applyMasteryRider`.
 */
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

export interface AfterHitOptions {
  riders: ReadonlyArray<RiderVM>;
  mastery: MasteryRiderVM[];
  cunningStrike: CunningStrikeVM[];
}

/** The options one action offers after a hit. Mastery and Cunning Strike ride a
 *  weapon; Cunning Strike only its Attack action. */
export function afterHitOptions(
  action: CombatAction,
  cunningStrike: CunningStrikeVM[]
): AfterHitOptions {
  const weapon = action.weaponFacts !== undefined;
  return {
    riders: action.weaponFacts?.riders ?? action.riders ?? [],
    mastery: weapon ? (action.masteryRiders ?? []) : [],
    cunningStrike: weapon && action.type === "action" ? cunningStrike : [],
  };
}
