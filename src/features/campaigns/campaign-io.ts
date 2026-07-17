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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { advanceTurn, prevTurn, removeCombatant } from "@/features/campaigns/encounter";
import { attachViolatesOneCampaign } from "@/features/campaigns/attach-guard";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { pushVersion } from "@/features/campaigns/chronicle-versions";
import type { EncounterState } from "@/types/campaign";
import {
  makeDevCampaign,
  makeDevNotes,
  makeDevSessions,
  makeDevPipCampaigns,
  devPipScenario,
} from "@/features/campaigns/dev-fixture";
import { stripUndefined } from "@/lib/strip-undefined";
import { withTimeout } from "@/lib/promise-timeout";
import { timestampsToDates } from "@/lib/timestamps-to-dates";
import { nonEmptyString } from "@/lib/non-empty-string";
import { deleteCampaignBanner } from "@/lib/storage";
import type {
  CampaignDoc,
  ChronicleDoc,
  SessionLogDoc,
  SharedNote,
  MemberCharacterSnapshot,
  TreasuryLogEntry,
} from "@/types/campaign";
import type { PortraitCrop } from "@/types/character";
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
  return { ...doc, memberDetails: conformCampaignMembers(doc.memberDetails) };
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
  if (DEV_BYPASS_AUTH) return code;
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
  if (DEV_BYPASS_AUTH) return inviteCode;
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return "attached";
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
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
    txn.update(ref, {
      "encounter.currentCombatantId": next.currentCombatantId,
      "encounter.round": next.round,
      updatedAt: serverTimestamp(),
    });
  });
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
  turn: { order: string[]; currentCombatantId: string; round: number }
): Promise<void> {
  if (DEV_BYPASS_AUTH) return;
  await updateDoc(campaignDoc(campaignId), {
    "encounter.order": turn.order,
    "encounter.currentCombatantId": turn.currentCombatantId,
    "encounter.round": turn.round,
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
  await updateDoc(campaignDoc(campaignId), {
    encounter: stripUndefined(encounter as unknown as Record<string, unknown>),
    encounterInit: {},
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
  if (DEV_BYPASS_AUTH) return;
  await updateDoc(campaignDoc(campaignId), {
    encounter: null,
    encounterInit: {},
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return [makeDevCampaign()];
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
  if (DEV_BYPASS_AUTH) {
    // A seeded pip roll-state scenario (the `combat-pip-needs-roll` e2e) overrides the
    // standard dev campaign with fixtures where the viewer is a PC, so the REAL pip
    // resolution runs; otherwise the normal single dev campaign.
    callback(makeDevPipCampaigns(devPipScenario()) ?? [makeDevCampaign()]);
    return () => {};
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) {
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return makeDevSessions();
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
  if (DEV_BYPASS_AUTH) return;
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
  if (DEV_BYPASS_AUTH) return;
  await deleteDoc(doc(sessionsCollection(campaignId), sessionId));
}

/** Create a new (empty) session log. Returns its id; no write under dev bypass. */
export async function createSession(
  campaignId: string,
  opts: { label: string; date: Date }
): Promise<string> {
  const ref = doc(sessionsCollection(campaignId));
  if (DEV_BYPASS_AUTH) return ref.id;
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
