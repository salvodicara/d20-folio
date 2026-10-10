/**
 * Pure play transitions for hit points, spell slots and trackers: the character in,
 * the next session out. The character store only guards, applies and persists them,
 * so each rule here is testable without the store.
 *
 * WORLD-FIRST: when the character carries a persisted mechanics world, a transition
 * is expressed on the world and its commit mirrors the legacy session fields in the
 * same value; a missing or rejecting world keeps the legacy direct write (the
 * documented fail-closed degradation).
 */
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { slotUsageKey } from "@/lib/cast-options";
import { clampHp, clampTemp } from "@/lib/combat-hp";
import { zeroTrackFor } from "@/lib/mechanics-world-store";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { ExhaustionLevel } from "@/types/condition";
import {
  cellWith,
  commitWorldVitals,
  drainedTemporary,
  vitalsWithTemporary,
} from "./world-commit";

/**
 * The Unconscious condition id (RA-10) — auto-applied by `applyDamage` when a
 * character drops to 0 HP (SRD "Falling Unconscious") and auto-shed by the
 * heal-from-0 seam in `setHP` / the at-zero "drop to 1 instead" interrupt. The
 * chip stays hand-removable like any condition (override-first).
 */
export const UNCONSCIOUS_CONDITION_ID = "unconscious";

/**
 * Set current HP, clamped to the EFFECTIVE max (base + hp-flat boons + Aid). Regaining
 * any HP from 0 resets the death saves (RAW 2024) and sheds Unconscious (SRD "Falling
 * Unconscious": until you regain any Hit Points). The Unconscious shed stays a
 * legacy-only overlay: the world never owned a manually-tracked knockout chip.
 */
export function setHp(doc: CharacterDoc, current: number): SessionState {
  const max = effectiveMaxHp(doc.character, doc.session);
  const clamped = clampHp(current, max);
  const healingFromZero = doc.session.hp.current === 0 && clamped > 0;
  const deathReset = healingFromZero ? { deathSucc: 0, deathFail: 0 } : {};
  const sheddingUnconscious =
    healingFromZero && doc.session.conditions.includes(UNCONSCIOUS_CONDITION_ID);
  const nextSucc = healingFromZero ? 0 : doc.session.deathSucc;
  const nextFail = healingFromZero ? 0 : doc.session.deathFail;
  const engine = commitWorldVitals(doc, "hp-set", (state) => {
    state.vitals = {
      hitPoints: {
        current: clamped,
        temporary: state.vitals.hitPoints.temporary,
      },
      zeroHitPoints: clamped > 0 ? null : zeroTrackFor(nextSucc, nextFail),
    };
    return state;
  });
  const base = engine
    ? engine.session
    : { ...doc.session, hp: { ...doc.session.hp, current: clamped }, ...deathReset };
  return sheddingUnconscious
    ? {
        ...base,
        conditions: base.conditions.filter((c) => c !== UNCONSCIOUS_CONDITION_ID),
      }
    : base;
}

/** Set temporary HP. A drain of the same pool keeps its source occurrence. */
export function setTempHp(doc: CharacterDoc, temp: number): SessionState {
  const clampedTemp = clampTemp(temp);
  const engine = commitWorldVitals(doc, "temp-hp-set", (state) => {
    if (state.vitals.hitPoints.temporary.current === clampedTemp) return null;
    state.vitals = vitalsWithTemporary(
      state.vitals,
      drainedTemporary(state.vitals.hitPoints.temporary, clampedTemp)
    );
    return state;
  });
  return engine
    ? engine.session
    : { ...doc.session, hp: { ...doc.session.hp, temp: clampedTemp } };
}

/** Spend one spell slot (standard or pact). A world cell that is empty degrades to
 *  the legacy counter. */
export function spendSpellSlot(
  doc: CharacterDoc,
  level: number,
  pactMagic: boolean
): SessionState {
  const engine = commitWorldVitals(doc, "slot-spend", (state) => {
    const cell = pactMagic
      ? state.resources.pactSpellSlot
      : state.resources.standardSpellSlots[String(level)];
    if (!cell || cell.current < 1) return null;
    if (pactMagic) state.resources.pactSpellSlot = cellWith(cell, cell.current - 1);
    else {
      state.resources.standardSpellSlots[String(level)] = cellWith(
        cell,
        cell.current - 1
      );
    }
    return state;
  });
  if (engine) return engine.session;
  const key = slotUsageKey({ level, pactMagic });
  const used = doc.session.spellSlots[key]?.used ?? 0;
  return {
    ...doc.session,
    spellSlots: { ...doc.session.spellSlots, [key]: { used: used + 1 } },
  };
}

/** Restore one spell slot, capped at the character's own slot table total (a restore
 *  past full is not a world fact). */
