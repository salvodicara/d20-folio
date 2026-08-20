/**
 * party-world-lease - the MEMBER-FLOW command boundary that carries the
 * viewer's own PC into the composed encounter world.
 *
 * The DM cannot write member documents, so the join rides the member's OWN
 * subscription flow: `GlobalCombatMount` (the one shell-level live read of
 * "which running encounters is this user in") feeds every observed own-PC
 * fight into {@link observePartyWorldFights}, and THIS module commits the
 * character-side boundaries through the member's own journal
 * (`commitCharacterAction` → the same debounced owner-scoped autosave the
 * solo wiring uses). The full composed model - why the lease is carried by
 * participant identity on the CHARACTER material instead of the kernel's
 * atomic multi-document clock lease - is documented once, at the seam, in
 * `src/lib/encounter-world-store.ts` ("The PC party lease").
 *
 * The three motions, each idempotent and FAIL-CLOSED (a corrupt member world
 * degrades ONLY the member's own join - the encounter document is never
 * touched from here; a rejected plan or commit changes nothing and never
 * expires anything early):
 *
 *  - JOIN - the surfaced (primary) fight lists the viewer's PC, turns have
 *    begun and the PC has rolled: the kernel's `start-encounter` boundary
 *    opens the lease-identified local encounter at the shared round. A
 *    lingering LOCAL solo encounter (or a stale lease from an ended fight)
 *    is ended FIRST through the kernel's `end-encounter` boundary - the rest
 *    wave's collision precedent. Idempotent by lease identity: an already
 *    matching lease is a silent no-op, and the join/leave action ids
 *    fingerprint the fight identity plus the world revision so a replayed
 *    observation lands on the journal's already-applied path.
 *  - TURN - the shared pointer passes OFF the viewer's own PC in a leased
 *    fight: the kernel's `complete-turn` boundary fires on the character
 *    material (the mirror of the solo End-Turn wiring), finalizing every due
 *    turn-anchored lifetime and advancing the local clock six seconds - once
 *    per (fight, round), enforced by the action id, so a DM stepping back
 *    and forward across the PC in the same round cannot double-expire.
 *  - LEAVE - the leased fight is no longer among the viewer's active own-PC
 *    fights (ended, epoch replaced, PC removed): the kernel's
 *    `end-encounter` boundary closes the lease and encounter-anchored
 *    lifetimes rebind through the kernel's combat-end machinery. A lease
 *    whose fight is still active but merely not primary is KEPT (no churn on
 *    pin switches); its boundaries pause until it is surfaced again.
 *
 * Commits require the fight's character to be the OPEN character (the store
 * is the only writer seam that composes with the sheet's autosave - the solo
 * precedent). A member whose sheet is closed simply joins late: the join is
 * observation-driven and idempotent, and missed pass-offs leave lifetimes
 * STANDING (fail-closed is always late, never early).
 */

import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import {
  partyAttackParticipationCapability,
  partyLeaseIdentity,
  planPartyEncounterJoin,
  planPartyEncounterLeave,
  planPartyTurnBoundary,
  runPartyCharacterAction,
} from "@/lib/encounter-world-store";
import {
  boundaryCommitFacts,
  characterTrackerSeeds,
  characterTurnEconomy,
  characterWorldState,
  commitCharacterAction,
} from "@/lib/mechanics-world-store";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { JournalActionDraft } from "@/types/action-journal";

/** One observed active fight the viewer's own PC is a combatant of. */
export interface PartyFightSnapshot {
  readonly campaignId: string;
  /** The viewer's attached character in this fight (the PC reference). */
  readonly characterId: string;
  /** The per-fight identity stamp (`encounter.epoch`). */
  readonly encounterEpoch: number;
  /** The viewer's raw d20 off the campaign's `encounterInit` table. */
  readonly initiativeRoll: number | null;
  /** The shared pointer rests on the viewer's PC. */
  readonly isMyTurn: boolean;
  readonly round: number;
  /** The DM has begun turns (a non-null shared pointer). */
  readonly turnsBegun: boolean;
}

interface OpenCharacterWorld {
  readonly doc: CharacterDoc;
  readonly uid: string;
  readonly world: Readonly<CharacterMaterialState>;
}

