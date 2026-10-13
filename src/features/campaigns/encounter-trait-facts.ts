/**
 * encounter-regeneration — the DM's one tap for a monster's Regeneration trait
 * (Troll, Oni, Shield Guardian): at the monster's turn start the card offers the
 * printed amount; the tap books it through the engine heal path
 * ({@link applyAdversaryHeal}) as the monster's own Regeneration beat, once per
 * round. Whether it took the suppressing damage (the Troll's Acid or Fire) is
 * the DM's call: the chip names the types, the tap is never automatic.
 *
 * Pure reducers over the encounter value; no corpus import (the fact arrives
 * from the lazy bestiary seam), so this module is safe in the campaign chunk.
 */
import type { MonsterTraitFact } from "@/data/types";
import type { LocText } from "@/lib/loc-text";
import type { EncounterMonster, EncounterState } from "@/types/campaign";
import { applyAdversaryHeal } from "./encounter-world-command";

/** The logged action of a regeneration heal (a ui key, re-localized on render). */
export const REGENERATION_ACTION: LocText = { ui: "monster.trait.regenerationAction" };

type Translate = (key: string, args?: Record<string, string | number>) => string;

/** "A, B and C" with the locale's word (`and` / `or`). */
function list(parts: ReadonlyArray<string>, word: string): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${word} ${parts[parts.length - 1]}`;
}

/** The compact chip a trait fact reads as on the DM's monster card. */
export function traitFactLabel(fact: MonsterTraitFact, t: Translate): string {
  const damage = (type: string) => t(`srd.damage_${type}`);
  switch (fact.kind) {
    case "advantage":
    case "disadvantage":
      return t(`monster.trait.${fact.kind}_${fact.when}`, {
        rolls: list(
          fact.rolls.map((roll) => t(`monster.trait.roll_${roll}`)),
          t("common.and")
        ),
      });
    case "regeneration":
      if (fact.suppressedBy)
        return t("monster.trait.regenerationSuppressed", {
          amount: fact.amount,
          types: list(fact.suppressedBy.map(damage), t("create.sizeOr")),
        });
      return t(
        fact.needsHp ? "monster.trait.regenerationNeedsHp" : "monster.trait.regeneration",
        { amount: fact.amount }
      );
    case "absorb":
      return t(fact.instead ? "monster.trait.absorbInstead" : "monster.trait.absorb", {
        type: damage(fact.damageType),
      });
    case "siege":
      return t("monster.trait.siege");
  }
}

/** The HP the turn-start offer heals, or null when there is nothing to offer. */
export function regenerationOffer(
  monster: EncounterMonster,
  fact: Extract<MonsterTraitFact, { kind: "regeneration" }>
): number | null {
  if (monster.hp.current >= monster.hp.max) return null;
  if (fact.needsHp && monster.hp.current < 1) return null;
  return fact.amount;
}

/** True once this monster's regeneration is booked in the current round. */
export function regeneratedThisRound(
  encounter: EncounterState,
  monsterId: string
): boolean {
  return (encounter.events ?? []).some(
    (event) =>
      event.kind === "hp-heal" &&
      event.round === encounter.round &&
      event.targetId === monsterId &&
      event.action !== undefined &&
      "ui" in event.action &&
      event.action.ui === "monster.trait.regenerationAction"
  );
}

/** Book one regeneration heal for the monster, at most once per round. */
export function applyRegeneration(
  encounter: EncounterState,
  campaignId: string,
  monsterId: string,
  amount: number
): EncounterState {
  if (regeneratedThisRound(encounter, monsterId)) return encounter;
  const before = encounter.events?.length ?? 0;
  const next = applyAdversaryHeal(encounter, campaignId, monsterId, amount, {
    actorId: monsterId,
    action: REGENERATION_ACTION,
  });
  // The 0-HP revive degrades to the legacy arithmetic, whose beat carries no
  // provenance: stamp the new heal beat so the log and the once-per-round guard
  // read it as this regeneration too.
  const events = next.events ?? [];
  return {
    ...next,
    events: events.map((event, index) =>
      index >= before &&
      event.kind === "hp-heal" &&
      event.targetId === monsterId &&
      !event.action
        ? { ...event, actorId: monsterId, action: REGENERATION_ACTION }
        : event
    ),
  };
}
