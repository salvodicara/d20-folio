/**
 * The character's core vitals as the sheet reads them: hit points, the death-save
 * track, exhaustion, concentration, the manual condition ledger, and the used count of
 * a spell-slot or tracker pool.
 *
 * The stored session fields are the truth. This module once also read the persisted
 * mechanics world and arbitrated per fact, but the arbitration always returned the
 * session value (a world that disagreed lost, one that agreed held the same value), so
 * it now reads the session alone. Retiring the world (docs/ARCHITECTURE_MAP.md) removes
 * these wrappers next; until then the surfaces keep calling them.
 */

import { slotUsageKey } from "@/lib/cast-options";
import type { SessionState } from "@/types/character";
import type { StoredConcentration } from "@/types/ids";

/** Current and temporary hit points. */
export function vitalHp(session: Pick<SessionState, "hp">): {
  current: number;
  temp: number;
} {
  return { current: session.hp.current, temp: session.hp.temp };
}

/** The death-save track (successes/failures). */
export function vitalDeathSaves(session: Pick<SessionState, "deathSucc" | "deathFail">): {
  successes: number;
  failures: number;
} {
  return { failures: session.deathFail, successes: session.deathSucc };
}

/** The exhaustion level (0–6). */
export function vitalExhaustion(session: Pick<SessionState, "exhaustion">): number {
  return session.exhaustion;
}

/** The held concentration (stored value: id / `custom:` / ""). */
export function vitalConcentration(
  session: Pick<SessionState, "concentration">
): StoredConcentration {
  return session.concentration;
}

/** The manual/base condition ledger (the concentration-owned and encounter layers
 *  stay with `effectiveSessionConditions`). */
export function vitalConditions(session: Pick<SessionState, "conditions">): string[] {
  return session.conditions;
}

/** The USED count of one spell-slot pool (standard `level` / pact). */
export function vitalSlotUsed(
  session: Pick<SessionState, "spellSlots">,
  slot: { readonly level: number; readonly pactMagic?: boolean; readonly total: number }
): number {
  return session.spellSlots[slotUsageKey(slot)]?.used ?? 0;
}

/** The USED count of one tracker pool. */
export function vitalTrackerUsed(
  session: Pick<SessionState, "trackers">,
  trackerId: string
): number {
  return session.trackers[trackerId]?.used ?? 0;
}

/** The cheap per-render vitals bag (hp, death track, exhaustion, concentration,
 *  conditions). Slot and pool usage stay per-row reads. */
export function characterVitals(
  session: Pick<
    SessionState,
    "hp" | "deathSucc" | "deathFail" | "exhaustion" | "concentration" | "conditions"
  >
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
