/**
 * The character-vitals projection — the SECOND sheet read of the persisted
 * mechanics world (`session.world`), after the standings projection
 * (`world-standing-grants.ts`): the ONE seam every core vital read (hit
 * points, death-save track, spell-slot usage, tracker-pool usage, exhaustion,
 * concentration, the manual condition ledger) goes through, so the legacy
 * session mirrors can later be deleted by flipping the arbitration HERE
 * instead of re-touching every surface.
 *
 * THE DRIFT LAW (rollout-bridge semantics, per fact): the commit mirror
 * (`mechanics-world-store.ts` → `mirroredCommit`) writes the world AND the
 * legacy session field on every engine commit, so agreement is the norm;
 * disagreement means a LEGACY-ONLY write happened (a manual HP edit, a slot
 * pip tap, a condition chip toggle, a tracker spend outside the engine) that
 * the world has not yet reconciled — the rest boundary re-derives it later.
 * Therefore, for EVERY fact family:
 *
 *   - world present, authenticates, and AGREES with the session field → the
 *     value (identical either way by construction);
 *   - world absent, malformed, or DISAGREEING → the SESSION value. Session
 *     truth wins on any drift, so a legacy-only spend can never be
 *     resurrected from a stale world — the exact fail-closed direction the
 *     rest boundary already reconciles in.
 *
 * Because both arms surface the session value, this projection is an
 * observable no-op today — by design. The mirror deletion flips the
 * arbitration world-first in this one module once no legacy-only write path
 * remains.
 *
 * Per-family notes:
 *   - DEATH TRACK: `mirroredCommit` mirrors the track on TRANSITIONS ONLY
 *     (living resets both counters, `dying` carries its counts, `stable` is
 *     the legacy stabilize write, `dead` asserts the third failure), so the
 *     world's `dying` counts authenticate when they agree; `stable`/`dead`
 *     carry no counts at all — session is the sole expresser there.
 *   - CONDITIONS: the projected fact is the MANUAL/BASE `session.conditions`
 *     ledger (the engine's self-condition transitions mirror into it); the
 *     concentration-owned and encounter layers stay with
 *     `effectiveSessionConditions`, which consumes this projection for its
 *     base term.
 *   - TRACKER ROLLS (`session.trackers[id].rolls`) are NOT a vital fact: the
 *     world does not model recorded rolls, so that read stays on the session.
 *
 * Fail-closed narrow read: `session.world` is persisted as `unknown` and
 * these are hot paths (store selectors, the tracker resolver), so the
 * projection walks the raw value with structural guards instead of running
 * the full material-state parse — anything malformed authenticates nothing.
 */

import { slotUsageKey } from "@/lib/cast-options";
import { concentrationValue } from "@/lib/concentration";
import type { SessionState } from "@/types/character";
import type { StoredConcentration } from "@/types/ids";

