/**
 * campaign-io — the Firebase boundary for `/campaigns/{campId}` (Phase 5 · Part 2a).
 *
 * The ONLY module that talks to Firestore for campaigns. It mirrors the proven
 * character I/O discipline (`src/lib/firestore.ts`): `stripUndefined` before every
 * write, `serverTimestamp()` for timestamps, `Timestamp → Date` on read, a
 * debounced writer for the ambient "shared artifact" edits, and a membership-scoped
 * (`array-contains`) query for the list — never an unbounded enumeration. Per
 * ARCHITECTURE.md (free-tier NFR): one document per campaign, reads on-open + cached, debounced
 * writes, no Cloud Functions.
 *
 * **Invite / join model.** The campaign document id IS its invite code (an
 * unguessable, crypto-random string). A joiner therefore resolves the campaign
 * straight from the code — no enumerable "find by inviteCode" query, which the
 * membership-scoped `list` rule would (correctly) deny — and self-adds with a
 * blind `arrayUnion` update that the `firestore.rules` "controlled self-join" path
 * validates (a non-member may add ONLY themselves). The joiner never needs read
 * access to the campaign, so the document stays member-only readable.
 */

import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Transaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEV_BYPASS_AUTH as IMPORTED_DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import {
  advanceTurn,
  prevTurn,
  removeCombatant,
  setMonsterCondition,
  setMonsterBardicInspirationDie,
} from "@/features/campaigns/encounter";
import {
  appendEvent,
  recordCondition,
  recordMonsterDamage,
  recordMonsterHp,
  recordPcHp,
} from "@/features/campaigns/combat-chronicle";
import { attachViolatesOneCampaign } from "@/features/campaigns/attach-guard";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { pushVersion } from "@/features/campaigns/chronicle-versions";
import type { EncounterMonster, EncounterPc, EncounterState } from "@/types/campaign";
import {
  makeDevCampaign,
  makeDevNotes,
  makeDevSessions,
  makeDevPipCampaigns,
  devPipScenario,
  resolveDevCampaign,
} from "@/features/campaigns/dev-fixture";
import {
  readDevDocument,
  subscribeDevDocument,
  updateDevDocument,
} from "@/lib/dev-document-store";
import { stripUndefined } from "@/lib/strip-undefined";
import { withTimeout } from "@/lib/promise-timeout";
import { timestampsToDates } from "@/lib/timestamps-to-dates";
import { nonEmptyString } from "@/lib/non-empty-string";
import {
  currentHpDeltaForEffect,
  endedEffectSuccessor,
  effectsByActorSource,
  effectsForTarget,
  expiredCombatEffects,
  foldCombatEffectOps,
  maxHpDeltaForEffect,
  resolvePersistentDamage,
  resolvePersistentHit,
  tempHpBoundEffectIds,
} from "@/lib/combat-effects";
import { defaultCombatState, reduceMemberCombatEffects } from "@/lib/combat-state";
import {
  combatStateRef,
  combatStateWriteData,
  parseCombatState,
  updateDevCombatState,
} from "@/lib/combat-state-io";
import { deleteCampaignBanner } from "@/lib/storage";
import type {
  CampaignDoc,
  ChronicleDoc,
  SessionLogDoc,
  SharedNote,
  MemberCharacterSnapshot,
  TreasuryLogEntry,
} from "@/types/campaign";
import {
  conformEncounterCreatures,
  setMonsterTempHp,
} from "@/features/campaigns/encounter";
import type { PortraitCrop } from "@/types/character";
import type { CombatChronicleEvent } from "@/types/combat-chronicle";

// Preserve the mockable live binding in dev/tests, while giving the production
// optimizer a literal `false` so the local-replica branches and fixtures disappear.
function devBypassEnabled(): boolean {
  return import.meta.env.PROD ? false : IMPORTED_DEV_BYPASS_AUTH;
}
import { srdText, type LocText } from "@/lib/loc-text";
import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
} from "@/types/combat-effect";
import type { CombatState } from "@/types/combat-state";
import type { DamageSource, DamageType } from "@/data/types";
import { NO_DEFENSES, type DamageDefenses } from "@/lib/damage-intake";
import { monsterDamageDefenses } from "@/features/campaigns/encounter-view";
import {
  createDebouncedWriter,
  type DebouncedWriter,
} from "@/app/_data/firestore-subscriptions";

/** Fields a member may edit ambiently (debounce-persisted shared artifacts). */
export type CampaignWritable = Partial<
  Pick<
    CampaignDoc,
    | "name"
    | "status"
    | "treasury"
    | "treasuryLog"
    | "bannerUrl"
    | "bannerCrop"
    | "encounter"
  >
>;

// Crockford-ish alphabet: no 0/O/1/I to keep codes legible when shared aloud.
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_LENGTH = 14;
/** Keeps the append-only effect ledger comfortably below Firestore's 1 MiB document cap. */
const MAX_COMBAT_EFFECT_OPS = 512;
const DEV_CAMPAIGN_COLLECTION = "campaign";

function readDevCampaign(campaignId: string): CampaignDoc {
  const raw =
    readDevDocument<CampaignDoc>(DEV_CAMPAIGN_COLLECTION, campaignId) ??
    resolveDevCampaign(campaignId);
  // Route fixture/local snapshots through the SAME defensive boundary as Firestore.
  return toCampaignDoc(campaignId, raw as unknown as Record<string, unknown>);
}

/**
 * Generate a cryptographically-random invite code. Doubles as the campaign
 * document id, so it must be unguessable: 14 chars over a 32-symbol alphabet
 * (~70 bits) is ample for a private group while staying shareable.
 */
function generateInviteCode(): string {
  const bytes = new Uint8Array(INVITE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length] ?? "").join(
    ""
  );
}

function campaignDoc(campaignId: string) {
  return doc(db, "campaigns", campaignId);
}

/**
 * The character doc ref (`/users/{uid}/characters/{charId}`) — mirrors
 * `src/lib/firestore.ts`'s private `charDoc`. Built HERE (not imported) so the D9
 * attach transaction can claim the one-campaign lock (`attachedCampaignId`) on the
 * character doc without pulling the character-I/O module — and its Storage / Functions
 * imports — into the campaign boundary's graph.
 */
function memberCharacterDoc(uid: string, charId: string) {
  return doc(db, "users", uid, "characters", charId);
}

/**
 * Parse a campaign document off the wire. Every date-bearing field — top-level
 * `createdAt`/`updatedAt` AND the array-nested ones Firestore does NOT
 * auto-convert (`treasuryLog[].at`, …) — is normalized
 * in one pass by the generic `timestampsToDates` deep-walker, so a future nested
 * date field is covered by construction (no per-field shim to forget, no
 * `Timestamp` leaking into a `.getTime()` call).
 *
 * This is the SINGLE untrusted-input boundary for `/campaigns/{id}` — every
 * campaign surface (Party · DmTools · Chronicle · CampaignsList) reads the doc
 * this returns. The one rule-10-sanctioned ONE-WAY read-normalization lives here:
 * a member's attached-character snapshot with a CORRUPT (empty/whitespace/non-string)
 * name is REJECTED — its `character` is dropped to `null` (the member renders as
 * "no character attached", never with an invented "Unnamed" name and never crashing
 * a downstream `name.trim()`/`<Portrait>`). A stale nameless snapshot ALREADY in
 * Firestore self-heals on the member's next save (`buildMemberSnapshot` re-stamps a
 * guaranteed-non-empty name). We never write the dropped value back (read-only).
 */
