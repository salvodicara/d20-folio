/**
 * combat-state — PURE, SRD-FREE, Firebase-free helpers for the per-character
 * combat-mutable state (the `combat/state` subdoc model, see
 * `src/types/combat-state.ts`).
 *
 * This module owns the seam between the in-memory {@link SessionState} (which keeps
 * the combat trio for every existing reader — compute / use-hp-controls / level-up /
 * rest) and the canonical {@link CombatState} written to the subdoc:
 *
 *  - the initiative-ROLL STRING ↔ NUMBER conversion (cockpit keeps `""`/`"15"` as the
 *    raw d20 roll; the subdoc carries the canonical `null`/`15` on `initiativeRoll`);
 *  - the projection `session → CombatState` (what gets written);
 *  - the cheap change detectors the auto-save subscribers use to route a store
 *    transition to the RIGHT doc (combat trio → subdoc; everything else → parent).
 *
 * The `combat/state` subdoc is the SOLE persisted home of the combat-mutable state:
 * the Firestore parent character doc carries NO combat trio (the serialization boundary
 * `toStoredPayload` omits {@link COMBAT_SESSION_KEYS} from `state`), and readers hydrate
 * the subdoc, falling to {@link defaultCombatState} (full HP) only when it is absent.
 *
 * Kept out of `combat-state-io.ts` (which imports `firebase/firestore`) so the
 * store + tests can use it without pulling Firebase — and so it can sit on the
 * always-eager path with zero SRD/Firebase weight.
 */
import type { SessionState } from "@/types/character";
import type { CombatState } from "@/types/combat-state";
import { applyDamage, applyHealing, clampHp, clampTemp } from "@/lib/combat-hp";

/**
 * REMOTE-CHANGE FENCE comparison (§5.4): whether an incoming combat-state snapshot
 * MATERIALLY differs from the open character's live session trio — the HP / temp /
 * death-saves / conditions that a snapshot-leg undo (prev-HP) would restore. The
 * subscription's remote-change fence composes this with `!hasPendingWrites` to decide
 * whether a same-character server update must drop the own-sheet undo stack. Pure +
 * firebase-free (lives here, not in `combat-state-io.ts`) so it is unit-testable.
 */
export function combatTrioDiffers(
  session: {
    hp: { current: number; temp: number };
    deathSucc: number;
    deathFail: number;
    conditions: string[];
  },
  combat: CombatState
): boolean {
  return (
    session.hp.current !== combat.hp.current ||
    session.hp.temp !== combat.hp.temp ||
    session.deathSucc !== combat.deathSaves.successes ||
    session.deathFail !== combat.deathSaves.failures ||
    session.conditions.join(",") !== combat.conditions.join(",")
  );
}

/**
 * The {@link SessionState} keys that move to the `combat/state` subdoc — identical to
 * the serialized `state` keys the Firestore parent doc must OMIT. Every OTHER session
 * field is persisted on the parent character doc. Listed once so the change detector
 * ({@link nonCombatSessionChanged}) and the parent-doc omission (`toStoredPayload`)
 * can't drift from the projection.
 */
export const COMBAT_SESSION_KEYS = [
  "hp",
  "conditions",
  "initiative",
  "deathSucc",
  "deathFail",
] as const satisfies ReadonlyArray<keyof SessionState>;

const COMBAT_KEY_SET: ReadonlySet<string> = new Set(COMBAT_SESSION_KEYS);

/**
 * Drop the combat trio from a SERIALIZED `state` map (the codec's `sessionToState`
 * output) — the Firestore parent-doc write omits it because the combat-mutable state
 * lives in the `combat/state` subdoc as its SOLE persisted home (golden rule 10). Pure;
 * reuses {@link COMBAT_SESSION_KEYS} (the serialized keys share the session names) so it
 * can't drift. The self-contained portable EXPORT keeps the trio inline (it has no subdoc).
 */
export function omitCombatTrio(state: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).filter(([key]) => !COMBAT_KEY_SET.has(key))
  );
}

/** Cockpit initiative-roll STRING → canonical NUMBER (`""`/non-numeric ⇒ `null`). */
export function initiativeToNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Canonical NUMBER → cockpit initiative-roll STRING (`null` ⇒ `""`). */
export function initiativeToString(value: number | null): string {
  return value === null ? "" : String(value);
}

