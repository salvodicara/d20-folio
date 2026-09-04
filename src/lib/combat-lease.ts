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
import type { Mechanic } from "./combat/mechanic";
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
  /** The entity's EXECUTABLE definitions, carried into the log so every client folds the same
   *  table (stage 6 design §2 D2). `[]` for an entity with nothing of its own. */
  readonly mechanics: readonly Mechanic[];
  readonly action: { readonly id: string; readonly seq: Seq };
}): Promise<void> {
  const {
    db,
    uid,
    characterId,
    campaignId,
    encounterId,
    epoch,
    entity,
    mechanics,
    action,
  } = args;
  const joinAction: Action = {
    kind: "table",
    id: action.id,
    seq: action.seq,
    by: uid,
    table: { op: "join", entity, mechanics },
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
 * What the leaving client writes back into its OWN personal document at
 * `users/{uid}/characters/{characterId}/combat/state`.
 *
 * Two shapes, because the document has two lives (stage 6 design §5, D1):
 *
 * - `encounter` — the personal aggregate as an `Encounter`. `encounter: null` means the document
 *   DOES NOT EXIST, so the sync is written as the first action of a fresh one (`set`, not
 *   `update`). That branch is narrow on purpose: the path ALIASES the live `CombatState` the old
 *   cockpit owns (see `personalEncounterRef` in `combat-io.ts`), so a document that did not parse
 *   is not "missing" — it is a legacy `CombatState`, and passing `null` for it would overwrite a
 *   live play session.
 * - `document` — **the stage-6 variant, and its named fate: it dies with the old sheet at item
 *   8.** While D1 holds, the personal document stays a `CombatState` carrying the character's
 *   whole play session, so leaving a table writes the projected document (built by
 *   `projectCombatState`, `combat-state-writeback.ts`) VERBATIM — no sync action, no `Encounter`
 *   envelope. Item 8 replaces this variant with the `encounter` one and its migration.
 */
export type PersonalWriteBack =
  | { readonly kind: "encounter"; readonly encounter: Encounter | null }
  | { readonly kind: "document"; readonly data: Record<string, unknown> };

/**
 * `table:leave`: append the leave action to the campaign encounter, write the entity back into
 * the owner's personal document, and clear the lease — in one batch.
 *
 * The write-back's shape is `personal`'s (see {@link PersonalWriteBack}). `sync` is the envelope
 * of the `table:sync` action the `encounter` variant appends; the `document` variant carries the
 * fight's outcome in `data` itself and never mints one.
 */
export async function leaveTable(args: {
  readonly db: Firestore;
  readonly uid: string;
  readonly characterId: string;
  readonly campaignId: string;
  readonly encounterId: string;
  readonly entity: Entity;
  /** The definitions the `sync` carries back into the personal aggregate — same contract as
   *  `joinTable`'s. */
  readonly mechanics: readonly Mechanic[];
  readonly leave: { readonly id: string; readonly seq: Seq };
  readonly sync: { readonly id: string; readonly seq: Seq };
  readonly personal: PersonalWriteBack;
}): Promise<void> {
  const {
    db,
    uid,
    characterId,
    campaignId,
    encounterId,
    entity,
    mechanics,
    leave,
    sync,
    personal,
  } = args;

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
    table: { op: "sync", entity, mechanics },
  };

  const batch = writeBatch(db);
  batch.update(encounterRef(db, campaignId, encounterId), {
    log: arrayUnion(stripUndefined(leaveAction)),
  });

  const personalRef = personalEncounterRef(db, uid, characterId);
  if (personal.kind === "document") {
    batch.set(personalRef, personal.data);
  } else if (personal.encounter === null) {
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
