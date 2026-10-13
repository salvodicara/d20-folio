/**
 * The player side of the session log: a sheet's own play-log lines (`CombatEvent`s the
 * owner's gestures produce — manual HP, heals, temp HP, conditions, concentration, death
 * saves, rests, actions) recorded into the campaign session. None of these produce a
 * Combat Chronicle beat, so nothing here duplicates the DM mirror.
 */

import type { LogEntry } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";
import { srdText } from "@/lib/loc-text";
import { TIME_STOP_ID } from "@/lib/play/extra-turns";

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
      return {
        kind: "action",
        actor: me,
        source: event.action,
        slot: "reaction",
        ...(event.targets?.length ? { targets: event.targets } : {}),
      };
    case "rider-use":
      return { kind: "action", actor: me, source: event.rider };
    case "hp-damage":
    case "hp-heal":
    case "temp-hp-gain":
      return {
        kind:
          event.kind === "hp-damage"
            ? "damage"
            : event.kind === "hp-heal"
              ? "heal"
              : "temp-hp",
        amount: event.amount,
        target: me,
        // The damage tray on myself: my own action did it.
        ...(event.source
          ? { actor: me, source: event.source, provenance: "manual" as const }
          : {}),
      };
    case "hp-max-reduction":
      return { kind: "max-hp", reduction: event.reduction, target: me };
    case "condition-gain":
    case "condition-loss":
      return {
        kind: "condition",
        conditionId: event.conditionId,
        gained: event.kind === "condition-gain",
        target: me,
        ...(event.kind === "condition-gain" && event.source
          ? { source: event.source }
          : {}),
      };
    case "effect-given":
      return event.effect === "condition"
        ? {
            kind: "condition",
            conditionId: event.conditionId ?? "",
            gained: true,
            target: event.target,
            ...(event.source ? { source: event.source } : {}),
          }
        : {
            kind: event.effect,
            amount: event.amount ?? 0,
            target: event.target,
            actor: me,
            ...(event.source ? { source: event.source } : {}),
            provenance: "manual",
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
    case "fading-penalty":
      return {
        kind: "status",
        sourceId: event.penaltyId,
        started: event.amount > 0,
        actor: me,
      };
    case "effect-expired":
      return { kind: "status", sourceId: event.sourceId, started: false, actor: me };
    case "turn-end":
      // A round advance is known from the encounter; an EXTRA turn is not, so it is
      // recorded as a use of the feature or spell that granted it.
      return event.extraTurn
        ? {
            kind: "action",
            actor: me,
            source: srdText(
              event.extraTurn.source === TIME_STOP_ID ? "spell" : "class-feature",
              event.extraTurn.source,
              "name"
            ),
          }
        : null;
    case "tracker-regain":
    case "slot-regain":
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
