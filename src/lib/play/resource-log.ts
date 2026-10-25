/**
 * The log lines a change to Exhaustion, spell-slot pips or Heroic Inspiration writes,
 * read from the character before and after it. The store writes them in one place,
 * after the sheet event that made the change ({@link sheetEventLogEvents}); an undo
 * removes the lines first, then undoes the event (the `passBreathTurn` pattern).
 */
import type { LocText } from "@/lib/loc-text";
import type { CharacterDoc } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";
import type { SheetEvent } from "./sheet-events";

const PACT_PREFIX = "pact-";

/** A slot usage key ("3", "pact-2") as its level and pool. */
function slotOfKey(key: string): { level: number; pactMagic: boolean } | null {
  const pactMagic = key.startsWith(PACT_PREFIX);
  const level = Number(pactMagic ? key.slice(PACT_PREFIX.length) : key);
  return Number.isSafeInteger(level) && level > 0 ? { level, pactMagic } : null;
}

/**
 * Every Exhaustion, spell-slot and Heroic Inspiration change between two states of a
 * character, as log lines: Exhaustion first, then each slot level (the standard pool,
 * then Pact Magic), then Inspiration. `source`: what caused it, when the caller knows.
 */
export function resourceLogEvents(
  before: CharacterDoc,
  after: CharacterDoc,
  options: { source?: LocText } = {}
): CombatEvent[] {
  const source = options.source ? { source: options.source } : {};
  const events: CombatEvent[] = [];
  const was = before.session;
  const now = after.session;
  if (was.exhaustion !== now.exhaustion) {
    events.push({
      kind: "exhaustion-change",
      from: was.exhaustion,
      to: now.exhaustion,
      ...source,
    });
  }
  const keys = new Set([...Object.keys(was.spellSlots), ...Object.keys(now.spellSlots)]);
  const slots = [...keys]
    .flatMap((key) => {
      const slot = slotOfKey(key);
      return slot ? [{ key, ...slot }] : [];
    })
    .sort((a, b) => Number(a.pactMagic) - Number(b.pactMagic) || a.level - b.level);
  for (const { key, ...slot } of slots) {
    const delta = (now.spellSlots[key]?.used ?? 0) - (was.spellSlots[key]?.used ?? 0);
    if (delta === 0) continue;
    events.push({
      kind: delta > 0 ? "slot-spent" : "slot-restored",
      level: slot.level,
      count: Math.abs(delta),
      ...(slot.pactMagic ? { pactMagic: true as const } : {}),
      ...source,
    });
  }
  if (was.inspiration !== now.inspiration) {
    events.push({ kind: "inspiration-change", gained: now.inspiration, ...source });
  }
  return events;
}

/** The sheet events whose change is these resources and nothing else. A rest, time
 *  passing or a held breath writes its own line, so it writes none of these. */
const LOGGED_KINDS: ReadonlySet<SheetEvent["kind"]> = new Set([
  "set-exhaustion",
  "spend-slot",
  "restore-slot",
  "set-inspiration",
]);

/** The lines one sheet event writes for these resources (none for any other event). */
export function sheetEventLogEvents(
  event: SheetEvent,
  before: CharacterDoc,
  after: CharacterDoc,
  options: { source?: LocText } = {}
): CombatEvent[] {
  return LOGGED_KINDS.has(event.kind) ? resourceLogEvents(before, after, options) : [];
}
