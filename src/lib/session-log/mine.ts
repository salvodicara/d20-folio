/**
 * One character's share of the session log: the lines where it acts or is acted on.
 * The sheet's log panel reads this when the character is in a campaign, so the player
 * sees the DM's moves on them beside their own (VISION: one shared session log).
 */
import type { SessionEntry } from "./fold";
import type { CombatantId, PlayEvent } from "./types";

/** Whether `id` acts in, or is a target of, the event. */
export function involvesCombatant(event: PlayEvent, id: CombatantId): boolean {
  if ("actor" in event && event.actor === id) return true;
  if ("target" in event && event.target === id) return true;
  return "targets" in event && (event.targets?.includes(id) ?? false);
}

/** The session lines involving `id`, in log order. */
export function entriesInvolving(
  entries: ReadonlyArray<SessionEntry>,
  id: CombatantId
): SessionEntry[] {
  return entries.filter((entry) => involvesCombatant(entry.event, id));
}

/** The non-PC names every encounter of the session declared, so a line can still name
 *  a goblin after its fight is gone. */
export function sessionCreatureNames(
  entries: ReadonlyArray<SessionEntry>
): Record<CombatantId, string> {
  const names: Record<CombatantId, string> = {};
  for (const { event } of entries) {
    if (event.kind === "encounter-start" && event.names)
      Object.assign(names, event.names);
  }
  return names;
}