/**
 * Project the in-memory session onto the canonical {@link CombatState} subdoc shape.
 * `session.initiative` is the SOLO raw d20 ROLL → `initiativeRoll` (a campaign
 * encounter's roll lives in the campaign's `encounterInit` table, never here). The
 * SOLO `round` is NOT a session field (it lives only in the turn engine + this
 * subdoc), so it is passed in — the cockpit store supplies the live
 * `combatStore.round`; a mock/dev seed defaults it to `1`.
 */
export function sessionToCombatState(session: SessionState, round = 1): CombatState {
  return {
    hp: { current: session.hp.current, temp: session.hp.temp },
    conditions: session.conditions,
    initiativeRoll: initiativeToNumber(session.initiative),
    deathSaves: { successes: session.deathSucc, failures: session.deathFail },
    round,
  };
}

/**
 * Merge a {@link CombatState} subdoc (or its ABSENCE) onto an in-memory session — the
 * ONE place the trio-hydration math lives (golden rule 6), reused by the cockpit
 * store ({@link "@/stores/characterStore".CharacterState.hydrateCombatState}) AND the
 * in-hub party/encounter live read. Pure: it takes `effectiveMax` as a NUMBER so it
 * never imports the SRD aggregate.
 *
 *  - With a `combat` doc: clamp current HP to `[0, effectiveMax]`, floor temp HP at 0,
 *    clamp each death-save count to `[0, 3]`, and convert the canonical numeric
 *    initiative back to the cockpit STRING.
 *  - With `combat === null` (an absent subdoc — a genuinely fresh/undamaged character):
 *    DEFAULT to FULL HP, empty conditions, blank initiative, zero death saves — never 0 HP.
 */
export function applyCombatToSession(
  session: SessionState,
  combat: CombatState | null,
  effectiveMax: number
): SessionState {
  const clampDeath = (n: number): number => Math.max(0, Math.min(3, Math.round(n)));
  const trio = combat
    ? {
        hp: {
          current: clampHp(combat.hp.current, effectiveMax),
          temp: clampTemp(combat.hp.temp),
        },
        conditions: combat.conditions,
        initiative: initiativeToString(combat.initiativeRoll),
        deathSucc: clampDeath(combat.deathSaves.successes),
        deathFail: clampDeath(combat.deathSaves.failures),
      }
    : {
        // Absent subdoc (a genuinely fresh/undamaged char): full HP, never 0.
        hp: { current: effectiveMax, temp: 0 },
        conditions: [] as string[],
        initiative: "",
        deathSucc: 0,
        deathFail: 0,
      };
  const merged: SessionState = { ...session, ...trio };
  // RA-12 — the Hide action's find-DC (`hiddenDc`) rides the PARENT doc, but its
  // owning `invisible` condition lives in the combat/state subdoc (D9). This is
  // the ONE seam where both the hydrated trio-conditions and the session's
  // `hiddenDc` are known, so it is the ONLY correct place to normalize the
  // cross-doc pair: if `invisible` was cleared via a subdoc-only path (a DM's
  // `setCombatCondition`/`reduceCondition`, which never touches the parent doc)
  // the find-DC is orphaned — drop it so no phantom " · DC N" resurfaces when
  // Invisible is later re-added by a non-Hide path. NEVER normalize at
  // parse/sanitize time: there the trio is stripped from the parent doc
  // (conditions is `[]`, `invisible` is hydrated from the subdoc afterwards), so
  // a legitimately-hidden character would wrongly lose its DC.
  if (!merged.conditions.includes("invisible")) merged.hiddenDc = undefined;
  return merged;
}

/** The full-HP default for an ABSENT subdoc (a genuinely fresh/undamaged character):
 *  current HP at `max`, no temp, no conditions, unrolled initiative, zero death saves.
 *  The seed a writer reduces over when no `combat/state` subdoc exists yet, so the FIRST
 *  offline write lands a complete shape — see `combat-state-io.ts`. */
export function defaultCombatState(max: number): CombatState {
  return {
    hp: { current: max, temp: 0 },
    conditions: [],
    initiativeRoll: null,
    deathSaves: { successes: 0, failures: 0 },
    round: 1,
  };
}

