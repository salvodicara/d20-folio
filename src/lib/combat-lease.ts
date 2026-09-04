/**
 * The lease — a PC joining and leaving a campaign encounter, design §5.2.
 *
 * A PC joins a campaign encounter by a `table:join` action appended by its OWNER's client,
 * carrying the entity projected from its personal aggregate. The owner's client also sets
 * `lease: { campaignId, encounterId, epoch }` on its own character parent document. While
 * leased: the campaign encounter owns the PC's combat facts; the personal aggregate is
 * read-only for those facts. On `table:leave` (or `table:end`, or when the owner's client
 * observes the encounter ended), the owner's client folds the encounter, writes the entity back
 * into its personal aggregate as a `table:sync` action, and clears `lease`.
 *
 * Nobody else ever writes the owner's documents: both verbs here touch only the encounter's
 * `log` (an `arrayUnion`, same as `appendAction`) and the caller's OWN character parent and
 * personal `combat/state` — never a peer's. Each verb is one `writeBatch`, atomic and
 * offline-queueable, so a join/leave can never leave the lease marker and the log out of sync
 * with each other even if the client goes offline mid-write.
 *
 * `lease` is a top-level field on the character parent document, outside the `{ schema, build,
 * state }` codec envelope — like `attachedCampaignId` (`docs/CHARACTER_SCHEMA.md`), but a
 * distinct concept: `attachedCampaignId` is the standing one-campaign claim, `lease` is which
 * encounter (if any) currently owns this PC's live combat facts.
 *
 * Same import boundary as `combat-io.ts`: `firebase/firestore` and sibling `combat/*` modules
 * only, never `@/lib/firebase`.
 */
import {
  arrayUnion,
  deleteField,
  doc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { encounterRef, personalEncounterRef } from "./combat-io";
import { encounterWriteData } from "./combat/codec";
import type { Seq } from "./combat/ids";
import type { Action, Encounter, Entity } from "./combat/types";
import { stripUndefined } from "./strip-undefined";

export interface EncounterLease {
  readonly campaignId: string;
  readonly encounterId: string;
  readonly epoch: number;
}

/** The character parent doc: `users/{uid}/characters/{characterId}`. */
function characterRef(db: Firestore, uid: string, characterId: string) {
  return doc(db, "users", uid, "characters", characterId);
}

/**
 * Read the `lease` field off a character parent doc's data. Shape-tolerant: an absent field, a
 * non-record value, or one missing/mistyping any of the three parts reads as "not leased"
 * (`null`) rather than throwing — a future build's schema must never crash this one.
 */
export function readLease(data: unknown): EncounterLease | null {
  if (typeof data !== "object" || data === null) return null;
  const lease = (data as Record<string, unknown>).lease;
  if (typeof lease !== "object" || lease === null) return null;
  const { campaignId, encounterId, epoch } = lease as Record<string, unknown>;
  if (
    typeof campaignId === "string" &&
    typeof encounterId === "string" &&
    typeof epoch === "number" &&
    Number.isFinite(epoch)
  ) {
    return { campaignId, encounterId, epoch };
  }
  return null;
}

/**
 * `table:join`: append the join action to the campaign encounter and mark the owner's character
 * parent with the lease, in one batch.
 */
export async function joinTable(args: {
  readonly db: Firestore;
  readonly uid: string;
  readonly characterId: string;
  readonly campaignId: string;
  readonly encounterId: string;
  readonly epoch: number;
  readonly entity: Entity;
  readonly action: { readonly id: string; readonly seq: Seq };
}): Promise<void> {
  const { db, uid, characterId, campaignId, encounterId, epoch, entity, action } = args;
  const joinAction: Action = {
    kind: "table",
    id: action.id,
    seq: action.seq,
    by: uid,
    table: { op: "join", entity },
  };
  const lease: EncounterLease = { campaignId, encounterId, epoch };

  const batch = writeBatch(db);
  batch.update(encounterRef(db, campaignId, encounterId), {
    log: arrayUnion(stripUndefined(joinAction)),
  });
  batch.update(characterRef(db, uid, characterId), { lease });
  await batch.commit();
}

/**
 * `table:leave`: append the leave action to the campaign encounter, fold the entity back into
 * the owner's personal aggregate as a `table:sync` action, and clear the lease — in one batch.
 *
 * `personal === null` means the owner has no personal `combat/state` document yet, so the sync
 * is written as the first action of a fresh personal `Encounter` (`set`, not `update`).
 */
export async function leaveTable(args: {
  readonly db: Firestore;
  readonly uid: string;
  readonly characterId: string;
  readonly campaignId: string;
  readonly encounterId: string;
  readonly entity: Entity;
  readonly leave: { readonly id: string; readonly seq: Seq };
  readonly sync: { readonly id: string; readonly seq: Seq };
  readonly personal: Encounter | null;
}): Promise<void> {
  const { db, uid, characterId, campaignId, encounterId, entity, leave, sync, personal } =
    args;

  const leaveAction: Action = {
    kind: "table",
    id: leave.id,
    seq: leave.seq,
    by: uid,
    table: { op: "leave", entity: entity.id },
  };
  const syncAction: Action = {
    kind: "table",
    id: sync.id,
    seq: sync.seq,
    by: uid,
    table: { op: "sync", entity },
  };

  const batch = writeBatch(db);
  batch.update(encounterRef(db, campaignId, encounterId), {
    log: arrayUnion(stripUndefined(leaveAction)),
  });

  const personalRef = personalEncounterRef(db, uid, characterId);
  if (personal === null) {
    const fresh: Encounter = {
      schema: 1,
      id: "personal",
      host: { kind: "personal", uid, characterId },
      log: [syncAction],
      checkpoint: null,
    };
    batch.set(personalRef, encounterWriteData(fresh));
  } else {
    batch.update(personalRef, { log: arrayUnion(stripUndefined(syncAction)) });
  }

  batch.update(characterRef(db, uid, characterId), { lease: deleteField() });
  await batch.commit();
}