export function restoreSpellSlot(
  doc: CharacterDoc,
  level: number,
  pactMagic: boolean
): SessionState {
  const row = doc.character.spellSlots.find(
    (slot) => slot.level === level && !!slot.pactMagic === pactMagic
  );
  const engine = commitWorldVitals(doc, "slot-restore", (state) => {
    const cell = pactMagic
      ? state.resources.pactSpellSlot
      : state.resources.standardSpellSlots[String(level)];
    if (!cell || !row || cell.current >= row.total) return null;
    if (pactMagic) state.resources.pactSpellSlot = cellWith(cell, cell.current + 1);
    else {
      state.resources.standardSpellSlots[String(level)] = cellWith(
        cell,
        cell.current + 1
      );
    }
    return state;
  });
  if (engine) return engine.session;
  const key = slotUsageKey({ level, pactMagic });
  const used = doc.session.spellSlots[key]?.used ?? 0;
  return {
    ...doc.session,
    spellSlots: { ...doc.session.spellSlots, [key]: { used: Math.max(0, used - 1) } },
  };
}

/** Spend uses of a tracker. A pool the world cannot afford degrades to the legacy
 *  counter, which keeps any recorded rolls. */
export function spendTracker(
  doc: CharacterDoc,
  trackerId: string,
  amount: number
): SessionState {
  const engine = commitWorldVitals(doc, "tracker-spend", (state) => {
    const cell = state.resources.pools[trackerId];
    if (
      cell?.kind !== "count" ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      cell.current < amount
    ) {
      return null;
    }
    state.resources.pools[trackerId] = cellWith(cell, cell.current - amount);
    return state;
  });
  if (engine) return engine.session;
  const entry = doc.session.trackers[trackerId];
  return {
    ...doc.session,
    trackers: {
      ...doc.session.trackers,
      [trackerId]: { ...entry, used: (entry?.used ?? 0) + amount },
    },
  };
}

/** Restore uses of a tracker, clamped to its derived capacity (the same floor law as
 *  the legacy max(0, …)). */
export function restoreTracker(
  doc: CharacterDoc,
  trackerId: string,
  amount: number
): SessionState {
  const engine = commitWorldVitals(doc, "tracker-restore", (state) => {
    const cell = state.resources.pools[trackerId];
    if (cell?.kind !== "count" || !Number.isSafeInteger(amount) || amount < 1) {
      return null;
    }
    const capacity =
      cell.capacity.override ??
      (cell.capacity.base.kind === "derived" ? cell.capacity.base.value : null);
    if (capacity === null) return null;
    const delta = Math.min(amount, Math.max(0, capacity - cell.current));
    if (delta < 1) return null;
    state.resources.pools[trackerId] = cellWith(cell, cell.current + delta);
    return state;
  });
  if (engine) return engine.session;
  const entry = doc.session.trackers[trackerId];
  return {
    ...doc.session,
    trackers: {
      ...doc.session.trackers,
      [trackerId]: { ...entry, used: Math.max(0, (entry?.used ?? 0) - amount) },
    },
  };
}

/** The death-save track set to exact counts (0–3 each), or null when unchanged.
 *  `newMark` names a mark that was ADDED (the story beat); clearing a pip or
 *  resetting the track is bookkeeping. The world's `stable`/`dead` states carry no
 *  counts, so the requested counts are re-asserted on the session. */
export function setDeathSaves(
  doc: CharacterDoc,
  successes: number,
  failures: number
): { session: SessionState; newMark: "success" | "failure" | null } | null {
  const succ = Math.max(0, Math.min(3, Math.round(successes)));
  const fail = Math.max(0, Math.min(3, Math.round(failures)));
  const prevSucc = doc.session.deathSucc;
  const prevFail = doc.session.deathFail;
  if (succ === prevSucc && fail === prevFail) return null;
  // A track write against a standing character is not a world fact.
  const engine = commitWorldVitals(doc, "death-save-set", (state) => {
    if (state.vitals.hitPoints.current !== 0 || state.vitals.zeroHitPoints === null) {
      return null;
    }
    state.vitals = { ...state.vitals, zeroHitPoints: zeroTrackFor(succ, fail) };
    return state;
  });
  return {
    session: {
      ...(engine ? engine.session : doc.session),
      deathSucc: succ,
      deathFail: fail,
    },
    newMark: succ > prevSucc ? "success" : fail > prevFail ? "failure" : null,
  };
}

/** The exhaustion level set to exactly `level` (0–6), or null when unchanged. The
 *  world's own invariant makes level 6 death, so the sixth pip on a living world
 *  degrades to the legacy write. */
export function setExhaustion(doc: CharacterDoc, level: number): SessionState | null {
  if (!Number.isFinite(level)) return null;
  const target = Math.max(0, Math.min(6, Math.round(level)));
  if (doc.session.exhaustion === target) return null;
  const engine = commitWorldVitals(doc, "exhaustion-set", (state) => {
    if (target === 6 && state.vitals.zeroHitPoints?.kind !== "dead") return null;
    state.exhaustion = target as ExhaustionLevel;
    return state;
  });
  return engine ? engine.session : { ...doc.session, exhaustion: target };
}