// ── CombatState reducers — the PURE op-kind transitions ──────────────────────
//
// The read-modify-write step every combat mutation composes: the writer reduces the
// CURRENT {@link CombatState} it already holds (the cockpit store's optimistic session;
// the DM/pip's live subscription value) and persists the WHOLE next object via the
// offline-safe `writeCombatState` (`setDoc(merge)`) — NO transaction, so the write is
// durably queued in the local cache offline and replayed on reconnect. Each reducer takes
// a {@link CombatState} and returns the NEXT one, composing the `combat-hp` arithmetic;
// splitting the math out here keeps it pure + unit-testable without the Firestore
// emulator, and keeps the single HP-clamp/temp-absorb rules in `combat-hp` (one source).
//
// Concurrency: two writers on the SAME PC are whole-object last-write-wins. Because each
// reduces over its LATEST subscription-hydrated state, edits to DIFFERENT fields (or the
// same field at different times) both land; only an EXACTLY-simultaneous same-field write
// loses one — the accepted, DM-correctable tradeoff (offline durability > lock-step).

/** Apply an HP delta (damage absorbs temp first / floors at 0; heal clamps to `max`). */
export function reduceHpDelta(
  s: CombatState,
  op: { kind: "damage" | "heal"; amount: number },
  max: number
): CombatState {
  if (op.kind === "damage") {
    const after = applyDamage(s.hp.current, s.hp.temp, op.amount);
    return { ...s, hp: { current: after.current, temp: after.temp } };
  }
  const healed = applyHealing(s.hp.current, op.amount, max);
  return {
    ...s,
    hp: { current: healed, temp: s.hp.temp },
    // RAW 2024 (PHB): "If you regain any Hit Points while at 0, your Death Saving
    // Throws reset." Reset on the 0 → positive transition, mirroring the cockpit
    // `setHP` so the subdoc never re-surfaces a prior dying episode's marks after a
    // revive (the live subscription would otherwise hydrate them back).
    ...(s.hp.current === 0 && healed > 0
      ? { deathSaves: { successes: 0, failures: 0 } }
      : {}),
  };
}

/** Bump the NESTED death-save count by one, capped at `[0, 3]` (a 4th tick stays 3). */
export function reduceDeathSave(
  s: CombatState,
  outcome: "success" | "failure"
): CombatState {
  const ds = s.deathSaves;
  return outcome === "success"
    ? { ...s, deathSaves: { ...ds, successes: Math.min(3, ds.successes + 1) } }
    : { ...s, deathSaves: { ...ds, failures: Math.min(3, ds.failures + 1) } };
}

/** Add (dedup) or remove a condition id — idempotent + commutative across writers. */
export function reduceCondition(
  s: CombatState,
  op: { kind: "add" | "remove"; conditionId: string }
): CombatState {
  if (op.kind === "add") {
    return s.conditions.includes(op.conditionId)
      ? s
      : { ...s, conditions: [...s.conditions, op.conditionId] };
  }
  return { ...s, conditions: s.conditions.filter((c) => c !== op.conditionId) };
}

/** Set HP to an exact value, clamped to `[0, max]` (leaves temp/conditions untouched;
 *  resets death saves on a 0 → positive set, mirroring the cockpit `setHP`). */
export function setHpAbsolute(s: CombatState, current: number, max: number): CombatState {
  const clamped = clampHp(current, max);
  return {
    ...s,
    hp: { current: clamped, temp: s.hp.temp },
    ...(s.hp.current === 0 && clamped > 0
      ? { deathSaves: { successes: 0, failures: 0 } }
      : {}),
  };
}

/** Set temp HP to an exact value, floored at 0 (leaves current HP untouched). */
export function setTempAbsolute(s: CombatState, temp: number): CombatState {
  return { ...s, hp: { current: s.hp.current, temp: clampTemp(temp) } };
}

/** Set the SOLO raw d20 initiative ROLL (`null` = unrolled). Touches only the roll.
 *  (An encounter roll is NOT a subdoc write — it goes to the campaign's `encounterInit`
 *  table via `setEncounterInitiative`.) */
export function setInitiativeAbsolute(s: CombatState, roll: number | null): CombatState {
  return { ...s, initiativeRoll: roll };
}

/**
 * Did any NON-combat session field change between two snapshots? Reference/value
 * compare over every key EXCEPT the trio. When true (or `character.character`
 * changed), the parent-doc writer persists the session (the serialization boundary
 * omits the combat trio) — so a trio-ONLY change (an HP tap, a condition toggle) never
 * triggers a redundant parent write.
 */
export function nonCombatSessionChanged(a: SessionState, b: SessionState): boolean {
  for (const key of Object.keys(a) as Array<keyof SessionState>) {
    if (COMBAT_KEY_SET.has(key)) continue;
    if (a[key] !== b[key]) return true;
  }
  return false;
}
