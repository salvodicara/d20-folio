/**
 * Pure play transitions that buy back a spent resource with another one (a Bard's
 * slot for Bardic Inspiration, a Cleric's level-N slot for Channel Divinity, a pool
 * for a use): the character in, the next session plus how to undo it out. WORLD-FIRST:
 * both legs commit as ONE journal action whose exact reverse is the undo; a missing or
 * rejecting world keeps the legacy counters, undone by restoring their prior values.
 */
import { slotUsageKey } from "@/lib/cast-options";
import { getSpellSlotTrackerRecovery, resolveTrackers } from "@/lib/smart-tracker";
import type { CharacterDoc, SessionState, TrackerState } from "@/types/character";
import { cellWith, commitWorldVitals } from "./world-commit";

/** One committed transition and how to reverse it. */
export interface PlayCommit {
  session: SessionState;
  /** The journal action to reverse; null when the legacy counters moved alone. */
  worldActionId: string | null;
  /** The legacy values to restore when there is no journal action. */
  prior: {
    spellSlots?: Readonly<Record<string, number>>;
    trackers?: Readonly<Record<string, TrackerState | undefined>>;
  };
}

/**
 * Restore a tracker entry to its prior value, or REMOVE it (rebuild without the key)
 * when it had none before. Never mutates (a missing entry === `used: 0`, so an absent
 * key is the canonical "unspent" state).
 */
export function restoreTrackerEntry(
  trackers: Record<string, TrackerState>,
  trackerId: string,
  prior: TrackerState | undefined
): Record<string, TrackerState> {
  if (prior !== undefined) return { ...trackers, [trackerId]: prior };
  const next: Record<string, TrackerState> = {};
  for (const [k, v] of Object.entries(trackers)) {
    if (k !== trackerId) next[k] = v;
  }
  return next;
}

/** The session with a commit's legacy prior values put back. */
export function restorePrior(
  session: SessionState,
  prior: PlayCommit["prior"]
): SessionState {
  let trackers = session.trackers;
  for (const [trackerId, entry] of Object.entries(prior.trackers ?? {})) {
    trackers = restoreTrackerEntry(trackers, trackerId, entry);
  }
  const spellSlots = { ...session.spellSlots };
  for (const [key, used] of Object.entries(prior.spellSlots ?? {})) {
    spellSlots[key] = { used };
  }
  return { ...session, spellSlots, trackers };
}

/** Spend the LOWEST available slot to restore a tracker (Bard Font of Inspiration). */
export function recoverTrackerFromSpellSlot(
  doc: CharacterDoc,
  trackerId: string
): PlayCommit | null {
  const option = getSpellSlotTrackerRecovery(doc).get(trackerId);
  const slotLevel = option?.availableSlotLevels[0];
  if (!option || slotLevel === undefined) return null;
  // The only grantor (Bard) has no Pact Magic, so the slot is a normal one.
  const slotKey = slotUsageKey({ level: slotLevel });
  const priorSlotUsed = doc.session.spellSlots[slotKey]?.used ?? 0;
  const prior = {
    spellSlots: { [slotKey]: priorSlotUsed },
    trackers: { [trackerId]: doc.session.trackers[trackerId] },
  };
  const engine = commitWorldVitals(doc, "tracker-slot-recovery", (state) => {
    const slotCell = state.resources.standardSpellSlots[String(slotLevel)];
    const pool = state.resources.pools[trackerId];
    if (!slotCell || slotCell.current < 1 || pool?.kind !== "count") return null;
    const capacity =
      pool.capacity.override ??
      (pool.capacity.base.kind === "derived" ? pool.capacity.base.value : null);
    if (capacity === null) return null;
    const target = Math.max(0, Math.min(capacity, capacity - option.newUsed));
    if (target <= pool.current) return null;
    state.resources.standardSpellSlots[String(slotLevel)] = cellWith(
      slotCell,
      slotCell.current - 1
    );
    state.resources.pools[trackerId] = cellWith(pool, target);
    return state;
  });
  if (engine) return { session: engine.session, worldActionId: engine.actionId, prior };
  return {
    session: {
      ...doc.session,
      spellSlots: { ...doc.session.spellSlots, [slotKey]: { used: priorSlotUsed + 1 } },
      trackers: { ...doc.session.trackers, [trackerId]: { used: option.newUsed } },
    },
    worldActionId: null,
    prior,
  };
}

