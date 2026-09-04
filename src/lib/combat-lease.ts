/**
 * The lease — a PC joining and leaving a campaign encounter, design §5.2.
 *
 * A PC joins a campaign encounter by a `table:join` action appended by its OWNER's client,
 * carrying the entity projected from its personal aggregate. The owner's client also sets
 * `lease: { campaignId, encounterId, epoch }` on its own character parent document. While
 * leased: the campaign encounter owns the PC's combat facts; the personal aggregate is
 * read-only for those facts. On `table:leave` (or `table:end`, or when the owner's client
 * observes the encounter ended), the owner's client folds the encounter, writes the entity back
 * into its personal document, and clears `lease`. While D1 holds that document is still a legacy
 * `CombatState` and the write-back is the projected document itself; the `table:sync` action the
 * design names arrives with the personal `Encounter` at item 8 (see {@link PersonalWriteBack}).
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
import type { Seq } from "./combat/ids";
import type { Mechanic } from "./combat/mechanic";
import type { LegacyCombatStateWrite } from "./combat-state-writeback";
import type { Action, Entity } from "./combat/types";
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
 * ONE shape, and its named fate: **it dies with the old sheet at item 8**, when the personal
 * aggregate becomes an `Encounter` and this type gains the `encounter` variant — a `table:sync`
 * appended to the aggregate, or a fresh one minted for a character that has none — together with
 * the migration that turns the stored document into one.
 *
 * Until then D1 holds: the path ALIASES the live `CombatState` the old cockpit owns (see
 * `personalEncounterRef` in `combat-io.ts`), which carries the character's whole play session, so
 * leaving a table writes the projected document VERBATIM — no sync action, no `Encounter`
 * envelope. Writing an `Encounter` there would be unrecoverable: `parseCombatState` would refuse
 * the document forever, and with it every character it belongs to. That is why the variant is
 * absent rather than merely unused.
 *
 * `data` is a {@link LegacyCombatStateWrite}, which ONLY `encodeLegacyWriteBack`
 * (`combat-state-writeback.ts`) can produce: this document has one sanctioned encoder, which
 * refuses a state without a valid v1 `playState` instead of writing one `parseCombatState` would
 * refuse forever, and which stamps `updatedAt` like every other writer. The type is what stops a
 * caller hand-rolling the object past that guard.
 *
 * The write is a whole-document OVERWRITE — this document's established contract, its payload
 * always being complete — so the `previous` state the encoder projected onto MUST be a fresh
 * parse of the live document; anything written after that read is lost, not merged.
 */
export type PersonalWriteBack = {
  readonly kind: "document";
  readonly data: LegacyCombatStateWrite;
};

/**
 * `table:leave`: append the leave action to the campaign encounter, write the entity back into
 * the owner's personal document, and clear the lease — in one batch.
 *
 * The write-back's shape is `personal`'s (see {@link PersonalWriteBack}): while D1 holds it
 * carries the fight's outcome in `data` itself, so no `table:sync` action is minted here. Item 8
 * brings the sync back with the `Encounter` aggregate.
 */
export async function leaveTable(args: {
  readonly db: Firestore;
  readonly uid: string;
  readonly characterId: string;
  readonly campaignId: string;
  readonly encounterId: string;
  readonly entity: Entity;
  readonly leave: { readonly id: string; readonly seq: Seq };
  readonly personal: PersonalWriteBack;
}): Promise<void> {
  const { db, uid, characterId, campaignId, encounterId, entity, leave, personal } = args;

  const leaveAction: Action = {
    kind: "table",
    id: leave.id,
    seq: leave.seq,
    by: uid,
    table: { op: "leave", entity: entity.id },
  };

  const batch = writeBatch(db);
  batch.update(encounterRef(db, campaignId, encounterId), {
    log: arrayUnion(stripUndefined(leaveAction)),
  });
  batch.set(personalEncounterRef(db, uid, characterId), personal.data);
  batch.update(characterRef(db, uid, characterId), { lease: deleteField() });
  await batch.commit();
}
