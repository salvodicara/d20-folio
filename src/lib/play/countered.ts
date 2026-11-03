/**
 * A countered spell keeps its slot (Counterspell 2024, edge-case M12): "the spell
 * fails, wasting its action, Bonus Action or Reaction, but not its spell slot". The
 * rule is Counterspell's own (`counter: { slot: "kept" }`); the cast that was
 * countered names the slot it paid, and saying "countered" on this turn gives it
 * back. The action stays spent.
 */
import { getSpellById } from "@/data/spells";
import type { LocText } from "@/lib/loc-text";
import type { CombatEvent } from "@/types/combat-log";

/** Whether a countered spell keeps its slot (the catalogue's Counterspell says so). */
export const COUNTERED_SPELL_KEEPS_SLOT =
  getSpellById("counterspell")?.counter?.slot === "kept";

/** A cast this turn that paid a slot and hasn't been marked countered yet. */
export interface CounterableCast {
  /** The cast's log entry. */
  entryId: string;
  action: LocText;
  level: number;
  pactMagic: boolean;
}

/** This turn's slot casts (since the last End Turn) that can still be marked
 *  countered, oldest first. */
export function counterableCasts(
  entries: ReadonlyArray<{ id: string; event: CombatEvent }>
): CounterableCast[] {
  if (!COUNTERED_SPELL_KEEPS_SLOT) return [];
  const countered = new Set<string>();
  const out: CounterableCast[] = [];
  for (const { id, event } of [...entries].reverse()) {
    if (event.kind === "turn-end") break;
    if (event.kind === "spell-countered") countered.add(event.entryId);
    if (event.kind === "action-use" && event.paidSlot && !countered.has(id)) {
      out.push({
        entryId: id,
        action: event.action,
        level: event.paidSlot.level,
        pactMagic: event.paidSlot.pactMagic === true,
      });
    }
  }
  return out.reverse();
}

/** The log line that marks a cast countered (its slot comes back). */
export function counteredEvent(cast: CounterableCast): CombatEvent {
  return {
    kind: "spell-countered",
    action: cast.action,
    entryId: cast.entryId,
    level: cast.level,
    ...(cast.pactMagic ? { pactMagic: true as const } : {}),
  };
}
