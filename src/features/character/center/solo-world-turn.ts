/**
 * solo-world-turn — the SOLO combat loop's bridge into the character's own
 * mechanics world (the engine twin of the tracker's round advance).
 *
 * The solo tracker's turn boundary is a legacy bookkeeping step
 * (`combatStore.endTurn` — round++, economy reset). These helpers carry that
 * SAME boundary into the canonical engine world: a local single-participant
 * encounter on the character's material (started lazily on the first advance),
 * the kernel's `complete-turn` boundary per advance (end waves finalize every
 * due turn-anchored lifetime; the next turn opens with a fresh own-turn
 * economy, so per-turn kernel claims reset exactly), and `end-encounter` when
 * the player ends combat. Every commit rides the canonical journal
 * (`commitCharacterAction`), so expiries mirror onto the legacy session
 * (conditions, concentration, slots) in the same write.
 *
 * FAIL-CLOSED, ONE-WAY — the encounter seam's doctrine: a rejected plan or
 * commit leaves the legacy tracker advanced and booked lifetimes STANDING
 * (nothing ever expires early), and undoing an End Turn rewinds only the
 * legacy round — a crossed engine boundary is a fact, not an animation.
 */

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import {
  boundaryCommitFacts,
  characterTrackerSeeds,
  characterWorldState,
  commitCharacterAction,
  planSoloEncounterEnd,
  planSoloEncounterStart,
  planSoloTurnBoundary,
} from "@/lib/mechanics-world-store";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";

/** The tracker's entered RAW d20 initiative, when the player typed one. */
function enteredInitiativeRoll(): number | null {
  const entered = Number.parseInt(useCombatStore.getState().initiative, 10);
  return Number.isSafeInteger(entered) && entered >= 1 && entered <= 20 ? entered : null;
}

/** The character's persisted engine world plus the identity to commit against. */
function soloWorldFor(): {
  doc: NonNullable<ReturnType<typeof useCharacterStore.getState>["character"]>;
  uid: string;
  world: NonNullable<ReturnType<typeof characterWorldState>>;
} | null {
  const store = useCharacterStore.getState();
  const doc = store.character;
  const uid = useAuthStore.getState().user?.uid;
  if (!doc || uid === undefined || store.readonly) return null;
  const world = characterWorldState(
    doc,
    uid,
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  return world ? { doc, uid, world } : null;
}

/**
 * SOLO ONLY — carry the tracker's round advance into the character's own
 * engine world: ensure the local single-participant encounter is running
 * (started lazily at the round that just ENDED, so pre-existing lifetimes
 * keep their out-of-combat freeze), then fire the kernel's `complete-turn`
 * boundary and mirror the expiries onto the legacy session in ONE commit.
 */
export function advanceSoloWorldTurn(endedRound: number): void {
  const resolved = soloWorldFor();
  if (!resolved) return;
  let { doc, world } = resolved;
  const { uid } = resolved;
  if (world.encounter === null) {
    const start = planSoloEncounterStart(
      doc,
      uid,
      world,
      Math.max(1, endedRound),
      `solo-combat-start:${canonicalFingerprint({
        revision: world.revision,
        round: endedRound,
      })}`,
      enteredInitiativeRoll()
    );
    if (!start) return;
    const committed = commitCharacterAction(
      doc,
      uid,
      world,
      start,
      boundaryCommitFacts(start)
    );
    if (!committed) return;
    useCharacterStore.getState().updateSession(committed.session);
    doc = { ...doc, session: committed.session };
    world = committed.world;
  }
  const boundary = planSoloTurnBoundary(
    doc,
    uid,
    world,
    `solo-turn:${canonicalFingerprint({
      revision: world.revision,
      round: endedRound,
    })}`
  );
  if (!boundary) return;
  const committed = commitCharacterAction(
    doc,
    uid,
    world,
    boundary,
    boundaryCommitFacts(boundary)
  );
  if (committed) useCharacterStore.getState().updateSession(committed.session);
}

/**
 * SOLO ONLY — end the character-world encounter alongside the tracker's End
 * Combat, through the kernel's own `end-encounter` boundary (encounter clocks
 * release; encounter-anchored lifetimes rebind through the kernel's
 * combat-end machinery). Fail-closed no-op when no world encounter runs.
 */
export function endSoloWorldEncounter(): void {
  const resolved = soloWorldFor();
  if (!resolved || resolved.world.encounter === null) return;
  const { doc, uid, world } = resolved;
  const action = planSoloEncounterEnd(
    doc,
    uid,
    world,
    `solo-combat-end:${canonicalFingerprint({ revision: world.revision })}`
  );
  if (!action) return;
  const committed = commitCharacterAction(
    doc,
    uid,
    world,
    action,
    boundaryCommitFacts(action)
  );
  if (committed) useCharacterStore.getState().updateSession(committed.session);
}
