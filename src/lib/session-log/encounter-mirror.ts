/**
 * Mirror the DM's live encounter (its turn markers and Combat Chronicle beats) into the
 * session log. Pure and idempotent: given the encounter and the session's folded lines,
 * it returns only what is missing — a new beat as an event, a renamed start line as a
 * correction, an undone beat as a retraction. Who struck a beat is not the mirror's
 * business: the feed appends that correction itself (`encounter-feed.ts`). Item ids are derived
 * from the encounter's epoch and the beat's id, so a reload or a repeated snapshot never
 * duplicates anything.
 */

import type { EncounterState } from "@/types/campaign";
import type { CombatChronicleEvent } from "@/types/combat-chronicle";

import { stableJson, type SessionEntry } from "./fold";
import type { LogItem, PlayEvent } from "./types";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A log item still to be stamped with `by` and `at` by the writing device. */
export type MirrorDraft = DistributiveOmit<LogItem, "by" | "at">;

/** Chronicle beat → play event; `null` for the read-time-only kinds never stored. */
export function chronicleToPlayEvent(event: CombatChronicleEvent): PlayEvent | null {
  const actor = (id: string | undefined) => (id === undefined ? {} : { actor: id });
  const source =
    event.kind !== "down" && "action" in event && event.action
      ? { source: event.action }
      : {};
  switch (event.kind) {
    case "hp-damage":
      return {
        kind: "damage",
        amount: event.amount,
        target: event.targetId,
        ...actor(event.attackerId),
        ...source,
      };
    case "hp-heal":
      return {
        kind: "heal",
        amount: event.amount,
        target: event.targetId,
        ...actor(event.actorId),
        ...source,
      };
    case "stabilized":
      return {
        kind: "stabilized",
        target: event.targetId,
        ...actor(event.actorId),
        ...source,
      };
    case "down":
      return { kind: "down", target: event.targetId };
    case "condition-gain":
    case "condition-loss":
      return {
        kind: "condition",
        conditionId: event.conditionId,
        gained: event.kind === "condition-gain",
        target: event.targetId,
        ...actor(event.kind === "condition-gain" ? event.attackerId : event.actorId),
        ...source,
      };
    case "resource-grant":
      return {
        kind: "resource-grant",
        resource: event.resource,
        target: event.targetId,
        ...actor(event.actorId),
        ...(event.value === undefined ? {} : { value: event.value }),
        ...source,
      };
    default:
      return null;
  }
}

/** Every item id already in the raw log, retracted lines included: an id is never
 *  written twice (the fold keeps only the first), so the mirror never re-adds a line
 *  someone retracted while its beat still stands. */
export function loggedIds(items: readonly LogItem[]): Set<string> {
  return new Set(items.map((item) => item.id));
}

/**
 * The DM's close of a fight ("Save to Chronicle"): the narrative note, then the end line
 * with the outcome, under the ids the mirror would use, so the mirror adds no second,
 * outcome-less end. The note comes first so it sits inside the encounter.
 */
export function encounterCloseDrafts(
  encounterId: string,
  note: string,
  outcome: "victory" | "ended"
): Array<Extract<MirrorDraft, { type: "event" }>> {
  const text = note.trim();
  return [
    ...(text
      ? [
          {
            type: "event" as const,
            id: `enc:${encounterId}:note`,
            event: { kind: "note" as const, text },
          },
        ]
      : []),
    {
      type: "event",
      id: `enc:${encounterId}:end`,
      event: { kind: "encounter-end", encounterId, outcome },
    },
  ];
}

export function mirrorEncounter(
  encounter: EncounterState | null,
  logged: readonly SessionEntry[],
  written: ReadonlySet<string> = new Set()
): MirrorDraft[] {
  const byId = new Map(logged.map((entry) => [entry.id, entry]));
  const drafts: MirrorDraft[] = [];
  const add = (id: string, event: PlayEvent): void => {
    if (!byId.has(id) && !written.has(id)) drafts.push({ type: "event", id, event });
  };
  /** Record `event` under `id`, or correct the recorded line when it changed. */
  const upsert = (id: string, event: PlayEvent): void => {
    const known = byId.get(id);
    if (!known) add(id, event);
    else if (stableJson(known.event) !== stableJson(event)) {
      // Numbered by the line's own correction count: stable while a write is in flight,
      // and unique if a line flips back to an earlier content.
      const correction = `${id}:c:${known.corrections + 1}`;
      drafts.push({ type: "correct", id: correction, target: id, event });
    }
  };

  const live = encounter ? String(encounter.epoch) : null;
  for (const entry of logged) {
    if (entry.event.kind !== "encounter-start" || entry.event.encounterId === live)
      continue;
    const { encounterId } = entry.event;
    add(`enc:${encounterId}:end`, { kind: "encounter-end", encounterId });
  }
  if (!encounter || live === null) return drafts;

  const prefix = `enc:${live}`;
  // Players read the log, so a hidden (ambush) creature is named only once revealed;
  // until then its lines identify it by id alone. A name once logged stays, so the
  // report still names every creature that was seen.
  const loggedStart = byId.get(`${prefix}:start`)?.event;
  const names: Record<string, string> = {
    ...(loggedStart?.kind === "encounter-start" ? loggedStart.names : {}),
  };
  for (const combatant of encounter.combatants) {
    if (combatant.kind === "monster" && combatant.hidden !== true)
      names[combatant.id] = combatant.name;
  }
  const start: PlayEvent = {
    kind: "encounter-start",
    encounterId: live,
    ...(Object.keys(names).length > 0 ? { names } : {}),
  };
  upsert(`${prefix}:start`, start);
  if (encounter.round >= 1)
    add(`${prefix}:round:${encounter.round}`, {
      kind: "round-start",
      round: encounter.round,
    });

  const present = new Set<string>();
  for (const beat of encounter.events ?? []) {
    const event = chronicleToPlayEvent(beat);
    if (!event) continue;
    // The encounter numbers beats from its live array, so a beat appended after the
    // newest one was undone reuses that id. The mirror's own retraction (`<line>:x`)
    // marks the old line as gone for good; the new beat takes the next generation.
    const base = `${prefix}:ev:${beat.id}`;
    let id = base;
    for (let generation = 2; written.has(`${id}:x`); generation++) {
      id = `${base}:g${generation}`;
    }
    present.add(id);
    // A beat never changes once recorded: who struck it is a correction appended by
    // the feed, and the mirror must not revert it.
    add(id, event);
  }
  for (const entry of logged) {
    if (entry.id.startsWith(`${prefix}:ev:`) && !present.has(entry.id)) {
      drafts.push({ type: "retract", id: `${entry.id}:x`, target: entry.id });
    }
  }
  return drafts;
}
