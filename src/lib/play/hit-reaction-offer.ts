/**
 * The reactions a hit offers once its damage is entered (#1330): the rules' "when you
 * are hit by an attack" reactions the character can take right now. Pattern source:
 * midi-qol's reaction prompt on a hit, drawn like the sheet's Concentration save prompt.
 *
 * Legal means: the hit is an attack's (a fall is not) and dealt damage; the character
 * could react just before it (alive, above 0 HP, nothing forbids a Reaction); the
 * Reaction is free; the reaction answers that trigger and can be paid for now (a
 * prepared Shield with a slot to cast it). A reaction already claimed for this hit
 * (its state lit before the damage was entered) is not offered twice.
 *
 * Each offered reaction has a kind, which says how the hit is settled:
 *  - `halve-hit` (Uncanny Dodge): the hit is counted again at half, rounded down.
 *  - `raise-ac` (Shield): the AC rises, and the player says whether the attack still hits.
 * Another hit-trigger reaction joins by adding its action id here with its kind.
 */
import { isCharacterAlive } from "@/lib/character-status";
import { sheetConditionEffects } from "@/lib/condition-sources";
import { resolveActions, type RawResolvedAction } from "@/lib/smart-tracker";
import { reactionTriggersOf } from "./reaction-triggers";
import type { CharacterDoc } from "@/types/character";

export { halvedHit } from "./damage";

export type HitReactionKind = "halve-hit" | "raise-ac";

/** The hit-trigger reactions the offer knows: action id → trigger it answers, kind. */
const HIT_REACTIONS: Readonly<
  Record<string, { trigger: string; kind: HitReactionKind }>
> = {
  "rogue-uncanny-dodge-reaction": { trigger: "hitByAttack", kind: "halve-hit" },
  "spell-shield": { trigger: "hitOrMagicMissileTarget", kind: "raise-ac" },
};

export interface HitReactionChoice {
  actionId: string;
  kind: HitReactionKind;
}

/** The hit as entered: the damage it dealt (after the character's defenses), and
 *  whether it came from an attack. */
export interface EnteredHit {
  amount: number;
  attack: boolean;
}

/**
 * The reactions this hit offers, read on the sheet as it was JUST BEFORE the hit (a
 * hit that drops the character to 0 still offers Shield: it is cast as the attack
 * hits). Empty when nothing is legal. `payable` says whether an action can be paid
 * for now (a use left, a slot to cast it with); the caller passes the sheet's own
 * depletion check, which lives in the presenter layer.
 */
export function hitReactionChoices(
  before: CharacterDoc,
  hit: EnteredHit,
  turn: { reactionUsed: boolean },
  payable: (action: RawResolvedAction) => boolean
): HitReactionChoice[] {
  if (!hit.attack || hit.amount <= 0 || turn.reactionUsed) return [];
  const { session } = before;
  if (session.hp.current < 1 || !isCharacterAlive(before.status, session)) return [];
  if (sheetConditionEffects(before).blockedSlots.has("reaction")) return [];
  const lit = new Set(session.activeFeatures ?? []);
  return resolveActions(before, "combat").flatMap((action) => {
    const known = HIT_REACTIONS[action.id];
    if (!known || action.type !== "reaction") return [];
    if (!reactionTriggersOf(action).includes(known.trigger)) return [];
    if (action.activatesKey && lit.has(action.activatesKey)) return [];
    if (!payable(action)) return [];
    return [{ actionId: action.id, kind: known.kind }];
  });
}
