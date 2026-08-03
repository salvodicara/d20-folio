/**
 * Combat Chronicle events — the campaign-encounter events-as-data contract (the
 * table-wide counterpart to the solo cockpit's {@link import("./combat-log").CombatEvent}).
 *
 * As the DM runs an encounter in the tracker, the PURE reducers append one
 * structured event per landed beat (an HP change, a condition, a fall) — the
 * deterministic record of WHAT LANDED (missed swings and drama belong in the DM's
 * narrative note at the end entry, not here). Each event carries ONLY ids + numbers — combatant ids
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
      /** Portion of `amount` absorbed by temporary HP, for exact one-tap reversal. */
      tempAbsorbed?: number;
      /** The target's HP AFTER the hit (the "{current}/{max}" readout). */
      current: number;
      max: number;
      /** The attributed attacker's combatant id — set by the one-tap picker; absent =
       *  unattributed. */
      attackerId?: string;
      /** Exact declared action when auto-attributed; absent on legacy/manual beats. */
      action?: LocText;
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
  /**
   * A player's DECLARED attack that MISSED — the certain miss line. Unlike every other
   * kind this is NEVER stored on the encounter doc: it is SYNTHESIZED at read time by the
   * reconciliation layer (`combat-reconcile.ts`) from a player's `recentActions` miss
   * declaration, so a missed swing needs no HP delta to record (the app records only what
   * the player explicitly tapped — golden rule 21, never inferred). `attackerId` is the
   * declaring PC, `targetId` the enemy they named.
   */
  | ({
      kind: "attack-miss";
      attackerId: string;
      targetId: string;
      action?: LocText;
    } & ChronicleEventBase)
  /**
   * A player's DECLARED MULTI-TARGET action FUSED with the several HP drops the DM
   * applied across the struck foes (auto-narrated combat, Phase 2 — Magic Missile's
   * darts, Scorching Ray's rays, an AoE's per-target damage). Like {@link attack-miss}
   * this is SYNTHESIZED at read time by the reconciliation layer (`chronicle-reconcile.
   * ts`), never stored: it REPLACES the individual per-target `hp-damage` lines with ONE
   * summary line. `amounts` carries the REAL DM delta for each struck target (NEVER an
   * invented number — a declared target with no in-window drop is simply ABSENT here);
   * a non-empty `amounts` renders the HIT line ("{attacker} hits A (x), B (y) and C
   * (z)"), an EMPTY `amounts` the MISS line over the full declared `targetIds`
   * ("{attacker} misses A, B and C"). `attackerId` is the declaring PC.
   */
  | ({
      kind: "attack-multi";
      attackerId: string;
      /** The full declared target set (ids), declared order — drives the MISS prose. */
      targetIds: string[];
      /** Per-struck-target REAL DM damage, declared order; ONLY targets that took a
       *  bound drop. Empty ⇒ the MISS line (or a hit awaiting HP, which emits no line). */
      amounts: ReadonlyArray<{ targetId: string; amount: number }>;
      action?: LocText;
    } & ChronicleEventBase)
  /**
   * A player's DECLARED AREA SAVE-for-half spell (Fireball class — auto-narrated combat,
   * Phase 3) FUSED with the DM's per-target HP drops. Like {@link attack-multi} this is
   * SYNTHESIZED at read time by the reconciliation layer, never stored: it REPLACES the
   * individual per-target `hp-damage` lines with ONE summary line whose per-target
   * outcome is a SAVE. `amounts` carries the REAL DM delta for each DAMAGED target
   * (whether they failed → full or saved → half; the DM's number is the truth, never
   * invented); `resisted` names the declared targets the DM left un-dropped (a full save
   * / no damage — positively logged as resisted, the Phase-3 distinction from a
   * multi-attack's silently-omitted target). Emitted only once at least one declared
   * target took a drop (the spell resolved); `attackerId` is the declaring caster.
   */
  | ({
      kind: "attack-save";
      attackerId: string;
      /** The full declared target set (ids), declared order. */
      targetIds: string[];
      /** Per-DAMAGED-target REAL DM damage, declared order (failed save → full, or
       *  saved → half; the DM's number either way). */
      amounts: ReadonlyArray<{ targetId: string; amount: number }>;
      /** Declared targets the DM left un-dropped — full save / no damage, declared order. */
      resisted: string[];
      action?: LocText;
    } & ChronicleEventBase)
  /**
   * A condition was gained. `attackerId` is set ONLY by the reconciliation layer when a
   * declaring PC's action RIDER (a Topple mastery, a spell rider) applied it — the
   * confident provenance ("{target} is {condition} — {attacker}'s strike"); it is NEVER
   * stored (a DM-booked condition has no attacker) and NEVER guessed from co-occurrence.
   */
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
    } & ChronicleEventBase);

/** Every `CombatChronicleEvent.kind` discriminant (for the presenter's exhaustiveness). */
export type CombatChronicleEventKind = CombatChronicleEvent["kind"];

/**
 * The light, state-supported outcome of a finished fight — `victory` when there was
 * at least one monster and every one is defeated, else the neutral `ended`. Offered
 * as the editable default at close; never asserts an outcome the state can't support.
 */
export type EncounterOutcome = "victory" | "ended";