/** Restore one use of an exhausted tracker by spending `amount` of another pool. */
export function recoverTrackerByAltCost(
  doc: CharacterDoc,
  trackerId: string,
  fromTracker: string,
  amount: number
): PlayCommit | null {
  if (amount <= 0) return null;
  const resolved = new Map(resolveTrackers(doc).map((tr) => [tr.id, tr]));
  const target = resolved.get(trackerId);
  const pool = resolved.get(fromTracker);
  if (!target || !pool) return null;
  // Only when the target is exhausted AND the pool can afford the cost.
  if (target.total - target.used > 0) return null;
  if (pool.total - pool.used < amount) return null;
  const priorPool = doc.session.trackers[fromTracker];
  const prior = {
    trackers: { [trackerId]: doc.session.trackers[trackerId], [fromTracker]: priorPool },
  };
  const engine = commitWorldVitals(doc, "tracker-alt-recovery", (state) => {
    const poolCell = state.resources.pools[fromTracker];
    const targetCell = state.resources.pools[trackerId];
    if (
      poolCell?.kind !== "count" ||
      targetCell?.kind !== "count" ||
      poolCell.current < amount
    ) {
      return null;
    }
    const capacity =
      targetCell.capacity.override ??
      (targetCell.capacity.base.kind === "derived"
        ? targetCell.capacity.base.value
        : null);
    if (capacity === null || targetCell.current >= capacity) return null;
    state.resources.pools[fromTracker] = cellWith(poolCell, poolCell.current - amount);
    state.resources.pools[trackerId] = cellWith(targetCell, targetCell.current + 1);
    return state;
  });
  if (engine) return { session: engine.session, worldActionId: engine.actionId, prior };
  return {
    session: {
      ...doc.session,
      trackers: {
        ...doc.session.trackers,
        [trackerId]: { used: Math.max(0, target.used - 1) },
        [fromTracker]: { used: (priorPool?.used ?? 0) + amount },
      },
    },
    worldActionId: null,
    prior,
  };
}

/** Restore one use of an exhausted tracker by spending the cheapest unspent slot of
 *  level ≥ `minLevel` (Cleric Divine Foreknowledge, Ranger). */
export function recoverTrackerByMinSlot(
  doc: CharacterDoc,
  trackerId: string,
  minLevel: number
): PlayCommit | null {
  const target = resolveTrackers(doc).find((t) => t.id === trackerId);
  if (!target || target.total - target.used > 0) return null;
  // The grantors have no Pact Magic, so every eligible slot is a normal slot.
  const slotLevel = doc.character.spellSlots
    .filter((s) => {
      const used = doc.session.spellSlots[slotUsageKey(s)]?.used ?? 0;
      return s.level >= minLevel && s.total - used > 0;
    })
    .map((s) => s.level)
    .sort((a, b) => a - b)[0];
  if (slotLevel === undefined) return null;
  const slotKey = slotUsageKey({ level: slotLevel });
  const priorSlotUsed = doc.session.spellSlots[slotKey]?.used ?? 0;
  const prior = {
    spellSlots: { [slotKey]: priorSlotUsed },
    trackers: { [trackerId]: doc.session.trackers[trackerId] },
  };
  const engine = commitWorldVitals(doc, "tracker-min-slot-recovery", (state) => {
    const slotCell = state.resources.standardSpellSlots[String(slotLevel)];
    const pool = state.resources.pools[trackerId];
    if (!slotCell || slotCell.current < 1 || pool?.kind !== "count") return null;
    const capacity =
      pool.capacity.override ??
      (pool.capacity.base.kind === "derived" ? pool.capacity.base.value : null);
    if (capacity === null || pool.current >= capacity) return null;
    state.resources.standardSpellSlots[String(slotLevel)] = cellWith(
      slotCell,
      slotCell.current - 1
    );
    state.resources.pools[trackerId] = cellWith(pool, pool.current + 1);
    return state;
  });
  if (engine) return { session: engine.session, worldActionId: engine.actionId, prior };
  return {
    session: {
      ...doc.session,
      spellSlots: { ...doc.session.spellSlots, [slotKey]: { used: priorSlotUsed + 1 } },
      trackers: {
        ...doc.session.trackers,
        // Restore exactly ONE use (alt-recovery semantics).
        [trackerId]: { used: Math.max(0, target.used - 1) },
      },
    },
    worldActionId: null,
    prior,
  };
}
