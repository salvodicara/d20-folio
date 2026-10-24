/**
 * encounter-regeneration — the DM's one tap for a monster's Regeneration trait
 * (Troll, Oni, Shield Guardian): at the monster's turn start the card offers the
 * printed amount; the tap books it through the engine heal path
 * ({@link applyAdversaryHeal}) as the monster's own Regeneration beat, once per
 * round. Whether it took the suppressing damage (the Troll's Acid or Fire) is read
 * from the encounter's damage log ({@link regenerationSuppressedBy}); a turn it is
 * switched off logs one line instead of healing ({@link regenerationTurnStart}).
 *
 * Pure reducers over the encounter value; no corpus import (the fact arrives
 * from the lazy bestiary seam), so this module is safe in the campaign chunk.
 */
import type { MonsterTraitFact } from "@/data/types";
import type { DamageType } from "@/types/damage";
import type { LocText } from "@/lib/loc-text";
import type { MirrorDraft } from "@/lib/session-log/encounter-mirror";
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

/**
 * Whether the turn-start tap belongs on the card now: on the monster's own turn — or,
 * for a regenerator that works at 0 HP (the Troll), all round while it is down, since
 * the turn engine skips a monster at 0 HP and its turn would never start.
 */
export function regenerationDue(
  monster: EncounterMonster,
  fact: Extract<MonsterTraitFact, { kind: "regeneration" }>,
  isCurrent: boolean
): boolean {
  return isCurrent || (monster.hp.current < 1 && !fact.needsHp);
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

/** The logged action of a regeneration a damage type switched off (a ui key). */
export const REGENERATION_SUPPRESSED_ACTION: LocText = {
  ui: "monster.trait.regenerationSuppressedAction",
};

/**
 * The damage types that switch the monster's Regeneration off for the turn the
 * encounter is on (the Troll: "If the troll takes Acid or Fire damage, this trait
 * doesn't function on the troll's next turn"), or null when it works. Pure over the
 * damage log: a typed hit counts when it landed between the start of the monster's
 * previous turn and the start of this round's turn (a hit during its own turn
 * reaches the next one). Untyped hits and a monster outside the frozen order never
 * switch it off, so the DM's tap stays the fallback.
 */
export function regenerationSuppressedBy(
  encounter: EncounterState,
  monsterId: string,
  fact: Extract<MonsterTraitFact, { kind: "regeneration" }>
): DamageType[] | null {
  const suppressors = fact.suppressedBy ?? [];
  if (suppressors.length === 0) return null;
  const order = encounter.order ?? [];
  const own = order.indexOf(monsterId);
  if (own < 0) return null;
  const position = (turnOf: string | undefined) =>
    turnOf === undefined ? -1 : turnOf === monsterId ? own : order.indexOf(turnOf);
  // A beat's place as (round, turn position); the window is [previous turn, this turn).
  const at = (round: number, slot: number) => round * (order.length + 1) + slot + 1;
  const from = at(encounter.round - 1, own);
  const to = at(encounter.round, own);
  const found = new Set<DamageType>();
  for (const event of encounter.events ?? []) {
    if (event.kind !== "hp-damage" || event.targetId !== monsterId) continue;
    const place = at(event.round, position(event.turnOf));
    if (place < from || place >= to) continue;
    for (const type of event.damageTypes ?? []) {
      if (suppressors.includes(type)) found.add(type);
    }
  }
  return found.size > 0 ? suppressors.filter((type) => found.has(type)) : null;
}

/**
 * The monster's Regeneration at the start of its turn, as one call: the heal through
 * {@link applyRegeneration}, or, when a damage type switched it off, the unchanged
 * encounter plus the one session-log line that says so (a deterministic id per
 * encounter, round and monster, so asking twice never logs twice). Nothing happens
 * when it already healed this round or there is nothing to heal.
 */
export function regenerationTurnStart(
  encounter: EncounterState,
  campaignId: string,
  monsterId: string,
  fact: Extract<MonsterTraitFact, { kind: "regeneration" }>
): { encounter: EncounterState; log: Array<Extract<MirrorDraft, { type: "event" }>> } {
  const idle = { encounter, log: [] };
  const monster = encounter.combatants.find((c) => c.id === monsterId);
  if (!monster || monster.kind !== "monster") return idle;
  if (regeneratedThisRound(encounter, monsterId)) return idle;
  if (regenerationSuppressedBy(encounter, monsterId, fact)) {
    return {
      encounter,
      log: [
        {
          type: "event",
          id: `enc:${encounter.epoch}:regen-off:${encounter.round}:${monsterId}`,
          event: {
            kind: "action",
            actor: monsterId,
            source: REGENERATION_SUPPRESSED_ACTION,
          },
        },
      ],
    };
  }
  const offer = regenerationOffer(monster, fact);
  if (offer === null) return idle;
  return {
    encounter: applyRegeneration(encounter, campaignId, monsterId, offer),
    log: [],
  };
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
