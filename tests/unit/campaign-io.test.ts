/**
 * campaign-io shape tests (Phase 5 · Part 2a, gate item 5d). Mocks
 * `firebase/firestore` so it runs Firebase-free in CI, and asserts each I/O
 * function produces the EXACT Firestore mutation:
 *   • createCampaign — A13 invariants (creator ∈ members, createdBy = uid,
 *     dmUid = uid) + seeded empty treasury/log (notes are their own subcollection)
 *     + inviteCode == doc id;
 *   • joinCampaign — idempotent + attachment-blind: a first join self-adds via
 *     arrayUnion + per-leaf identity fields (NEVER characterId/character); a
 *     re-join as an existing member is a pure no-op (the clobber-bug regression);
 *   • listSharedCampaigns — a membership-scoped (`array-contains`) query, never an
 *     unbounded enumeration;
 *   • updateCampaign — writes the shared artifacts with a server `updatedAt`.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

const {
  setDocMock,
  updateDocMock,
  getDocMock,
  getDocsMock,
  getDocsFromServerMock,
  docMock,
  collectionMock,
  queryMock,
  whereMock,
  arrayUnionMock,
  arrayRemoveMock,
  deleteFieldMock,
  serverTimestampMock,
  onSnapshotMock,
  deleteDocMock,
  limitMock,
  orderByMock,
  incrementMock,
  runTransactionMock,
} = vi.hoisted(() => ({
  setDocMock: vi.fn<(ref: unknown, data: Record<string, unknown>) => Promise<void>>(() =>
    Promise.resolve()
  ),
  updateDocMock: vi.fn<(ref: unknown, data: Record<string, unknown>) => Promise<void>>(
    () => Promise.resolve()
  ),
  // Default: the campaign is unreadable to the caller (a brand-new joiner — the
  // production read is denied; here we model it as a non-existent snapshot), so
  // joinCampaign falls through to the first-join self-add. Re-join tests override
  // this per-call with an existing-member snapshot.
  getDocMock: vi.fn<() => Promise<{ exists: () => boolean; data?: () => unknown }>>(() =>
    Promise.resolve({ exists: () => false })
  ),
  getDocsMock: vi.fn<() => Promise<{ docs: unknown[] }>>(() =>
    Promise.resolve({ docs: [] })
  ),
  getDocsFromServerMock: vi.fn<() => Promise<{ docs: unknown[] }>>(() =>
    Promise.resolve({ docs: [] })
  ),
  docMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __doc: args })),
  collectionMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __col: args })),
  queryMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __query: args })),
  whereMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __where: args })),
  arrayUnionMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({
    __arrayUnion: args,
  })),
  arrayRemoveMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({
    __arrayRemove: args,
  })),
  deleteFieldMock: vi.fn<() => unknown>(() => ({ __deleteField: true })),
  serverTimestampMock: vi.fn<() => unknown>(() => ({ __serverTimestamp: true })),
  onSnapshotMock: vi.fn<() => () => void>(() => () => {}),
  deleteDocMock: vi.fn<(ref: unknown) => Promise<void>>(() => Promise.resolve()),
  limitMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __limit: args })),
  orderByMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({ __orderBy: args })),
  incrementMock: vi.fn<(...args: unknown[]) => unknown>((...args) => ({
    __increment: args,
  })),
  runTransactionMock:
    vi.fn<(db: unknown, fn: (txn: unknown) => Promise<unknown>) => Promise<unknown>>(),
}));

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firebase", () => ({ db: { __db: true } }));
vi.mock("firebase/firestore", () => ({
  setDoc: setDocMock,
  updateDoc: updateDocMock,
  getDoc: getDocMock,
  getDocs: getDocsMock,
  getDocsFromServer: getDocsFromServerMock,
  doc: docMock,
  collection: collectionMock,
  query: queryMock,
  where: whereMock,
  arrayUnion: arrayUnionMock,
  arrayRemove: arrayRemoveMock,
  deleteField: deleteFieldMock,
  serverTimestamp: serverTimestampMock,
  onSnapshot: onSnapshotMock,
  deleteDoc: deleteDocMock,
  limit: limitMock,
  orderBy: orderByMock,
  increment: incrementMock,
  runTransaction: runTransactionMock,
  // A faithful Timestamp double: `new Timestamp(seconds, nanos)` round-trips to a
  // real Date, so the conformance guard can assert ordering, not just type.
  Timestamp: class {
    seconds: number;
    nanoseconds: number;
    constructor(seconds = 0, nanoseconds = 0) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    toDate(): Date {
      return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6));
    }
  },
}));
// Stub Storage so deleteCampaign's banner cascade runs Firebase-free.
vi.mock("@/lib/storage", () => ({
  deleteCampaignBanner: vi.fn(() => Promise.resolve()),
}));

import {
  advanceEncounterTurn,
  applyTreasuryDelta,
  attachMemberCharacter,
  commitChronicleEdit,
  createCampaign,
  createCampaignSave,
  joinCampaign,
  listSharedCampaigns,
  persistBeginTurns,
  subscribeToCampaign,
  subscribeToCampaignNotes,
  undoTreasuryEntry,
  updateCampaign,
  removeMember,
  setJoinsLocked,
  deleteSession,
  updateSession,
  listSessions,
  deleteCampaign,
} from "@/features/campaigns/campaign-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { deleteCampaignBanner } from "@/lib/storage";
import type {
  CampaignDoc,
  EncounterCombatant,
  EncounterMonster,
  EncounterState,
  TreasuryLogEntry,
} from "@/types/campaign";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("campaign-io — advanceEncounterTurn (P2 scoped turn write)", () => {
  const encounter: EncounterState = {
    round: 1,
    currentCombatantId: "pc-a",
    // The FROZEN turn order on the doc — the transaction reads THIS (no caller-supplied
    // orderedIds), so every caller steps the identical sequence.
    order: ["pc-a", "monster-1"],
    epoch: 1,
    status: "active",
    combatants: [
      { kind: "pc", id: "pc-a", memberUid: "a", characterId: "char-a" },
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 8,
        conditions: [],
        maxHp: 7,
        tokens: [7],
      },
    ],
  };

  /** Drive the transaction with a snapshot whose `encounter` is `seed`, capturing the
   *  dot-path `txn.update(...)` payload. */
  function runWith(seed: EncounterState | undefined): {
    update: ReturnType<typeof vi.fn>;
  } {
    const update = vi.fn();
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: () => Promise.resolve({ data: () => ({ encounter: seed }) }),
        update,
      })
    );
    return { update };
  }

  it("advances ONLY the two turn fields with a dot-path update (diff-scoped)", async () => {
    const { update } = runWith(encounter);
    await advanceEncounterTurn("camp1", "next", { uid: "a", isDm: false }, "pc-a");
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    // From pc-a (idx 0) → monster-1, same round; ONLY the turn fields + updatedAt.
    expect(data["encounter.currentCombatantId"]).toBe("monster-1");
    expect(data["encounter.round"]).toBe(1);
    expect(Object.keys(data).sort()).toEqual([
      "encounter.currentCombatantId",
      "encounter.round",
      "updatedAt",
    ]);
  });

  it("prev wraps from the first combatant back a round (floored at 1)", async () => {
    const { update } = runWith(encounter);
    await advanceEncounterTurn("camp1", "prev", { uid: "a", isDm: false }, "pc-a");
    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data["encounter.currentCombatantId"]).toBe("monster-1");
    // Round-1 prev floors at 1 (never 0).
    expect(data["encounter.round"]).toBe(1);
  });

  it("is a tolerant no-op when no encounter exists (a member can't conjure a turn)", async () => {
    const { update } = runWith(undefined);
    await advanceEncounterTurn("camp1", "next", { uid: "a", isDm: false }, "pc-a");
    expect(update).not.toHaveBeenCalled();
  });

  it("a non-DM who does NOT own the current turn is a tolerant no-op (INIT-6 re-validate)", async () => {
    const { update } = runWith(encounter); // current turn is pc-a
    await advanceEncounterTurn("camp1", "next", { uid: "b", isDm: false }, "pc-a");
    expect(update).not.toHaveBeenCalled();
  });

  it("the DM may advance any turn", async () => {
    const { update } = runWith(encounter);
    await advanceEncounterTurn("camp1", "next", { uid: "dm", isDm: true }, "pc-a");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("is a no-op before turns have begun (currentCombatantId null)", async () => {
    const { update } = runWith({ ...encounter, currentCombatantId: null });
    await advanceEncounterTurn("camp1", "next", { uid: "dm", isDm: true }, null);
    expect(update).not.toHaveBeenCalled();
  });

  it("CAS: a stale double-click (expected pointer no longer current) is a clean no-op", async () => {
    // The FRESH pointer has already moved to monster-1 (the first click committed), but the
    // caller still carries the pre-advance expected pointer (pc-a) from the un-reconciled
    // render — even the DM, who otherwise may advance any turn, must NOT step a second time.
    const { update } = runWith({ ...encounter, currentCombatantId: "monster-1" });
    await advanceEncounterTurn("camp1", "next", { uid: "dm", isDm: true }, "pc-a");
    expect(update).not.toHaveBeenCalled();
  });

  it("CAS: an advance whose expected pointer MATCHES the fresh pointer proceeds", async () => {
    // The confirming case — expected === fresh → the single legitimate step commits.
    const { update } = runWith(encounter); // fresh currentCombatantId is pc-a
    await advanceEncounterTurn("camp1", "next", { uid: "dm", isDm: true }, "pc-a");
    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data["encounter.currentCombatantId"]).toBe("monster-1");
  });
});