/** The optional raw persisted world every projection input may carry. */
interface WorldSlice {
  readonly world?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/** World value authenticates only when it agrees; session wins on any drift. */
function reconciled(world: number | null, session: number): number {
  return world !== null && world === session ? world : session;
}

// ─── Narrow world readers (fail-closed: null = "world expresses nothing") ───

function worldVitals(world: unknown): Record<string, unknown> | null {
  if (!isRecord(world)) return null;
  return isRecord(world.vitals) ? world.vitals : null;
}

function worldHitPoints(world: unknown): Record<string, unknown> | null {
  const vitals = worldVitals(world);
  return vitals !== null && isRecord(vitals.hitPoints) ? vitals.hitPoints : null;
}

function worldHpCurrent(world: unknown): number | null {
  return nonNegativeInteger(worldHitPoints(world)?.current);
}

function worldHpTemp(world: unknown): number | null {
  const hitPoints = worldHitPoints(world);
  if (hitPoints === null || !isRecord(hitPoints.temporary)) return null;
  return nonNegativeInteger(hitPoints.temporary.current);
}

/** The world's death track, in session vocabulary. Null when the world cannot
 *  express the counts (`stable`/`dead` carry none; malformed shapes carry
 *  nothing). A living track (`zeroHitPoints: null`) is exactly zero marks. */
function worldDeathTrack(
  world: unknown
): { successes: number | null; failures: number | null } | null {
  const vitals = worldVitals(world);
  if (vitals === null || !("zeroHitPoints" in vitals)) return null;
  const zero = vitals.zeroHitPoints;
  if (zero === null) return { failures: 0, successes: 0 };
  if (!isRecord(zero) || zero.kind !== "dying") return null;
  return {
    failures: nonNegativeInteger(zero.failures),
    successes: nonNegativeInteger(zero.successes),
  };
}

function worldExhaustion(world: unknown): number | null {
  if (!isRecord(world)) return null;
  const level = nonNegativeInteger(world.exhaustion);
  return level !== null && level <= 6 ? level : null;
}

/** The catalogue spell held by the world's LIVE engine concentration, as the
 *  stored session value — the same walk `engineConcentrationHandle` performs,
 *  raw and fail-closed. Null when no live engine concentration expresses a
 *  catalogue spell. */
function worldConcentration(world: unknown): StoredConcentration | null {
  if (!isRecord(world) || !isRecord(world.occurrences)) return null;
  for (const occurrence of Object.values(world.occurrences)) {
    if (
      !isRecord(occurrence) ||
      occurrence.kind !== "concentration" ||
      occurrence.ending !== null ||
      !isRecord(occurrence.origin)
    ) {
      continue;
    }
    const rootRef = occurrence.origin.root;
    if (!isRecord(rootRef) || !isRecord(rootRef.occurrence)) continue;
    const rootId = rootRef.occurrence.occurrenceId;
    if (typeof rootId !== "string") continue;
    const root = world.occurrences[rootId];
    if (!isRecord(root) || root.kind !== "program" || !isRecord(root.authority)) {
      continue;
    }
    const snapshot = root.authority.snapshot;
    if (!isRecord(snapshot) || !isRecord(snapshot.ref)) continue;
    const definition = snapshot.ref.definition;
    if (
      isRecord(definition) &&
      definition.kind === "catalogue" &&
      definition.catalogueKind === "spell" &&
      typeof definition.entityId === "string" &&
      definition.entityId.length > 0
    ) {
      return concentrationValue(definition.entityId);
    }
  }
  return null;
}

function worldResources(world: unknown): Record<string, unknown> | null {
  if (!isRecord(world)) return null;
  return isRecord(world.resources) ? world.resources : null;
}

/** The world's REMAINING count for one spell-slot cell (standard level or the
 *  pact pool). The cells are unbounded counts, so the caller converts to the
 *  session's `used` vocabulary against the resolved slot total. */
function worldSlotCurrent(
  world: unknown,
  slot: { readonly level: number; readonly pactMagic?: boolean }
): number | null {
  const resources = worldResources(world);
  if (resources === null) return null;
  const cell =
    slot.pactMagic === true
      ? resources.pactSpellSlot
      : isRecord(resources.standardSpellSlots)
        ? resources.standardSpellSlots[String(slot.level)]
        : undefined;
  if (!isRecord(cell) || cell.kind !== "count") return null;
  return nonNegativeInteger(cell.current);
}

/** The world's USED count for one tracker pool, derived from the pool cell's
 *  own finite capacity (`capacity.override ?? capacity.base.value`). Null when
 *  the world has never seeded the pool or the cell carries no derived
 *  capacity (a legacy-shaped unbounded cell expresses no total). */
function worldPoolUsed(world: unknown, trackerId: string): number | null {
  const resources = worldResources(world);
  if (resources === null || !isRecord(resources.pools)) return null;
  const cell = resources.pools[trackerId];
  if (!isRecord(cell) || cell.kind !== "count" || !isRecord(cell.capacity)) return null;
  const base = cell.capacity.base;
  if (!isRecord(base) || base.kind !== "derived") return null;
  const capacity =
    nonNegativeInteger(cell.capacity.override) ?? nonNegativeInteger(base.value);
  const current = nonNegativeInteger(cell.current);
  if (capacity === null || current === null) return null;
  return Math.max(0, capacity - current);
}

// ─── The projection (public API) ────────────────────────────────────────────

/** Current + temporary hit points, per-fact reconciled. */
export function vitalHp(session: Pick<SessionState, "hp"> & WorldSlice): {
  current: number;
  temp: number;
} {
  return {
    current: reconciled(worldHpCurrent(session.world), session.hp.current),
    temp: reconciled(worldHpTemp(session.world), session.hp.temp),
  };
}

/** The death-save track (successes/failures), per-fact reconciled. */
export function vitalDeathSaves(
  session: Pick<SessionState, "deathSucc" | "deathFail"> & WorldSlice
): { successes: number; failures: number } {
  const track = worldDeathTrack(session.world);
  return {
    failures: reconciled(track?.failures ?? null, session.deathFail),
    successes: reconciled(track?.successes ?? null, session.deathSucc),
  };
}

/** The exhaustion level (0–6), reconciled. */
export function vitalExhaustion(
  session: Pick<SessionState, "exhaustion"> & WorldSlice
): number {
  return reconciled(worldExhaustion(session.world), session.exhaustion);
}

/** The held concentration (stored value: id / `custom:` / ""), reconciled.
 *  The world expresses only an ENGINE-held catalogue spell; a legacy-held or
 *  custom concentration is session-only truth, and a legacy swap/clear wins
 *  over a live engine occurrence exactly as the transitions-only mirror
 *  intends. */
export function vitalConcentration(
  session: Pick<SessionState, "concentration"> & WorldSlice
): StoredConcentration {
  const world = worldConcentration(session.world);
  return world !== null && world === session.concentration
    ? world
    : session.concentration;
}

/** The manual/base condition ledger. Per-condition arbitration: a world-only
 *  condition means a legacy chip removal happened (hidden — session wins) and
 *  a session-only condition is a legacy add the world never owned (shown) —
 *  so the reconciled SET is the session ledger VERBATIM in every case, and
 *  the projection returns it by identity (referential stability for memoized
 *  consumers). The mirror deletion replaces this body with the world's live
 *  self-condition walk (`mechanics-world-store.ts` → `selfConditionIds` is
 *  the typed reader); until then a world read here would be dead work on the
 *  aggregation hot path. */
export function vitalConditions(
  session: Pick<SessionState, "conditions"> & WorldSlice
): string[] {
  return session.conditions;
}

/** The USED count of one spell-slot pool (standard `level` / pact), in the
 *  session's `slotUsageKey` vocabulary. The world holds the REMAINING count,
 *  so the caller's resolved slot row supplies the total the conversion needs. */
export function vitalSlotUsed(
  session: Pick<SessionState, "spellSlots"> & WorldSlice,
  slot: { readonly level: number; readonly pactMagic?: boolean; readonly total: number }
): number {
  const sessionUsed = session.spellSlots[slotUsageKey(slot)]?.used ?? 0;
  const current = worldSlotCurrent(session.world, slot);
  const worldUsed = current === null ? null : Math.max(0, slot.total - current);
  return reconciled(worldUsed, sessionUsed);
}

/** The USED count of one tracker pool, reconciled against the world pool
 *  cell's own derived capacity. */
export function vitalTrackerUsed(
  session: Pick<SessionState, "trackers"> & WorldSlice,
  trackerId: string
): number {
  const sessionUsed = session.trackers[trackerId]?.used ?? 0;
  return reconciled(worldPoolUsed(session.world, trackerId), sessionUsed);
}

/** The cheap per-render vitals bag (hp, death track, exhaustion,
 *  concentration, conditions). Slot and pool usage stay per-row reads
 *  ({@link vitalSlotUsed} / {@link vitalTrackerUsed}) because their
 *  session↔world conversion needs the caller's resolved totals — never
 *  re-resolve the whole tracker/slot tables just to project one row. */
export function characterVitals(
  session: Pick<
    SessionState,
    "hp" | "deathSucc" | "deathFail" | "exhaustion" | "concentration" | "conditions"
  > &
    WorldSlice
): {
  hp: { current: number; temp: number };
  death: { successes: number; failures: number };
  exhaustion: number;
  concentration: StoredConcentration;
  conditions: string[];
} {
  return {
    concentration: vitalConcentration(session),
    conditions: vitalConditions(session),
    death: vitalDeathSaves(session),
    exhaustion: vitalExhaustion(session),
    hp: vitalHp(session),
  };
}
