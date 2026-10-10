/**
 * Committing a play transition on the character's persisted mechanics world: the
 * write-path seam every vitals, condition and resource transition shares. Pure
 * apart from the journal action id (a random UUID).
 */
import {
  boundaryCommitFacts,
  characterTrackerSeeds,
  characterWorldState,
  commitCharacterAction,
  persistedWorldUid,
  planCharacterVitalsTransition,
} from "@/lib/mechanics-world-store";
import type { JournalActionDraft } from "@/types/action-journal";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { CreatureVitals } from "@/types/vitals";

/** One committed world transition: the journal action id (its undo pairing)
 * plus the mirrored session (world + every world-owned legacy field, ONE
 * value the caller folds into a single store update). */
export interface WorldVitalsCommit {
  actionId: string;
  session: SessionState;
}

/**
 * Commit one TABLE-AUTHORITY vitals transition against the character's
 * PERSISTED engine world — the write-path twin of the `character-vitals` read
 * seam. The caller's `mutate` moves the fact fields on a cloned state (the
 * rest boundary's rebase-on-session-truth discipline) and returns null when
 * the world cannot express the transition. FAIL-CLOSED (the encounter seam's
 * degradation): no persisted world, an unparseable world, an inexpressible
 * transition, or a rejected plan/commit all return null and the caller runs
 * the documented legacy session write instead — nothing engine-side moves.
 */
export function commitWorldVitals(
  doc: CharacterDoc,
  prefix: string,
  mutate: (state: CharacterMaterialState) => CharacterMaterialState | null
): WorldVitalsCommit | null {
  if (doc.session.world === undefined) return null;
  const uid = persistedWorldUid(doc.session.world);
  if (uid === null) return null;
  const world = characterWorldState(
    doc,
    uid,
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  if (!world) return null;
  const next = mutate(structuredClone(world));
  if (!next) return null;
  const actionId = `${prefix}-${crypto.randomUUID()}`;
  const action = planCharacterVitalsTransition(doc, uid, world, next, actionId);
  if (!action) return null;
  const committed = commitCharacterAction(
    doc,
    uid,
    world,
    action,
    boundaryCommitFacts(action)
  );
  return committed ? { actionId, session: committed.session } : null;
}

/** Commit one planned condition action (apply/end) over the persisted world —
 * the {@link commitWorldVitals} skeleton with a caller-supplied planner. */
export function commitWorldCondition(
  doc: CharacterDoc,
  prefix: string,
  plan: (
    uid: string,
    world: Readonly<CharacterMaterialState>,
    actionId: string
  ) => Readonly<JournalActionDraft> | null
): WorldVitalsCommit | null {
  if (doc.session.world === undefined) return null;
  const uid = persistedWorldUid(doc.session.world);
  if (uid === null) return null;
  const world = characterWorldState(
    doc,
    uid,
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  if (!world) return null;
  const actionId = `${prefix}-${crypto.randomUUID()}`;
  const action = plan(uid, world, actionId);
  if (!action) return null;
  const committed = commitCharacterAction(
    doc,
    uid,
    world,
    action,
    boundaryCommitFacts(action)
  );
  return committed ? { actionId, session: committed.session } : null;
}

/** The next temporary-HP cell for a legacy write: a drain of the same pool
 * (0 < next ≤ prior) keeps its source occurrence (an engine THP source keeps
 * its empty-trigger linkage); a raise or an emptied pool drops it (a manual
 * grant is table truth; an empty cell must carry no source). */
export function drainedTemporary(
  prior: CreatureVitals["hitPoints"]["temporary"],
  nextTemp: number
): CreatureVitals["hitPoints"]["temporary"] {
  return {
    current: nextTemp,
    sourceOccurrence:
      nextTemp > 0 && nextTemp <= prior.current ? prior.sourceOccurrence : null,
  };
}

/** The vitals value with only the temporary pool replaced. */
export function vitalsWithTemporary(
  vitals: CreatureVitals,
  temporary: CreatureVitals["hitPoints"]["temporary"]
): CreatureVitals {
  return { ...vitals, hitPoints: { ...vitals.hitPoints, temporary } };
}

/** One count cell with its current value replaced (cells are frozen-shaped). */
export function cellWith<T extends { readonly current: number }>(
  cell: T,
  current: number
): T {
  return { ...cell, current };
}
