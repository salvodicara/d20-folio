/**
 * The player side of the session log: a sheet's own play-log lines (`CombatEvent`s the
 * owner's gestures produce — manual HP, heals, temp HP, conditions, concentration, death
 * saves, rests, actions) recorded into the campaign session. None of these produce a
 * Combat Chronicle beat, so nothing here duplicates the DM mirror.
 */

import type { LogEntry } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";

import type { SessionRecorder } from "./recorder";
import type { CombatantId, PlayEvent } from "./types";

/** Sheet line → play event, with the character as actor (or target of what it took);
 *  `null` for what the session already knows (turn ends) or cannot express yet. */
export function combatEventToPlayEvent(
  event: CombatEvent,
  me: CombatantId
): PlayEvent | null {
  switch (event.kind) {
    case "action-use":
      return {
        kind: "action",
        actor: me,
        source: event.action,
        slot: event.slot,
        ...(event.targets?.length ? { targets: event.targets } : {}),
      };
    case "reaction-use":
      return { kind: "action", actor: me, source: event.action, slot: "reaction" };
    case "rider-use":
      return { kind: "action", actor: me, source: event.rider };
    case "hp-damage":
      return { kind: "damage", amount: event.amount, target: me };
    case "hp-heal":
      return { kind: "heal", amount: event.amount, target: me };
    case "temp-hp-gain":
      return { kind: "temp-hp", amount: event.amount, target: me };
    case "condition-gain":
    case "condition-loss":
      return {
        kind: "condition",
        conditionId: event.conditionId,
        gained: event.kind === "condition-gain",
        target: me,
      };
    case "concentration-start":
    case "concentration-end":
      return {
        kind: "concentration",
        spell: event.spell,
        started: event.kind === "concentration-start",
        actor: me,
      };
    case "death-save":
      return { kind: "death-save", outcome: event.outcome, actor: me };
    case "rest":
      return { kind: "rest", rest: event.restKind, actor: me };
    case "turn-end":
    case "effect-expired":
    case "legacy":
      return null;
  }
}

/**
 * Forward one character's sheet lines into the session: each new line once (its id is
 * derived from the character and line, so a second open device dedupes in the fold), and
 * an undo as a retraction of the line it recorded.
 */
export function createCharacterLogMirror(deps: {
  recorder: SessionRecorder;
  characterId: string;
  actor: CombatantId;
}): {
  added(entry: LogEntry): Promise<void>;
  removed(entryId: string): Promise<void>;
  corrected(entry: LogEntry): Promise<void>;
} {
  const recorded = new Set<string>();
  const idOf = (entryId: string): string => `pc:${deps.characterId}:${entryId}`;
  return {
    async added(entry) {
      const event = combatEventToPlayEvent(entry.event, deps.actor);
      if (!event) return;
      const id = idOf(entry.id);
      recorded.add(id);
      await deps.recorder.record(event, { id });
    },
    async corrected(entry) {
      const id = idOf(entry.id);
      const event = combatEventToPlayEvent(entry.event, deps.actor);
      if (!event || !recorded.has(id)) return;
      await deps.recorder.correct(id, event);
    },
    async removed(entryId) {
      const id = idOf(entryId);
      if (!recorded.delete(id)) return;
      await deps.recorder.retract(id, { id: `${id}:x` });
    },
  };
}
