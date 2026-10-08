/**
 * The session log — one append-only record per play session, shared by every device at
 * the table. Every gesture becomes a {@link PlayEvent}; state and the per-round report are
 * derived from the log, never stored beside it.
 *
 * Minimal declaration: only `kind` (and the number or id that makes the event mean
 * something) is required. Who, on whom and from what are optional; the report says only
 * what it knows. Round and encounter are NOT stamped on events: they follow from the
 * event's position after `round-start` / `encounter-start` markers, so a player's device
 * never needs to know the fight's state to record a gesture.
 *
 * Order is the log's array order. The Firestore adapter appends with `arrayUnion`, which
 * gives every client the same total order (offline writes land in send order), so no
 * clock is needed.
 */

import type { ActionType } from "@/data/types";
import type { LocText } from "@/lib/loc-text";
import type { ConcentrationRef } from "@/types/ids";

/** A creature at the table: `pc-<uid>` or `monster-<n>` (the encounter's ids). */
export type CombatantId = string;

/** Where a declared number came from. Players type every result today; digital dice
 *  would be a second provenance, never a different event. */
export type RollProvenance = "manual";

/** One thing that happened. Fields beyond the discriminant are optional by design. */
export type PlayEvent =
  | {
      kind: "action";
      actor?: CombatantId;
      /** The feature, spell, item or attack used. */
      source?: LocText;
      slot?: ActionType;
      targets?: CombatantId[];
      outcome?: "hit" | "miss" | "saved" | "failed";
    }
  | {
      kind: "damage" | "heal" | "temp-hp";
      amount: number;
      target?: CombatantId;
      actor?: CombatantId;
      source?: LocText;
      provenance?: RollProvenance;
    }
  | {
      kind: "condition";
      conditionId: string;
      gained: boolean;
      target?: CombatantId;
      source?: LocText;
    }
  | {
      kind: "concentration";
      spell: ConcentrationRef;
      started: boolean;
      actor?: CombatantId;
    }
  | { kind: "down"; target: CombatantId }
  | { kind: "stabilized"; target: CombatantId; actor?: CombatantId; source?: LocText }
  | {
      kind: "resource-grant";
      resource: "bardic-inspiration-die" | "heroic-inspiration";
      value?: string;
      target: CombatantId;
      actor?: CombatantId;
      source?: LocText;
    }
  | { kind: "death-save"; outcome: "success" | "failure"; actor?: CombatantId }
  | { kind: "rest"; rest: "short" | "long"; actor?: CombatantId }
  | { kind: "encounter-start"; encounterId: string }
  | { kind: "encounter-end"; encounterId: string; outcome?: "victory" | "ended" }
  | { kind: "round-start"; round: number }
  | { kind: "note"; text: string; actor?: CombatantId };

export type PlayEventKind = PlayEvent["kind"];

/** Envelope common to every log item. `by` is the uid of the device's user. */
interface LogItemBase {
  /** Unique across the session (client-generated). */
  id: string;
  by: string;
  /** Unix ms on the recording device — display only, never used for ordering. */
  at: number;
}

/** A gesture, a correction of an earlier gesture, or its retraction. Corrections are
 *  appended like everything else, so history is never rewritten. */
export type LogItem =
  | (LogItemBase & { type: "event"; event: PlayEvent })
  | (LogItemBase & { type: "correct"; target: string; event: PlayEvent })
  | (LogItemBase & { type: "retract"; target: string });