function toCampaignDoc(id: string, data: Record<string, unknown>): CampaignDoc {
  const doc = { ...timestampsToDates(data), id } as CampaignDoc;
  // C8 — NO `encounter.turnIndex` read-shim is needed here. The current EncounterState
  // tracks a STABLE `currentCombatantId` (not a sort index); an old `turnIndex` could
  // only exist on a campaign doc written by pre-C6 code. But the whole campaigns/
  // encounter feature is UNDEPLOYED (live users are on pre-campaigns v0.14.0), so NO
  // live campaign doc carries an encounter at all — encounters are seeded fresh by the
  // DM (`encounter.ts` → `startEncounter`, `currentCombatantId = combatants[0].id`).
  // Adding a `turnIndex → combatants[i].id` conform would be day-one dead code (rule 10).
  return {
    ...doc,
    memberDetails: conformCampaignMembers(doc.memberDetails),
    ...(doc.encounter
      ? {
          encounter: {
            ...conformEncounterCreatures(doc.encounter),
            ...(doc.encounter.effectOps
              ? { effectOps: conformCombatEffectOps(doc.encounter.effectOps) }
              : {}),
          },
        }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCombatantRef(value: unknown): boolean {
  if (!isRecord(value) || !isString(value.combatantId)) return false;
  if (value.kind === "monster") {
    return (
      value.tokenIndex === undefined ||
      (typeof value.tokenIndex === "number" &&
        Number.isInteger(value.tokenIndex) &&
        value.tokenIndex >= 0)
    );
  }
  return value.kind === "pc" && isString(value.memberUid) && isString(value.characterId);
}

function isCombatEffectDuration(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.kind === "encounter") return true;
  if (value.kind === "concentration") {
    return isString(value.actorId) && isString(value.sourceId);
  }
  return (
    value.kind === "turn-boundary" &&
    isString(value.combatantId) &&
    typeof value.round === "number" &&
    Number.isFinite(value.round) &&
    (value.phase === "turn-start" || value.phase === "turn-end")
  );
}

function isActiveCombatEffect(value: unknown): value is ActiveCombatEffect {
  if (!isRecord(value)) return false;
  const source = value.source;
  const payload = value.payload;
  const validPayload =
    isRecord(payload) &&
    isString(payload.activeKey) &&
    ((payload.kind === "grant-group" &&
      (payload.phase === undefined ||
        payload.phase === "active" ||
        payload.phase === "aftereffect")) ||
      (payload.kind === "target-mark" &&
        (payload.scope === "marked" || payload.scope === "cursed")));
  const validBindings =
    value.bindings === undefined ||
    (isRecord(value.bindings) &&
      (value.bindings.spellcastingModifier === undefined ||
        (typeof value.bindings.spellcastingModifier === "number" &&
          Number.isFinite(value.bindings.spellcastingModifier))));
  const validApplied =
    value.applied === undefined ||
    (isRecord(value.applied) &&
      (value.applied.currentHpDelta === undefined ||
        (typeof value.applied.currentHpDelta === "number" &&
          Number.isFinite(value.applied.currentHpDelta))));
  return (
    isString(value.id) &&
    isCombatantRef(value.actor) &&
    isCombatantRef(value.target) &&
    isRecord(source) &&
    source.kind === "spell" &&
    isString(source.id) &&
    isString(source.actionId) &&
    validPayload &&
    validBindings &&
    validApplied &&
    isCombatEffectDuration(value.duration)
  );
}

/**
 * Tolerant read boundary for the append-only effect ledger. Firestore rules protect
 * regular writes, but DM/admin tools and legacy documents can still contain adverse
 * shapes. Invalid applications and revocations whose stored provenance does not match
 * their application are ignored before engine consumers dereference nested fields.
 */
export function conformCombatEffectOps(raw: unknown): CombatEffectOp[] {
  if (!Array.isArray(raw)) return [];
  const valid: CombatEffectOp[] = [];
  const effects = new Map<string, ActiveCombatEffect>();
  for (const value of raw) {
    if (!isRecord(value) || !isString(value.id)) continue;
    if (value.kind === "apply" && isActiveCombatEffect(value.effect)) {
      const operation: CombatEffectOp = {
        id: value.id,
        kind: "apply",
        effect: value.effect,
      };
      valid.push(operation);
      if (!effects.has(value.effect.id)) effects.set(value.effect.id, value.effect);
      continue;
    }
    if (
      value.kind !== "revoke" ||
      !isString(value.effectId) ||
      !isString(value.actorId) ||
      !isString(value.targetId)
    ) {
      continue;
    }
    const effect = effects.get(value.effectId);
    if (
      !effect ||
      effect.actor.combatantId !== value.actorId ||
      effect.target.combatantId !== value.targetId
    ) {
      continue;
    }
    valid.push({
      id: value.id,
      kind: "revoke",
      effectId: value.effectId,
      actorId: value.actorId,
      targetId: value.targetId,
    });
  }
  return valid;
}

/**
 * Reject a member's attached-character snapshot whose `name` is NOT a non-empty
 * string (the reject-at-boundary half of non-nullability, owner directive
 * 2026-06-15). A corrupt snapshot's `character` is set to `null` — the member is
 * KEPT (a real party member) but rendered as "no character attached", never with a
 * placeholder name. A member with no character (`character == null`) or a valid
 * snapshot passes through untouched. Pure; never mutates the input. Exported so the
 * dev-bypass hub can route its in-memory fixture through the SAME boundary the real
 * Firestore read uses (so the corrupt-skip behaviour is identical in dev).
 */
export function conformCampaignMembers(raw: unknown): CampaignDoc["memberDetails"] {
  // `raw` is the off-the-wire value — a malformed/partial campaign doc may have no
  // `memberDetails` at all (or a non-object), so we narrow from `unknown` and default
  // to an empty map rather than crash (the whole point of a read-side conform:
  // tolerate adverse persisted shapes).
  if (typeof raw !== "object" || raw === null) return {};
  const memberDetails = raw as CampaignDoc["memberDetails"];
  const conformed: CampaignDoc["memberDetails"] = {};
  for (const [uid, member] of Object.entries(memberDetails)) {
    conformed[uid] =
      member.character && nonEmptyString(member.character.name) === null
        ? { ...member, character: null }
        : member;
  }
  return conformed;
}

/**
 * Create a campaign owned by `uid` (A13 invariants: the creator is in `members`,
 * is recorded as `createdBy`, and is the `dmUid`). Returns the new campaign id,
 * which equals its invite code. Seeds an empty treasury / log (notes are their own
 * subcollection, created lazily on the first note).
 */
export async function createCampaign(
  uid: string,
  opts: { name: string; displayName?: string; photoURL?: string | null }
): Promise<string> {
  const code = generateInviteCode();
  // Dev bypass persists nothing (no real auth → a real write would be denied);
  // the hub seeds a fixture for the returned code. Mirrors `updateCampaign`.
  if (devBypassEnabled()) return code;
  const payload = {
    name: opts.name,
    createdBy: uid,
    dmUid: uid,
    members: [uid],
    memberDetails: {
      [uid]: {
        displayName: opts.displayName ?? "",
        // The DM's Google photo — the party avatar before a character is attached.
        photoURL: opts.photoURL ?? null,
        characterId: null,
        role: "dm" as const,
      },
    },
    status: "active" as const,
    inviteCode: code,
    treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
  };
  // The two `serverTimestamp()` sentinels are added AFTER `stripUndefined` (the
  // proven `createCharacter` discipline — src/lib/firestore.ts), never THROUGH it:
  // a `FieldValue` sentinel is a plain class instance with one enumerable field
  // (`_methodName`), so `stripUndefined` — which special-cases only `Date` /
  // `Timestamp` — would recurse INTO it and flatten the sentinel to a dead
  // `{ _methodName: "serverTimestamp" }` map. Firestore would then persist that map
  // verbatim instead of stamping the server time, so `createdAt` read back as a
  // plain object (never a `Date`) and the list card's "Iniziata {date}" never
  // rendered for an app-created campaign (the fixture-injected demo carried a real
  // Timestamp, so only IT showed a date). `updatedAt` self-healed on the next
  // update (which adds it outside `stripUndefined`); `createdAt`, written once, did
  // not — so it stayed blank forever until this fix.
  await setDoc(campaignDoc(code), {
    ...(stripUndefined(payload) as Record<string, unknown>),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return code;
}

/**
 * Join the campaign whose invite code is `inviteCode` (== its document id).
 *
 * IDEMPOTENT BY CONSTRUCTION — re-opening a still-shared invite link as an
 * already-attached member must NEVER wipe the character (the production
 * data-loss bug: a re-join used to whole-object-overwrite the member's
 * `memberDetails` entry, dropping `characterId` + the `character` snapshot).
 * Two independent safeguards:
 *
 *   1. **No-op guard.** An EXISTING member can read the campaign (rules
 *      `get: isMember`); a brand-new joiner's read is DENIED and caught
 *      (→ treated as a first join). If the read confirms we are already in
 *      `members`, we return immediately and write NOTHING — re-clicking the
 *      link is a pure no-op (also saves a write, free-tier).
 *   2. **Attachment-blind write.** The first-join write below adds the member
 *      via `arrayUnion` (idempotent) and seeds ONLY their identity fields via
 *      per-leaf field paths. It deliberately NEVER writes `characterId` or
 *      `character` — those belong exclusively to {@link setMemberCharacter}
 *      (attach/detach). So even if a read failure (offline) misclassified an
 *      existing member as new, this write can still never drop an attachment.
 *
 * A new member's entry has no `characterId`/`character` key yet (the reads
 * default both to "no character attached" + the Party attach picker), exactly
 * the freshly-joined state. The "controlled self-join" rule validates that only
 * the caller's own uid + `memberDetails` entry change. Returns the joined
 * campaign id. Throws if the code is invalid (the document does not exist).
 */
export async function joinCampaign(
  uid: string,
  inviteCode: string,
  displayName = "",
  photoURL: string | null = null
): Promise<string> {
  // Dev bypass persists nothing; the hub seeds a fixture for this code.
  if (devBypassEnabled()) return inviteCode;
  // Safeguard 1 — no-op for an already-joined member (an existing member can
  // read; a new joiner's read is denied → caught → treated as a first join).
  const snap = await getDoc(campaignDoc(inviteCode)).catch(() => null);
  if (snap && snap.exists()) {
    const members = (snap.data() as Partial<CampaignDoc>).members;
    if (members?.includes(uid)) return inviteCode;
  }
  // Safeguard 2 — first-join write: identity-only, attachment-blind (no
  // characterId/character), so a re-join can never clobber an attachment.
  await updateDoc(campaignDoc(inviteCode), {
    members: arrayUnion(uid),
    [`memberDetails.${uid}.displayName`]: displayName,
    // The joiner's Google photo — the party avatar before a character is attached.
    [`memberDetails.${uid}.photoURL`]: photoURL ?? null,
    [`memberDetails.${uid}.role`]: "player",
    updatedAt: serverTimestamp(),
  });
  return inviteCode;
}

/**
 * D29 — attach (or detach) the CURRENT member's character to a campaign: writes
 * their own `memberDetails.<uid>.characterId` + the denormalized `character`
 * snapshot the party reads (rules let a member write only their own entry). Pass
 * `null` to detach. No-op under dev bypass (the caller updates the store
 * optimistically; the seeded fixture has no backend).
 */
export async function setMemberCharacter(
  campaignId: string,
  uid: string,
  characterId: string | null,
  snapshot: MemberCharacterSnapshot | null
): Promise<void> {
  if (devBypassEnabled()) return;
  await updateDoc(campaignDoc(campaignId), {
    [`memberDetails.${uid}.characterId`]: characterId,
    // Strip undefined first — the snapshot's optional fields (subclass / ac / hpMax)
    // are absent for some characters, and Firestore rejects an undefined value.
    [`memberDetails.${uid}.character`]: snapshot ? stripUndefined(snapshot) : null,
    updatedAt: serverTimestamp(),
  });
}

/** The result of an atomic attach: the claim succeeded, or the character was already
 *  claimed by a DIFFERENT campaign (D9 — the caller reverts + tells the player). */
export type AttachOutcome = "attached" | "conflict";

/**
 * D9 ATTACH SEAM (B07) — atomically CLAIM the character for THIS campaign and write the
 * member's `characterId` + denormalized `character` snapshot, closing the two-device
 * TOCTOU race that let one hero attach to TWO campaigns at once.
 *
 * A `runTransaction` re-reads the CHARACTER doc's `attachedCampaignId` claim FRESH
 * inside the txn and aborts (`"conflict"`) when the hero is already claimed by a
 * DIFFERENT campaign ({@link attachViolatesOneCampaign}). Because the character doc is
 * in the txn's READ set, Firestore's optimistic-concurrency retry serializes two racing
 * attaches: the first commits the claim; the loser's txn re-runs, re-reads the
 * now-claimed doc, and aborts — so both can never commit. On success it writes, in ONE
 * atomic transaction: the campaign's `memberDetails.<uid>` entry, the newly-attached
 * character's `attachedCampaignId` claim, and (on a swap/detach) the previously-attached
 * character's claim CLEARED so it can attach elsewhere. Detach (`nextCharacterId ===
 * null`) just releases the prior claim — no gate, no race to close.
 *
 * `attachedCampaignId` is an INTERNAL lock field on the character doc — written/read
 * only here. The parent-doc auto-save uses `updateDoc` (merge), so it never clobbers
 * the field, and nothing surfaces it into the typed `CharacterDoc`. The character write
 * is owner-only per `firestore.rules`; the campaign write touches only the caller's own
 * `memberDetails` entry — both permitted for the attaching member. No-op ("attached")
 * under dev bypass (the caller updates the store optimistically).
 */
export async function attachMemberCharacter(
  campaignId: string,
  uid: string,
  prevCharacterId: string | null,
  nextCharacterId: string | null,
  snapshot: MemberCharacterSnapshot | null
): Promise<AttachOutcome> {
  if (devBypassEnabled()) return "attached";
  const campaignRef = campaignDoc(campaignId);
  return runTransaction(db, async (txn) => {
    // Gate the character being attached against a claim by a DIFFERENT campaign. The
    // FRESH read inside the txn is what makes the race un-winnable twice — ALL reads
    // must precede ALL writes, so this stays first.
    if (nextCharacterId) {
      const charRef = memberCharacterDoc(uid, nextCharacterId);
      const charSnap = await txn.get(charRef);
      const claimed = charSnap.data()?.attachedCampaignId as string | undefined;
      if (attachViolatesOneCampaign(claimed, campaignId)) return "conflict";
      txn.update(charRef, { attachedCampaignId: campaignId });
    }
    // A swap/detach releases the PREVIOUS character's claim so it can attach elsewhere.
    if (prevCharacterId && prevCharacterId !== nextCharacterId) {
      txn.update(memberCharacterDoc(uid, prevCharacterId), {
        attachedCampaignId: deleteField(),
      });
    }
    txn.update(campaignRef, {
      [`memberDetails.${uid}.characterId`]: nextCharacterId,
      // Strip undefined first — the snapshot's optional fields (subclass / ac / hpMax)
      // are absent for some characters, and Firestore rejects an undefined value.
      [`memberDetails.${uid}.character`]: snapshot ? stripUndefined(snapshot) : null,
      updatedAt: serverTimestamp(),
    });
    return "attached";
  });
}

/**
 * D29 — transfer the DM role from `oldDmUid` to `newDmUid`: the campaign's `dmUid`
 * plus the two members' `role`s flip in one write. Permitted for the current DM or
 * the admin (the rules gate it). No-op under dev bypass (the caller updates the
 * store optimistically).
 */
export async function yieldDmRole(
  campaignId: string,
  oldDmUid: string,
  newDmUid: string
): Promise<void> {
  if (devBypassEnabled()) return;
  await updateDoc(campaignDoc(campaignId), {
    dmUid: newDmUid,
    [`memberDetails.${newDmUid}.role`]: "dm",
    [`memberDetails.${oldDmUid}.role`]: "player",
    updatedAt: serverTimestamp(),
  });
}

/**
 * Remove a member from the campaign (DM-only — `firestore.rules` gives the DM/admin an
 * unconstrained roster write): drop the uid from `members` (`arrayRemove`), delete their
 * whole `memberDetails` entry (`deleteField`), AND — B03 — splice their `pc-<uid>`
 * combatant out of any RUNNING encounter.
 *
 * A removed member's PC combatant is NOT harmless: while gathering it counts toward the
 * Begin-turns total forever (an orphan that can never roll → the gate locks with no UI to
 * remove it); once turns begin it renders as an invisible, un-highlightable turn slot
 * `advanceTurn` still steps onto. So this runs in a `runTransaction` that reads the
 * encounter FRESH and prunes the combatant through the SAME {@link removeCombatant}
 * reducer, writing ONLY the touched encounter fields via dot-paths (never the whole map —
 * mirroring {@link advanceEncounterTurn}). Reading fresh means a concurrent turn advance
 * is preserved: `removeCombatant` only re-points `currentCombatantId` when the removed PC
 * WAS current, so writing it back is otherwise a no-op on the value we just read, and
 * Firestore retries the txn if an advance commits in between. When no encounter (or no
 * such combatant) exists the txn writes only the roster drop. No-op under dev bypass (the
 * caller prunes the store optimistically).
 */
export async function removeMember(campaignId: string, uid: string): Promise<void> {
  if (devBypassEnabled()) return;
  const ref = campaignDoc(campaignId);
  const combatantId = `pc-${uid}`;
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    const encounter = (snap.data()?.encounter ?? null) as EncounterState | null;
    const update: Record<string, unknown> = {
      members: arrayRemove(uid),
      [`memberDetails.${uid}`]: deleteField(),
      updatedAt: serverTimestamp(),
    };
    if (encounter?.combatants.some((c) => c.id === combatantId)) {
      const pruned = removeCombatant(encounter, combatantId);
      update["encounter.combatants"] = pruned.combatants;
      update["encounter.currentCombatantId"] = pruned.currentCombatantId;
      update["encounter.round"] = pruned.round;
      update["encounter.order"] = pruned.order ?? [];
    }
    txn.update(ref, update);
  });
}

/**
 * Lock (or re-open) new member joins — the no-migration kill switch for a leaked
 * invite link. The invite code IS the campaign doc id, so rotating it would need an
 * architecture migration; instead `joinsLocked: true` makes the `firestore.rules`
 * self-join path deny, so the link stops admitting anyone new while current members
 * stay. DM-only (the unconstrained `isDm()`/`isAdmin()` update branch). Re-opening
 * clears it. No-op under dev bypass (the caller updates the store optimistically).
 */
export async function setJoinsLocked(campaignId: string, locked: boolean): Promise<void> {
  if (devBypassEnabled()) return;
  await updateDoc(campaignDoc(campaignId), {
    joinsLocked: locked,
    updatedAt: serverTimestamp(),
  });
}

/**
 * N4 — set (or clear) a campaign's custom banner: writes `bannerUrl` +
 * `bannerCrop` immediately (any member may; the rules allow shared-artifact
 * writes). Pass `null` for both to clear back to the default art. No-op under dev
 * bypass (the caller updates the store optimistically).
 */
export async function setCampaignBanner(
  campaignId: string,
  bannerUrl: string | null,
  bannerCrop: PortraitCrop | null
): Promise<void> {
  if (devBypassEnabled()) return;
  await updateDoc(campaignDoc(campaignId), {
    bannerUrl,
    bannerCrop,
    updatedAt: serverTimestamp(),
  });
}

/**
 * INIT-6 — advance (or step back) the SHARED encounter turn pointer, the ONE source of
 * truth (`campaign.encounter.{currentCombatantId, round}`), through ONE transaction for
 * BOTH the DM and a player advancing their own turn (the debounced whole-encounter writer
 * is reserved for STRUCTURE). A `runTransaction` re-reads the encounter FRESH inside the
 * txn (so a concurrent DM/player advance never double-steps — the id-based
 * {@link advanceTurn}/{@link prevTurn} step from the live pointer), RE-VALIDATES that the
 * caller may advance (the DM, or the player who OWNS the current turn — the rules can't
 * iterate the combatants array to prove this, so the strict who-is-current check lives
 * here, inside the txn, on the fresh state), then writes ONLY the two turn fields with a
 * DOT-PATH update: the diff `affectedKeys()` is exactly `{currentCombatantId, round}`,
 * which the `firestore.rules` `turnFieldsOnlyChanged()` member grant allows (combatants /
 * status / roster untouched). It deliberately does NOT use the debounced whole-encounter
 * writer (`selectCampaignSave`), which ships the entire map (failing the member rule and
 * clobbering concurrent monster edits). Aborts as a tolerant no-op when no encounter
 * exists, the turn hasn't begun, or the caller may not advance. No-op under dev bypass.
 *
 * The turn order is read FRESH from the encounter's FROZEN `order` field INSIDE the txn —
 * NOT a caller-supplied live sort — so the DM, a player, the sheet, the hub, and the pip
 * all step the IDENTICAL sequence with no cross-member reads (the disease this cured: the
 * order used to be recomputed per-caller and diverged). A concurrent DM reorder is picked
 * up on the next step (the re-read), so two writers never corrupt the pointer.
 *
 * DOUBLE-ACTIVATION CAS (owner, 2026-07-04 — "double-click skips turns"): `expectedCurrentId`
 * is the pointer the CALLER saw when they pressed. The txn aborts as a clean no-op when the
 * FRESH pointer no longer equals it — so a second rapid click (which carries the SAME expected
 * pointer as the first, the render not yet reconciled) finds the turn already moved and does
 * nothing, instead of stepping a SECOND time and skipping a combatant. The DM path (which skips
 * the ownership check) relied on nothing but the fresh read before; this is its guard. A player
 * was already protected by the ownership re-validation below (after their turn advances they no
 * longer own the pointer), so the CAS simply makes every advancer uniformly single-step.
 */
export async function advanceEncounterTurn(
  campaignId: string,
  dir: "next" | "prev",
  caller: { uid: string | undefined; isDm: boolean },
  expectedCurrentId: string | null
): Promise<void> {
  if (devBypassEnabled()) {
    const encounter = currentDevEncounter(campaignId);
    if (!encounter || encounter.currentCombatantId !== expectedCurrentId) return;
    if (!caller.isDm && encounter.currentCombatantId !== `pc-${caller.uid}`) return;
    const next = dir === "next" ? advanceTurn(encounter) : prevTurn(encounter);
    useCampaignStore.getState().setEncounter(next);
    if (dir === "next") {
      const position = encounterPosition(next);
      for (const effect of expiredCombatEffects(encounter.effectOps, position)) {
        const revoke = makeRevokeCombatEffectOp(
          currentDevEncounter(campaignId)?.effectOps,
          effect.id
        );
        if (!revoke) continue;
        appendPersistentCombatEffectOpOptimistic(campaignId, revoke);
        const successor = endedEffectSuccessor(effect, position);
        if (successor) {
          appendPersistentCombatEffectOpOptimistic(
            campaignId,
            makePersistentApplyOperation(successor)
          );
        }
      }
    }
    return;
  }
  const ref = campaignDoc(campaignId);
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    const encounter = (snap.data()?.encounter ?? null) as EncounterState | null;
    if (!encounter) return; // tolerant: a member can't conjure a turn
    if (encounter.currentCombatantId === null) return; // turns not begun yet
    // CAS: the turn already moved since the caller pressed (a stale double-click) → no-op.
    if (encounter.currentCombatantId !== expectedCurrentId) return;
    // Re-validate against the FRESH pointer: the DM always may; a player only when their
    // PC is the current combatant. Coarse rules let any member move the pointer, so this
    // is the authoritative who-is-current check (tolerant no-op otherwise).
    const ownsCurrentTurn = encounter.currentCombatantId === `pc-${caller.uid}`;
    if (!caller.isDm && !ownsCurrentTurn) return;
    const next = dir === "next" ? advanceTurn(encounter) : prevTurn(encounter);
    const position = {
      order: next.order ?? [],
      currentCombatantId: next.currentCombatantId,
      round: next.round,
      phase: "turn-start" as const,
    };
    const lifecycleOps: CombatEffectOp[] = [];
    let workingOps = encounter.effectOps ?? [];
    if (dir === "next") {
      for (const effect of expiredCombatEffects(workingOps, position)) {
        const revoke = makeRevokeCombatEffectOp(workingOps, effect.id);
        if (!revoke) continue;
        lifecycleOps.push(revoke);
        workingOps = appendCombatEffectOp(workingOps, revoke) ?? workingOps;
        const successor = endedEffectSuccessor(effect, position);
        if (!successor) continue;
        const apply = makePersistentApplyOperation(successor);
        lifecycleOps.push(apply);
        workingOps = appendCombatEffectOp(workingOps, apply) ?? workingOps;
      }
    }
    if (lifecycleOps.length === 0) {
      txn.update(ref, {
        "encounter.currentCombatantId": next.currentCombatantId,
        "encounter.round": next.round,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    await applyPersistentCombatEffectOperations(
      txn,
      ref,
      snap.data() as CampaignDoc,
      encounter,
      lifecycleOps,
      {
        "encounter.currentCombatantId": next.currentCombatantId,
        "encounter.round": next.round,
      }
    );
  });
}

/** The index of the first LIVE token in a monster group (`hp > 0`) — the token a
 *  player's declared damage lands on; falls back to `0` when the whole group is down
 *  (a re-hit on a dead group is a clamp no-op via {@link setHp}). Pure. */
function firstLiveTokenIndex(tokens: ReadonlyArray<number>): number {
  const i = tokens.findIndex((hp) => hp > 0);
  return i < 0 ? 0 : i;
}

function pcCombatantRef(combatant: EncounterPc | undefined): CombatantRef | null {
  return combatant
    ? {
        kind: "pc",
        combatantId: combatant.id,
        memberUid: combatant.memberUid,
        characterId: combatant.characterId,
      }
    : null;
}

/** Shared numeric shape for reviewed monster HP changes. */
interface DeclaredAmountEffect {
  targetId: string;
  amount: number;
  /** Compatibility-only index for a legacy grouped monster that has not crossed the
   * campaign conform boundary yet. Current creature instances always use index 0. */
  tokenIndex?: number;
}

type DeclaredDamageEffect = DeclaredAmountEffect & {
  kind: "damage";
  damageType?: DamageType;
  damageSource?: DamageSource;
};

/** One target-facing consequence confirmed in the universal combat resolver. Damage,
 * healing, and conditions share one transaction so a multi-effect action lands as one
 * reviewable change. */
export type DeclaredCombatEffect =
  | DeclaredDamageEffect
  | ({ kind: "healing" } & DeclaredAmountEffect)
  | ({ kind: "temp-hp" } & DeclaredAmountEffect)
  | {
      kind: "condition";
      targetId: string;
      conditionId: string;
      active: boolean;
    }
  | {
      kind: "granted-die";
      targetId: string;
      dieKind: "bardic-inspiration";
      die: string;
    };

/** The live, already-authorized combat slice the resolver shows for a PC target. */
export interface DeclaredPcTargetSnapshot {
  targetId: string;
  memberUid: string;
  characterId: string;
  currentHp: number;
  tempHp: number;
  maxHp: number;
  conditions: string[];
  bardicInspirationDie?: string;
  defenses: DamageDefenses;
}

/** Provenance + target snapshots for one reviewed action resolution. */
export interface DeclaredCombatContext {
  actorId: string;
  action: LocText;
  round: number;
  pcTargets: ReadonlyArray<DeclaredPcTargetSnapshot>;
  /** Successful attack-hit targets. Kept separate from damage so a 0-damage hit
   * can still trigger deterministic reactions. */
  hitTargetIds?: ReadonlyArray<string>;
  attackMode?: "melee" | "ranged";
}

type UnstampedCombatChronicleEvent<T = CombatChronicleEvent> =
  T extends CombatChronicleEvent ? Omit<T, "id" | "round"> : never;

interface DirectPcEffectResult {
  target: DeclaredPcTargetSnapshot;
  hp: { current: number; temp: number };
  conditions: string[];
  bardicInspirationDie?: string;
  resetDeathSaves: boolean;
  events: CombatChronicleEvent[];
  transfers: Array<{
    target: CombatantRef;
    amount: number;
    effectId: string;
    actorId?: string;
    action?: LocText;
    damageType?: DamageType;
    damageSource?: DamageSource;
  }>;
  consumedEffectIds: string[];
}

/**
 * Reduce one PC's reviewed effects from the exact live values shown in the resolver.
 * The returned patch touches ONLY combat-mutable fields, so an offline peer write can
 * never overwrite the target's build, inventory, resources, or recent-action history.
 */
export function reduceDirectPcEffects(
  target: DeclaredPcTargetSnapshot,
  effects: ReadonlyArray<DeclaredCombatEffect>,
  provenance: {
    actorId: string;
    action: LocText;
    round: number;
    persistentEffects?: ReadonlyArray<ActiveCombatEffect>;
    hit?: { attacker: CombatantRef | null; attackMode?: "melee" | "ranged" };
  }
): DirectPcEffectResult | null {
  let current = Math.max(0, Math.min(target.maxHp, Math.round(target.currentHp)));
  let temp = Math.max(0, Math.round(target.tempHp));
  let conditions = [...target.conditions];
  let bardicInspirationDie = target.bardicInspirationDie;
  let resetDeathSaves = false;
  const events: CombatChronicleEvent[] = [];
  const transfers: DirectPcEffectResult["transfers"] = [];
  const consumedEffectIds = new Set<string>();
  let eventIndex = 0;
  const stamp = (event: UnstampedCombatChronicleEvent): CombatChronicleEvent => ({
    ...event,
    // These are reducer-local ids only. The transaction re-stamps every landed beat
    // through the Chronicle's append seam after it has read the fresh encounter.
    id: String(eventIndex++),
    round: provenance.round,
  });

  for (const effect of effects) {
    if (effect.targetId !== target.targetId) continue;
    if (effect.kind === "granted-die") {
      if (bardicInspirationDie !== effect.die) {
        bardicInspirationDie = effect.die;
        events.push(
          stamp({
            kind: "resource-grant",
            targetId: target.targetId,
            resource: "bardic-inspiration-die",
            value: effect.die,
            actorId: provenance.actorId,
            action: provenance.action,
          })
        );
      }
      continue;
    }
    if (effect.kind === "condition") {
      const had = conditions.includes(effect.conditionId);
      conditions = effect.active
        ? [...new Set([...conditions, effect.conditionId])]
        : conditions.filter((condition) => condition !== effect.conditionId);
      if (had !== effect.active) {
        events.push(
          stamp({
            kind: effect.active ? "condition-gain" : "condition-loss",
            targetId: target.targetId,
            conditionId: effect.conditionId,
            ...(effect.active
              ? { attackerId: provenance.actorId }
              : { actorId: provenance.actorId }),
            action: provenance.action,
          })
        );
      }
      continue;
    }
    let amount = Math.max(0, Math.round(effect.amount));
    if (amount === 0) continue;
    if (effect.kind === "temp-hp") {
      if (amount > temp) {
        for (const effectId of tempHpBoundEffectIds(provenance.persistentEffects ?? [])) {
          consumedEffectIds.add(effectId);
        }
      }
      temp = Math.max(temp, amount);
      continue;
    }
    if (effect.kind === "healing") {
      const before = current;
      current = Math.min(target.maxHp, current + amount);
      const landed = current - before;
      if (before === 0 && current > 0) {
        resetDeathSaves = true;
        conditions = conditions.filter((condition) => condition !== "unconscious");
      }
      if (landed > 0) {
        events.push(
          stamp({
            kind: "hp-heal",
            targetId: target.targetId,
            amount: landed,
            current,
            max: target.maxHp,
            actorId: provenance.actorId,
            action: provenance.action,
          })
        );
      }
      continue;
    }
    const outcome = resolvePersistentDamage(
      (provenance.persistentEffects ?? []).filter(
        (active) => !consumedEffectIds.has(active.id)
      ),
      {
        currentHp: current,
        tempHp: temp,
        incomingDamage: amount,
        ...(effect.damageType
          ? {
              damageType: effect.damageType,
              damageSource: effect.damageSource,
              defenses: target.defenses,
            }
          : {}),
      }
    );
    amount = outcome.targetDamage;
    transfers.push(...outcome.transfers);
    for (const effectId of outcome.consumedEffectIds) consumedEffectIds.add(effectId);
    const beforeCurrent = current;
    const beforeTemp = temp;
    const absorbed = Math.min(temp, amount);
    temp -= absorbed;
    current = Math.max(0, current - (amount - absorbed));
    const landed = beforeCurrent - current + (beforeTemp - temp);
    if (landed > 0) {
      events.push(
        stamp({
          kind: "hp-damage",
          targetId: target.targetId,
          amount: landed,
          current,
          max: target.maxHp,
          ...(absorbed > 0 ? { tempAbsorbed: absorbed } : {}),
          attackerId: provenance.actorId,
          action: provenance.action,
        })
      );
      if (beforeCurrent > 0 && current === 0) {
        events.push(stamp({ kind: "down", targetId: target.targetId }));
      }
    }
  }

  if (provenance.hit) {
    const retaliations = resolvePersistentHit(provenance.persistentEffects ?? [], {
      attacker: provenance.hit.attacker,
      attackMode: provenance.hit.attackMode,
      tempHp: target.tempHp,
    });
    transfers.push(
      ...retaliations.map((retaliation) => ({
        target: retaliation.target,
        amount: retaliation.amount,
        effectId: retaliation.effectId,
        actorId: retaliation.actor.combatantId,
        action: srdText("spell", retaliation.sourceId, "name"),
        damageType: retaliation.damageType,
        damageSource: "spell" as const,
      }))
    );
  }

  const changed =
    current !== target.currentHp ||
    temp !== target.tempHp ||
    conditions.join("\u0000") !== target.conditions.join("\u0000") ||
    bardicInspirationDie !== target.bardicInspirationDie ||
    transfers.length > 0 ||
    consumedEffectIds.size > 0;
  return changed
    ? {
        target,
        hp: { current, temp },
        conditions,
        ...(bardicInspirationDie !== undefined ? { bardicInspirationDie } : {}),
        resetDeathSaves,
        events,
        transfers,
        consumedEffectIds: [...consumedEffectIds],
      }
    : null;
}

/** Apply every reviewed target consequence in one fresh-read transaction. The acting
 * client writes a table-mate's narrow combat subdocument directly, so the target may be
 * offline; reading that subdocument inside the transaction also prevents two simultaneous
 * effects from reducing the same stale HP snapshot. PC state, monster state, and Chronicle
 * provenance therefore commit together or not at all. */
export async function applyDeclaredCombatEffects(
  campaignId: string,
  effects: ReadonlyArray<DeclaredCombatEffect>,
  context?: DeclaredCombatContext
): Promise<void> {
  const applicable: DeclaredCombatEffect[] = effects.filter(
    (effect) =>
      effect.kind === "condition" || effect.kind === "granted-die" || effect.amount > 0
  );
  for (const targetId of context?.hitTargetIds ?? []) {
    if (
      !applicable.some(
        (effect) => effect.kind === "damage" && effect.targetId === targetId
      )
    ) {
      applicable.push({ kind: "damage", targetId, amount: 0 });
    }
  }
  if (applicable.length === 0) return;
  if (devBypassEnabled()) {
    return applyDeclaredEffectsOptimistic(campaignId, applicable, context);
  }
  const ref = campaignDoc(campaignId);
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    const encounter = (snap.data()?.encounter ?? null) as EncounterState | null;
    if (!encounter) return; // tolerant: a member can't conjure a fight
    const campaign = snap.data() as CampaignDoc;
    const actor = context
      ? encounter.combatants.find((combatant) => combatant.id === context.actorId)
      : undefined;
    if (context && actor?.kind !== "pc") return;
    const attackerRef = pcCombatantRef(actor?.kind === "pc" ? actor : undefined);
    const hitTargetIds = new Set(context?.hitTargetIds ?? []);

    // Read every declared PC plus every PC that can receive a persistent transfer.
    // Firestore requires all reads before the first write; the transaction retries when
    // either the encounter or any involved combat slice changes underneath it.
    const relevantPcIds = new Set(applicable.map((effect) => effect.targetId));
    if (actor?.kind === "pc") relevantPcIds.add(actor.id);
    for (const effect of foldCombatEffectOps(encounter.effectOps)) {
      if (effect.actor.kind === "pc") relevantPcIds.add(effect.actor.combatantId);
      if (effect.target.kind === "pc") relevantPcIds.add(effect.target.combatantId);
    }
    const pcTargetMap = new Map(
      (context?.pcTargets ?? [])
        .filter((target) => relevantPcIds.has(target.targetId))
        .map((target) => [target.targetId, target])
    );
    if (actor?.kind === "pc" && !pcTargetMap.has(actor.id)) {
      const actorMax = campaignMemberHpMax(campaign, actor.memberUid);
      if (typeof actorMax === "number" && Number.isFinite(actorMax) && actorMax > 0) {
        pcTargetMap.set(actor.id, {
          targetId: actor.id,
          memberUid: actor.memberUid,
          characterId: actor.characterId,
          currentHp: actorMax,
          tempHp: 0,
          maxHp: actorMax,
          conditions: [],
          defenses: NO_DEFENSES,
        });
      }
    }
    for (const effect of foldCombatEffectOps(encounter.effectOps)) {
      for (const participant of [effect.actor, effect.target]) {
        if (participant.kind !== "pc" || pcTargetMap.has(participant.combatantId))
          continue;
        const baseMax = campaignMemberHpMax(campaign, participant.memberUid);
        if (typeof baseMax !== "number" || !Number.isFinite(baseMax) || baseMax <= 0)
          continue;
        const max =
          baseMax +
          effectsForTarget(encounter.effectOps, participant.combatantId).reduce(
            (sum, active) => sum + maxHpDeltaForEffect(active),
            0
          );
        pcTargetMap.set(participant.combatantId, {
          targetId: participant.combatantId,
          memberUid: participant.memberUid,
          characterId: participant.characterId,
          currentHp: max,
          tempHp: 0,
          maxHp: max,
          conditions: [],
          defenses: NO_DEFENSES,
        });
      }
    }
    const pcTargets = [...pcTargetMap.values()].map((target) => {
      const baseMax = campaignMemberHpMax(campaign, target.memberUid);
      if (typeof baseMax !== "number" || !Number.isFinite(baseMax) || baseMax <= 0)
        return target;
      return {
        ...target,
        maxHp:
          baseMax +
          effectsForTarget(encounter.effectOps, target.targetId).reduce(
            (sum, active) => sum + maxHpDeltaForEffect(active),
            0
          ),
      };
    });
    const pcRefs = pcTargets.map((target) =>
      combatStateRef(target.memberUid, target.characterId)
    );
    const pcSnaps = await Promise.all(pcRefs.map((combatRef) => txn.get(combatRef)));
    const validTargets = pcTargets.flatMap((target, index) => {
      const combatRef = pcRefs[index];
      if (!combatRef) return [];
      const combatant = encounter.combatants.find(
        (candidate) => candidate.id === target.targetId
      );
      if (
        combatant?.kind !== "pc" ||
        combatant.memberUid !== target.memberUid ||
        combatant.characterId !== target.characterId ||
        target.maxHp <= 0
      ) {
        return [];
      }
      const stored = pcSnaps[index]?.exists()
        ? parseCombatState(pcSnaps[index].data())
        : null;
      return [
        {
          target: {
            ...target,
            ...(stored
              ? {
                  currentHp: stored.hp.current,
                  tempHp: stored.hp.temp,
                  conditions: stored.conditions,
                  bardicInspirationDie: stored.bardicInspirationDie,
                }
              : {}),
          },
          ref: combatRef,
        },
      ];
    });
    const validById = new Map(
      validTargets.map((entry) => [entry.target.targetId, entry])
    );
    const directTargetIds = new Set(
      applicable
        .map(({ targetId }) => targetId)
        .filter((targetId) => validById.has(targetId))
    );
    const encounterEffects = applicable.filter(
      (effect) => !directTargetIds.has(effect.targetId)
    );
    const initialEffectOps = encounter.effectOps ?? [];
    let nextEffectOps = initialEffectOps;
    let chronicle = encounter;
    const latestTargets = new Map(
      validTargets.map(({ target }) => [target.targetId, target])
    );
    const changedTargets = new Map<string, DirectPcEffectResult>();
    const transferQueue: Array<
      DirectPcEffectResult["transfers"][number] & { path: ReadonlySet<string> }
    > = [];
    const consume = (effectIds: ReadonlyArray<string>): void => {
      for (const effectId of effectIds) {
        const operation = makeRevokeCombatEffectOp(nextEffectOps, effectId);
        if (!operation) continue;
        nextEffectOps = appendCombatEffectOp(nextEffectOps, operation) ?? nextEffectOps;
      }
    };
    const enqueueTransfers = (
      transfers: DirectPcEffectResult["transfers"],
      path: ReadonlySet<string> = new Set()
    ): void => {
      for (const transfer of transfers) {
        if (path.has(transfer.effectId)) continue;
        transferQueue.push({
          ...transfer,
          path: new Set([...path, transfer.effectId]),
        });
      }
    };
    for (const effect of encounterEffects) {
      if (effect.kind !== "damage") {
        chronicle = reduceDeclaredEffects(
          chronicle,
          [effect],
          context ? { actorId: context.actorId, action: context.action } : undefined
        );
        continue;
      }
      const result = reducePersistentMonsterDamage(
        chronicle,
        { ...effect, kind: "damage" },
        nextEffectOps,
        hitTargetIds.has(effect.targetId)
          ? { attacker: attackerRef, attackMode: context?.attackMode }
          : undefined,
        { actorId: context?.actorId, action: context?.action }
      );
      chronicle = result.encounter;
      enqueueTransfers(result.transfers);
      consume(result.consumedEffectIds);
    }
    const landPcResult = (
      result: DirectPcEffectResult,
      path: ReadonlySet<string> = new Set()
    ): void => {
      latestTargets.set(result.target.targetId, {
        ...result.target,
        currentHp: result.hp.current,
        tempHp: result.hp.temp,
        conditions: result.conditions,
      });
      const previous = changedTargets.get(result.target.targetId);
      changedTargets.set(result.target.targetId, {
        ...result,
        resetDeathSaves: result.resetDeathSaves || previous?.resetDeathSaves === true,
      });
      chronicle = recordDirectPcEffectEvents(chronicle, result.events);
      enqueueTransfers(result.transfers, path);
      consume(result.consumedEffectIds);
    };

    for (const targetId of directTargetIds) {
      const target = latestTargets.get(targetId);
      if (!target) continue;
      const result = reduceDirectPcEffects(target, applicable, {
        actorId: context?.actorId ?? "",
        action: context?.action ?? { custom: "" },
        round: encounter.round,
        persistentEffects: effectsForTarget(nextEffectOps, targetId),
        ...(hitTargetIds.has(targetId)
          ? { hit: { attacker: attackerRef, attackMode: context?.attackMode } }
          : {}),
      });
      if (!result) continue;
      landPcResult(result);
    }

    // Shared-damage links resolve from the same fresh snapshots. Each link occurrence
    // transfers at most once per original damage chain, preventing reciprocal bonds from
    // looping while still allowing the recipient's own resistance/one-shot ward to apply.
    while (transferQueue.length > 0) {
      const transfer = transferQueue.shift();
      if (!transfer) continue;
      if (transfer.target.kind === "pc") {
        const target = latestTargets.get(transfer.target.combatantId);
        if (!target) continue;
        const result = reduceDirectPcEffects(
          target,
          [
            {
              kind: "damage",
              targetId: target.targetId,
              amount: transfer.amount,
              ...(transfer.damageType ? { damageType: transfer.damageType } : {}),
              ...(transfer.damageSource ? { damageSource: transfer.damageSource } : {}),
            },
          ],
          {
            actorId: transfer.actorId ?? context?.actorId ?? "",
            action: transfer.action ?? context?.action ?? { custom: "" },
            round: encounter.round,
            persistentEffects: effectsForTarget(nextEffectOps, target.targetId),
          }
        );
        if (result) landPcResult(result, transfer.path);
      } else {
        const result = reducePersistentMonsterDamage(
          chronicle,
          {
            kind: "damage",
            targetId: transfer.target.combatantId,
            amount: transfer.amount,
            ...(transfer.damageType ? { damageType: transfer.damageType } : {}),
            ...(transfer.damageSource ? { damageSource: transfer.damageSource } : {}),
            ...(transfer.target.tokenIndex !== undefined
              ? { tokenIndex: transfer.target.tokenIndex }
              : {}),
          },
          nextEffectOps,
          undefined,
          {
            actorId: transfer.actorId ?? context?.actorId,
            action: transfer.action ?? context?.action,
          }
        );
        chronicle = result.encounter;
        enqueueTransfers(result.transfers, transfer.path);
        consume(result.consumedEffectIds);
      }
    }

    for (const [targetId, result] of changedTargets) {
      const combatRef = validById.get(targetId)?.ref;
      if (!combatRef) continue;
      txn.set(
        combatRef,
        {
          hp: result.hp,
          conditions: result.conditions,
          ...(result.bardicInspirationDie !== undefined
            ? { bardicInspirationDie: result.bardicInspirationDie }
            : {}),
          ...(result.resetDeathSaves
            ? { deathSaves: { successes: 0, failures: 0 } }
            : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
    const effectOpsChanged = nextEffectOps !== initialEffectOps;
    if (chronicle === encounter && changedTargets.size === 0 && !effectOpsChanged) return;
    txn.update(ref, {
      "encounter.combatants": chronicle.combatants,
      "encounter.events": chronicle.events ?? [],
      ...(effectOpsChanged ? { "encounter.effectOps": nextEffectOps } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * Drain effects queued by the previously deployed owner-client delivery model. New
 * actions never append here: {@link applyDeclaredCombatEffects} writes the narrow target
 * combat slice directly, so an offline target does not delay the table. Keeping this
 * one-way drain during the transition prevents an already-running live encounter from
 * losing a queued effect; the ids remain idempotent in the target combat state.
 */
export async function deliverQueuedMemberEffects(args: {
  campaignId: string;
  uid: string;
  characterId: string;
  targetId: string;
  maxHp: number;
}): Promise<void> {
  if (devBypassEnabled() || args.maxHp <= 0) return;
  const campaignRef = campaignDoc(args.campaignId);
  const combatRef = combatStateRef(args.uid, args.characterId);
  await runTransaction(db, async (txn) => {
    const [campaignSnap, combatSnap] = await Promise.all([
      txn.get(campaignRef),
      txn.get(combatRef),
    ]);
    const encounter = (campaignSnap.data()?.encounter ?? null) as EncounterState | null;
    if (!encounter) return;
    const target = encounter.combatants.find(
      (combatant) => combatant.id === args.targetId
    );
    if (
      target?.kind !== "pc" ||
      target.memberUid !== args.uid ||
      target.characterId !== args.characterId
    ) {
      return;
    }

    const queued = (encounter.memberEffects ?? []).filter(
      (effect) => effect.targetId === args.targetId
    );
    if (queued.length === 0) return;
    let combat = combatSnap.exists()
      ? parseCombatState(combatSnap.data())
      : defaultCombatState(args.maxHp);
    let chronicle = encounter;
    let changed = false;

    for (const effect of queued) {
      const before = combat;
      const after = reduceMemberCombatEffects(
        before,
        encounter.epoch,
        [effect],
        args.maxHp
      );
      if (after === before) continue;
      changed = true;
      combat = after;
      if (effect.kind === "condition") {
        const wasActive = before.conditions.includes(effect.conditionId);
        const isActive = after.conditions.includes(effect.conditionId);
        if (wasActive !== isActive) {
          chronicle = recordCondition(
            chronicle,
            args.targetId,
            effect.conditionId,
            isActive
          );
        }
        continue;
      }
      if (effect.kind === "temp-hp") continue;
      const landed =
        effect.kind === "healing"
          ? after.hp.current - before.hp.current
          : before.hp.current - after.hp.current + (before.hp.temp - after.hp.temp);
      if (landed <= 0) continue;
      chronicle = recordPcHp(chronicle, {
        targetId: args.targetId,
        kind: effect.kind === "healing" ? "heal" : "damage",
        amount: landed,
        preCurrent: before.hp.current,
        postCurrent: after.hp.current,
        max: args.maxHp,
      });
    }

    if (!changed) return;
    txn.set(combatRef, combatStateWriteData(combat));
    if (chronicle !== encounter) {
      txn.update(campaignRef, {
        "encounter.events": chronicle.events ?? [],
        updatedAt: serverTimestamp(),
      });
    }
  });
}

/**
 * Persist one standing target-bound effect as an append-only operation. The effect id
 * is the occurrence identity and therefore also gives the apply operation its stable
 * idempotency key. A transaction composes concurrent actions without replacing a
 * peer's operation log. Replaying the same occurrence is a clean no-op.
 */
export async function appendPersistentCombatEffect(
  campaignId: string,
  effect: ActiveCombatEffect
): Promise<void> {
  await appendPersistentCombatEffectOp(campaignId, makePersistentApplyOperation(effect));
}

function makePersistentApplyOperation(effect: ActiveCombatEffect): CombatEffectOp {
  const { applied: untrustedApplied, ...effectInput } = effect;
  void untrustedApplied;
  const currentHpDelta = currentHpDeltaForEffect(effect);
  const appliedEffect: ActiveCombatEffect = {
    ...effectInput,
    ...(currentHpDelta !== 0 ? { applied: { currentHpDelta } } : {}),
  };
  return stripUndefined({
    id: `apply:${appliedEffect.id}`,
    kind: "apply" as const,
    effect: appliedEffect,
  }) as CombatEffectOp;
}

/**
 * Revoke one exact effect occurrence. Actor/target ids are recovered from the stored
 * apply operation inside the fresh-read transaction, so callers cannot accidentally
 * address the right id with stale provenance. Missing/already-revoked ids are harmless.
 */
export async function revokePersistentCombatEffect(
  campaignId: string,
  effectId: string
): Promise<void> {
  if (devBypassEnabled()) {
    const encounter = currentDevEncounter(campaignId);
    if (!encounter) return;
    const operation = makeRevokeCombatEffectOp(encounter.effectOps, effectId);
    if (operation) appendPersistentCombatEffectOpOptimistic(campaignId, operation);
    return;
  }
  const ref = campaignDoc(campaignId);
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    const encounter = (snap.data()?.encounter ?? null) as EncounterState | null;
    if (!encounter) return;
    const operation = makeRevokeCombatEffectOp(encounter.effectOps, effectId);
    if (!operation) return;
    await applyPersistentCombatEffectOperation(
      txn,
      ref,
      snap.data() as CampaignDoc,
      encounter,
      operation
    );
  });
}

/**
 * Revoke every currently-active occurrence owned by one actor/source pair. Each exact
 * inverse (plus any data-declared end state) is appended in one fresh-read transaction,
 * composing with concurrent writes without restoring a stale snapshot. Replaying after
 * completion performs one read and no writes.
 */
export async function revokePersistentCombatEffectsBySource(
  campaignId: string,
  owner: { actorId: string; sourceId: string }
): Promise<void> {
  if (devBypassEnabled()) {
    for (;;) {
      const encounter = currentDevEncounter(campaignId);
      if (!encounter) return;
      const effect = sourceOwnedActiveEffect(encounter.effectOps, owner);
      if (!effect) return;
      const operation = makeRevokeCombatEffectOp(encounter.effectOps, effect.id);
      if (!operation) return;
      appendPersistentCombatEffectOpOptimistic(campaignId, operation);
      const successor = endedEffectSuccessor(effect, encounterPosition(encounter));
      if (successor) {
        appendPersistentCombatEffectOpOptimistic(
          campaignId,
          makePersistentApplyOperation(successor)
        );
      }
    }
  }

  const ref = campaignDoc(campaignId);
  for (;;) {
    const appended = await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      const encounter = (snap.data()?.encounter ?? null) as EncounterState | null;
      if (!encounter) return false;
      const effect = sourceOwnedActiveEffect(encounter.effectOps, owner);
      if (!effect) return false;
      const operation = makeRevokeCombatEffectOp(encounter.effectOps, effect.id);
      if (!operation) return false;
      const successor = endedEffectSuccessor(effect, encounterPosition(encounter));
      return applyPersistentCombatEffectOperations(
        txn,
        ref,
        snap.data() as CampaignDoc,
        encounter,
        [operation, ...(successor ? [makePersistentApplyOperation(successor)] : [])]
      );
    });
    if (!appended) return;
  }
}

function sourceOwnedActiveEffect(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  owner: { actorId: string; sourceId: string }
): ActiveCombatEffect | undefined {
  return effectsByActorSource(operations, owner.actorId, owner.sourceId).find(
    (effect) =>
      effect.payload.kind !== "grant-group" || effect.payload.phase !== "aftereffect"
  );
}

function encounterPosition(encounter: EncounterState) {
  const combatants = (encounter as { combatants?: EncounterState["combatants"] })
    .combatants;
  return {
    order: encounter.order ?? combatants?.map(({ id }) => id) ?? [],
    currentCombatantId: encounter.currentCombatantId,
    round: encounter.round,
    phase: "turn-start" as const,
  };
}

async function appendPersistentCombatEffectOp(
  campaignId: string,
  operation: CombatEffectOp
): Promise<void> {
  if (devBypassEnabled()) {
    appendPersistentCombatEffectOpOptimistic(campaignId, operation);
    return;
  }
  const ref = campaignDoc(campaignId);
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    const encounter = (snap.data()?.encounter ?? null) as EncounterState | null;
    if (!encounter) return;
    if (
      operation.kind === "apply" &&
      (!encounterContainsCombatantRef(encounter, operation.effect.actor) ||
        !encounterContainsCombatantRef(encounter, operation.effect.target))
    ) {
      throw new Error("Combat effect participant mismatch");
    }
    await applyPersistentCombatEffectOperation(
      txn,
      ref,
      snap.data() as CampaignDoc,
      encounter,
      operation
    );
  });
}

interface PersistentHpMutation {
  target: CombatantRef;
  delta: number;
}

/** Net exact current/max-HP inverses caused by one operation-log transition. */
function persistentHpMutations(
  before: ReadonlyArray<CombatEffectOp> | undefined,
  after: ReadonlyArray<CombatEffectOp>
): PersistentHpMutation[] {
  const prior = new Map(foldCombatEffectOps(before).map((effect) => [effect.id, effect]));
  const next = new Map(foldCombatEffectOps(after).map((effect) => [effect.id, effect]));
  const byTarget = new Map<string, PersistentHpMutation>();
  const add = (target: CombatantRef, delta: number): void => {
    if (delta === 0) return;
    const key =
      target.kind === "pc"
        ? `pc:${target.memberUid}:${target.characterId}`
        : `monster:${target.combatantId}:${String(target.tokenIndex ?? 0)}`;
    const current = byTarget.get(key);
    byTarget.set(key, { target, delta: (current?.delta ?? 0) + delta });
  };
  for (const effect of prior.values()) {
    if (!next.has(effect.id)) add(effect.target, -(effect.applied?.currentHpDelta ?? 0));
  }
  for (const effect of next.values()) {
    if (!prior.has(effect.id)) add(effect.target, effect.applied?.currentHpDelta ?? 0);
  }
  return [...byTarget.values()].filter(({ delta }) => delta !== 0);
}

function applyPersistentHpDelta(state: CombatState, delta: number): CombatState {
  const current = Math.max(0, state.hp.current + delta);
  const revived = state.hp.current === 0 && current > 0;
  return {
    ...state,
    hp: { ...state.hp, current },
    ...(revived
      ? {
          conditions: state.conditions.filter((condition) => condition !== "unconscious"),
          deathSaves: { successes: 0, failures: 0 },
        }
      : {}),
  };
}

function memberCombatMax(
  campaign: CampaignDoc,
  target: Extract<CombatantRef, { kind: "pc" }>,
  effectOps?: ReadonlyArray<CombatEffectOp>
) {
  const max = campaignMemberHpMax(campaign, target.memberUid);
  if (typeof max !== "number" || !Number.isFinite(max) || max <= 0) {
    throw new Error("Combat effect target has no HP snapshot");
  }
  return (
    max +
    effectsForTarget(effectOps, target.combatantId).reduce(
      (sum, effect) => sum + maxHpDeltaForEffect(effect),
      0
    )
  );
}

/** Campaign snapshots are required on valid documents, but this IO edge remains
 * absence-safe for an older/incomplete local or transaction fixture. */
function campaignMemberHpMax(
  campaign: CampaignDoc,
  memberUid: string
): number | undefined {
  const memberDetails = (campaign as { memberDetails?: CampaignDoc["memberDetails"] })
    .memberDetails;
  return memberDetails?.[memberUid]?.character?.hpMax;
}

function applyPersistentMonsterHpDelta(
  encounter: EncounterState,
  target: Extract<CombatantRef, { kind: "monster" }>,
  delta: number
): EncounterState {
  let combatantId = target.combatantId;
  let tokenIndex = target.tokenIndex ?? 0;
  let monster = encounter.combatants.find(
    (combatant): combatant is EncounterMonster =>
      combatant.id === combatantId && combatant.kind === "monster"
  );
  if (!monster) {
    const legacy = /^(.*)~(\d+)$/.exec(target.combatantId);
    if (!legacy) return encounter;
    combatantId = legacy[1] ?? target.combatantId;
    tokenIndex = Math.max(0, Number(legacy[2]) - 1);
    monster = encounter.combatants.find(
      (combatant): combatant is EncounterMonster =>
        combatant.id === combatantId && combatant.kind === "monster"
    );
  }
  if (!monster || tokenIndex >= monster.tokens.length) return encounter;
  const targetMonster = monster;
  return {
    ...encounter,
    combatants: encounter.combatants.map((combatant) =>
      combatant !== targetMonster
        ? combatant
        : {
            ...targetMonster,
            maxHp: Math.max(1, targetMonster.maxHp + delta),
            tokens: targetMonster.tokens.map((hp, index) =>
              index === tokenIndex ? Math.max(0, hp + delta) : hp
            ),
          }
    ),
  };
}

/** Append one exact lifecycle operation together with every landed HP inverse. */
async function applyPersistentCombatEffectOperation(
  txn: Transaction,
  campaignRef: ReturnType<typeof campaignDoc>,
  campaign: CampaignDoc,
  encounter: EncounterState,
  operation: CombatEffectOp
): Promise<boolean> {
  return applyPersistentCombatEffectOperations(txn, campaignRef, campaign, encounter, [
    operation,
  ]);
}

async function applyPersistentCombatEffectOperations(
  txn: Transaction,
  campaignRef: ReturnType<typeof campaignDoc>,
  campaign: CampaignDoc,
  encounter: EncounterState,
  operations: ReadonlyArray<CombatEffectOp>,
  extraCampaignFields: Record<string, unknown> = {}
): Promise<boolean> {
  const initialOps = encounter.effectOps ?? [];
  let nextOps = initialOps;
  for (const operation of operations) {
    const appended = appendCombatEffectOp(nextOps, operation);
    if (appended) nextOps = appended;
  }
  if (nextOps === initialOps) return false;
  const mutations = persistentHpMutations(encounter.effectOps, nextOps);
  const pcMutations = mutations.filter(
    (
      mutation
    ): mutation is PersistentHpMutation & {
      target: Extract<CombatantRef, { kind: "pc" }>;
    } => mutation.target.kind === "pc"
  );
  const pcRefs = pcMutations.map(({ target }) =>
    combatStateRef(target.memberUid, target.characterId)
  );
  const pcSnapshots = await Promise.all(pcRefs.map((ref) => txn.get(ref)));
  let nextEncounter = encounter;
  for (const mutation of mutations) {
    if (mutation.target.kind === "monster") {
      nextEncounter = applyPersistentMonsterHpDelta(
        nextEncounter,
        mutation.target,
        mutation.delta
      );
    }
  }
  for (const [index, mutation] of pcMutations.entries()) {
    const snapshot = pcSnapshots[index];
    const combatRef = pcRefs[index];
    if (!snapshot || !combatRef) continue;
    const current = snapshot.exists()
      ? parseCombatState(snapshot.data())
      : defaultCombatState(
          memberCombatMax(campaign, mutation.target, encounter.effectOps)
        );
    txn.set(
      combatRef,
      combatStateWriteData(applyPersistentHpDelta(current, mutation.delta))
    );
  }
  txn.update(campaignRef, {
    "encounter.effectOps": nextOps,
    ...(nextEncounter !== encounter
      ? { "encounter.combatants": nextEncounter.combatants }
      : {}),
    ...extraCampaignFields,
    updatedAt: serverTimestamp(),
  });
  return true;
}

/** Exact encounter-provenance check for a persistent-effect endpoint. */
function encounterContainsCombatantRef(
  encounter: EncounterState,
  ref: CombatantRef
): boolean {
  const direct = encounter.combatants.find(
    (combatant) => combatant.id === ref.combatantId
  );
  if (ref.kind === "pc") {
    return (
      direct?.kind === "pc" &&
      direct.memberUid === ref.memberUid &&
      direct.characterId === ref.characterId
    );
  }

  if (direct?.kind === "monster") {
    return (
      ref.tokenIndex === undefined ||
      (Number.isInteger(ref.tokenIndex) &&
        ref.tokenIndex >= 0 &&
        ref.tokenIndex < direct.tokens.length)
    );
  }

  // Read-conformed legacy groups expose `monster~2`, while the untouched campaign
  // transaction may still carry `monster.tokens[1]`. Accept only that exact slot.
  const legacy = /^(.*)~(\d+)$/.exec(ref.combatantId);
  if (!legacy || ref.tokenIndex !== undefined) return false;
  const group = encounter.combatants.find(
    (combatant) => combatant.id === legacy[1] && combatant.kind === "monster"
  );
  const index = Number(legacy[2]) - 1;
  return (
    group?.kind === "monster" &&
    Number.isInteger(index) &&
    index >= 0 &&
    index < group.tokens.length
  );
}

/** Pure append guard shared by Firestore and dev-bypass writes. */
function appendCombatEffectOp(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  operation: CombatEffectOp
): CombatEffectOp[] | null {
  const current = operations ?? [];
  if (current.some((entry) => entry.id === operation.id)) return null;
  if (current.length >= MAX_COMBAT_EFFECT_OPS) {
    throw new Error("Combat effect operation limit reached");
  }
  return [...current, operation];
}

function makeRevokeCombatEffectOp(
  operations: ReadonlyArray<CombatEffectOp> | undefined,
  effectId: string
): CombatEffectOp | null {
  const current = operations ?? [];
  if (current.some((entry) => entry.kind === "revoke" && entry.effectId === effectId)) {
    return null;
  }
  const applied = current.find(
    (entry) => entry.kind === "apply" && entry.effect.id === effectId
  );
  if (!applied || applied.kind !== "apply") return null;
  return {
    id: `revoke:${effectId}`,
    kind: "revoke",
    effectId,
    actorId: applied.effect.actor.combatantId,
    targetId: applied.effect.target.combatantId,
  };
}

function currentDevEncounter(campaignId: string): EncounterState | null {
  const campaign = useCampaignStore.getState().campaign;
  return campaign?.id === campaignId ? (campaign.encounter ?? null) : null;
}

function appendPersistentCombatEffectOpOptimistic(
  campaignId: string,
  operation: CombatEffectOp
): void {
  const store = useCampaignStore.getState();
  const campaign = store.campaign;
  const encounter = currentDevEncounter(campaignId);
  if (!campaign || !encounter) return;
  if (
    operation.kind === "apply" &&
    (!encounterContainsCombatantRef(encounter, operation.effect.actor) ||
      !encounterContainsCombatantRef(encounter, operation.effect.target))
  ) {
    throw new Error("Combat effect participant mismatch");
  }
  const nextOps = appendCombatEffectOp(encounter.effectOps, operation);
  if (!nextOps) return;
  let next = encounter;
  for (const mutation of persistentHpMutations(encounter.effectOps, nextOps)) {
    if (mutation.target.kind === "monster") {
      next = applyPersistentMonsterHpDelta(next, mutation.target, mutation.delta);
      continue;
    }
    const max = memberCombatMax(campaign, mutation.target, encounter.effectOps);
    updateDevCombatState(
      mutation.target.memberUid,
      mutation.target.characterId,
      defaultCombatState(max),
      (current) => applyPersistentHpDelta(current, mutation.delta)
    );
  }
  store.setEncounter({ ...next, effectOps: nextOps });
}

interface PersistentMonsterDamageResult {
  encounter: EncounterState;
  transfers: DirectPcEffectResult["transfers"];
  consumedEffectIds: string[];
}

/** Monster twin of {@link reduceDirectPcEffects}' persistent damage leg. */
function reducePersistentMonsterDamage(
  encounter: EncounterState,
  effect: DeclaredDamageEffect,
  effectOps: ReadonlyArray<CombatEffectOp>,
  hit?: { attacker: CombatantRef | null; attackMode?: "melee" | "ranged" },
  provenance?: { actorId?: string; action?: LocText }
): PersistentMonsterDamageResult {
  let storedTargetId = effect.targetId;
  let tokenIndex = effect.tokenIndex;
  let monster = encounter.combatants.find(
    (combatant): combatant is EncounterMonster =>
      combatant.id === storedTargetId && combatant.kind === "monster"
  );
  if (!monster) {
    const legacy = /^(.*)~(\d+)$/.exec(effect.targetId);
    if (legacy) {
      storedTargetId = legacy[1] ?? effect.targetId;
      tokenIndex = Math.max(0, Number(legacy[2]) - 1);
      monster = encounter.combatants.find(
        (combatant): combatant is EncounterMonster =>
          combatant.id === storedTargetId && combatant.kind === "monster"
      );
    }
  }
  if (!monster) return { encounter, transfers: [], consumedEffectIds: [] };
  const resolvedTokenIndex = tokenIndex ?? firstLiveTokenIndex(monster.tokens);
  const currentHp = monster.tokens[resolvedTokenIndex];
  if (currentHp === undefined) return { encounter, transfers: [], consumedEffectIds: [] };
  const persistentEffects = effectsForTarget(
    effectOps,
    effect.targetId,
    undefined,
    effect.tokenIndex
  );
  const retaliations = hit
    ? resolvePersistentHit(persistentEffects, {
        attacker: hit.attacker,
        attackMode: hit.attackMode,
        tempHp: monster.tempHp ?? 0,
      })
    : [];
  const outcome = resolvePersistentDamage(persistentEffects, {
    currentHp,
    tempHp: monster.tempHp ?? 0,
    incomingDamage: effect.amount,
    ...(effect.damageType
      ? {
          damageType: effect.damageType,
          damageSource: effect.damageSource,
          defenses: monsterDamageDefenses(monster.defenses) ?? NO_DEFENSES,
        }
      : {}),
  });
  return {
    encounter: recordMonsterDamage(
      encounter,
      storedTargetId,
      resolvedTokenIndex,
      outcome.targetDamage,
      provenance?.actorId,
      provenance?.action
    ),
    transfers: [
      ...outcome.transfers,
      ...retaliations.map((entry) => ({
        target: entry.target,
        amount: entry.amount,
        effectId: entry.effectId,
        actorId: entry.actor.combatantId,
        action: srdText("spell", entry.sourceId, "name"),
        damageType: entry.damageType,
        damageSource: "spell" as const,
      })),
    ],
    consumedEffectIds: [...outcome.consumedEffectIds],
  };
}

/** Apply every declared hit to the encounter through the pure {@link recordMonsterHp}
 *  recorder (lowers the first live token + appends the unattributed chronicle event).
 *  PURE — shared by the live transaction and the dev-bypass optimistic path so both
 *  behave identically. Returns the SAME state when nothing landed. */
export function reduceDeclaredEffects(
  encounter: EncounterState,
  effects: ReadonlyArray<DeclaredCombatEffect>,
  provenance?: { actorId: string; action: LocText }
): EncounterState {
  let next = encounter;
  for (const effect of effects) {
    const { targetId } = effect;
    let storedTargetId = targetId;
    let legacyIndex =
      effect.kind === "condition" || effect.kind === "granted-die"
        ? undefined
        : effect.tokenIndex;
    let monster = next.combatants.find((c) => c.id === storedTargetId);
    // A player may be looking at the read-conformed instance `monster-1~2` while an
    // untouched live campaign still stores the retired `monster-1.tokens[1]` group.
    // Resolve that deterministic id back to the old slot inside this transaction. The
    // member write keeps the combatant count unchanged, satisfying the narrow rules;
    // the next DM structural save persists the already-conformed instance model.
    if (!monster) {
      const legacy = /^(.*)~(\d+)$/.exec(targetId);
      if (legacy) {
        storedTargetId = legacy[1] ?? targetId;
        legacyIndex = Math.max(0, Number(legacy[2]) - 1);
        monster = next.combatants.find((c) => c.id === storedTargetId);
      }
    }
    // PC state lives in its combat subdocument. The IO seam handles it directly from
    // the resolver's live target snapshot; this encounter reducer owns monsters only.
    if (monster?.kind === "pc") continue;
    if (!monster) continue;
    if (effect.kind === "granted-die") {
      if (monster.bardicInspirationDie === effect.die) {
        continue;
      }
      next = setMonsterBardicInspirationDie(next, storedTargetId, effect.die);
      if (provenance) {
        next = appendEvent(next, {
          kind: "resource-grant",
          targetId: storedTargetId,
          resource: "bardic-inspiration-die",
          value: effect.die,
          actorId: provenance.actorId,
          action: provenance.action,
        });
      }
      continue;
    }
    if (effect.kind === "condition") {
      const wasActive = monster.conditions.includes(effect.conditionId);
      next = setMonsterCondition(next, storedTargetId, effect.conditionId, effect.active);
      if (wasActive !== effect.active) {
        next = recordCondition(next, storedTargetId, effect.conditionId, effect.active);
      }
      continue;
    }
    if (effect.amount <= 0) continue;
    if (effect.kind === "temp-hp") {
      next = setMonsterTempHp(
        next,
        storedTargetId,
        Math.max(monster.tempHp ?? 0, effect.amount)
      );
      continue;
    }
    const tokenIndex = legacyIndex ?? firstLiveTokenIndex(monster.tokens);
    if (effect.kind === "damage") {
      next = recordMonsterDamage(next, storedTargetId, tokenIndex, effect.amount);
    } else {
      const value = (monster.tokens[tokenIndex] ?? 0) + effect.amount;
      next = recordMonsterHp(next, storedTargetId, tokenIndex, value);
    }
  }
  return next;
}

/** Dev-bypass optimistic apply: reduce the campaign store's live encounter so the local
 *  hub reflects the drop (no Firestore). No-op when the store holds a different / no
 *  encounter. */
function applyDeclaredEffectsOptimistic(
  campaignId: string,
  effects: ReadonlyArray<DeclaredCombatEffect>,
  context?: DeclaredCombatContext
): void {
  const store = useCampaignStore.getState();
  const campaign = store.campaign;
  if (!campaign || campaign.id !== campaignId || !campaign.encounter) return;
  const actor = context
    ? campaign.encounter.combatants.find((combatant) => combatant.id === context.actorId)
    : undefined;
  if (context && actor?.kind !== "pc") return;
  const attackerRef = pcCombatantRef(actor?.kind === "pc" ? actor : undefined);
  const hitTargetIds = new Set(context?.hitTargetIds ?? []);

  let next = campaign.encounter;
  const initialEffectOps = next.effectOps ?? [];
  let nextEffectOps = initialEffectOps;
  const declaredTargets = new Map(
    (context?.pcTargets ?? []).map((target) => [target.targetId, target])
  );
  const directTargetIds = new Set(
    effects
      .map(({ targetId }) => targetId)
      .filter((targetId) => declaredTargets.has(targetId))
  );
  const transferQueue: Array<
    DirectPcEffectResult["transfers"][number] & { path: ReadonlySet<string> }
  > = [];
  const consume = (effectIds: ReadonlyArray<string>): void => {
    for (const effectId of effectIds) {
      const operation = makeRevokeCombatEffectOp(nextEffectOps, effectId);
      if (!operation) continue;
      nextEffectOps = appendCombatEffectOp(nextEffectOps, operation) ?? nextEffectOps;
    }
  };
  const enqueueTransfers = (
    transfers: DirectPcEffectResult["transfers"],
    path: ReadonlySet<string> = new Set()
  ): void => {
    for (const transfer of transfers) {
      if (path.has(transfer.effectId)) continue;
      transferQueue.push({
        ...transfer,
        path: new Set([...path, transfer.effectId]),
      });
    }
  };
  const landPcEffects = (
    targetRef: Extract<CombatantRef, { kind: "pc" }>,
    targetEffects: ReadonlyArray<DeclaredCombatEffect>,
    path: ReadonlySet<string> = new Set(),
    chainedProvenance?: { actorId?: string; action?: LocText },
    includeOriginalHit = true
  ): void => {
    const combatant = next.combatants.find(
      (candidate) => candidate.id === targetRef.combatantId
    );
    if (
      combatant?.kind !== "pc" ||
      combatant.memberUid !== targetRef.memberUid ||
      combatant.characterId !== targetRef.characterId
    ) {
      return;
    }
    const declared = declaredTargets.get(targetRef.combatantId);
    const snapshotMax = campaignMemberHpMax(campaign, targetRef.memberUid);
    const maxHp =
      typeof snapshotMax === "number" && Number.isFinite(snapshotMax) && snapshotMax > 0
        ? snapshotMax +
          effectsForTarget(nextEffectOps, targetRef.combatantId).reduce(
            (sum, effect) => sum + maxHpDeltaForEffect(effect),
            0
          )
        : (declared?.maxHp ?? 0);
    if (maxHp <= 0) return;
    const fallback = {
      ...defaultCombatState(maxHp),
      ...(declared
        ? {
            hp: { current: declared.currentHp, temp: declared.tempHp },
            conditions: declared.conditions,
          }
        : {}),
    };
    const landed = { result: null as DirectPcEffectResult | null };
    updateDevCombatState(
      targetRef.memberUid,
      targetRef.characterId,
      fallback,
      (current) => {
        const result = reduceDirectPcEffects(
          {
            targetId: targetRef.combatantId,
            memberUid: targetRef.memberUid,
            characterId: targetRef.characterId,
            maxHp,
            currentHp: current.hp.current,
            tempHp: current.hp.temp,
            conditions: current.conditions,
            bardicInspirationDie: current.bardicInspirationDie,
            defenses: declared?.defenses ?? NO_DEFENSES,
          },
          targetEffects,
          {
            actorId: chainedProvenance?.actorId ?? context?.actorId ?? "",
            action: chainedProvenance?.action ?? context?.action ?? { custom: "" },
            round: next.round,
            persistentEffects: effectsForTarget(nextEffectOps, targetRef.combatantId),
            ...(includeOriginalHit && hitTargetIds.has(targetRef.combatantId)
              ? { hit: { attacker: attackerRef, attackMode: context?.attackMode } }
              : {}),
          }
        );
        if (!result) return current;
        landed.result = result;
        return {
          ...current,
          hp: result.hp,
          conditions: result.conditions,
          ...(result.bardicInspirationDie !== undefined
            ? { bardicInspirationDie: result.bardicInspirationDie }
            : {}),
          ...(result.resetDeathSaves
            ? { deathSaves: { successes: 0, failures: 0 } }
            : {}),
        };
      }
    );
    if (!landed.result) return;
    next = recordDirectPcEffectEvents(next, landed.result.events);
    enqueueTransfers(landed.result.transfers, path);
    consume(landed.result.consumedEffectIds);
  };

  for (const targetId of directTargetIds) {
    const target = declaredTargets.get(targetId);
    if (!target) continue;
    landPcEffects(
      {
        kind: "pc",
        combatantId: target.targetId,
        memberUid: target.memberUid,
        characterId: target.characterId,
      },
      effects
    );
  }

  for (const effect of effects.filter(
    (candidate) => !directTargetIds.has(candidate.targetId)
  )) {
    if (effect.kind !== "damage") {
      next = reduceDeclaredEffects(
        next,
        [effect],
        context ? { actorId: context.actorId, action: context.action } : undefined
      );
      continue;
    }
    const result = reducePersistentMonsterDamage(
      next,
      { ...effect, kind: "damage" },
      nextEffectOps,
      hitTargetIds.has(effect.targetId)
        ? { attacker: attackerRef, attackMode: context?.attackMode }
        : undefined,
      { actorId: context?.actorId, action: context?.action }
    );
    next = result.encounter;
    enqueueTransfers(result.transfers);
    consume(result.consumedEffectIds);
  }

  while (transferQueue.length > 0) {
    const transfer = transferQueue.shift();
    if (!transfer) continue;
    if (transfer.target.kind === "pc") {
      landPcEffects(
        transfer.target,
        [
          {
            kind: "damage",
            targetId: transfer.target.combatantId,
            amount: transfer.amount,
            ...(transfer.damageType ? { damageType: transfer.damageType } : {}),
            ...(transfer.damageSource ? { damageSource: transfer.damageSource } : {}),
          },
        ],
        transfer.path,
        { actorId: transfer.actorId, action: transfer.action },
        false
      );
      continue;
    }
    const result = reducePersistentMonsterDamage(
      next,
      {
        kind: "damage",
        targetId: transfer.target.combatantId,
        amount: transfer.amount,
        ...(transfer.damageType ? { damageType: transfer.damageType } : {}),
        ...(transfer.damageSource ? { damageSource: transfer.damageSource } : {}),
        ...(transfer.target.tokenIndex !== undefined
          ? { tokenIndex: transfer.target.tokenIndex }
          : {}),
      },
      nextEffectOps,
      undefined,
      {
        actorId: transfer.actorId ?? context?.actorId,
        action: transfer.action ?? context?.action,
      }
    );
    next = result.encounter;
    enqueueTransfers(result.transfers, transfer.path);
    consume(result.consumedEffectIds);
  }

  if (nextEffectOps !== initialEffectOps) next = { ...next, effectOps: nextEffectOps };
  if (next !== campaign.encounter) store.setEncounter(next);
}

/** One Chronicle projection for both the Firestore and auth-bypass transaction paths. */
function recordDirectPcEffectEvents(
  encounter: EncounterState,
  events: ReadonlyArray<CombatChronicleEvent>
): EncounterState {
  let next = encounter;
  for (const event of events) {
    if (event.kind === "hp-heal") {
      next = recordPcHp(next, {
        targetId: event.targetId,
        kind: "heal",
        amount: event.amount,
        preCurrent: event.current - event.amount,
        postCurrent: event.current,
        max: event.max,
        actorId: event.actorId,
        action: event.action,
      });
    } else if (event.kind === "hp-damage") {
      next = recordPcHp(next, {
        targetId: event.targetId,
        kind: "damage",
        amount: event.amount,
        preCurrent: event.current + Math.max(0, event.amount - (event.tempAbsorbed ?? 0)),
        postCurrent: event.current,
        max: event.max,
        attackerId: event.attackerId,
        action: event.action,
        tempAbsorbed: event.tempAbsorbed,
      });
    } else if (event.kind === "condition-gain" || event.kind === "condition-loss") {
      next = recordCondition(
        next,
        event.targetId,
        event.conditionId,
        event.kind === "condition-gain",
        {
          actorId: event.kind === "condition-gain" ? event.attackerId : event.actorId,
          action: event.action,
        }
      );
    } else if (event.kind === "resource-grant") {
      next = appendEvent(next, {
        kind: event.kind,
        targetId: event.targetId,
        resource: event.resource,
        value: event.value,
        actorId: event.actorId,
        action: event.action,
      });
    }
  }
  return next;
}

/**
 * INIT-4 / B15 — persist the START of the turn order IMMEDIATELY (never via the 2s
 * debounced writer). "Begin turns" freezes `order` and points the turn at its top;
 * routing that only through the debounce left a ~2s window where an advance transaction
 * read the still-`null` server pointer, hit the "turns not begun" guard and SILENTLY
 * no-opped (offline it rejected). Writing the three turn fields NOW closes that window:
 * the very next {@link advanceEncounterTurn} sees a begun order. DM-only (Begin-turns is
 * DM-gated at the call site AND `order` is DM-only in `firestore.rules` — the DM's write
 * rides the unconstrained `isDm()` branch). Dot-path so the diff stays narrow. An
 * `updateDoc` (unlike a transaction) is OFFLINE-QUEUEABLE, so an offline Begin-turns is
 * durably queued rather than lost. No-op under dev bypass (the caller updates the store
 * optimistically). Its optimistic store update ALSO arms the debounced whole-encounter
 * writer, which lands consistently later (its pointer is reconciled from the live store —
 * see {@link createCampaignSave}), so the two writes never fight.
 */
export async function persistBeginTurns(
  campaignId: string,
  turn: {
    order: string[];
    currentCombatantId: string;
    round: number;
    skipped?: Record<string, boolean>;
  }
): Promise<void> {
  if (devBypassEnabled()) return;
  await updateDoc(campaignDoc(campaignId), {
    "encounter.order": turn.order,
    "encounter.currentCombatantId": turn.currentCombatantId,
    "encounter.round": turn.round,
    ...(turn.skipped ? { encounterSkipped: turn.skipped } : {}),
    updatedAt: serverTimestamp(),
  });
}

/** Opt this member out of (or back into) the current gathering phase. A per-key update
 * composes across players and is offline-queueable; rules scope a regular member to their
 * own uid while the DM/admin retain table correction authority. */
export async function setEncounterParticipation(
  campaignId: string,
  uid: string,
  participating: boolean
): Promise<void> {
  if (devBypassEnabled()) return;
  await updateDoc(campaignDoc(campaignId), {
    [`encounterSkipped.${uid}`]: participating ? deleteField() : true,
    updatedAt: serverTimestamp(),
  });
}

/**
 * THE INITIATIVE WRITE (the initiative-SSOT seam) — set (or clear, `roll === null`)
 * ONE member's raw d20 initiative roll in the campaign's `encounterInit` table.
 *
 * ONE function for BOTH writers: the player rolling their OWN initiative (the pip /
 * party card / cockpit turn meter) and the DM rolling FOR any member (the encounter
 * card). Both write the SAME campaign doc they are already authorized on —
 * `firestore.rules` proves the four directions (DM any row · member own row · member
 * NOT a peer's row · non-member nothing) — so no cross-user character write, no
 * dmReaders grant, and no field-locked subdoc shape is involved anymore (the class of
 * failure behind the old "DM access out of date" toast is structurally gone).
 *
 * A PER-KEY field-path `updateDoc` (like the treasury's atomic deltas): concurrent
 * rolls by different members COMPOSE instead of clobbering, and the write is
 * OFFLINE-QUEUEABLE (durably replayed on reconnect — offline-first). No-op under dev
 * bypass (the caller updates the store optimistically).
 */
export async function setEncounterInitiative(
  campaignId: string,
  memberUid: string,
  roll: number | null
): Promise<void> {
  if (devBypassEnabled()) return;
  await updateDoc(campaignDoc(campaignId), {
    [`encounterInit.${memberUid}`]: roll === null ? deleteField() : Math.round(roll),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Start a fresh encounter IMMEDIATELY (never via the 2s debounced writer), resetting
 * the `encounterInit` table to `{}` IN THE SAME atomic write — the per-fight
 * invalidation: a new fight starts with every PC un-rolled, without the DM touching
 * any player-owned document (this replaced the per-character `initiativeEpoch`
 * stamp). Immediate for the same reason as {@link persistBeginTurns}: a player may
 * roll within seconds of the DM starting the fight, and their per-key roll write must
 * land on a doc that already carries the reset (the debounced whole-`encounter`
 * writer never touches the SIBLING `encounterInit`, so it can never clobber rolls
 * afterwards). DM/admin-only at the call site AND in the rules (the unconstrained
 * `isDm()` branch). The caller ALSO updates the store optimistically; the debounced
 * structural writer it arms re-lands the same `encounter` content — harmless.
 */
export async function persistStartEncounter(
  campaignId: string,
  encounter: EncounterState
): Promise<void> {
  if (devBypassEnabled()) return;
  await updateDoc(campaignDoc(campaignId), {
    encounter: stripUndefined(encounter as unknown as Record<string, unknown>),
    encounterInit: {},
    encounterSkipped: {},
    updatedAt: serverTimestamp(),
  });
}

/**
 * End the encounter IMMEDIATELY: clear the `encounter` field AND the `encounterInit`
 * table in one atomic write (a lingering table would leak the dead fight's rolls into
 * the next one). DM/admin-only at the call site AND in the rules. The caller also
 * clears the store optimistically.
 */
export async function persistEndEncounter(campaignId: string): Promise<void> {
  if (devBypassEnabled()) return;
  await updateDoc(campaignDoc(campaignId), {
    encounter: null,
    encounterInit: {},
    encounterSkipped: {},
    updatedAt: serverTimestamp(),
  });
}

/**
 * B06 — apply a treasury add/take ATOMICALLY so concurrent edits COMPOSE instead of
 * clobbering. The old path shipped the whole `treasury` map + `treasuryLog` array through
 * the debounced last-write-wins writer, so two members editing within the 2s window
 * silently overwrote each other's total AND dropped a ledger row. Here the coin movement
 * is a per-currency server-side `increment()` (commutative — +5 then −3 over 10 always
 * lands 12, whichever order) and the ledger row is appended with `arrayUnion` (both rows
 * survive). Both are `updateDoc` field transforms, so the write is also OFFLINE-QUEUEABLE
 * (offline-first) and composes even when queued. `entry.amount` is the already-clamped
 * moved amount the caller records (the UI clamps a take to the balance it sees; a rare
 * concurrent over-take can dip a coin below 0 — cosmetic, the party corrects it — which is
 * strictly better than the old total corruption). No-op under dev bypass.
 */
export async function applyTreasuryDelta(
  campaignId: string,
  entry: TreasuryLogEntry
): Promise<void> {
  if (devBypassEnabled()) return;
  const signed = entry.type === "add" ? entry.amount : -entry.amount;
  await updateDoc(campaignDoc(campaignId), {
    [`treasury.${entry.currency}`]: increment(signed),
    treasuryLog: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
}

/**
 * B06 — truly undo one logged treasury transaction ATOMICALLY: reverse its coin movement
 * (a per-currency `increment()` — an "add" takes the coins back, a "remove" returns them)
 * AND drop that exact ledger row with `arrayRemove`. Like {@link applyTreasuryDelta} these
 * are composing, offline-queueable field transforms — so undoing never clobbers a
 * concurrent add/take. `arrayRemove` matches the stored element structurally; our entries
 * carry a millisecond-precision `at` (from `new Date()`), which round-trips
 * Timestamp↔Date exactly, so the element matches. No-op under dev bypass.
 */
export async function undoTreasuryEntry(
  campaignId: string,
  entry: TreasuryLogEntry
): Promise<void> {
  if (devBypassEnabled()) return;
  // Reverse of the original movement: undoing an "add" removes coins, undoing a
  // "remove" returns them.
  const reversed = entry.type === "add" ? -entry.amount : entry.amount;
  await updateDoc(campaignDoc(campaignId), {
    [`treasury.${entry.currency}`]: increment(reversed),
    treasuryLog: arrayRemove(entry),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Persist an ambient edit to a campaign's shared artifacts (name / status / encounter
 * structure). Treasury is NOT written here anymore — it rides the atomic
 * {@link applyTreasuryDelta} / {@link undoTreasuryEntry} path (B06). No-op under dev
 * bypass (mirrors `updateCharacter`).
 */
export async function updateCampaign(
  campaignId: string,
  data: CampaignWritable
): Promise<void> {
  if (devBypassEnabled()) return;
  await updateDoc(campaignDoc(campaignId), {
    ...(stripUndefined(data) as Record<string, unknown>),
    updatedAt: serverTimestamp(),
  });
}

/**
 * B04 — reconcile a PENDING debounced encounter write's TURN POINTER against the live
 * store at WRITE time (called inside the debounced writer's flush, not at arm time).
 *
 * The debounced writer packages the whole `encounter` when a DM makes a STRUCTURAL edit
 * (monster HP / condition / add-remove / reorder). During the ~2s window a concurrent
 * {@link advanceEncounterTurn} transaction can commit a new `{currentCombatantId, round}`;
 * the resulting snapshot updates the store but the loop guard deliberately does NOT re-arm
 * the pending payload — so, left alone, the stale whole-object write would land later and
 * REWIND the just-committed turn. Since the store is always reconciled from the newest
 * snapshot, at write time it holds the FRESH pointer: copy it onto the pending payload so
 * the structural write preserves the advance instead of reverting it. Only reconciled
 * within the SAME fight (matching `epoch`); a different/absent live encounter (a new or
 * ended fight) leaves the payload untouched. Pure aside from the single store read.
 */
function reconcileEncounterPointer(data: CampaignWritable): CampaignWritable {
  const pending = data.encounter;
  if (!pending) return data; // no encounter in this write (or it is being ended)
  const live = useCampaignStore.getState().campaign?.encounter ?? null;
  if (!live || live.epoch !== pending.epoch) return data; // different / no live fight
  if (
    live.currentCombatantId === pending.currentCombatantId &&
    live.round === pending.round
  ) {
    return data; // pointer already current — nothing to reconcile
  }
  return {
    ...data,
    encounter: {
      ...pending,
      currentCombatantId: live.currentCombatantId,
      round: live.round,
    },
  };
}

/**
 * Build the debounced writer for a campaign's shared artifacts. `uid` is accepted
 * for the shared-abstraction `createSave(uid, docId)` signature; the campaign path
 * is `/campaigns/{id}` and does not need it. The write closure reconciles the
 * encounter turn pointer from the live store first (B04 — see
 * {@link reconcileEncounterPointer}) so a queued structural write can never revert a
 * concurrently-advanced turn.
 */
export function createCampaignSave(
  _uid: string,
  campaignId: string
): DebouncedWriter<CampaignWritable> {
  return createDebouncedWriter<CampaignWritable>((data) =>
    updateCampaign(campaignId, reconcileEncounterPointer(data))
  );
}

/** Dev-bypass counterpart: merge the same writable projection into a local document. */
export function createDevCampaignSave(
  _uid: string,
  campaignId: string
): DebouncedWriter<CampaignWritable> {
  return createDebouncedWriter<CampaignWritable>((data) => {
    updateDevDocument(
      DEV_CAMPAIGN_COLLECTION,
      campaignId,
      resolveDevCampaign(campaignId),
      (current) => ({
        ...current,
        ...reconcileEncounterPointer(data),
        updatedAt: new Date(),
      })
    );
    return Promise.resolve();
  });
}

/**
 * Subscribe to a single campaign document. `uid` is accepted for the shared
 * `subscribe(uid, docId, …)` signature (the path needs only the id). Returns an
 * unsubscribe function — call it in effect cleanup.
 */
export function subscribeToCampaign(
  _uid: string,
  campaignId: string,
  callback: (doc: CampaignDoc | null) => void,
  onError?: (err: Error) => void
): () => void {
  if (devBypassEnabled()) {
    return subscribeDevDocument<CampaignDoc>(
      DEV_CAMPAIGN_COLLECTION,
      campaignId,
      (stored) =>
        callback(
          stored
            ? toCampaignDoc(campaignId, stored as unknown as Record<string, unknown>)
            : readDevCampaign(campaignId)
        )
    );
  }
  return onSnapshot(
    campaignDoc(campaignId),
    (snap) => {
      callback(snap.exists() ? toCampaignDoc(snap.id, snap.data()) : null);
    },
    (err) => onError?.(err)
  );
}

/**
 * List the Shared campaigns `uid` belongs to — a membership-scoped query
 * (`members array-contains uid`), the ONLY list shape the security rules permit.
 * Never enumerates other players' campaigns. Under dev bypass it returns the
 * seeded dev campaign so the list is REACHABLE locally (D29 — "give me a dev-mode
 * way to test campaigns"); clicking it opens the hub the same fixture seeds.
 */
export async function listSharedCampaigns(uid: string): Promise<CampaignDoc[]> {
  if (devBypassEnabled()) return [readDevCampaign(makeDevCampaign().id)];
  const q = query(collection(db, "campaigns"), where("members", "array-contains", uid));
  // Both reads are BOUNDED: a wedged Firestore local layer (the 2026-07-09 "Clear
  // site data" incident) can hang either one indefinitely, and every caller must get
  // a rejection it can surface (Retry) — never an infinite spinner.
  let snap = await withTimeout(getDocs(q), CAMPAIGNS_READ_TIMEOUT_MS, "campaigns read");
  // Boot-resilience: after the local cache is wiped mid-session, this one-shot
  // resolves from the now-EMPTY cache, which would render the misleading "no
  // campaigns" empty state. An EMPTY result that is only `fromCache` is not
  // authoritative — force a fresh server read (which also bypasses the wedged local
  // layer). When genuinely offline we keep the cached (empty) answer rather than
  // throw; `getDocsFromServer` rejects offline, so guard it.
  if (snap.empty && snap.metadata.fromCache && navigator.onLine) {
    snap = await withTimeout(
      getDocsFromServer(q),
      CAMPAIGNS_READ_TIMEOUT_MS,
      "campaigns server read"
    );
  }
  return snap.docs.map((d) => toCampaignDoc(d.id, d.data()));
}

/** Bound on each campaigns-list read — a wedged SDK must surface a recoverable
 *  error, never hang a caller forever (mirrors the roster's confirm timeout). */
const CAMPAIGNS_READ_TIMEOUT_MS = 10_000;

/**
 * INIT-2 — subscribe LIVE to the Shared campaigns `uid` belongs to (the SAME
 * membership-scoped `array-contains` query as {@link listSharedCampaigns}, the only list
 * shape the rules permit). Mounted ONCE at the shell so the global combat pip + the sheet
 * in-combat region both read from ONE listener — and, unlike the one-shot `getDocs`, it
 * RE-FIRES the instant the DM starts/ends an encounter, so combat surfaces without a
 * reload. At 6-user scale this single query listener is trivially free-tier. Returns an
 * unsubscribe. Under dev bypass it delivers the seeded fixture once (no real listener).
 */
export function subscribeToSharedCampaigns(
  uid: string,
  callback: (campaigns: CampaignDoc[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (devBypassEnabled()) {
    // A seeded pip roll-state scenario (the `combat-pip-needs-roll` e2e) overrides the
    // standard dev campaign with fixtures where the viewer is a PC, so the REAL pip
    // resolution runs; otherwise the normal single dev campaign.
    const scenario = makeDevPipCampaigns(devPipScenario());
    if (scenario) {
      callback(scenario);
      return () => {};
    }
    const campaignId = makeDevCampaign().id;
    return subscribeDevDocument<CampaignDoc>(
      DEV_CAMPAIGN_COLLECTION,
      campaignId,
      (stored) =>
        callback([
          stored
            ? toCampaignDoc(campaignId, stored as unknown as Record<string, unknown>)
            : readDevCampaign(campaignId),
        ])
    );
  }
  const q = query(collection(db, "campaigns"), where("members", "array-contains", uid));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => toCampaignDoc(d.id, d.data()))),
    (err) => onError?.(err)
  );
}

/**
 * Delete a campaign and cascade its subcollections (DM-only — `firestore.rules`
 * `allow delete: if isDm()`). Firestore does not cascade, so the known
 * subcollections (every session + the single chronicle doc) are deleted first,
 * then the parent — no orphaned sub-resources (the no-leaks rule). No-op under dev
 * bypass. The DM is a member, so the subcollection writes are permitted.
 */
export async function deleteCampaign(campaignId: string): Promise<void> {
  if (devBypassEnabled()) return;
  // Cascade the custom banner in Storage too — it's addressed by path, not a
  // parent relationship, so deleting the campaign doc alone would leak the file.
  // Idempotent (ignores "not-found" when the campaign used the default art),
  // mirroring deleteCharacter's portrait cascade (the no-leaks rule).
  await deleteCampaignBanner(campaignId);
  const sessions = await getDocs(sessionsCollection(campaignId));
  await Promise.all(
    sessions.docs.map((d) => deleteDoc(doc(sessionsCollection(campaignId), d.id)))
  );
  for (const col of [notesCollection(campaignId), dmNotesCollection(campaignId)]) {
    const notes = await getDocs(col);
    await Promise.all(notes.docs.map((d) => deleteDoc(doc(col, d.id))));
  }
  await deleteDoc(chronicleDoc(campaignId)).catch(() => {});
  await deleteDoc(campaignDoc(campaignId));
}

// ─── Notes subcollections (the content-sharing soft-reveal — PATH-based gate) ────
//
// Shared notes are per-note documents (the doc id IS the note id), NOT an array on
// the campaign doc, AND a note's visibility is encoded in WHICH collection holds it:
//   • `/campaigns/{campId}/notes/{noteId}`   — REVEALED notes, readable by all members;
//   • `/campaigns/{campId}/dmNotes/{noteId}` — HIDDEN notes, readable by the DM/admin ONLY.
// This is what makes the soft-reveal SERVER-ENFORCED. A per-DOCUMENT `dmOnly` flag
// could NOT enforce it: Firestore security rules are NOT filters — a `list` query is
// not evaluated against each document's data, so a content-based read rule
// (`resource.data.dmOnly != true`) lets a member's UNSCOPED list return the hidden
// docs anyway. A COLLECTION-path gate has no such hole: a member simply cannot read
// or list `dmNotes` at all. Revealing/hiding a note MOVES it between the two
// collections (DM-only, since it writes `dmNotes`). The `SharedNote.dmOnly` field is
// derived from the collection on read (a hidden note carries `dmOnly: true`).

function notesCollection(campaignId: string) {
  return collection(db, "campaigns", campaignId, "notes");
}

function dmNotesCollection(campaignId: string) {
  return collection(db, "campaigns", campaignId, "dmNotes");
}

/** The document ref for a note in its visibility's collection. */
function noteRef(campaignId: string, noteId: string, hidden: boolean) {
  return doc(db, "campaigns", campaignId, hidden ? "dmNotes" : "notes", noteId);
}

/**
 * Parse one note document off the wire: the doc id IS the note id, and the only
 * date-bearing field (`updatedAt`) is normalized Timestamp → Date by the generic
 * deep-walker (tolerant of a note written before the field existed → epoch). `hidden`
 * comes from WHICH collection the doc was read from, surfaced as `dmOnly: true`.
 */
function toSharedNote(
  id: string,
  raw: Record<string, unknown>,
  hidden: boolean
): SharedNote {
  const data = timestampsToDates(raw);
  return {
    id,
    title: typeof data.title === "string" ? data.title : "",
    content: typeof data.content === "string" ? data.content : "",
    pinned: data.pinned === true,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "",
    updatedAt: data.updatedAt instanceof Date ? data.updatedAt : new Date(0),
    ...(hidden ? { dmOnly: true } : {}),
  };
}

/** The fields persisted for a note (visibility is the COLLECTION, never a field). */
function noteWriteData(note: SharedNote): Record<string, unknown> {
  return stripUndefined({
    title: note.title,
    content: note.content,
    pinned: note.pinned,
    createdBy: note.createdBy,
    updatedAt: serverTimestamp(),
  }) as Record<string, unknown>;
}

/**
 * Subscribe to a campaign's shared notes. A player reads ONLY the revealed
 * collection (`notes`); the DM/admin reads BOTH and the two live snapshots are
 * merged (hidden notes tagged `dmOnly: true`). Returns an unsubscribe function that
 * tears down every underlying listener. Under dev bypass there is no Firestore, so
 * the seeded fixture notes are delivered once (the DM sees all; a player only the
 * revealed ones).
 */
export function subscribeToCampaignNotes(
  campaignId: string,
  dmView: boolean,
  callback: (notes: SharedNote[]) => void,
  onError?: (err: Error) => void
): () => void {
  if (devBypassEnabled()) {
    const seed = makeDevNotes();
    callback(dmView ? seed : seed.filter((n) => !n.dmOnly));
    return () => {};
  }
  const onErr = (err: Error) => onError?.(err);
  if (!dmView) {
    return onSnapshot(
      notesCollection(campaignId),
      (snap) => callback(snap.docs.map((d) => toSharedNote(d.id, d.data(), false))),
      onErr
    );
  }
  // DM/admin: merge the revealed + hidden collections into one live list. Each
  // half emits only once BOTH have delivered their first snapshot, so the board
  // never flashes a partial (hidden-less) list.
  let revealed: SharedNote[] = [];
  let hidden: SharedNote[] = [];
  let haveRevealed = false;
  let haveHidden = false;
  const emit = () => {
    if (haveRevealed && haveHidden) callback([...revealed, ...hidden]);
  };
  const unsubRevealed = onSnapshot(
    notesCollection(campaignId),
    (snap) => {
      revealed = snap.docs.map((d) => toSharedNote(d.id, d.data(), false));
      haveRevealed = true;
      emit();
    },
    onErr
  );
  const unsubHidden = onSnapshot(
    dmNotesCollection(campaignId),
    (snap) => {
      hidden = snap.docs.map((d) => toSharedNote(d.id, d.data(), true));
      haveHidden = true;
      emit();
    },
    onErr
  );
  return () => {
    unsubRevealed();
    unsubHidden();
  };
}

/**
 * Create or replace one shared note IN PLACE — written to its CURRENT visibility's
 * collection (revealed → `notes`, hidden → `dmNotes`). Used for add / edit / pin,
 * which never change visibility; toggling reveal/hide is {@link setCampaignNoteHidden}.
 * The rules let any member write `notes` but only the DM/admin write `dmNotes`, so a
 * member can only ever create/edit a revealed note. No-op under dev bypass.
 */
export async function setCampaignNote(
  campaignId: string,
  note: SharedNote
): Promise<void> {
  if (devBypassEnabled()) return;
  await setDoc(noteRef(campaignId, note.id, note.dmOnly === true), noteWriteData(note));
}

/**
 * Reveal or hide a note — the soft-reveal toggle. Visibility is the collection, so
 * this MOVES the doc: it deletes the note from its old collection and writes it to
 * the target one, atomically in a batch. DM/admin-only (it writes `dmNotes`, which
 * the rules gate to the DM). `note` is the note in its CURRENT state; `hidden` is the
 * desired next visibility. No-op under dev bypass.
 */
export async function setCampaignNoteHidden(
  campaignId: string,
  note: SharedNote,
  hidden: boolean
): Promise<void> {
  if (devBypassEnabled()) return;
  const batch = writeBatch(db);
  batch.delete(noteRef(campaignId, note.id, !hidden));
  batch.set(noteRef(campaignId, note.id, hidden), noteWriteData(note));
  await batch.commit();
}

/**
 * Delete one shared note from its visibility's collection (`hidden` selects which).
 * A member may delete a revealed note; a hidden one is DM/admin-only (the rules).
 * No-op under dev bypass.
 */
export async function deleteCampaignNote(
  campaignId: string,
  noteId: string,
  hidden: boolean
): Promise<void> {
  if (devBypassEnabled()) return;
  await deleteDoc(noteRef(campaignId, noteId, hidden));
}

/**
 * Transitional (rule 10) — durably remove ONE note from the LEGACY
 * `campaign.sharedNotes` array, the pre-soft-reveal home that the read-fallback
 * still surfaces. Called when a legacy (not-yet-migrated) note is DELETED or HIDDEN:
 * both must drop the everyone-readable campaign-doc copy (an edit or pin leaves the
 * note visible, so the promoted subcollection copy simply shadows it via
 * {@link mergeSharedNotes} — no eviction needed). A transaction reads the RAW array
 * (Timestamps preserved, no Date round-trip) and writes back the filtered array, or
 * `deleteField()` when it empties. No-op if the id isn't present or the array is
 * already gone (post-migration). The member-update rule lets any member write
 * `sharedNotes` (a shared artifact), so a player deleting a revealed legacy note is
 * permitted; hiding is DM-only (the unconstrained `isDm()` branch). Deleted together
 * with `scripts/migrate-shared-notes.ts`. No-op under dev bypass.
 */
export async function evictLegacyNote(campaignId: string, noteId: string): Promise<void> {
  if (devBypassEnabled()) return;
  const ref = campaignDoc(campaignId);
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    // Read the RAW array (its `updatedAt`s are still wire Timestamps) and write the
    // filtered array straight back, so no element is round-tripped through a Date.
    const raw = (snap.data() as Partial<CampaignDoc> | undefined)?.sharedNotes;
    if (!raw || raw.length === 0) return;
    const next = raw.filter((n) => n.id !== noteId);
    if (next.length === raw.length) return; // not present → nothing to write
    txn.update(ref, {
      sharedNotes: next.length > 0 ? next : deleteField(),
      updatedAt: serverTimestamp(),
    });
  });
}

// ─── Chronicle subcollection (single doc, real-time via the §7.1 abstraction) ──
//
// The shared campaign log lives at `/campaigns/{campId}/chronicle/main` — a single
// doc the rules member-gate (via the parent get). It is read through a scoped
// `firestore-subscriptions` listener; a Save commits ATOMICALLY through
// `commitChronicleEdit` (a transaction that snapshots the server's current text into
// the version history before overwriting), so concurrent editors compose instead of
// clobbering — the chronicle is a READ-ONLY subscription (no debounced writer).

function chronicleDoc(campaignId: string) {
  return doc(db, "campaigns", campaignId, "chronicle", "main");
}

function toChronicleDoc(raw: Record<string, unknown>): ChronicleDoc {
  // Normalize every Timestamp → Date in one pass (top-level + array-nested
  // `versions[].timestamp`), then shape the fields and default any MISSING date to
  // epoch 0 (the deep-walker only converts Timestamps it finds; absent fields are
  // defaulted here).
  const data = timestampsToDates(raw);
  return {
    text: typeof data.text === "string" ? data.text : "",
    lastEditedBy: typeof data.lastEditedBy === "string" ? data.lastEditedBy : "",
    lastEditedAt: data.lastEditedAt instanceof Date ? data.lastEditedAt : new Date(0),
    versions: Array.isArray(data.versions)
      ? data.versions.map((v): ChronicleDoc["versions"][number] => {
          const ver = v as Record<string, unknown>;
          return {
            timestamp: ver.timestamp instanceof Date ? ver.timestamp : new Date(0),
            editedBy: typeof ver.editedBy === "string" ? ver.editedBy : "",
            editedByName: typeof ver.editedByName === "string" ? ver.editedByName : "",
            textSnapshot: typeof ver.textSnapshot === "string" ? ver.textSnapshot : "",
          };
        })
      : [],
  };
}

/**
 * Subscribe to a campaign's chronicle doc. `null` = "no chronicle yet" (a valid
 * empty state — the first edit creates it). Returns an unsubscribe function.
 */
export function subscribeToChronicle(
  _uid: string,
  campaignId: string,
  callback: (doc: ChronicleDoc | null) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    chronicleDoc(campaignId),
    (snap) => {
      callback(snap.exists() ? toChronicleDoc(snap.data()) : null);
    },
    (err) => onError?.(err)
  );
}

/**
 * B18 — commit a chronicle SAVE ATOMICALLY, so concurrent editors compose instead of
 * silently overwriting each other's text AND erasing it from the version history meant to
 * recover it.
 *
 * The old path snapshotted the editor's LOCAL pre-edit text and shipped the whole
 * `{text, versions}` through the debounced last-write-wins writer: a second editor saving
 * against the same base overwrote the first's text and never captured it in any version.
 * Here a transaction re-reads the SERVER's CURRENT chronicle inside the txn and snapshots
 * THAT (which may already carry a concurrent editor's paragraph) into history via the
 * capped {@link pushVersion} BEFORE writing the new text — so no editor's text is ever
 * lost from the restore history, and the array stays bounded (never the whole-object
 * clobber). Text itself is last-write-wins (a single shared field), but always recoverable
 * from a version. The snapshot's `editedByName` is left empty on purpose: the reader
 * resolves the (possibly concurrent) prior editor's live name from `memberDetails`.
 *
 * A transaction needs a live round-trip, so an OFFLINE save rejects — the caller surfaces
 * that honestly (a shared collaborative log should not silently queue an offline edit that
 * would land later and clobber). No-op under dev bypass.
 */
export async function commitChronicleEdit(
  campaignId: string,
  edit: { text: string; editedBy: string }
): Promise<void> {
  if (devBypassEnabled()) return;
  const ref = chronicleDoc(campaignId);
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    const prior = snap.exists()
      ? toChronicleDoc(snap.data())
      : { text: "", lastEditedBy: "", lastEditedAt: new Date(0), versions: [] };
    const versions = pushVersion(prior.versions, {
      timestamp: prior.lastEditedAt,
      editedBy: prior.lastEditedBy,
      editedByName: "",
      textSnapshot: prior.text,
    });
    txn.set(
      ref,
      {
        text: edit.text,
        lastEditedBy: edit.editedBy,
        versions,
        lastEditedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/** Concatenate a new chapter onto the prior chronicle text — a blank-line gap between
 *  chapters, or the chapter alone when the chronicle is empty. Pure (testable without
 *  the emulator). */
export function joinChronicleText(prior: string, chapter: string): string {
  return prior.trim() ? `${prior.trimEnd()}\n\n${chapter}` : chapter;
}

/**
 * APPEND one Combat-Chronicle chapter to the campaign's shared chronicle — the SINGLE
 * persisted write per finished encounter. A transaction reads the SERVER's CURRENT
 * text INSIDE the txn and concatenates the chapter onto it (never a whole-object
 * clobber of a stale client copy — golden rule 6, the app carries the consistency
 * burden), snapshotting the pre-append text into the capped version history first so
 * it stays restorable. Idempotent-safe against concurrent edits: a concurrent editor's
 * paragraph is captured in a version, and the chapter still lands at the end.
 *
 * A transaction needs a live round-trip, so an OFFLINE close rejects — the caller
 * surfaces that honestly and leaves the encounter running so the DM can retry. No-op
 * under dev bypass.
 */
export async function appendChronicleChapter(
  campaignId: string,
  append: { chapter: string; editedBy: string }
): Promise<void> {
  if (devBypassEnabled()) return;
  const ref = chronicleDoc(campaignId);
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(ref);
    const prior = snap.exists()
      ? toChronicleDoc(snap.data())
      : { text: "", lastEditedBy: "", lastEditedAt: new Date(0), versions: [] };
    const versions = pushVersion(prior.versions, {
      timestamp: prior.lastEditedAt,
      editedBy: prior.lastEditedBy,
      editedByName: "",
      textSnapshot: prior.text,
    });
    const text = joinChronicleText(prior.text, append.chapter);
    txn.set(
      ref,
      {
        text,
        lastEditedBy: append.editedBy,
        versions,
        lastEditedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

// ─── Sessions subcollection (one-shot read on open; NOT a listener) ────────────
//
// The session list lives at `/campaigns/{campId}/sessions/{sessId}` (member-gated
// by the rules). Per NFR it is read on-open + cached (a bounded one-shot query,
// never a standing collection listener) and appended to; the rich per-participant
// logs + AI recaps are Phase 6.

function sessionsCollection(campaignId: string) {
  return collection(db, "campaigns", campaignId, "sessions");
}

function toSessionLogDoc(id: string, raw: Record<string, unknown>): SessionLogDoc {
  // Normalize every Timestamp → Date first (top-level `date`/`recapRequestedAt`
  // AND the map-nested `logs[uid].syncedAt`, which Firestore does NOT
  // auto-convert), then shape + default MISSING dates.
  const data = timestampsToDates(raw);
  return {
    id,
    date: data.date instanceof Date ? data.date : new Date(0),
    label: typeof data.label === "string" ? data.label : "",
    notes: typeof data.notes === "string" ? data.notes : "",
    recapRequested: data.recapRequested === true,
    recapRequestedBy:
      typeof data.recapRequestedBy === "string" ? data.recapRequestedBy : null,
    recapRequestedAt:
      data.recapRequestedAt instanceof Date ? data.recapRequestedAt : null,
    logs: (data.logs as SessionLogDoc["logs"] | undefined) ?? {},
    generatedRecap: typeof data.generatedRecap === "string" ? data.generatedRecap : null,
    addedToChronicle: data.addedToChronicle === true,
  };
}

/** Cap the sessions read so a long-running campaign can't pull an unbounded
 *  subcollection (#50 / free-tier NFR). 100 sessions is years of weekly play. */
const SESSIONS_LIMIT = 100;

/** List a campaign's sessions, newest first (one-shot, bounded). Empty under dev
 *  bypass. B29 — the query orders by `date` DESC *before* the cap so the retained
 *  100 are always the NEWEST: a bare `limit()` orders by document id (auto-ids are
 *  not date-correlated), so past 100 sessions Firestore could silently drop the most
 *  recent ones. Every session is created with a `date` (see {@link createSession}),
 *  so none is excluded by the ordered query. The client-side sort is kept as a
 *  belt-and-braces tiebreak on the (already newest-100) result. */
export async function listSessions(campaignId: string): Promise<SessionLogDoc[]> {
  if (devBypassEnabled()) return makeDevSessions();
  const snap = await getDocs(
    query(sessionsCollection(campaignId), orderBy("date", "desc"), limit(SESSIONS_LIMIT))
  );
  return snap.docs
    .map((d) => toSessionLogDoc(d.id, d.data()))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Rename / re-date a session (#49). Members may write the subcollection (rules
 *  line "campaigns/{id}/{subcol}/{docId}"). No write under dev bypass. */
export async function updateSession(
  campaignId: string,
  sessionId: string,
  data: { label?: string; date?: Date; notes?: string }
): Promise<void> {
  if (devBypassEnabled()) return;
  await updateDoc(
    doc(sessionsCollection(campaignId), sessionId),
    stripUndefined(data) as Record<string, unknown>
  );
}

/** Delete a session log (#49). DM-or-member per the subcollection rule. No write
 *  under dev bypass. */
export async function deleteSession(
  campaignId: string,
  sessionId: string
): Promise<void> {
  if (devBypassEnabled()) return;
  await deleteDoc(doc(sessionsCollection(campaignId), sessionId));
}

/** Create a new (empty) session log. Returns its id; no write under dev bypass. */
export async function createSession(
  campaignId: string,
  opts: { label: string; date: Date }
): Promise<string> {
  const ref = doc(sessionsCollection(campaignId));
  if (devBypassEnabled()) return ref.id;
  await setDoc(
    ref,
    stripUndefined({
      date: opts.date,
      label: opts.label,
      notes: "",
      recapRequested: false,
      recapRequestedBy: null,
      recapRequestedAt: null,
      logs: {},
      generatedRecap: null,
      addedToChronicle: false,
    }) as Record<string, unknown>
  );
  return ref.id;
}
