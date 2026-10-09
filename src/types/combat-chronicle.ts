/**
 * Combat Chronicle events — the campaign-encounter events-as-data contract (the
 * table-wide counterpart to the solo cockpit's {@link import("./combat-log").CombatEvent}).
 *
 * As the DM runs an encounter in the tracker, the PURE reducers append one
 * structured event per landed beat (an HP change, a condition, a fall). Each event
 * carries ONLY ids + numbers — combatant ids (`pc-<uid>` / `monster-<n>`), condition
 * ids, amounts — never a localized display string.
 *
 * These beats are no longer what anyone reads. The DM mirror copies each one into the
 * session log (`src/lib/session-log/encounter-mirror.ts`), and the Combat Chronicle
 * feed, the end-of-fight chapter and the session report are views of that log. The
 * array stays on {@link import("./campaign").EncounterState}.events for two jobs only:
 * the DM's one-tap undo, which reverses a beat's engine action, and the HP readout
 * (`current`/`max`), which the log deliberately does not carry. It is dropped when the
 * encounter clears.
 */

import type { LocText } from "@/lib/loc-text";

/** Shared fields every chronicle event carries. */
interface ChronicleEventBase {
  /**
   * Stable per-encounter id — the append INDEX at emit time (deterministic,
   * collision-free, NO RNG — golden rule 21). Only ever appended during a fight, so
   * the index is unique + stable for React keys and the end-entry line deletion.
   */
  id: string;
  /** The combat round the event occurred in (read from state at append) — drives the
   *  round-grouped feed + the chapter's round markers. */
  round: number;
  /**
   * The engine journal action this beat mirrors (`encounter.world` — the
   * adversary world seam), stamped by `mirrorAdversaryCommit`. The chronicle
   * UNDO tap reverses THAT action through the journal (exact revert) instead
   * of blind arithmetic; absent on legacy/manual beats (they undo through the
   * legacy arithmetic — the documented degradation). An id, never prose.
   */
  engineActionId?: string;
}

/**
 * One structured combat-chronicle event. Each variant carries only ids/tokens +
 * numbers; the presenter maps each `kind` to its i18n prose template and resolves
 * the combatant / condition ids to names via injected resolvers.
 */
export type CombatChronicleEvent =
  /**
   * A combatant took damage. `attackerId` is known only when the action that caused it
   * said so; "Who struck?" answered later is a correction in the session log, never a
   * change to this beat.
   */
  | ({
      kind: "hp-damage";
      /** The combatant that took the hit (`pc-<uid>` / `monster-<n>`). */
      targetId: string;
      /** Current + Temporary HP actually removed. This landed amount is the exact
       *  reversible delta; the pre-floor/overkill incoming amount belongs to the
       *  actor's local combat log instead. */
      amount: number;
      /** Portion of `amount` absorbed by temporary HP, for exact one-tap reversal. */
      tempAbsorbed?: number;
      /** The target's HP AFTER the hit (the "{current}/{max}" readout). */
      current: number;
      max: number;
      /** The attacker's combatant id, when the action that caused the damage said so. */
      attackerId?: string;
      /** Exact resolved action; absent on manual beats. */
      action?: LocText;
    } & ChronicleEventBase)
  /** A combatant regained HP. */
  | ({
      kind: "hp-heal";
      targetId: string;
      amount: number;
      current: number;
      max: number;
      /** The creature that caused the healing, when it came from a resolved action. */
      actorId?: string;
      /** Exact resolved action (spell/feature/item), kept locale-independent. */
      action?: LocText;
    } & ChronicleEventBase)
  /** A 0-HP player character was stabilized without regaining HP. */
  | ({
      kind: "stabilized";
      targetId: string;
      actorId: string;
      /** Exact resolved action (feature/item), kept locale-independent. */
      action?: LocText;
    } & ChronicleEventBase)
  /** A combatant dropped (crossed to 0 HP — a PC downed, a monster group defeated). */
  | ({ kind: "down"; targetId: string } & ChronicleEventBase)
  /** A condition was gained; `attackerId` when the action that applied it said so. */
  | ({
      kind: "condition-gain";
      targetId: string;
      conditionId: string;
      attackerId?: string;
      action?: LocText;
    } & ChronicleEventBase)
  /** A condition was lost / removed. */
  | ({
      kind: "condition-loss";
      targetId: string;
      conditionId: string;
      actorId?: string;
      action?: LocText;
    } & ChronicleEventBase)
  /** A creature received a held combat resource from another creature. */
  | ({
      kind: "resource-grant";
      targetId: string;
      resource: "bardic-inspiration-die" | "heroic-inspiration";
      /** Resource payload when the kind carries one (the Bardic die size). */
      value?: string;
      actorId: string;
      action?: LocText;
    } & ChronicleEventBase);

/** Every `CombatChronicleEvent.kind` discriminant (for the presenter's exhaustiveness). */
export type CombatChronicleEventKind = CombatChronicleEvent["kind"];

/**
 * The light, state-supported outcome of a finished fight — `victory` when there was
 * at least one monster and every one is defeated, else the neutral `ended`. Offered
 * as the editable default at close; never asserts an outcome the state can't support.
 */
export type EncounterOutcome = "victory" | "ended";