describe("campaign-io — session subcollection writes (#49/#50)", () => {
  it("updateSession patches the named session doc", async () => {
    await updateSession("camp1", "sess1", { label: "Session 2" });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data).toEqual({ label: "Session 2" });
  });

  it("deleteSession deletes one session doc", async () => {
    await deleteSession("camp1", "sess1");
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });

  it("listSessions bounds the read with a limit (#50)", async () => {
    await listSessions("camp1");
    expect(limitMock).toHaveBeenCalledTimes(1);
    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });

  it("listSessions orders by date DESC before the cap so the NEWEST are retained (B29)", async () => {
    // Without an explicit orderBy, `limit(100)` orders by document id (auto-ids are not
    // date-correlated), so past 100 sessions Firestore could silently drop the most
    // recent ones. The query must order by `date` DESC so the cap keeps the newest.
    await listSessions("camp1");
    expect(orderByMock).toHaveBeenCalledWith("date", "desc");
    // The query is assembled orderBy-then-limit (the ordered set is what gets capped).
    const queryArgs = queryMock.mock.calls.at(-1) as unknown[];
    expect(queryArgs).toContainEqual({ __orderBy: ["date", "desc"] });
    expect(queryArgs).toContainEqual({ __limit: [100] });
  });

  it("deleteCampaign cascades sessions + notes + dmNotes + chronicle then the parent", async () => {
    // getDocs is called in order: sessions, revealed notes, hidden dmNotes.
    getDocsMock
      .mockResolvedValueOnce({
        docs: [
          { id: "s1", data: () => ({}) },
          { id: "s2", data: () => ({}) },
        ],
      })
      .mockResolvedValueOnce({ docs: [{ id: "n1", data: () => ({}) }] })
      .mockResolvedValueOnce({ docs: [{ id: "h1", data: () => ({}) }] });
    await deleteCampaign("camp1");
    // 2 sessions + 1 note + 1 dmNote + 1 chronicle + 1 parent = 6 deletes (no
    // orphaned sub-resources — both note collections are cascaded).
    expect(deleteDocMock).toHaveBeenCalledTimes(6);
    // …and the Storage banner is cascaded too (no orphan file leak).
    expect(deleteCampaignBanner).toHaveBeenCalledWith("camp1");
  });
});

