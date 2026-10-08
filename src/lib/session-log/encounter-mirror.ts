/**
 * Mirror the DM's live encounter (its turn markers and Combat Chronicle beats) into the
 * session log. Pure and idempotent: given the encounter and the session's folded lines,
 * it returns only what is missing — a new beat as an event, a changed beat (an attacker
 * tapped later) as a correction, an undone beat as a retraction. Item ids are derived
 * from the encounter's epoch and the beat's id, so a reload or a repeated snapshot never
 * duplicates anything.
 */

import type { EncounterState } from "@/types/campaign";
import type { CombatChronicleEvent } from "@/types/combat-chronicle";

import type { SessionEntry } from "./fold";
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

/** JSON with sorted keys, so a value read back from Firestore compares equal. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function mirrorEncounter(
  encounter: EncounterState | null,
  logged: readonly SessionEntry[]
): MirrorDraft[] {
  const byId = new Map(logged.map((entry) => [entry.id, entry]));
  const drafts: MirrorDraft[] = [];
  const add = (id: string, event: PlayEvent): void => {
    if (!byId.has(id)) drafts.push({ type: "event", id, event });
  };
  /** Record `event` under `id`, or correct the recorded line when it changed. */
  const upsert = (id: string, event: PlayEvent): void => {
    const known = byId.get(id);
    if (!known) drafts.push({ type: "event", id, event });
    else if (stable(known.event) !== stable(event)) {
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
  const names: Record<string, string> = {};
  for (const combatant of encounter.combatants) {
    if (combatant.kind === "monster") names[combatant.id] = combatant.name;
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
    const id = `${prefix}:ev:${beat.id}`;
    present.add(id);
    upsert(id, event);
  }
  for (const entry of logged) {
    if (entry.id.startsWith(`${prefix}:ev:`) && !present.has(entry.id)) {
      drafts.push({ type: "retract", id: `${entry.id}:x`, target: entry.id });
    }
  }
  return drafts;
}
