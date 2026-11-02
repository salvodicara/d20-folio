/**
 * The spends ledger for a hit from another device
 * (docs/architecture/2026-11-cross-device-hits.md). That device can write only a
 * PC's combat roots, so what the hit spends on the PC's sheet (an Arcane Ward
 * filling, a claimed Uncanny Dodge or Death Ward used up) is appended to the
 * character's `combat/spends` doc instead. Every reader folds the pending entries
 * before it reads the sheet, so nothing is spent twice; the owner's client folds them
 * into the sheet once, by id, then removes them from the ledger.
 */
import type { PeerSpend } from "@/types/combat-state";
import type { SessionState } from "@/types/character";

export type { PeerSpend } from "@/types/combat-state";

/** The most entries the ledger holds. Each hit adds one or two, and the owner's
 *  client empties it whenever it is online; at the cap a hit still lands, without
 *  the spends it would record. */
export const PEER_SPENDS_CAP = 128;

/** The entries this sheet has not folded yet. */
export function pendingPeerSpends(
  session: Pick<SessionState, "foldedPeerSpends">,
  ledger: ReadonlyArray<PeerSpend>
): PeerSpend[] {
  const folded = new Set(session.foldedPeerSpends ?? []);
  return ledger.filter((entry) => !folded.has(entry.id));
}

/**
 * The sheet with every pending entry applied, in order: a pool's use moves by the
 * amount (never below empty), a state ends or comes back. The folded ids are kept
 * for the entries still in the ledger, so a repeat fold is a no-op and the list
 * never outgrows the ledger.
 */
export function foldPeerSpends(
  session: SessionState,
  ledger: ReadonlyArray<PeerSpend>
): SessionState {
  const pending = pendingPeerSpends(session, ledger);
  const inLedger = new Set(ledger.map((entry) => entry.id));
  const folded = [
    ...(session.foldedPeerSpends ?? []).filter((id) => inLedger.has(id)),
    ...pending.map((entry) => entry.id),
  ];
  let trackers = session.trackers;
  let active = session.activeFeatures ?? [];
  for (const entry of pending) {
    if (entry.kind === "tracker") {
      const used = Math.max(0, (trackers[entry.trackerId]?.used ?? 0) + entry.amount);
      const id = entry.trackerId;
      const rest = Object.fromEntries(
        Object.entries(trackers).filter(([key]) => key !== id)
      );
      trackers = used > 0 ? { ...rest, [id]: { used } } : rest;
    } else if (entry.kind === "state-end") {
      active = active.filter((key) => key !== entry.key);
    } else if (!active.includes(entry.key)) {
      active = [...active, entry.key];
    }
  }
  return {
    ...session,
    trackers,
    activeFeatures: active,
    foldedPeerSpends: folded.length > 0 ? folded : undefined,
  };
}

/** The entries an undo appends: each spend reversed, in reverse order. */
export function invertPeerSpends(
  spends: ReadonlyArray<PeerSpend>,
  newId: (index: number) => string
): PeerSpend[] {
  return [...spends].reverse().map((entry, index): PeerSpend => {
    const id = newId(index);
    if (entry.kind === "tracker") return { ...entry, id, amount: -entry.amount };
    return {
      id,
      kind: entry.kind === "state-end" ? "state-restore" : "state-end",
      key: entry.key,
    };
  });
}