describe("campaign-io — write shapes", () => {
  it("createCampaign builds an A13-valid CampaignDoc (creator = member + createdBy + dmUid)", async () => {
    const id = await createCampaign("u1", {
      name: "The Starless Keep",
      displayName: "Aria",
    });

    expect(setDocMock).toHaveBeenCalledTimes(1);
    const data = setDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data.name).toBe("The Starless Keep");
    expect(data.createdBy).toBe("u1");
    expect(data.dmUid).toBe("u1");
    expect(data.members).toEqual(["u1"]);
    expect(data.memberDetails).toEqual({
      u1: { displayName: "Aria", photoURL: null, characterId: null, role: "dm" },
    });
    expect(data.status).toBe("active");
    expect(data.treasury).toEqual({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
    expect(data.treasuryLog).toEqual([]);
    // Shared notes are their own subcollection now — NOT seeded on the campaign doc.
    expect(data.sharedNotes).toBeUndefined();

    // The invite code IS the document id (both present, non-empty, addressed).
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    expect(data.inviteCode).toBe(id);
    expect(docMock).toHaveBeenCalledWith({ __db: true }, "campaigns", id);

    // REGRESSION (createdAt hotfix — "Iniziata {date}" blank on app-created cards):
    // the two server-time sentinels must be written as the RAW value
    // `serverTimestamp()` returns, added AFTER `stripUndefined` — never THROUGH it.
    // A real `serverTimestamp()` is a `FieldValue` class instance with one enumerable
    // field (`_methodName`); routing it through `stripUndefined` (which special-cases
    // only Date/Timestamp) recursed INTO it and flattened the sentinel to a dead
    // `{ _methodName: "serverTimestamp" }` map, so Firestore persisted a plain object
    // and `createdAt` read back as a non-Date → the card never rendered the start date.
    // `stripUndefined` returns a NEW object for any map, so REFERENTIAL identity to the
    // sentinel proves createdAt/updatedAt bypassed the strip (the fix). Before the fix
    // this failed — the written values were stripUndefined clones, not the sentinels.
    const stamps = serverTimestampMock.mock.results.map((r) => r.value as unknown);
    expect(data.createdAt).toBe(stamps[0]);
    expect(data.updatedAt).toBe(stamps[1]);
  });

  it("joinCampaign self-adds the joiner via arrayUnion + per-leaf identity fields (attachment-blind)", async () => {
    const id = await joinCampaign("u2", "INVITECODEABCD", "Borin");

    expect(id).toBe("INVITECODEABCD");
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(arrayUnionMock).toHaveBeenCalledWith("u2");
    expect(data.members).toEqual({ __arrayUnion: ["u2"] });
    // Per-leaf identity writes (NOT a whole-object set) — so a re-join can never
    // drop a sibling field.
    expect(data["memberDetails.u2.displayName"]).toBe("Borin");
    expect(data["memberDetails.u2.photoURL"]).toBeNull();
    expect(data["memberDetails.u2.role"]).toBe("player");
    // ATTACHMENT-BLIND (the clobber fix, safeguard 2): join NEVER writes
    // characterId or character — those belong to setMemberCharacter alone, so even
    // a misclassified re-join cannot wipe an attachment.
    expect(
      Object.keys(data).some(
        (k) => k.endsWith(".characterId") || k.endsWith(".character")
      )
    ).toBe(false);
    expect(docMock).toHaveBeenCalledWith({ __db: true }, "campaigns", "INVITECODEABCD");
  });

  it("joinCampaign is IDEMPOTENT — re-joining as an existing member writes NOTHING (clobber regression)", async () => {
    // THE production data-loss bug (campaign D7CKZNP7S7JYQJ): an already-attached
    // member who re-opened the still-shared invite link used to whole-object-
    // overwrite memberDetails[uid], dropping characterId + the `character` snapshot
    // → their hero vanished from the party. An existing member can READ the doc;
    // the no-op guard now short-circuits with ZERO writes, leaving the attachment
    // untouched. Fails before the fix (it issued the clobbering updateDoc).
    getDocMock.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({
        members: ["dm", "u2"],
        memberDetails: {
          u2: {
            displayName: "Borin",
            role: "player",
            characterId: "char-borin",
            character: { name: "Borin", race: "Dwarf", classes: [], ac: 18, hpMax: 30 },
          },
        },
      }),
    });

    const id = await joinCampaign("u2", "INVITECODEABCD", "Borin");

    expect(id).toBe("INVITECODEABCD");
    // No write whatsoever — the existing characterId + character survive intact.
    expect(updateDocMock).not.toHaveBeenCalled();
    expect(arrayUnionMock).not.toHaveBeenCalled();
  });

  it("create/join denormalize the member's Google photoURL (party avatar fallback)", async () => {
    await createCampaign("u1", {
      name: "Photo Test",
      displayName: "Aria",
      photoURL: "https://lh3.googleusercontent.com/a/aria",
    });
    const created = setDocMock.mock.calls[0]?.[1] as {
      memberDetails: { u1: { photoURL: string } };
    };
    expect(created.memberDetails.u1.photoURL).toBe(
      "https://lh3.googleusercontent.com/a/aria"
    );

    await joinCampaign("u9", "INVITECODEABCD", "Bron", "https://lh3/bron");
    const joined = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(joined["memberDetails.u9.photoURL"]).toBe("https://lh3/bron");
  });

  it("updateCampaign writes the shared artifacts with a server updatedAt", async () => {
    await updateCampaign("c1", { treasury: { pp: 1, gp: 0, ep: 0, sp: 0, cp: 0 } });

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data.treasury).toEqual({ pp: 1, gp: 0, ep: 0, sp: 0, cp: 0 });
    expect(data.updatedAt).toEqual({ __serverTimestamp: true });
  });
});

