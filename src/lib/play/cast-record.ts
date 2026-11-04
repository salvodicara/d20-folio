/**
 * The cast record (edge-case M13): what a spell was cast with, read back from the
 * cast's own log line. The line is the record: it is written once at the cast,
 * undoing the cast removes it, and it already travels with the character.
 */
import type { StoredConcentration } from "@/types/ids";
import type { CombatEvent } from "@/types/combat-log";

type CastLine = Extract<CombatEvent, { kind: "action-use" }>;

/** The latest cast line of the spell Concentration is held on, if it is still logged. */
export function heldSpellCast(
  entries: ReadonlyArray<{ event: CombatEvent }>,
  concentration: StoredConcentration
): CastLine | undefined {
  if (!concentration) return undefined;
  for (const { event } of [...entries].reverse()) {
    if (
      event.kind === "action-use" &&
      "srd" in event.action &&
      event.action.srd.kind === "spell" &&
      event.action.srd.key === concentration
    ) {
      return event;
    }
  }
  return undefined;
}

/** Whether the held spell was cast with a Metamagic option (Extended Spell). */
export function heldSpellCastWith(
  entries: ReadonlyArray<{ event: CombatEvent }>,
  concentration: StoredConcentration,
  metamagicId: string
): boolean {
  return heldSpellCast(entries, concentration)?.metamagic?.includes(metamagicId) === true;
}
