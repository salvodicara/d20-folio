/** Pure transitions of the character's own play log (the persisted, capped array). */
import type { CombatEvent } from "@/types/combat-log";
import type { LogEntry } from "@/types/character";

/**
 * Hard cap on the persisted/synced log array: it ships to Firestore on every save and
 * mirrors to IndexedDB, so it keeps the last MAX_LOG entries.
 */
export const MAX_LOG = 200;

/** The log with one entry appended, capped. */
export function appendLogEntry(
  entries: ReadonlyArray<LogEntry>,
  entry: LogEntry
): LogEntry[] {
  return [...entries, entry].slice(-MAX_LOG);
}

/** The log without one entry; null when it is not there. */
export function removeLogEntry(
  entries: ReadonlyArray<LogEntry>,
  id: string
): LogEntry[] | null {
  return entries.some((e) => e.id === id) ? entries.filter((e) => e.id !== id) : null;
}

/** The log with one entry's event replaced. */
export function amendLogEntry(
  entries: ReadonlyArray<LogEntry>,
  id: string,
  event: CombatEvent
): LogEntry[] {
  return entries.map((e) => (e.id === id ? { ...e, event } : e));
}