describe("campaign-io — roster management (remove member + lock joins)", () => {
  /** Drive removeMember's transaction with a snapshot whose `encounter` is `seed`,
   *  capturing the single `txn.update(...)` payload (B03). */
  function runRemoveWith(seed: EncounterState | undefined): {
    update: ReturnType<typeof vi.fn>;
  } {
    const update = vi.fn();
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: () => Promise.resolve({ data: () => ({ encounter: seed }) }),
        update,
      })
    );
    return { update };
  }

  it("removeMember drops the uid from members (arrayRemove) + deletes their memberDetails entry (deleteField)", async () => {
    const { update } = runRemoveWith(undefined); // no encounter running
    await removeMember("c1", "u2");

    expect(update).toHaveBeenCalledTimes(1);
    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    // members: arrayRemove(uid) — a targeted roster drop, never a whole-array set.
    expect(arrayRemoveMock).toHaveBeenCalledWith("u2");
    expect(data.members).toEqual({ __arrayRemove: ["u2"] });
    // memberDetails.<uid>: deleteField() — the entry is removed, not nulled.
    expect(data["memberDetails.u2"]).toEqual({ __deleteField: true });
    expect(data.updatedAt).toEqual({ __serverTimestamp: true });
    // No encounter → the write never touches encounter fields.
    expect(Object.keys(data).some((k) => k.startsWith("encounter."))).toBe(false);
    expect(docMock).toHaveBeenCalledWith({ __db: true }, "campaigns", "c1");
  });

  it("B03 — removeMember PRUNES the removed member's pc-<uid> combatant from a running encounter", async () => {
    // A gathering encounter seeded with two PCs; the DM removes u2 mid-fight. BEFORE the
    // fix removeMember never touched the encounter, so pc-u2 orphaned in combatants/order
    // (counting toward the Begin-turns total forever). Now it is spliced out at the seam.
    const encounter: EncounterState = {
      round: 1,
      currentCombatantId: null, // gathering
      order: ["pc-u1", "pc-u2"],
      epoch: 1,
      status: "active",
      combatants: [
        { kind: "pc", id: "pc-u1", memberUid: "u1", characterId: "char-1" },
        { kind: "pc", id: "pc-u2", memberUid: "u2", characterId: "char-2" },
      ],
    };
    const { update } = runRemoveWith(encounter);
    await removeMember("c1", "u2");

    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    // The roster drop still happens…
    expect(data["memberDetails.u2"]).toEqual({ __deleteField: true });
    // …AND the encounter is pruned via dot-paths (never the whole map): pc-u2 gone from
    // combatants + order, so it no longer counts toward the Begin-turns total.
    const combatants = data["encounter.combatants"] as { id: string }[];
    expect(combatants.map((c) => c.id)).toEqual(["pc-u1"]);
    expect(data["encounter.order"]).toEqual(["pc-u1"]);
    // Narrow write — only the touched encounter dot-paths, never `encounter` wholesale.
    expect(Object.keys(data)).not.toContain("encounter");
  });

  it("B03 — removeMember leaves the encounter alone when the member has no pc combatant", async () => {
    const encounter: EncounterState = {
      round: 1,
      currentCombatantId: null,
      order: ["pc-u1"],
      epoch: 1,
      status: "active",
      combatants: [{ kind: "pc", id: "pc-u1", memberUid: "u1", characterId: "char-1" }],
    };
    const { update } = runRemoveWith(encounter);
    await removeMember("c1", "u2"); // u2 has no pc combatant here

    const data = update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(data["memberDetails.u2"]).toEqual({ __deleteField: true });
    expect(Object.keys(data).some((k) => k.startsWith("encounter."))).toBe(false);
  });

  it("setJoinsLocked writes the boolean flag + a server updatedAt (lock then re-open)", async () => {
    await setJoinsLocked("c1", true);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const locked = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(locked.joinsLocked).toBe(true);
    expect(locked.updatedAt).toEqual({ __serverTimestamp: true });
    // Dedicated fn — it does NOT route through the debounced CampaignWritable writer.
    expect(docMock).toHaveBeenCalledWith({ __db: true }, "campaigns", "c1");

    updateDocMock.mockClear();
    await setJoinsLocked("c1", false);
    const opened = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(opened.joinsLocked).toBe(false);
  });
});

