/**
 * combat-reconcile — the PURE derivation the shell combat producer publishes, and the ONE
 * place the topbar pip's primary turn-phase and the cockpit `status` are reconciled from a
 * SINGLE source so they can never disagree by construction.
 *
 * THE DISEASE IT CURES (the owner's live "your turn FLICKERS on End Turn" bug). The pip's
 * primary turn-phase used to be reduced from the CHEAP shared-campaigns query
 * (`subscribeToSharedCampaigns` → `viewerActiveEncounters` → `buildPipModel`) while the
 * cockpit `status` was reduced from a SEPARATE live read of the same campaign doc
 * (`subscribeToCampaign` → `useLiveEncounter`). Those are two INDEPENDENT Firestore watch
 * targets that reconcile the SAME turn-advance in DIFFERENT ticks, and the producer
 * co-publishes them through one `set(status, pip)`. So right after the optimistic End-Turn
 * hand-off flipped the pip GOLD→quiet, whichever listener re-fired FIRST would republish its
 * own advanced half beside the other's STALE half:
 *   • the live read (status) advancing first → `set(advanced status, STALE your-turn pip)`
 *     — the pip snapped back to GOLD "your turn" for a frame before the query caught up;
 *   • the query (pip) advancing first, or a peer's `combat/state` echo re-running the status
 *     memo while the turn write was still in flight → `set(STALE your-turn, STALE pip)`
 *     — the optimistic hand-off was reverted wholesale.
 *
 * THE FIX (single-source, atomic — no timers, no hiding, no debounce):
 *   1. {@link syncPipToStatus} derives the primary pip entry's turn-phase FROM `status`, so
 *      the pip and the sheet band are ONE derivation — a stale-half publish is unrepresentable.
 *   2. {@link reconcileCombatPublish} guards `status` against REGRESSING below the optimistic
 *      hand-off: while the player's own turn-advance write is still in flight ({@link
 *      PendingTurn}, set by the sheet's End Turn) and the live read still shows the pointer
 *      exactly where they advanced FROM, the reconcile re-applies the pure {@link
 *      advanceGlobalCombat} step — so a lagging listener can never publish a pre-advance frame.
 *      The instant the real read reflects the advance, the guard is inert and the pending
 *      marker clears.
 *
 * PURE + engine-only: total functions over the light status/pip shapes + the pure
 * `advanceTurn` reducer — no React, no store, no Firebase (mirrors `encounter.ts`).
 */

import { advanceTurn } from "@/features/campaigns/encounter";
import type {
  GlobalCombat,
  PendingTurn,
  PipModel,
  PipState,
} from "@/features/campaigns/global-combat-context";

/**
 * The next {@link GlobalCombat} after this player's turn ends, computed from the PURE
 * {@link advanceTurn} reducer over the live encounter (the SAME transition the shared
 * `advanceEncounterTurn` transaction runs server-side). Published optimistically the INSTANT
 * End Turn is pressed so every reactive surface — the sheet turn band, the own-turn controls,
 * the topbar pip — flips to its not-your-turn state immediately, instead of feeling DEAD for
 * the `runTransaction` server round-trip (transactions aren't offline/latency-compensated).
 * The real snapshot reconciles it when it lands. Pure; the input is not mutated.
 */
export function advanceGlobalCombat(status: GlobalCombat): GlobalCombat {
  const next = advanceTurn(status.encounter);
  const currentId = next.currentCombatantId;
  return {
    ...status,
    encounter: next,
    view: { ...status.view, currentId },
    isMyTurn: currentId === status.myId,
    gathering: currentId === null,
    round: next.round,
  };
}

/**
 * Derive the turn-phase of the pip entry that matches `status.campaignId` FROM `status`, so
 * the topbar pill and the cockpit band are a SINGLE source (never a stale-half publish). A
 * `needs-roll` entry is LEFT untouched — that phase is owned by the doc-derived roll-state
 * (the entry's own `encounterInit` fact), and it takes precedence over the
 * turn pointer (spec §5). The other entries (a different fight's row) are never touched — this
 * player's advance can't change another encounter. Pure; the input is not mutated.
 */
export function syncPipToStatus(
  pip: PipModel | null,
  status: GlobalCombat
): PipModel | null {
  if (!pip) return pip;
  return {
    ...pip,
    entries: pip.entries.map((e) => {
      if (e.campaignId !== status.campaignId || e.state === "needs-roll") return e;
      const state: PipState = status.isMyTurn
        ? "your-turn"
        : status.gathering
          ? "gathering"
          : "actor-turn";
      const actorName =
        state === "actor-turn"
          ? (status.view.rows.find((r) => r.id === status.encounter.currentCombatantId)
              ?.name ?? null)
          : null;
      return { ...e, state, round: status.round, actorName };
    }),
  };
}

/**
 * Whether the optimistic End-Turn hand-off ({@link PendingTurn}) has NOT yet landed in
 * `rawStatus` — the live read still shows the pointer EXACTLY where the player advanced FROM
 * (same campaign / epoch / round / combatant). While true, {@link reconcileCombatPublish}
 * keeps the turn optimistically advanced; the moment the real read moves off that pointer
 * (the write echoed, or the DM stepped it), this is false and the marker is cleared by the
 * producer. Keyed on the exact (epoch, round, fromId) triple so a LATER wrap back onto this
 * player's own turn (a new round) reads as landed, never as "still pending". Pure.
 */
export function pendingApplies(
  rawStatus: GlobalCombat | null,
  pending: PendingTurn | null
): boolean {
  return (
    pending !== null &&
    rawStatus !== null &&
    rawStatus.campaignId === pending.campaignId &&
    rawStatus.encounter.epoch === pending.epoch &&
    rawStatus.encounter.currentCombatantId === pending.fromId &&
    rawStatus.round === pending.fromRound
  );
}

/**
 * The SINGLE derivation the shell producer publishes: reconcile the raw `status` (from the
 * live campaign read) and the raw `pip` (from the shared-campaigns query) into a CONSISTENT,
 * NON-REGRESSING pair. `status` is optimistically advanced while an End-Turn write is still
 * in flight ({@link pendingApplies}), and the primary pip entry's turn-phase is then derived
 * FROM that reconciled status ({@link syncPipToStatus}) — so the pip and the sheet band can
 * never disagree, and neither can regress to a pre-advance "your turn" frame while the
 * hand-off is pending. Pure; inputs are not mutated.
 */
export function reconcileCombatPublish(
  rawStatus: GlobalCombat | null,
  rawPip: PipModel | null,
  pending: PendingTurn | null
): { status: GlobalCombat | null; pip: PipModel | null } {
  const status =
    pendingApplies(rawStatus, pending) && rawStatus !== null
      ? advanceGlobalCombat(rawStatus)
      : rawStatus;
  const pip = status ? syncPipToStatus(rawPip, status) : rawPip;
  return { status, pip };
}
