/**
 * Combat Chronicle events — the campaign-encounter events-as-data contract (the
 * table-wide counterpart to the solo cockpit's {@link import("./combat-log").CombatEvent}).
 *
 * As the DM runs an encounter in the tracker, the PURE reducers append one
 * structured event per mechanical beat (an HP change, a condition, a fall, a
 * logged miss / pass). Each event carries ONLY ids + numbers — combatant ids
 * (`pc-<uid>` / `monster-<n>`), condition ids, amounts — never a localized display
 * string (golden rule 7). The presenter `lib/views/combat-chronicle-view.ts`
 * resolves every one to its prose line at render, so the SAME stored log renders
 * fully in EN or IT and a language switch re-localizes the whole feed.
 *
 * BUDGET-SAFE by construction: the events live on {@link
 * import("./campaign").EncounterState}.events, so they ride the EXISTING debounced
 * encounter writer — accumulating them adds NO new write cadence, and never a
 * per-action write. The array is EPHEMERAL: it survives a reload (it is on the
 * campaign doc) but is dropped the moment the encounter clears at "End encounter".
 * At end the DM renders the kept events to ONE markdown chapter and appends it to
 * the Chronicle — the single persisted Chronicle write per fight.
 *
 * The encounter-START and encounter-END/outcome are NOT stored events: the fight
 * always starts at round 1 (a derived feed/chapter header) and the outcome is
 * inferred from live state at close (`inferOutcome`, in the feature-layer recorders),
 * so storing them would be redundant state (rule 1 — declare the least).
 */

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
}

/**
 * One structured combat-chronicle event. Each variant carries only ids/tokens +
 * numbers; the presenter maps each `kind` to its i18n prose template and resolves
 * the combatant / condition ids to names via injected resolvers.
 */
export type CombatChronicleEvent =
  /**
   * A combatant took damage. `attackerId` is set ONLY by an explicit attribution tap
   * (the app NEVER guesses the attacker); ABSENT + `attackerSkipped` unset means the
   * attribution is still pending, ABSENT + `attackerSkipped` means the DM chose "no
   * attacker" ("{target} takes {amount}").
   */
  | ({
      kind: "hp-damage";
      /** The combatant that took the hit (`pc-<uid>` / `monster-<n>`). */
      targetId: string;
      /** Incoming damage (may exceed HP lost when temp HP absorbed some). */
      amount: number;
      /** The target's HP AFTER the hit (the "{current}/{max}" readout). */
      current: number;
      max: number;
      /** The attributed attacker's combatant id — set by the one-tap picker; absent =
       *  unattributed. */
      attackerId?: string;
      /** The DM tapped "skip": attribution resolved as deliberately unattributed (the
       *  picker hides without ever guessing a "who"). */
      attackerSkipped?: boolean;
    } & ChronicleEventBase)
  /** A combatant regained HP. */
  | ({
      kind: "hp-heal";
      targetId: string;
      amount: number;
      current: number;
      max: number;
    } & ChronicleEventBase)
  /** A combatant dropped (crossed to 0 HP — a PC downed, a monster group defeated). */
  | ({ kind: "down"; targetId: string } & ChronicleEventBase)
  /** A condition was gained. */
  | ({
      kind: "condition-gain";
      targetId: string;
      conditionId: string;
    } & ChronicleEventBase)
  /** A condition was lost / removed. */
  | ({
      kind: "condition-loss";
      targetId: string;
      conditionId: string;
    } & ChronicleEventBase)
  /** A LOGGED miss — pulled explicitly by the DM on the active combatant (never
   *  inferred from an event-less turn). */
  | ({ kind: "attack-miss"; attackerId: string; targetId: string } & ChronicleEventBase)
  /** A LOGGED pass/hold — the active combatant's turn went by without an action. */
  | ({ kind: "turn-pass"; actorId: string } & ChronicleEventBase);

/** Every `CombatChronicleEvent.kind` discriminant (for the presenter's exhaustiveness). */
export type CombatChronicleEventKind = CombatChronicleEvent["kind"];

/**
 * The light, state-supported outcome of a finished fight — `victory` when there was
 * at least one monster and every one is defeated, else the neutral `ended`. Offered
 * as the editable default at close; never asserts an outcome the state can't support.
 */
export type EncounterOutcome = "victory" | "ended";