describe("campaign-io — attachMemberCharacter atomic D9 claim (B07)", () => {
  /** Drive the attach transaction: `charDocData` is what the char-doc read returns
   *  inside the txn; capture every `txn.update(ref, data)` and each read `ref`. */
  function runAttachWith(charDocData: Record<string, unknown> | undefined): {
    updates: Array<{ ref: unknown; data: Record<string, unknown> }>;
    gets: unknown[];
  } {
    const updates: Array<{ ref: unknown; data: Record<string, unknown> }> = [];
    const gets: unknown[] = [];
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: (ref: unknown) => {
          gets.push(ref);
          return Promise.resolve({ data: () => charDocData });
        },
        update: (ref: unknown, data: Record<string, unknown>) => {
          updates.push({ ref, data });
        },
      })
    );
    return { updates, gets };
  }

  const charWrite = (u: { ref: unknown; data: Record<string, unknown> }) =>
    "attachedCampaignId" in u.data;
  const campaignWrite = (u: { ref: unknown; data: Record<string, unknown> }) =>
    "memberDetails.u1.characterId" in u.data;

  it("claims an UNCLAIMED hero: writes the char lock + the campaign membership, returns 'attached'", async () => {
    const { updates, gets } = runAttachWith({}); // char doc has no attachedCampaignId
    const outcome = await attachMemberCharacter("campA", "u1", null, "char-1", null);

    expect(outcome).toBe("attached");
    // The char doc was READ inside the txn — the load-bearing property that makes
    // Firestore's optimistic-concurrency retry serialize two racing attaches.
    expect(gets).toContainEqual({
      __doc: [{ __db: true }, "users", "u1", "characters", "char-1"],
    });
    // The character's one-campaign claim is stamped…
    const claim = updates.find(charWrite);
    expect(claim?.data.attachedCampaignId).toBe("campA");
    // …and the campaign membership points at the hero.
    const member = updates.find(campaignWrite);
    expect(member?.data["memberDetails.u1.characterId"]).toBe("char-1");
  });

  it("REFUSES a hero already claimed by a DIFFERENT campaign: no membership write, returns 'conflict'", async () => {
    // The race loser: the fresh read shows the hero was just claimed by campB.
    const { updates } = runAttachWith({ attachedCampaignId: "campB" });
    const outcome = await attachMemberCharacter("campA", "u1", null, "char-1", null);

    expect(outcome).toBe("conflict");
    // Nothing is written — neither the campaign membership nor a competing claim.
    expect(updates).toHaveLength(0);
  });

  it("allows a re-attach to the SAME campaign (idempotent)", async () => {
    const { updates } = runAttachWith({ attachedCampaignId: "campA" });
    const outcome = await attachMemberCharacter("campA", "u1", "char-1", "char-1", null);
    expect(outcome).toBe("attached");
    expect(updates.find(campaignWrite)).toBeDefined();
  });

  it("detach (next=null) releases the PRIOR claim and clears the membership — no gate read", async () => {
    const { updates, gets } = runAttachWith(undefined);
    const outcome = await attachMemberCharacter("campA", "u1", "char-1", null, null);
    expect(outcome).toBe("attached");
    // No character read (nothing to gate on a detach).
    expect(gets).toHaveLength(0);
    // The previous character's claim is cleared…
    const cleared = updates.find(charWrite);
    expect(cleared?.data.attachedCampaignId).toEqual({ __deleteField: true });
    // …and the membership is nulled.
    const member = updates.find(campaignWrite);
    expect(member?.data["memberDetails.u1.characterId"]).toBeNull();
  });

  it("a swap RELEASES the old character's claim and CLAIMS the new one", async () => {
    const { updates } = runAttachWith({}); // the new char is unclaimed
    await attachMemberCharacter("campA", "u1", "char-old", "char-new", null);
    // new char gets the campA claim…
    const claim = updates.find(
      (u) => charWrite(u) && u.data.attachedCampaignId === "campA"
    );
    expect(claim).toBeDefined();
    // …and the old char's claim is released (deleteField sentinel).
    const release = updates.find(
      (u) =>
        charWrite(u) &&
        typeof u.data.attachedCampaignId === "object" &&
        u.data.attachedCampaignId !== null &&
        "__deleteField" in u.data.attachedCampaignId
    );
    expect(release).toBeDefined();
  });
});