/** The OPEN character's engine world plus the identity to commit against. */
function openCharacterWorld(): OpenCharacterWorld | null {
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

/** Commit one planned boundary and rethread the doc/world pair (null = fail-closed). */
function commitBoundary(
  resolved: OpenCharacterWorld,
  plan: Readonly<JournalActionDraft>
): OpenCharacterWorld | null {
  const committed = commitCharacterAction(
    resolved.doc,
    resolved.uid,
    resolved.world,
    plan,
    boundaryCommitFacts(plan)
  );
  if (!committed) return null;
  useCharacterStore.getState().updateSession(committed.session);
  return {
    doc: { ...resolved.doc, session: committed.session },
    uid: resolved.uid,
    world: committed.world,
  };
}

/** End whatever local encounter runs (solo collision or stale lease), kernel-canonically. */
function endLocalEncounter(resolved: OpenCharacterWorld): OpenCharacterWorld | null {
  const plan = planPartyEncounterLeave(
    resolved.doc.id,
    resolved.uid,
    resolved.world,
    `party-encounter-end:${canonicalFingerprint({
      lease: partyLeaseIdentity(resolved.world),
      revision: resolved.world.revision,
    })}`
  );
  return plan ? commitBoundary(resolved, plan) : null;
}

function sameFight(
  lease: { campaignId: string; encounterEpoch: number },
  fight: Pick<PartyFightSnapshot, "campaignId" | "encounterEpoch">
): boolean {
  return (
    lease.campaignId === fight.campaignId && lease.encounterEpoch === fight.encounterEpoch
  );
}

/**
 * Fire the character-side `complete-turn` for every fight whose pointer moved
 * OFF the viewer's PC between two settled observations. The first observation
 * primes silently (a reload mid-fight is not a pass-off).
 */
function firePassedTurnBoundaries(
  previous: readonly PartyFightSnapshot[] | null,
  fights: readonly PartyFightSnapshot[]
): void {
  if (previous === null) return;
  for (const fight of fights) {
    const before = previous.find((candidate) => sameFight(candidate, fight));
    if (!before || !before.isMyTurn || fight.isMyTurn) continue;
    const resolved = openCharacterWorld();
    if (!resolved || resolved.doc.id !== fight.characterId) continue;
    const lease = partyLeaseIdentity(resolved.world);
    if (!lease || !sameFight(lease, fight)) continue;
    const plan = planPartyTurnBoundary(
      resolved.doc.id,
      resolved.uid,
      resolved.world,
      // Once per (fight, round): a replayed observation (or a DM stepping
      // back and forward across the PC in the same round) re-plans the SAME
      // action id and lands on the journal's already-applied path.
      `party-turn:${canonicalFingerprint({
        campaignId: fight.campaignId,
        encounterEpoch: fight.encounterEpoch,
        round: before.round,
      })}`
    );
    if (plan) commitBoundary(resolved, plan);
  }
}

/** Reconcile the OPEN character's lease against the observed fights. */
function reconcileLease(
  fights: readonly PartyFightSnapshot[],
  primaryCampaignId: string | null
): void {
  const resolved = openCharacterWorld();
  if (!resolved) return;
  const primary =
    primaryCampaignId === null
      ? undefined
      : fights.find((fight) => fight.campaignId === primaryCampaignId);
  const joinable =
    primary &&
    primary.characterId === resolved.doc.id &&
    primary.turnsBegun &&
    primary.initiativeRoll !== null
      ? primary
      : null;
  const lease = partyLeaseIdentity(resolved.world);

  if (joinable) {
    if (lease && sameFight(lease, joinable)) return; // already joined - idempotent
    let current: OpenCharacterWorld | null = resolved;
    if (current.world.encounter !== null) {
      // The solo collision (or a stale lease): end it first, kernel-canonically.
      current = endLocalEncounter(current);
      if (!current) return; // fail-closed: nothing joined, nothing lost
    }
    const plan = planPartyEncounterJoin(
      current.doc.id,
      current.uid,
      current.world,
      {
        campaignId: joinable.campaignId,
        encounterEpoch: joinable.encounterEpoch,
        round: joinable.round,
      },
      joinable.initiativeRoll,
      `party-join:${canonicalFingerprint({
        campaignId: joinable.campaignId,
        encounterEpoch: joinable.encounterEpoch,
        revision: current.world.revision,
      })}`
    );
    if (plan) commitBoundary(current, plan);
    return;
  }

  // No joinable surfaced fight: release a lease whose fight is GONE from the
  // viewer's active set. A lease for a still-active (merely non-primary or
  // pre-roll) fight is kept - no churn on pin switches or loading gaps.
  if (!lease) return;
  if (fights.some((fight) => sameFight(lease, fight))) return;
  endLocalEncounter(resolved);
}

/**
 * The ONE observation entry - called by `GlobalCombatMount` on every settled
 * change of the viewer's active own-PC fights. `previous` is the caller's
 * last settled observation (null on the first, which primes silently).
 * Boundaries fire BEFORE the reconcile so a pass-off and a fight end arriving
 * in one snapshot resolve in table order (turn ends, then the lease closes).
 */
export function observePartyWorldFights(
  previous: readonly PartyFightSnapshot[] | null,
  fights: readonly PartyFightSnapshot[],
  primaryCampaignId: string | null
): void {
  firePassedTurnBoundaries(previous, fights);
  reconcileLease(fights, primaryCampaignId);
}

/**
 * Stamp the PC side of one cross-material action: the acting member commits
 * the correlation id into its OWN journal as a `record-manual-boundary` turn
 * claim on the leased participant's economy (the encounter side of the same
 * action carries the identical id prefix on the encounter journal and the
 * chronicle beat - see `applyAdversaryDamage`). Best-effort and fail-closed:
 * the adversary's damage is table truth and lands first; a missing lease,
 * closed sheet, foreign actor or rejected claim skips the stamp silently.
 */
export function commitPartyAttackParticipation(
  campaignId: string,
  actorId: string,
  correlationId: string
): void {
  const uid = useAuthStore.getState().user?.uid;
  if (uid === undefined || actorId !== `pc-${uid}`) return;
  const resolved = openCharacterWorld();
  if (!resolved) return;
  const lease = partyLeaseIdentity(resolved.world);
  if (!lease || lease.campaignId !== campaignId) return;
  const capability = partyAttackParticipationCapability(
    resolved.doc.id,
    resolved.uid,
    correlationId
  );
  if (!capability) return;
  const outcome = runPartyCharacterAction(
    resolved.doc.id,
    resolved.uid,
    resolved.world,
    capability,
    correlationId,
    characterTurnEconomy(resolved.doc, resolved.uid)
  );
  if (!outcome || outcome.status !== "complete" || !outcome.action) return;
  const committed = commitCharacterAction(
    resolved.doc,
    resolved.uid,
    resolved.world,
    outcome.action,
    boundaryCommitFacts(outcome.action)
  );
  if (committed) useCharacterStore.getState().updateSession(committed.session);
}