describe("campaign-io — list scoping", () => {
  it("listSharedCampaigns queries members array-contains the uid (never enumerates)", async () => {
    await listSharedCampaigns("u1");
    expect(collectionMock).toHaveBeenCalledWith({ __db: true }, "campaigns");
    expect(whereMock).toHaveBeenCalledWith("members", "array-contains", "u1");
    expect(getDocsMock).toHaveBeenCalledTimes(1);
  });

  // Boot-resilience (the 2026-07-09 "Clear site data" incident): an EMPTY result that
  // is only `fromCache` is not authoritative — force a fresh server read so a wiped/
  // wedged local cache can never render the misleading "no campaigns" empty state.
  const setOnline = (value: boolean): void => {
    Object.defineProperty(navigator, "onLine", { value, configurable: true });
  };

  it("server-confirms an empty-from-cache result while online", async () => {
    setOnline(true);
    getDocsMock.mockResolvedValueOnce({
      docs: [],
      empty: true,
      metadata: { fromCache: true },
    } as never);
    getDocsFromServerMock.mockResolvedValueOnce({ docs: [] });
    await listSharedCampaigns("u1");
    expect(getDocsFromServerMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT hit the server when the cache-empty read is genuinely offline", async () => {
    setOnline(false);
    getDocsMock.mockResolvedValueOnce({
      docs: [],
      empty: true,
      metadata: { fromCache: true },
    } as never);
    await listSharedCampaigns("u1");
    expect(getDocsFromServerMock).not.toHaveBeenCalled();
    setOnline(true);
  });

  it("does NOT re-read the server when the cache already has campaigns", async () => {
    setOnline(true);
    getDocsMock.mockResolvedValueOnce({
      docs: [{ id: "c1", data: () => ({ name: "Gildenmoor", members: ["u1"] }) }],
      empty: false,
      metadata: { fromCache: true },
    } as never);
    await listSharedCampaigns("u1");
    expect(getDocsFromServerMock).not.toHaveBeenCalled();
  });

  it("a hung read REJECTS with a TimeoutError that propagates to the caller", async () => {
    // A wedged Firestore local layer can leave getDocs pending forever — the bounded
    // read must reject so every caller surfaces a recoverable error (Retry), never an
    // infinite spinner. The rejection propagates as-is (no internal swallow).
    vi.useFakeTimers();
    try {
      getDocsMock.mockImplementationOnce(() => new Promise<never>(() => {}));
      const call = listSharedCampaigns("u1");
      const assertion = expect(call).rejects.toMatchObject({ name: "TimeoutError" });
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

/** Walk a parsed object and collect the paths of anything still carrying a
 *  `toDate` method — i.e. a Firestore `Timestamp` that leaked past the read
 *  boundary (the exact class of bug that crashed the campaign page). */
function findLeakedTimestamps(value: unknown, path = "$"): string[] {
  if (value === null || typeof value !== "object") return [];
  if (value instanceof Date) return [];
  if (typeof (value as { toDate?: unknown }).toDate === "function") return [path];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findLeakedTimestamps(v, `${path}[${i}]`));
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    findLeakedTimestamps(v, `${path}.${k}`)
  );
}

/** Drive a single campaign snapshot through `subscribeToCampaign` and return the
 *  parsed `CampaignDoc` the UI would receive. */
function parseCampaignWire(data: Record<string, unknown>): Record<string, unknown> {
  const seen: unknown[] = [];
  subscribeToCampaign("u1", "c1", (doc) => seen.push(doc));
  const call = onSnapshotMock.mock.calls.at(-1) as unknown as [
    unknown,
    (snap: {
      exists: () => boolean;
      id: string;
      data: () => Record<string, unknown>;
    }) => void,
  ];
  call[1]({ exists: () => true, id: "c1", data: () => data });
  return seen[0] as Record<string, unknown>;
}

describe("campaign-io — member-snapshot non-nullability (owner 2026-06-15)", () => {
  // A persisted member snapshot whose hero `name` is corrupt (empty / whitespace /
  // non-string — a stale doc written before the branded invariant) is REJECTED at the
  // read boundary: its `character` is dropped to `null` (the member renders as "no
  // character attached"), never coerced to an "Unnamed" placeholder. The member row
  // itself is KEPT. A valid snapshot passes through untouched.
  it("drops a corrupt (nameless) member snapshot's character to null, keeps the member", () => {
    const parsed = parseCampaignWire({
      name: "Gildenmoor",
      members: ["u1", "u2", "u3"],
      memberDetails: {
        u1: {
          displayName: "Tav",
          characterId: "x",
          role: "player",
          character: { name: "   ", race: "human", classes: [], ac: 16, hpMax: 24 },
        },
        u2: {
          displayName: "Mara",
          characterId: "y",
          role: "player",
          character: { name: "Mara", race: "human", classes: [], ac: 14, hpMax: 18 },
        },
        u3: { displayName: "DM", characterId: null, role: "dm" },
      },
    });
    const members = parsed.memberDetails as Record<
      string,
      { character?: { name?: string } | null }
    >;
    // The corrupt member is kept, but its character is rejected to null.
    expect(members.u1?.character).toBeNull();
    // The valid member's snapshot is untouched.
    expect(members.u2?.character?.name).toBe("Mara");
    // No "Unnamed"/"Senza nome" placeholder is ever invented for the corrupt member.
    expect(JSON.stringify(members.u1)).not.toMatch(/unnamed|senza nome/i);
  });
});

describe("campaign-io — FULL-wire date conformance (the campaign-dates hotfix guard)", () => {
  it("strips EVERY Timestamp from a full wire doc — incl. the array-nested treasuryLog[].at", async () => {
    const { Timestamp } = await import("firebase/firestore");
    // The raw Firestore wire shape of a real campaign: every date field arrives as
    // a Timestamp, INCLUDING array-nested ones Firestore does not auto-convert
    // (treasuryLog[].at) — the precise gap that delivered a Timestamp into a
    // `.getTime()` call and took down the page.
    const wire = {
      name: "The Starless Keep",
      createdAt: new Timestamp(1_700_000_000, 0),
      updatedAt: new Timestamp(1_700_000_100, 0),
      members: ["u1"],
      memberDetails: { u1: { displayName: "Aria", characterId: null, role: "dm" } },
      treasury: { pp: 0, gp: 1, ep: 0, sp: 0, cp: 0 },
      treasuryLog: [
        {
          amount: 5,
          currency: "gp",
          type: "add",
          note: "",
          by: "u1",
          at: new Timestamp(1_700_000_050, 0),
        },
      ],
    };

    const parsed = parseCampaignWire(wire);

    // ZERO Timestamps survive ANYWHERE in the parsed tree.
    expect(findLeakedTimestamps(parsed)).toEqual([]);
    expect(parsed.createdAt).toBeInstanceOf(Date);
    expect(parsed.updatedAt).toBeInstanceOf(Date);
    const log = parsed.treasuryLog as Array<{ at?: Date }>;
    expect(log[0]?.at).toBeInstanceOf(Date);
  });
});

type NoteWire = { id: string; data: Record<string, unknown> };
type SnapCall = [
  unknown,
  (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) => void,
];
function fireSnap(call: SnapCall, docs: NoteWire[]): void {
  call[1]({ docs: docs.map((d) => ({ id: d.id, data: () => d.data })) });
}

/** Drive the MEMBER notes subscription (the single revealed `notes` collection) and
 *  return the parsed `SharedNote[]` the UI would receive. */
function parseRevealedWire(docs: NoteWire[]): Array<Record<string, unknown>> {
  let received: Array<Record<string, unknown>> = [];
  subscribeToCampaignNotes("c1", false, (notes) => {
    received = notes as unknown as Array<Record<string, unknown>>;
  });
  fireSnap(onSnapshotMock.mock.calls.at(-1) as unknown as SnapCall, docs);
  return received;
}

/** Drive the DM notes subscription — it registers TWO listeners (revealed `notes`
 *  then hidden `dmNotes`) and emits only once BOTH have delivered; fire both and
 *  return the merged `SharedNote[]` (hidden notes tagged `dmOnly: true`). */
function parseDmWire(
  revealedDocs: NoteWire[],
  hiddenDocs: NoteWire[]
): Array<Record<string, unknown>> {
  let received: Array<Record<string, unknown>> = [];
  subscribeToCampaignNotes("c1", true, (notes) => {
    received = notes as unknown as Array<Record<string, unknown>>;
  });
  const [notesCall, dmCall] = onSnapshotMock.mock.calls.slice(-2) as unknown as [
    SnapCall,
    SnapCall,
  ];
  fireSnap(notesCall, revealedDocs);
  fireSnap(dmCall, hiddenDocs);
  return received;
}

describe("campaign-io — notes subcollection date conformance", () => {
  it("converts a note's `updatedAt` Timestamp to a Date (and the doc id IS the note id)", async () => {
    const { Timestamp } = await import("firebase/firestore");
    const notes = parseRevealedWire([
      {
        id: "n1",
        data: {
          title: "Pinned",
          content: "",
          pinned: true,
          createdBy: "u1",
          updatedAt: new Timestamp(1_700_000_010, 0),
        },
      },
    ]);
    expect(findLeakedTimestamps(notes)).toEqual([]);
    expect(notes[0]?.id).toBe("n1"); // the doc id becomes the note id
    expect(notes[0]?.updatedAt).toBeInstanceOf(Date);
    expect(notes[0]?.dmOnly).toBeUndefined(); // a /notes doc is revealed → no flag
  });

  it("a note doc with NO updatedAt parses to an epoch Date (never undefined) — sort-safe", () => {
    const notes = parseRevealedWire([
      {
        id: "legacy",
        data: { title: "Legacy", content: "", pinned: false, createdBy: "u1" },
      },
    ]);
    expect(notes[0]?.updatedAt).toBeInstanceOf(Date);
    expect((notes[0]?.updatedAt as Date).getTime()).toBe(0);
  });

  it("the DM view MERGES revealed + hidden, tagging only the dmNotes ones dmOnly:true", () => {
    const notes = parseDmWire(
      [
        {
          id: "shared",
          data: { title: "S", content: "", pinned: false, createdBy: "u1" },
        },
      ],
      [
        {
          id: "secret",
          data: { title: "H", content: "", pinned: false, createdBy: "u1" },
        },
      ]
    );
    expect(findLeakedTimestamps(notes)).toEqual([]);
    expect(notes).toHaveLength(2);
    const shared = notes.find((n) => n.id === "shared");
    const secret = notes.find((n) => n.id === "secret");
    expect(shared?.dmOnly).toBeUndefined(); // from /notes → revealed
    expect(secret?.dmOnly).toBe(true); // from /dmNotes → hidden
  });
});

describe("campaign-io — snapshot normalization", () => {
  it("converts treasury ledger `at` Timestamps to Dates on read (live-data shim)", async () => {
    // Firestore does NOT auto-convert Timestamps inside arrays; the owner's live
    // ledger entries arrive Timestamp-shaped. The read boundary must hand the UI
    // real Dates (TREASURY-UX formats `at` per row).
    const { subscribeToCampaign } = await import("@/features/campaigns/campaign-io");
    const { Timestamp } = await import("firebase/firestore");
    const seen: unknown[] = [];
    subscribeToCampaign("u1", "c1", (doc) => seen.push(doc));
    const call = onSnapshotMock.mock.calls[0] as unknown as [
      unknown,
      (snap: {
        exists: () => boolean;
        id: string;
        data: () => Record<string, unknown>;
      }) => void,
    ];
    const ts = new Timestamp(0, 0);
    call[1]({
      exists: () => true,
      id: "c1",
      data: () => ({
        name: "T",
        createdAt: ts,
        updatedAt: ts,
        treasuryLog: [
          { amount: 5, currency: "gp", type: "add", note: "", by: "u1", at: ts },
        ],
      }),
    });
    const doc = seen[0] as {
      createdAt: Date;
      treasuryLog: Array<{ at: Date }>;
    };
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.treasuryLog[0]?.at).toBeInstanceOf(Date);
  });
});

describe("campaign-io — treasury atomic writes (B06)", () => {
  const entry: TreasuryLogEntry = {
    amount: 5,
    currency: "gp",
    type: "add",
    note: "loot",
    by: "u1",
    at: new Date(1_700_000_000_000),
  };

  it("applyTreasuryDelta composes via increment() + arrayUnion (never a whole-object write)", async () => {
    await applyTreasuryDelta("c1", entry);
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    // Per-currency server-side increment (an "add" is +amount) — commutes with a
    // concurrent take instead of the old last-write-wins whole-map overwrite.
    expect(incrementMock).toHaveBeenCalledWith(5);
    expect(data["treasury.gp"]).toEqual({ __increment: [5] });
    // The ledger row is appended (arrayUnion), so a concurrent edit's row survives too.
    expect(arrayUnionMock).toHaveBeenCalledWith(entry);
    expect(data.treasuryLog).toEqual({ __arrayUnion: [entry] });
    // NEVER a blind whole treasury map / whole log array (the B06 clobber).
    expect(data).not.toHaveProperty("treasury");
    expect(data.updatedAt).toEqual({ __serverTimestamp: true });
  });

  it("applyTreasuryDelta signs a take negative", async () => {
    await applyTreasuryDelta("c1", { ...entry, type: "remove", amount: 3 });
    expect(incrementMock).toHaveBeenCalledWith(-3);
  });

  it("undoTreasuryEntry reverses the coins (increment) and drops the exact row (arrayRemove)", async () => {
    await undoTreasuryEntry("c1", entry); // undo an add → take the coins back
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(incrementMock).toHaveBeenCalledWith(-5);
    expect(data["treasury.gp"]).toEqual({ __increment: [-5] });
    expect(arrayRemoveMock).toHaveBeenCalledWith(entry);
    expect(data.treasuryLog).toEqual({ __arrayRemove: [entry] });
  });

  it("undoTreasuryEntry returns coins when undoing a remove", async () => {
    await undoTreasuryEntry("c1", { ...entry, type: "remove", amount: 8 });
    expect(incrementMock).toHaveBeenCalledWith(8);
  });

  it("two concurrent adds each issue their OWN composing write (no shared stale base)", async () => {
    // The B06 failure: A and B each compute a new total from the SAME stale base and the
    // last whole-object write wins. With increment(), each edit is an independent
    // server-side delta, so both land and both ledger rows survive — proven here by two
    // arrayUnion appends + two signed increments, never a single overwrite of the map.
    await applyTreasuryDelta("c1", { ...entry, amount: 5 });
    await applyTreasuryDelta("c1", { ...entry, type: "remove", amount: 3 });
    expect(incrementMock).toHaveBeenNthCalledWith(1, 5);
    expect(incrementMock).toHaveBeenNthCalledWith(2, -3);
    expect(arrayUnionMock).toHaveBeenCalledTimes(2);
  });
});

describe("campaign-io — persistBeginTurns immediate write (B15)", () => {
  it("writes the three turn fields via dot-paths IMMEDIATELY (never the 2s debounce)", async () => {
    await persistBeginTurns("c1", {
      order: ["pc-a", "monster-1"],
      currentCombatantId: "pc-a",
      round: 1,
    });
    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    // Dot-path so the diff stays narrow; setting the pointer NOW is exactly what makes
    // the very next advance transaction see a begun order instead of the still-null
    // server pointer it read within the debounce window (the silent no-op B15 fixes).
    expect(data["encounter.order"]).toEqual(["pc-a", "monster-1"]);
    expect(data["encounter.currentCombatantId"]).toBe("pc-a");
    expect(data["encounter.round"]).toBe(1);
    expect(data.updatedAt).toEqual({ __serverTimestamp: true });
  });
});

describe("campaign-io — debounced encounter write reconciles the turn pointer (B04)", () => {
  const pcA: EncounterCombatant = {
    kind: "pc",
    id: "pc-a",
    memberUid: "a",
    characterId: "char-a",
  };
  const goblin: EncounterMonster = {
    kind: "monster",
    id: "monster-1",
    name: "Goblin",
    ac: 13,
    initiative: 8,
    conditions: [],
    maxHp: 7,
    tokens: [7],
  };
  const baseEncounter: EncounterState = {
    combatants: [pcA, goblin],
    round: 1,
    currentCombatantId: "pc-a",
    order: ["pc-a", "monster-1"],
    epoch: 42,
    status: "active",
  };

  function campaignWith(enc: EncounterState): CampaignDoc {
    return {
      id: "c1",
      name: "C",
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: "u1",
      dmUid: "u1",
      members: ["u1"],
      memberDetails: {},
      status: "active",
      inviteCode: "c1",
      treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      treasuryLog: [],
      encounter: enc,
    };
  }

  afterEach(() => useCampaignStore.setState({ campaign: null }));

  it("merges the LIVE (advanced) pointer over a stale pending structural write", async () => {
    // The live store already reflects a concurrent advance (its snapshot was applied): the
    // pointer moved to monster-1, round 2.
    useCampaignStore.setState({
      campaign: campaignWith({
        ...baseEncounter,
        currentCombatantId: "monster-1",
        round: 2,
      }),
    });
    const writer = createCampaignSave("u1", "c1");
    // A DM's STALE monster-edit payload still carries the pre-advance pointer (pc-a /
    // round 1) but a bumped monster HP — this is what used to flush and rewind the turn.
    const bloodiedGoblin: EncounterMonster = { ...goblin, tokens: [3] };
    writer.save({
      name: "C",
      encounter: { ...baseEncounter, combatants: [pcA, bloodiedGoblin] },
    });
    await writer.flush();

    expect(updateDocMock).toHaveBeenCalledTimes(1);
    const data = updateDocMock.mock.calls[0]?.[1] as { encounter: EncounterState };
    // The pointer + round are RECONCILED to the live advanced values (never reverted)…
    expect(data.encounter.currentCombatantId).toBe("monster-1");
    expect(data.encounter.round).toBe(2);
    // …while the DM's structural edit (the monster HP) is preserved.
    const mon = data.encounter.combatants.find((c) => c.id === "monster-1");
    expect(mon?.kind === "monster" ? mon.tokens : null).toEqual([3]);
  });

  it("leaves the payload untouched across a DIFFERENT fight (epoch mismatch)", async () => {
    useCampaignStore.setState({
      campaign: campaignWith({
        ...baseEncounter,
        epoch: 99,
        currentCombatantId: "monster-1",
      }),
    });
    const writer = createCampaignSave("u1", "c1");
    writer.save({ name: "C", encounter: baseEncounter }); // epoch 42 ≠ live 99
    await writer.flush();
    const data = updateDocMock.mock.calls[0]?.[1] as { encounter: EncounterState };
    // Different fight → no cross-fight pointer merge; the payload stands as-is.
    expect(data.encounter.currentCombatantId).toBe("pc-a");
  });
});

describe("campaign-io — commitChronicleEdit atomic version snapshot (B18)", () => {
  function runTxnWith(serverDoc: Record<string, unknown> | undefined): {
    set: ReturnType<typeof vi.fn>;
  } {
    const set = vi.fn();
    runTransactionMock.mockImplementation(async (_db, fn) =>
      fn({
        get: () =>
          Promise.resolve({
            exists: () => serverDoc !== undefined,
            data: () => serverDoc,
          }),
        set,
      })
    );
    return { set };
  }

  it("snapshots the SERVER's CURRENT text into history before overwriting (no editor's text lost)", async () => {
    // The server already carries a CONCURRENT editor B's paragraph (NOT the base A started
    // from). The old path snapshotted A's local base and shipped the whole array, so B's
    // text vanished from both the live text AND every stored version.
    const { set } = runTxnWith({
      text: "base + B's concurrent paragraph",
      lastEditedBy: "userB",
      versions: [],
    });
    await commitChronicleEdit("c1", { text: "base + A's paragraph", editedBy: "userA" });

    expect(set).toHaveBeenCalledTimes(1);
    const data = set.mock.calls[0]?.[1] as {
      text: string;
      lastEditedBy: string;
      versions: Array<{ textSnapshot: string; editedBy: string }>;
    };
    // The new text is written…
    expect(data.text).toBe("base + A's paragraph");
    expect(data.lastEditedBy).toBe("userA");
    // …and B's text (the SERVER's current, re-read inside the txn) is captured in history,
    // so it is recoverable — the version history is no longer erased by a concurrent save.
    expect(data.versions[0]?.textSnapshot).toBe("base + B's concurrent paragraph");
    expect(data.versions[0]?.editedBy).toBe("userB");
  });

  it("creates the doc with no version snapshot on the very first save", async () => {
    const { set } = runTxnWith(undefined); // no chronicle doc yet
    await commitChronicleEdit("c1", { text: "first entry", editedBy: "userA" });
    const data = set.mock.calls[0]?.[1] as { text: string; versions: unknown[] };
    expect(data.text).toBe("first entry");
    // No prior text → no version snapshot (pushVersion skips an empty prior).
    expect(data.versions).toEqual([]);
  });
});
