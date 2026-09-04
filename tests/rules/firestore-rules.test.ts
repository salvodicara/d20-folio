/// <reference types="node" />
/**
 * Firestore security-rules tests for `/campaigns` (Phase 5 · Part 2a).
 *
 * EMULATOR-DEPENDENT — this is NOT part of the plain Vitest unit suite
 * (`vitest.config.ts` includes only `tests/unit/**`); it runs against the
 * Firestore emulator via its own config:
 *
 *     pnpm test:rules
 *       → firebase emulators:exec --only firestore,storage \
 *           'pnpm exec vitest run --config vitest.rules.config.ts'
 *
 * Requires `firebase-tools` (the owner already has it for deploys) AND a Java
 * runtime (the Firestore emulator is a JVM process). It cannot run in the plain
 * unit job or in any CI lane that lacks Java + the emulator.
 *
 * Enforced matrix: member r/w · non-member denied · blocked denied · admin
 * override · A13 create · list scoped to membership · subcollection member-gating
 * · member-mutation guard (+ the controlled self-join) · character/combat reads
 * gated to a reciprocal current campaign attachment (requester + target owner in
 * the roster, with the target's exact character id) · owner-only character write.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const PROJECT_ID = "demo-d20folio";
// Admin is DATA-DRIVEN (owner-ratified — CLAUDE.md → Firebase essentials): a uid is admin iff its user doc carries
// role:"admin" — no hardcoded uid. So this is just an ordinary test uid that the
// seed below grants the role to.
const ADMIN_UID = "admin-user";
const EMPTY_TREASURY = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

let testEnv: RulesTestEnvironment;

/** A well-formed campaign document seeded for the access-matrix tests. */
function campaignDoc(
  members: string[],
  dmUid = "dm",
  characterIds: Readonly<Record<string, string | null>> = {}
) {
  return {
    name: "Test Table",
    createdBy: dmUid,
    dmUid,
    members,
    memberDetails: Object.fromEntries(
      members.map((m) => [
        m,
        {
          displayName: m,
          characterId: characterIds[m] ?? null,
          role: m === dmUid ? "dm" : "player",
        },
      ])
    ),
    status: "active",
    inviteCode: "camp1",
    treasury: EMPTY_TREASURY,
    treasuryLog: [],
  };
}

/** A shared-note document for the notes-subcollection gate tests. Visibility is the
 *  COLLECTION (`notes` revealed vs `dmNotes` hidden), never a field on the doc. */
function noteDoc(overrides: Record<string, unknown> = {}) {
  return {
    title: "Lore",
    content: "Something the table learned.",
    pinned: false,
    createdBy: "dm",
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed user docs (isNotBlocked() reads /users/{uid}.status) + a base campaign,
  // bypassing rules.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", "dm"), { status: "active" });
    await setDoc(doc(db, "users", "member"), { status: "active" });
    await setDoc(doc(db, "users", "peer"), { status: "active" });
    await setDoc(doc(db, "users", "outsider"), { status: "active" });
    await setDoc(doc(db, "users", "blocked"), { status: "blocked" });
    await setDoc(doc(db, "users", ADMIN_UID), { status: "active", role: "admin" });
    await setDoc(doc(db, "campaigns", "camp1"), campaignDoc(["dm", "member"]));
  });
});

describe("firestore.rules — /users + the owner-ratified data-driven admin role", () => {
  it("the read matrix: own doc only, unless the user doc itself grants role:admin", async () => {
    // ADMIN_UID is privileged ONLY because its seeded doc carries role:"admin".
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(admin, "users", "member"))); // read another's doc
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(getDoc(doc(db, "users", "member"))); // own doc OK
    await assertFails(getDoc(doc(db, "users", "outsider"))); // another's doc denied
  });

  it("a user CANNOT self-assign role:admin on create (self-promotion blocked)", async () => {
    const db = testEnv.authenticatedContext("newbie").firestore();
    await assertFails(
      setDoc(doc(db, "users", "newbie"), { status: "active", role: "admin" })
    );
    await assertSucceeds(
      setDoc(doc(db, "users", "newbie"), { status: "active" }) // a plain create is fine
    );
  });

  // ── Users-update FIELD-LOCK (admin-godmode part a) ────────────────────────
  // A non-admin may update ONLY their OWN `lastActiveAt` (the recurring sign-in
  // telemetry bump in src/lib/auth.ts) — never `role` (escalation) and never
  // `status` (self-unblock). Admin keeps full update.
  it("a non-admin CAN bump ONLY their own lastActiveAt (the documented self-update path)", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "users", "member"), { lastActiveAt: Timestamp.now() })
    );
    await assertFails(
      updateDoc(doc(db, "users", "outsider"), { lastActiveAt: Timestamp.now() })
    );
  });

  it("a non-admin can escalate NOTHING — not role, not status, not bundled", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(updateDoc(doc(db, "users", "member"), { role: "admin" }));
    // The escalation must stay denied even when smuggled alongside an allowed field.
    await assertFails(
      updateDoc(doc(db, "users", "member"), {
        role: "admin",
        lastActiveAt: Timestamp.now(),
      })
    );
    await assertFails(
      updateDoc(doc(db, "users", "member"), {
        status: "blocked",
        lastActiveAt: Timestamp.now(),
      })
    );
    // A blocked user must not be able to flip themselves back to active.
    const blocked = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(updateDoc(doc(blocked, "users", "blocked"), { status: "active" }));
  });

  it("an admin CAN update any user — block/unblock + grant role", async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(updateDoc(doc(admin, "users", "member"), { status: "blocked" }));
    await assertSucceeds(updateDoc(doc(admin, "users", "member"), { role: "admin" }));
  });
});

describe("firestore.rules — /campaigns access", () => {
  it("a member can read and edit shared artifacts", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(getDoc(doc(db, "campaigns", "camp1")));
    await assertSucceeds(
      updateDoc(doc(db, "campaigns", "camp1"), {
        treasury: { pp: 0, gp: 5, ep: 0, sp: 0, cp: 0 },
      })
    );
  });

  it("a non-member is denied read and write", async () => {
    const db = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(getDoc(doc(db, "campaigns", "camp1")));
    await assertFails(
      updateDoc(doc(db, "campaigns", "camp1"), { treasury: EMPTY_TREASURY })
    );
  });

  it("a blocked user is denied", async () => {
    const db = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(getDoc(doc(db, "campaigns", "camp1")));
  });

  it("the admin can read any campaign (override)", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(db, "campaigns", "camp1")));
  });

  it("A13: create requires creator ∈ members AND createdBy == dmUid == self", async () => {
    const db = testEnv.authenticatedContext("outsider").firestore();
    // Valid: outsider creates their own campaign.
    await assertSucceeds(
      setDoc(doc(db, "campaigns", "own"), campaignDoc(["outsider"], "outsider"))
    );
    // Invalid: createdBy spoofed to someone else.
    await assertFails(
      setDoc(doc(db, "campaigns", "spoof1"), {
        ...campaignDoc(["outsider"], "outsider"),
        createdBy: "dm",
      })
    );
    // Invalid: creator not in members.
    await assertFails(
      setDoc(doc(db, "campaigns", "spoof2"), campaignDoc(["dm"], "outsider"))
    );
    // Invalid: dmUid is someone else.
    await assertFails(
      setDoc(doc(db, "campaigns", "spoof3"), {
        ...campaignDoc(["outsider"], "outsider"),
        dmUid: "dm",
      })
    );
  });

  it("list is scoped to membership (array-contains self only)", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      getDocs(
        query(collection(db, "campaigns"), where("members", "array-contains", "member"))
      )
    );
    // An unconstrained list could surface other players' campaigns → denied.
    await assertFails(getDocs(collection(db, "campaigns")));
  });

  it("member-mutation guard: a member cannot add or remove members", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      updateDoc(doc(db, "campaigns", "camp1"), { members: ["dm", "member", "outsider"] })
    );
    await assertFails(updateDoc(doc(db, "campaigns", "camp1"), { members: ["member"] }));
  });

  it("the DM may manage the roster; only the DM and the admin may delete", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(
      updateDoc(doc(dm, "campaigns", "camp1"), {
        members: arrayUnion("outsider"),
        "memberDetails.outsider": {
          displayName: "Outsider",
          characterId: null,
          role: "player",
        },
      })
    );
    // A plain member (and a non-member) may never delete the table.
    for (const uid of ["member", "outsider"]) {
      await assertFails(
        deleteDoc(
          doc(testEnv.authenticatedContext(uid).firestore(), "campaigns", "camp1")
        )
      );
    }
    // Admin-supreme: the admin deletes a campaign it is not a member of.
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(deleteDoc(doc(admin, "campaigns", "camp1")));
    // …and so does the DM (re-seeded out of band, since the admin just deleted it).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "campaigns", "camp1"),
        campaignDoc(["dm", "member"])
      );
    });
    await assertSucceeds(deleteDoc(doc(dm, "campaigns", "camp1")));
  });

  it("controlled self-join: a non-member adds only themselves", async () => {
    const db = testEnv.authenticatedContext("outsider").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "campaigns", "camp1"), {
        members: arrayUnion("outsider"),
        "memberDetails.outsider": {
          displayName: "Outsider",
          characterId: null,
          role: "player",
        },
      })
    );
  });

  it("self-join cannot smuggle a treasury edit", async () => {
    const db = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(
      updateDoc(doc(db, "campaigns", "camp1"), {
        members: arrayUnion("outsider"),
        "memberDetails.outsider": {
          displayName: "Outsider",
          characterId: null,
          role: "player",
        },
        treasury: { pp: 99, gp: 0, ep: 0, sp: 0, cp: 0 },
      })
    );
  });

  // ── own-entry guard (the campaign-member data-loss hardening) ────────────────
  // rosterAndOwnerUnchanged() pins only the memberDetails KEY SET, not which value
  // changed — so before memberEditsOnlyOwnEntry() a member could overwrite a PEER's
  // entry (the A-edits-B vector). These pin both halves: a peer's entry is now
  // off-limits, while a member's OWN attach/detach stays allowed.
  it("a member CANNOT edit ANOTHER member's memberDetails entry (A-edits-B)", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    // Leaf overwrite of the DM's characterId.
    await assertFails(
      updateDoc(doc(db, "campaigns", "camp1"), {
        "memberDetails.dm.characterId": "stolen",
      })
    );
    // Whole-object overwrite of the DM's entry.
    await assertFails(
      updateDoc(doc(db, "campaigns", "camp1"), {
        "memberDetails.dm": { displayName: "DM", characterId: null, role: "player" },
      })
    );
  });

  it("a member MAY attach/detach their OWN character (own-entry self-edit still allowed)", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "campaigns", "camp1"), {
        "memberDetails.member.characterId": "char-1",
        "memberDetails.member.character": {
          name: "Mara",
          race: "Human",
          classes: [],
          ac: 15,
          hpMax: 22,
        },
      })
    );
  });

  it("a per-leaf identity write (the new join shape) MERGES — an existing attachment survives", async () => {
    // The load-bearing fact behind the clobber fix: a dotted leaf write MERGES
    // (siblings preserved), whereas the old whole-object set REPLACED the node and
    // dropped characterId + character. Seed `member` WITH an attachment, replay the
    // new joinCampaign write shape (identity-only, attachment-blind), and confirm
    // the attachment is still there.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
        ...campaignDoc(["dm", "member"]),
        memberDetails: {
          dm: { displayName: "dm", characterId: null, role: "dm" },
          member: {
            displayName: "Mara",
            photoURL: null,
            role: "player",
            characterId: "char-1",
            character: { name: "Mara", race: "Human", classes: [], ac: 15, hpMax: 22 },
          },
        },
      });
    });
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "campaigns", "camp1"), {
        members: arrayUnion("member"),
        "memberDetails.member.displayName": "Mara",
        "memberDetails.member.photoURL": null,
        "memberDetails.member.role": "player",
      })
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), "campaigns", "camp1"));
      const member = (
        snap.data() as {
          memberDetails: Record<
            string,
            { characterId?: string; character?: { name?: string } }
          >;
        }
      ).memberDetails.member;
      expect(member?.characterId).toBe("char-1");
      expect(member?.character?.name).toBe("Mara");
    });
  });

  // ── the deleted play fields (§5.4) ───────────────────────────────────────────
  // Play LEFT the campaign document. `encounter`, `encounterInit`, `encounterSkipped`
  // and `memberEffects` are not model fields any more, so NO writer — member, DM or
  // admin — may create or change them; the shared fight lives in `encounters/{eid}`.
  it("no writer may touch the deleted play fields", async () => {
    const patches: ReadonlyArray<Record<string, unknown>> = [
      { encounter: { round: 1, combatants: [], status: "active" } },
      { "encounterInit.member": 17 },
      { "encounterSkipped.member": true },
      { memberEffects: [] },
    ];
    for (const uid of ["member", "dm", ADMIN_UID]) {
      const db = testEnv.authenticatedContext(uid).firestore();
      for (const patch of patches) {
        await assertFails(updateDoc(doc(db, "campaigns", "camp1"), patch));
      }
    }
  });

  it("a create carrying an `encounter` key is denied (the model is closed)", async () => {
    const db = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(
      setDoc(doc(db, "campaigns", "own-enc"), {
        ...campaignDoc(["outsider"], "outsider"),
        encounter: { round: 1, combatants: [] },
      })
    );
  });

  it("a member's shared-artifact write still succeeds", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "campaigns", "camp1"), {
        treasury: { pp: 0, gp: 7, ep: 0, sp: 0, cp: 0 },
      })
    );
  });

  it("the DM may hand the table to a member, never to a stranger", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertFails(updateDoc(doc(dm, "campaigns", "camp1"), { dmUid: "outsider" }));
    await assertSucceeds(
      updateDoc(doc(dm, "campaigns", "camp1"), {
        dmUid: "member",
        "memberDetails.member.role": "dm",
        "memberDetails.dm.role": "player",
      })
    );
  });

  it("the admin may update a campaign he is not a member of", async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(admin, "campaigns", "camp1"), { status: "archived" })
    );
  });

  // ── invite management: remove member + lock joins (DM tools) ──────────────────
  // Removing a member (arrayRemove + deleteField) and toggling `joinsLocked` are
  // DM/admin-only roster/tool writes; a regular member or a non-member may do
  // neither. A locked campaign additionally refuses the self-join path.
  it("the DM may remove a member (drop from members + delete their memberDetails entry)", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(
      updateDoc(doc(dm, "campaigns", "camp1"), {
        members: arrayRemove("member"),
        "memberDetails.member": deleteField(),
      })
    );
  });

  it("a regular member CANNOT remove another member", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      updateDoc(doc(db, "campaigns", "camp1"), {
        members: arrayRemove("dm"),
        "memberDetails.dm": deleteField(),
      })
    );
  });

  it("a non-member CANNOT remove a member", async () => {
    const db = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(
      updateDoc(doc(db, "campaigns", "camp1"), {
        members: arrayRemove("member"),
        "memberDetails.member": deleteField(),
      })
    );
  });

  it("the DM (and the admin) may lock / re-open joins", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(updateDoc(doc(dm, "campaigns", "camp1"), { joinsLocked: true }));
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(admin, "campaigns", "camp1"), { joinsLocked: false })
    );
  });

  it("a regular member and a non-member CANNOT flip joinsLocked", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      updateDoc(doc(member, "campaigns", "camp1"), { joinsLocked: true })
    );
    const outsider = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(
      updateDoc(doc(outsider, "campaigns", "camp1"), { joinsLocked: true })
    );
  });

  it("a self-join is DENIED when joins are locked (the leaked-link kill switch)", async () => {
    // Lock the campaign out-of-band, then a non-member's controlled self-join — the
    // exact shape that succeeds on an OPEN campaign — must now be denied.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), { joinsLocked: true });
    });
    const db = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(
      updateDoc(doc(db, "campaigns", "camp1"), {
        members: arrayUnion("outsider"),
        "memberDetails.outsider": {
          displayName: "Outsider",
          characterId: null,
          role: "player",
        },
      })
    );
  });
});

describe("firestore.rules — character parents: access matrix, revision CAS, DM detach", () => {
  // Cross-user access is DERIVED LIVE: the char doc carries only the
  // `attachedCampaignId` pointer (written atomically with the roster by the attach
  // transaction); the grant is "requester + target owner are CURRENT members of
  // THAT campaign and the target's roster row names this exact character", read off
  // the campaign doc at request time. NO stored reader list, so nothing goes stale.
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // campA: dm + member + peer. `char-member` is attached to it; `char-private`
      // is unattached (no pointer) → owner/admin only.
      await setDoc(
        doc(db, "campaigns", "campA"),
        campaignDoc(["dm", "member", "peer"], "dm", {
          member: "char-member",
        })
      );
      await setDoc(doc(db, "users", "member", "characters", "char-member"), {
        status: "active",
        attachedCampaignId: "campA",
        build: { name: "Mara Quickfingers" },
        state: {},
        cache: {},
        revision: 3,
      });
      await setDoc(doc(db, "users", "member", "characters", "char-private"), {
        status: "active",
        build: { name: "Secret" },
        state: {},
        cache: {},
        revision: 3,
      });
    });
  });

  it("the read matrix: owner, admin and a current co-member in; outsider and blocked out", async () => {
    const attached = ["users", "member", "characters", "char-member"] as const;
    const unattached = ["users", "member", "characters", "char-private"] as const;
    for (const uid of ["member", ADMIN_UID, "peer", "dm"]) {
      await assertSucceeds(
        getDoc(doc(testEnv.authenticatedContext(uid).firestore(), ...attached))
      );
    }
    // An UNATTACHED char has no campaign pointer → owner/admin only.
    await assertSucceeds(
      getDoc(doc(testEnv.authenticatedContext("member").firestore(), ...unattached))
    );
    for (const uid of ["outsider", "peer", "dm"]) {
      await assertFails(
        getDoc(doc(testEnv.authenticatedContext(uid).firestore(), ...unattached))
      );
    }
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext("outsider").firestore(), ...attached))
    );
    // A BLOCKED co-member is denied by the isNotBlocked gate.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "campaigns", "campA"),
        campaignDoc(["dm", "member", "blocked"])
      );
    });
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext("blocked").firestore(), ...attached))
    );
  });

  it("a co-member and the DM may READ but never WRITE a peer's character", async () => {
    for (const uid of ["peer", "dm"]) {
      await assertFails(
        updateDoc(
          doc(
            testEnv.authenticatedContext(uid).firestore(),
            "users",
            "member",
            "characters",
            "char-member"
          ),
          { status: "dead" }
        )
      );
    }
  });

  it("a character is born at revision 0 with an EMPTY state", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    const character = { status: "active", build: {}, state: {}, cache: {} };
    await assertSucceeds(
      setDoc(doc(owner, "users", "member", "characters", "new-ok"), {
        ...character,
        revision: 0,
      })
    );
    await assertFails(
      setDoc(doc(owner, "users", "member", "characters", "new-rev"), {
        ...character,
        revision: 1,
      })
    );
    // The play session belongs to `combat/state`; the parent envelope stays empty.
    await assertFails(
      setDoc(doc(owner, "users", "member", "characters", "new-state"), {
        ...character,
        revision: 0,
        state: { usedSlots: { "1": 1 } },
      })
    );
  });

  it("a build write is compare-and-set: exactly revision + 1, stale and ahead denied", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    const ref = doc(owner, "users", "member", "characters", "char-member");
    await assertFails(updateDoc(ref, { build: { name: "Mara II" }, revision: 3 }));
    await assertFails(updateDoc(ref, { build: { name: "Mara II" }, revision: 5 }));
    await assertFails(updateDoc(ref, { build: { name: "Mara II" } }));
    await assertSucceeds(updateDoc(ref, { build: { name: "Mara II" }, revision: 4 }));
  });

  it("a metadata-only write may leave the generation alone OR advance it by exactly one", async () => {
    // A whole-document ceremony (sharing publish, snapshot restore) rewrites the parent
    // with values that often diff to nothing, yet legitimately advances the generation.
    const owner = testEnv.authenticatedContext("member").firestore();
    const ref = doc(owner, "users", "member", "characters", "char-member");
    await assertSucceeds(updateDoc(ref, { status: "retired" }));
    await assertSucceeds(updateDoc(ref, { status: "dead", revision: 4 }));
    await assertFails(updateDoc(ref, { status: "archived", revision: 6 }));
    await assertFails(updateDoc(ref, { status: "archived", revision: 3 }));
    // An owner update that would strand a session on the parent is denied outright.
    await assertFails(updateDoc(ref, { state: { usedSlots: { "1": 1 } }, revision: 4 }));
  });

  it("an attachment claim dies with the roster row: dangling, removed, or swapped", async () => {
    const attached = ["users", "member", "characters", "char-member"] as const;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "campA"), {
        members: arrayRemove("peer"),
        "memberDetails.peer": deleteField(),
      });
    });
    // The cured disease: with the stored-ACL model this revocation needed the OWNER's
    // client to recompute a reader list; now the very next request reads the live roster.
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext("peer").firestore(), ...attached))
    );

    // A DANGLING pointer (campaign deleted) fails CLOSED for peers; the owner keeps access.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), "campaigns", "campA"));
    });
    await assertFails(
      getDoc(doc(testEnv.authenticatedContext("dm").firestore(), ...attached))
    );
    await assertSucceeds(
      getDoc(doc(testEnv.authenticatedContext("member").firestore(), ...attached))
    );
  });

  it("the DM's removal batch may no longer clear a departing character's claim", async () => {
    // §5.2 — membership stops writing another user's documents. The roster half is
    // legal on its own; the cross-user character write is not, so the batch fails.
    const dm = testEnv.authenticatedContext("dm").firestore();
    const batch = writeBatch(dm);
    batch.update(doc(dm, "campaigns", "campA"), {
      members: arrayRemove("member"),
      "memberDetails.member": deleteField(),
    });
    batch.update(doc(dm, "users", "member", "characters", "char-member"), {
      attachedCampaignId: deleteField(),
    });
    await assertFails(batch.commit());
    await assertSucceeds(
      updateDoc(doc(dm, "campaigns", "campA"), {
        members: arrayRemove("member"),
        "memberDetails.member": deleteField(),
      })
    );
  });

  it("the owner clears their OWN claim (the §5.2 replacement path)", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(owner, "users", "member", "characters", "char-member"), {
        attachedCampaignId: deleteField(),
      })
    );
  });

  it("the admin writes another user's character under the SAME revision CAS", async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    const ref = doc(admin, "users", "member", "characters", "char-private");
    await assertFails(updateDoc(ref, { build: { name: "Broken" }, revision: 9 }));
    await assertFails(updateDoc(ref, { state: { usedSlots: { "1": 1 } }, revision: 4 }));
    await assertSucceeds(updateDoc(ref, { build: { name: "Fixed" }, revision: 4 }));
    await assertSucceeds(deleteDoc(ref));
  });

  it("the owner may delete an unshared character", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      deleteDoc(doc(owner, "users", "member", "characters", "char-private"))
    );
  });
});

describe("firestore.rules — sanitized public character projection", () => {
  // Anonymous readers get ONE literal derived doc, never the private parent. The
  // projection is transaction-coupled to its source so it cannot lag a publish,
  // revoke, portrait change, or sheet update by even one committed write.
  const SHARED_PARENT = ["users", "member", "characters", "char-shared"] as const;
  const PUBLIC_SHEET = [...SHARED_PARENT, "public", "sheet"] as const;
  const PRIVATE_PARENT = ["users", "member", "characters", "char-private"] as const;
  const PRIVATE_SHEET = [...PRIVATE_PARENT, "public", "sheet"] as const;
  const SOURCE_UPDATED_AT = Timestamp.fromMillis(1_720_000_000_000);
  const NEXT_UPDATED_AT = Timestamp.fromMillis(1_720_000_001_000);
  const BUILD = { name: "Mara Quickfingers", classes: [{ id: "rogue", level: 5 }] };
  const CACHE = { ac: 16, hpMax: 33, passivePerception: 14 };
  const CROP = { x: 5, y: 8, width: 70, height: 76 };

  function parentDoc(overrides: Record<string, unknown> = {}) {
    return {
      schema: 3,
      build: BUILD,
      state: {},
      cache: CACHE,
      status: "active",
      shared: true,
      revision: 3,
      portraitUrl: "https://storage.invalid/private-token",
      portraitCrop: CROP,
      attachedCampaignId: "campPublic",
      inviteCode: "never-project-this",
      internalMetadata: { migration: "private" },
      createdAt: Timestamp.fromMillis(1_710_000_000_000),
      updatedAt: SOURCE_UPDATED_AT,
      ...overrides,
    };
  }

  function publicSheet(overrides: Record<string, unknown> = {}) {
    return {
      publicSchema: 1,
      schema: 3,
      build: BUILD,
      cache: CACHE,
      status: "active",
      hasPortrait: true,
      portraitCrop: CROP,
      sourceUpdatedAt: SOURCE_UPDATED_AT,
      ...overrides,
    };
  }

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(
        doc(db, "campaigns", "campPublic"),
        campaignDoc(["dm", "member"], "dm", { member: "char-shared" })
      );
      await setDoc(doc(db, ...SHARED_PARENT), parentDoc());
      await setDoc(doc(db, ...PUBLIC_SHEET), publicSheet());
      await setDoc(
        doc(db, ...PRIVATE_PARENT),
        parentDoc({
          shared: false,
          portraitUrl: null,
          portraitCrop: null,
          attachedCampaignId: null,
        })
      );
      await setDoc(doc(db, ...SHARED_PARENT, "snapshots", "snap1"), {
        build: {},
        state: {},
      });
      await setDoc(doc(db, ...SHARED_PARENT, "combat", "state"), {
        hp: { current: 10, temp: 0 },
        conditions: [] as string[],
      });
    });
  });

  it("anonymous exact GET returns only the closed public schema", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    const snapshot = await assertSucceeds(getDoc(doc(anon, ...PUBLIC_SHEET)));
    expect(snapshot.data()).toEqual(publicSheet());
    expect(Object.keys(snapshot.data() ?? {}).sort()).toEqual(
      [
        "publicSchema",
        "schema",
        "build",
        "cache",
        "status",
        "hasPortrait",
        "portraitCrop",
        "sourceUpdatedAt",
      ].sort()
    );
    for (const privateKey of [
      "portraitUrl",
      "state",
      "attachedCampaignId",
      "inviteCode",
      "internalMetadata",
    ]) {
      expect(snapshot.data()).not.toHaveProperty(privateKey);
    }

    // …and nothing else: not the raw parent, a private child, a wrong id, or a LIST.
    await assertFails(getDoc(doc(anon, ...SHARED_PARENT)));
    await assertFails(getDoc(doc(anon, ...PRIVATE_PARENT)));
    await assertFails(getDoc(doc(anon, ...SHARED_PARENT, "public", "other")));
    await assertFails(getDoc(doc(anon, ...SHARED_PARENT, "snapshots", "snap1")));
    await assertFails(getDoc(doc(anon, ...SHARED_PARENT, "combat", "state")));
    await assertFails(getDocs(collection(anon, ...SHARED_PARENT, "public")));
    await assertFails(
      getDocs(
        query(
          collection(anon, "users", "member", "characters"),
          where("shared", "==", true)
        )
      )
    );

    // A portrait-less character normalizes its absent private crop to `null`.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const parent = parentDoc({ portraitUrl: null });
      delete (parent as Record<string, unknown>).portraitCrop;
      await setDoc(doc(db, ...SHARED_PARENT), parent);
      await setDoc(
        doc(db, ...PUBLIC_SHEET),
        publicSheet({ hasPortrait: false, portraitCrop: null })
      );
    });
    await assertSucceeds(getDoc(doc(anon, ...PUBLIC_SHEET)));
  });

  it("anonymous reads fail closed for leaked keys and every source mismatch", async () => {
    const missingRequiredKey: Record<string, unknown> = publicSheet();
    delete missingRequiredKey.cache;
    const malformed: ReadonlyArray<Record<string, unknown>> = [
      missingRequiredKey,
      publicSheet({ attachedCampaignId: "campPublic" }),
      publicSheet({ inviteCode: "secret" }),
      publicSheet({ portraitUrl: "https://storage.invalid/token" }),
      publicSheet({ state: { notes: "private" } }),
      publicSheet({ internalMetadata: true }),
      publicSheet({ publicSchema: 2 }),
      publicSheet({ schema: 4 }),
      publicSheet({ build: { name: "Stale" } }),
      publicSheet({ cache: { ac: 99 } }),
      publicSheet({ status: "retired" }),
      publicSheet({ hasPortrait: false }),
      publicSheet({ portraitCrop: null }),
      publicSheet({ sourceUpdatedAt: NEXT_UPDATED_AT }),
    ];
    const anon = testEnv.unauthenticatedContext().firestore();
    for (const data of malformed) {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), ...PUBLIC_SHEET), data);
      });
      await assertFails(getDoc(doc(anon, ...PUBLIC_SHEET)));
    }

    // The SOURCE side of the pair is checked just as strictly: a parent off the one
    // canonical shape (wrong schema, a stranded session, an unknown status) closes it.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...PUBLIC_SHEET), publicSheet());
    });
    for (const parent of [
      parentDoc({ schema: 2 }),
      parentDoc({ state: { notes: "private" } }),
      parentDoc({ status: "homebrew-secret" }),
    ]) {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), ...SHARED_PARENT), parent);
      });
      await assertFails(getDoc(doc(anon, ...PUBLIC_SHEET)));
    }
  });

  it("anonymous callers can never write either side of the projection", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, ...PUBLIC_SHEET), publicSheet()));
    await assertFails(deleteDoc(doc(anon, ...PUBLIC_SHEET)));
    await assertFails(updateDoc(doc(anon, ...SHARED_PARENT), { shared: false }));
  });

  it("owner projection writes admit no private key and no parent mismatch", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    for (const [key, value] of [
      ["attachedCampaignId", "campPublic"],
      ["inviteCode", "secret"],
      ["portraitUrl", "https://storage.invalid/token"],
      ["state", { notes: "private" }],
      ["internalMetadata", { migration: "private" }],
    ] as const) {
      const batch = writeBatch(owner);
      batch.update(doc(owner, ...SHARED_PARENT), { updatedAt: NEXT_UPDATED_AT });
      batch.set(
        doc(owner, ...PUBLIC_SHEET),
        publicSheet({ sourceUpdatedAt: NEXT_UPDATED_AT, [key]: value })
      );
      await assertFails(batch.commit());
    }

    // …and every value mismatch against the parent it derives from, batched or not.
    const mismatches: ReadonlyArray<Record<string, unknown>> = [
      { publicSchema: 2 },
      { schema: 4 },
      { build: { name: "Wrong" } },
      { cache: { ac: 99 } },
      { status: "retired" },
      { hasPortrait: false },
      { portraitCrop: null },
      { sourceUpdatedAt: SOURCE_UPDATED_AT },
    ];
    for (const mismatch of mismatches) {
      const batch = writeBatch(owner);
      batch.update(doc(owner, ...SHARED_PARENT), { updatedAt: NEXT_UPDATED_AT });
      batch.set(
        doc(owner, ...PUBLIC_SHEET),
        publicSheet({ sourceUpdatedAt: NEXT_UPDATED_AT, ...mismatch })
      );
      await assertFails(batch.commit());
    }
  });

  it("publishing requires one atomic parent + projection commit", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      updateDoc(doc(owner, ...PRIVATE_PARENT), {
        shared: true,
        updatedAt: NEXT_UPDATED_AT,
      })
    );
    await assertFails(
      setDoc(
        doc(owner, ...PRIVATE_SHEET),
        publicSheet({
          hasPortrait: false,
          portraitCrop: null,
          sourceUpdatedAt: NEXT_UPDATED_AT,
        })
      )
    );

    // The REAL `setCharacterSharing` payload rewrites the WHOLE parent: schema /
    // build / state / cache are re-sent with the SAME values (so they diff to nothing)
    // while `shared` flips and the generation advances. The first cut of the rule
    // demanded an unchanged `revision` whenever build/state/cache were unaffected,
    // which denied exactly this real client write (and the no-op snapshot restore).
    const sharingBatch = writeBatch(owner);
    sharingBatch.update(doc(owner, ...PRIVATE_PARENT), {
      schema: 3,
      build: BUILD,
      state: {},
      cache: CACHE,
      shared: true,
      revision: 4,
      updatedAt: NEXT_UPDATED_AT,
    });
    sharingBatch.set(
      doc(owner, ...PRIVATE_SHEET),
      publicSheet({
        hasPortrait: false,
        portraitCrop: null,
        sourceUpdatedAt: NEXT_UPDATED_AT,
      })
    );
    await assertSucceeds(sharingBatch.commit());

    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, ...PRIVATE_SHEET)));
    const stored = await getDoc(doc(owner, ...PRIVATE_PARENT));
    expect(stored.data()?.revision).toBe(4);
  });

  it("public-relevant parent updates require the matching projection in the same commit", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    const nextBuild = { name: "Mara Updated", classes: [{ id: "rogue", level: 6 }] };
    const nextCache = { ac: 17, hpMax: 39, passivePerception: 15 };
    const parentPatch = {
      build: nextBuild,
      cache: nextCache,
      status: "retired",
      portraitUrl: null,
      portraitCrop: null,
      revision: 4,
      updatedAt: NEXT_UPDATED_AT,
    };
    await assertFails(updateDoc(doc(owner, ...SHARED_PARENT), parentPatch));
    await assertFails(
      setDoc(
        doc(owner, ...PUBLIC_SHEET),
        publicSheet({
          build: nextBuild,
          cache: nextCache,
          status: "retired",
          hasPortrait: false,
          portraitCrop: null,
          sourceUpdatedAt: NEXT_UPDATED_AT,
        })
      )
    );

    const batch = writeBatch(owner);
    batch.update(doc(owner, ...SHARED_PARENT), parentPatch);
    batch.set(
      doc(owner, ...PUBLIC_SHEET),
      publicSheet({
        build: nextBuild,
        cache: nextCache,
        status: "retired",
        hasPortrait: false,
        portraitCrop: null,
        sourceUpdatedAt: NEXT_UPDATED_AT,
      })
    );
    await assertSucceeds(batch.commit());
    const anon = testEnv.unauthenticatedContext().firestore();
    const snapshot = await assertSucceeds(getDoc(doc(anon, ...PUBLIC_SHEET)));
    expect(snapshot.data()).toMatchObject({
      build: nextBuild,
      cache: nextCache,
      status: "retired",
      hasPortrait: false,
      portraitCrop: null,
      sourceUpdatedAt: NEXT_UPDATED_AT,
    });
  });

  it("revoking and deleting each require one atomic parent + projection commit", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertFails(updateDoc(doc(owner, ...SHARED_PARENT), { shared: false }));
    await assertFails(deleteDoc(doc(owner, ...PUBLIC_SHEET)));
    // A shared parent may not be deleted while its projection still exists: the delete
    // rule requires `!existsAfter(public/sheet)`, so an orphaned anonymous sheet is
    // structurally impossible.
    await assertFails(deleteDoc(doc(owner, ...SHARED_PARENT)));

    const batch = writeBatch(owner);
    batch.update(doc(owner, ...SHARED_PARENT), {
      shared: false,
      updatedAt: NEXT_UPDATED_AT,
    });
    batch.delete(doc(owner, ...PUBLIC_SHEET));
    await assertSucceeds(batch.commit());

    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, ...PUBLIC_SHEET)));
    await assertFails(getDoc(doc(anon, ...SHARED_PARENT)));

    // Deleting a SHARED character needs the same atomic pair; once revoked (no sheet)
    // the parent deletes on its own.
    await assertSucceeds(deleteDoc(doc(owner, ...SHARED_PARENT)));
  });

  it("the OWNER's attachment-only removal keeps an unchanged public projection valid", async () => {
    // §5.2 — the departing player's OWN client clears the claim (the DM's cross-user
    // detach is gone), and that write must still satisfy the projection invariant.
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(owner, ...SHARED_PARENT), { attachedCampaignId: deleteField() })
    );
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertFails(
      updateDoc(doc(dm, ...SHARED_PARENT), { attachedCampaignId: "campPublic" })
    );

    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, ...PUBLIC_SHEET)));
    const parent = await assertSucceeds(getDoc(doc(owner, ...SHARED_PARENT)));
    expect(parent.data()).not.toHaveProperty("attachedCampaignId");
    expect(parent.data()?.updatedAt).toEqual(SOURCE_UPDATED_AT);
  });

  it("admin-supreme STOPS at a PUBLISHED character: the projection is owner-only", async () => {
    // The one limit on admin-supreme, and it is structural rather than a special case:
    // a parent write on a shared character must produce the EXACT projection in the same
    // commit, and `public/sheet` is owner-only — so the admin can neither re-publish nor
    // revoke on the owner's behalf. An unshared character stays fully admin-writable.
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertFails(
      updateDoc(doc(admin, ...SHARED_PARENT), {
        build: { ...BUILD, name: "Renamed" },
        revision: 4,
      })
    );
    await assertFails(deleteDoc(doc(admin, ...SHARED_PARENT)));
    await assertFails(setDoc(doc(admin, ...PUBLIC_SHEET), publicSheet()));
    await assertSucceeds(
      updateDoc(doc(admin, ...PRIVATE_PARENT), {
        build: { name: "Fixed" },
        revision: 4,
      })
    );
  });
});

describe("firestore.rules — combat/state: the owner's document", () => {
  // §5.4 — the personal encounter is an OWNER document: the owner (and the admin)
  // write it, a current co-member reads it, nobody else touches it. The peer effect
  // fence died with the embedded campaign encounter: a table effect is now an ACTION
  // appended to `campaigns/{id}/encounters/{eid}` and folded by the reducer, so no
  // client ever writes another player's document to deliver damage.
  const COMBAT_PATH = [
    "users",
    "member",
    "characters",
    "char-cbt",
    "combat",
    "state",
  ] as const;
  const PARENT_PATH = ["users", "member", "characters", "char-cbt"] as const;

  function combatState(overrides: Record<string, unknown> = {}) {
    return {
      hp: { current: 10, temp: 0 },
      conditions: [] as string[],
      deathSaves: { successes: 0, failures: 0 },
      updatedAt: Timestamp.fromMillis(1_720_000_000_000),
      ...overrides,
    };
  }

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(
        doc(db, "campaigns", "campA"),
        campaignDoc(["dm", "member", "peer"], "dm", { member: "char-cbt" })
      );
      await setDoc(doc(db, ...PARENT_PATH), {
        status: "active",
        attachedCampaignId: "campA",
        build: { name: "Mara" },
        state: {},
        cache: {},
        revision: 3,
      });
      await setDoc(doc(db, ...COMBAT_PATH), combatState());
    });
  });

  it("the read matrix: owner, admin and a current co-member in; everyone else out", async () => {
    for (const uid of ["member", ADMIN_UID, "peer", "dm"]) {
      await assertSucceeds(
        getDoc(doc(testEnv.authenticatedContext(uid).firestore(), ...COMBAT_PATH))
      );
    }
    for (const db of [
      testEnv.authenticatedContext("outsider").firestore(),
      testEnv.unauthenticatedContext().firestore(),
    ]) {
      await assertFails(getDoc(doc(db, ...COMBAT_PATH)));
    }
  });

  it("the owner owns the whole document — no shape, additive fields included", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(owner, ...COMBAT_PATH), {
        hp: { current: 9, temp: 2 },
        someFutureRoot: { version: 2 },
      })
    );
    await assertSucceeds(setDoc(doc(owner, ...COMBAT_PATH), combatState()));
    await assertSucceeds(deleteDoc(doc(owner, ...COMBAT_PATH)));
  });

  it("the admin writes it; a co-member, the DM and an outsider never do", async () => {
    for (const uid of ["peer", "dm", "outsider"]) {
      await assertFails(
        updateDoc(doc(testEnv.authenticatedContext(uid).firestore(), ...COMBAT_PATH), {
          hp: { current: 9, temp: 0 },
        })
      );
    }
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(admin, ...COMBAT_PATH), { conditions: ["prone"] })
    );
  });

  it("the co-member read dies live with either half of the attachment", async () => {
    const revocations: ReadonlyArray<Record<string, unknown>> = [
      // The requester leaves the table.
      { members: ["dm", "member"], "memberDetails.peer": deleteField() },
      // The TARGET's owner leaves — the stale memberDetails row must not keep granting.
      { members: ["dm", "peer"] },
      // The target swaps to another character.
      { "memberDetails.member.characterId": "char-replacement" },
    ];
    for (const revocation of revocations) {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(
          doc(db, "campaigns", "campA"),
          campaignDoc(["dm", "member", "peer"], "dm", { member: "char-cbt" })
        );
        await updateDoc(doc(db, "campaigns", "campA"), revocation);
      });
      const peer = testEnv.authenticatedContext("peer").firestore();
      await assertFails(getDoc(doc(peer, ...PARENT_PATH)));
      await assertFails(getDoc(doc(peer, ...COMBAT_PATH)));
    }
    // Reciprocal fencing never weakens the direct owner path.
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(getDoc(doc(owner, ...PARENT_PATH)));
    await assertSucceeds(getDoc(doc(owner, ...COMBAT_PATH)));
  });

  it("an UNATTACHED character has no cross-user grant at all", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), ...PARENT_PATH), {
        attachedCampaignId: deleteField(),
      });
    });
    for (const uid of ["dm", "peer"]) {
      const db = testEnv.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, ...COMBAT_PATH)));
      await assertFails(
        updateDoc(doc(db, ...COMBAT_PATH), { hp: { current: 9, temp: 0 } })
      );
    }
  });
});

describe("firestore.rules — character snapshots (immutable envelopes)", () => {
  // A snapshot is the unified codec envelope plus its reason: created and deleted by
  // the owner (or the admin), never updated, never readable by anyone else.
  const SNAPSHOTS = ["users", "member", "characters", "char-snap", "snapshots"] as const;
  const envelope = {
    schema: 3,
    build: { name: "Mara Quickfingers" },
    state: {},
    reason: "level-up",
    createdAt: Timestamp.fromMillis(1_720_000_000_000),
  };

  it("the owner creates, reads and deletes an envelope — but never updates one", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(setDoc(doc(owner, ...SNAPSHOTS, "s1"), envelope));
    await assertSucceeds(getDoc(doc(owner, ...SNAPSHOTS, "s1")));
    await assertFails(updateDoc(doc(owner, ...SNAPSHOTS, "s1"), { reason: "edited" }));
    await assertSucceeds(deleteDoc(doc(owner, ...SNAPSHOTS, "s1")));
  });

  it("an envelope missing the reason or the codec shape is denied", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      setDoc(doc(owner, ...SNAPSHOTS, "s2"), { schema: 3, build: {}, state: {} })
    );
    await assertFails(setDoc(doc(owner, ...SNAPSHOTS, "s3"), { ...envelope, schema: 2 }));
    await assertFails(
      setDoc(doc(owner, ...SNAPSHOTS, "s4"), { ...envelope, state: "not-a-map" })
    );
  });

  it("the admin may create and delete another user's snapshot; a stranger neither", async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(setDoc(doc(admin, ...SNAPSHOTS, "s5"), envelope));
    await assertSucceeds(getDoc(doc(admin, ...SNAPSHOTS, "s5")));
    await assertSucceeds(deleteDoc(doc(admin, ...SNAPSHOTS, "s5")));
    const outsider = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(setDoc(doc(outsider, ...SNAPSHOTS, "s6"), envelope));
    await assertFails(getDoc(doc(outsider, ...SNAPSHOTS, "s5")));
  });
});

describe("firestore.rules — /campaigns subcollections", () => {
  it("a member can read/write a subcollection doc; a non-member cannot", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      setDoc(doc(member, "campaigns", "camp1", "chronicle", "main"), {
        text: "Session 1",
      })
    );
    const outsider = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(getDoc(doc(outsider, "campaigns", "camp1", "chronicle", "main")));
    await assertFails(
      setDoc(doc(outsider, "campaigns", "camp1", "chronicle", "main"), { text: "x" })
    );
  });
});

// ── shared NOTES: the content-sharing soft-reveal, gated by COLLECTION PATH ───────
// REVEALED notes live in `/campaigns/{campId}/notes/{id}` (members read/write, like
// chronicle/sessions). HIDDEN notes live in `/campaigns/{campId}/dmNotes/{id}`,
// DM/admin-only. Path-based gating is LIST-SAFE: a member cannot read OR list dmNotes
// at all, so a hidden note can never reach a player — even via an unscoped query
// (a content-flag rule could NOT enforce that, since rules don't filter lists).
describe("firestore.rules — /campaigns notes (revealed) + dmNotes (hidden) gate", () => {
  const revealed = (id: string) => ["campaigns", "camp1", "notes", id] as const;
  const hidden = (id: string) => ["campaigns", "camp1", "dmNotes", id] as const;

  beforeEach(async () => {
    // Seed a revealed note and a hidden note (each in its visibility's collection).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, ...revealed("r1")), noteDoc());
      await setDoc(doc(db, ...hidden("h1")), noteDoc());
    });
  });

  it("a member reads revealed notes and can never reach dmNotes, doc or LIST", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(getDoc(doc(member, ...revealed("r1"))));
    await assertSucceeds(getDocs(collection(member, "campaigns", "camp1", "notes")));
    // The crux: path-based gating denies the whole-collection list, so there is no
    // unscoped-query hole that a content-flag rule would leave open. This is also
    // the REGRESSION for the generic /campaigns/{campId}/{subcol}/{docId} grant:
    // Firestore OR-combines matching rules, so without `subcol != 'dmNotes'` its
    // broad member grant would override the DM-only gate.
    await assertFails(getDoc(doc(member, ...hidden("h1"))));
    await assertFails(getDocs(collection(member, "campaigns", "camp1", "dmNotes")));
  });

  it("the DM and the admin CAN read, list and WRITE hidden notes", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(getDoc(doc(dm, ...hidden("h1"))));
    await assertSucceeds(getDocs(collection(dm, "campaigns", "camp1", "dmNotes")));
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(admin, ...hidden("h1"))));
    await assertSucceeds(getDocs(collection(admin, "campaigns", "camp1", "dmNotes")));
    await assertSucceeds(updateDoc(doc(admin, ...hidden("h1")), { pinned: true }));
  });

  it("a non-member and a blocked user are denied even a revealed note", async () => {
    const outsider = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(getDoc(doc(outsider, ...revealed("r1"))));
    const blocked = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(getDoc(doc(blocked, ...revealed("r1"))));
  });

  it("a member CAN create / edit / delete a revealed note", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      setDoc(doc(member, ...revealed("m1")), noteDoc({ createdBy: "member" }))
    );
    await assertSucceeds(
      updateDoc(doc(member, ...revealed("r1")), {
        pinned: true,
        updatedAt: Timestamp.now(),
      })
    );
    await assertSucceeds(deleteDoc(doc(member, ...revealed("r1"))));
  });

  it("a member CANNOT write dmNotes — cannot author a hidden note nor HIDE one", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    // Author straight-to-hidden → denied.
    await assertFails(
      setDoc(doc(member, ...hidden("m2")), noteDoc({ createdBy: "member" }))
    );
    // The "hide" half of the move (write into dmNotes) → denied; editing/deleting an
    // existing hidden note → denied. So a member can never reveal/hide a note.
    await assertFails(updateDoc(doc(member, ...hidden("h1")), { pinned: true }));
    await assertFails(deleteDoc(doc(member, ...hidden("h1"))));
  });

  it("the DM may hide (write dmNotes) and reveal (write notes) — the soft-reveal move", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    // Hide: write the doc into dmNotes (+ the move deletes the notes copy).
    await assertSucceeds(setDoc(doc(dm, ...hidden("r1")), noteDoc()));
    await assertSucceeds(deleteDoc(doc(dm, ...revealed("r1"))));
    // Reveal: write into notes (+ delete the dmNotes copy).
    await assertSucceeds(setDoc(doc(dm, ...revealed("h1")), noteDoc()));
    await assertSucceeds(deleteDoc(doc(dm, ...hidden("h1"))));
  });
});

/** A well-formed bug-report document for the given reporter (OWN-37). */
function reportDoc(reporterUid: string, overrides: Record<string, unknown> = {}) {
  return {
    type: "bug",
    screen: "character-cockpit",
    severity: "medium",
    title: "Spell DC is wrong",
    description: "Shows 14, expected 15.",
    status: "new",
    reporterUid,
    locale: "en",
    debugContext: { pathname: "/characters/x" },
    ...overrides,
  };
}

describe("firestore.rules — /bug_reports access (OWN-37)", () => {
  it("a signed-in user can create a well-formed report for themselves", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(setDoc(doc(db, "bug_reports", "r1"), reportDoc("member")));
  });

  it("rejects a blocked reporter, a spoofed uid, an empty title and a non-'new' status", async () => {
    const blocked = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(setDoc(doc(blocked, "bug_reports", "rb"), reportDoc("blocked")));
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(setDoc(doc(db, "bug_reports", "rs"), reportDoc("outsider")));
    await assertFails(
      setDoc(doc(db, "bug_reports", "rt"), reportDoc("member", { title: "" }))
    );
    await assertFails(
      setDoc(doc(db, "bug_reports", "ro"), reportDoc("member", { status: "opened" }))
    );
  });

  it("rejects a client pre-setting the issue linkage (function-only write-back)", async () => {
    // A forged issueNumber could alias an unrelated CLOSED issue and get the
    // report wrongly purged by the inbox reconciliation — function-only fields.
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      setDoc(doc(db, "bug_reports", "ri"), reportDoc("member", { issueNumber: 1 }))
    );
    await assertFails(
      setDoc(
        doc(db, "bug_reports", "ru"),
        reportDoc("member", { issueUrl: "https://github.com/x/y/issues/1" })
      )
    );
  });

  it("only the admin can read reports", async () => {
    // Seed one via the privileged context (bypasses rules).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "bug_reports", "r2"), reportDoc("member"));
    });
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(getDoc(doc(member, "bug_reports", "r2")));
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(admin, "bug_reports", "r2")));
  });

  it("a plain client cannot update or delete a report; the ADMIN can delete (the inbox purge)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "bug_reports", "r3"), reportDoc("member"));
    });
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(updateDoc(doc(member, "bug_reports", "r3"), { status: "opened" }));
    await assertFails(deleteDoc(doc(member, "bug_reports", "r3")));
    // The admin inbox reconciliation deletes a report once its issue closes.
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(deleteDoc(doc(admin, "bug_reports", "r3")));
  });
});

/** A well-formed diagnostics-report document for the given uid (ADR-0008). */
function diagnosticDoc(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    schema: 1,
    uid,
    level: "error",
    event: "character.quarantine",
    message: "malformed-entry at build.spells[0]",
    createdAtMs: 1_720_000_000_000,
    context: { sessionId: "s", buildSha: "abc", appVersion: "1" },
    breadcrumbs: [{ t: 1, level: "error", event: "character.quarantine" }],
    createdAt: Timestamp.now(),
    ...overrides,
  };
}

describe("firestore.rules — /diagnostics (ADR-0008 create-only reports)", () => {
  it("a signed-in user creates a well-formed report for themselves; a blocked user cannot", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      setDoc(doc(member, "diagnostics", "d1"), diagnosticDoc("member"))
    );
    const blocked = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(
      setDoc(doc(blocked, "diagnostics", "d2"), diagnosticDoc("blocked"))
    );
  });

  it("rejects a spoofed uid, a non-error level, an oversized message and unknown keys", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      setDoc(doc(member, "diagnostics", "d3"), diagnosticDoc("outsider"))
    );
    await assertFails(
      setDoc(doc(member, "diagnostics", "d4"), diagnosticDoc("member", { level: "info" }))
    );
    await assertFails(
      setDoc(
        doc(member, "diagnostics", "d5"),
        diagnosticDoc("member", { message: "x".repeat(2001) })
      )
    );
    await assertFails(
      setDoc(doc(member, "diagnostics", "d6"), diagnosticDoc("member", { extra: true }))
    );
  });

  it("only the admin reads and deletes; nobody updates", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "diagnostics", "d7"), diagnosticDoc("member"));
    });
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(getDoc(doc(member, "diagnostics", "d7")));
    await assertFails(updateDoc(doc(member, "diagnostics", "d7"), { message: "edited" }));
    await assertFails(deleteDoc(doc(member, "diagnostics", "d7")));
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(admin, "diagnostics", "d7")));
    await assertFails(updateDoc(doc(admin, "diagnostics", "d7"), { message: "edited" }));
    await assertSucceeds(deleteDoc(doc(admin, "diagnostics", "d7")));
  });
});

/** One library entry, shaped like the client's own write (src/lib/library.ts). */
function libraryEntry(name: string) {
  return {
    id: `entry-${name}`,
    savedAt: 1_700_000_000_000,
    kind: "spell",
    item: {
      custom: true,
      name,
      level: 1,
      school: "evocation",
      castingTime: "action",
      range: "60 feet",
      components: { v: true, s: true, m: false },
      duration: "Instantaneous",
      concentration: false,
      description: "Homebrew.",
    },
  };
}

describe("firestore.rules — the account-level homebrew library (users/{uid}/library)", () => {
  it("the OWNER can read and write their own library", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", "member", "library", "index"), {
        entries: [libraryEntry("Ember Bolt")],
      })
    );
    await assertSucceeds(getDoc(doc(db, "users", "member", "library", "index")));
  });

  it("an empty library (the first save's precursor) is a valid write", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", "member", "library", "index"), { entries: [] })
    );
  });

  it("a STRANGER can neither read nor write another user's library", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "member", "library", "index"), {
        entries: [libraryEntry("Ember Bolt")],
      });
    });
    const db = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(getDoc(doc(db, "users", "member", "library", "index")));
    await assertFails(
      setDoc(doc(db, "users", "member", "library", "index"), { entries: [] })
    );
  });

  it("a BLOCKED user is denied their OWN library (isNotBlocked gate)", async () => {
    const db = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(getDoc(doc(db, "users", "blocked", "library", "index")));
    await assertFails(
      setDoc(doc(db, "users", "blocked", "library", "index"), { entries: [] })
    );
  });

  it("rejects an OVERSIZE list and a non-list `entries` (the free-tier cap)", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    // The cap mirrors FREE_TIER_LIMITS.libraryEntries (100): 100 passes, 101 fails.
    const atCap = Array.from({ length: 100 }, (_, i) => libraryEntry(`S${i}`));
    await assertSucceeds(
      setDoc(doc(db, "users", "member", "library", "index"), { entries: atCap })
    );
    await assertFails(
      setDoc(doc(db, "users", "member", "library", "index"), {
        entries: [...atCap, libraryEntry("overflow")],
      })
    );
    await assertFails(
      setDoc(doc(db, "users", "member", "library", "index"), { entries: "nope" })
    );
  });

  it("the ADMIN may read and write another user's library (admin-supreme)", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      setDoc(doc(db, "users", "member", "library", "index"), {
        entries: [libraryEntry("Ember Bolt")],
      })
    );
    await assertSucceeds(getDoc(doc(db, "users", "member", "library", "index")));
  });
});

// ── The encounter document (combat re-architecture, P2 prototype) ────────────
// `campaigns/{campId}/encounters/{eid}` is the ONLY shared writable gameplay surface of
// the target architecture: members APPEND actions to `log`; the DM (and admin) may
// rewrite it (checkpoints, settings, deletion). Rules enforce membership and shape;
// game legality lives in the reducer (ADR-0005). Nobody writes another user's subtree.
describe("firestore.rules — campaign encounter documents (append-only log)", () => {
  const encounterPath = ["campaigns", "camp1", "encounters", "enc1"] as const;
  const seedEncounter = {
    schema: 1,
    id: "enc1",
    host: { kind: "campaign", campaignId: "camp1" },
    log: [
      {
        kind: "table",
        id: "t-1",
        seq: { ms: 1, counter: 0, by: "dm" },
        by: "dm",
        table: { op: "start", epoch: 1 },
      },
    ],
    checkpoint: null,
  };
  const memberAction = {
    kind: "declare",
    id: "d-1",
    seq: { ms: 2, counter: 0, by: "member" },
    by: "member",
    relation: { kind: "visible", a: "a", b: "b", value: true },
    remove: false,
    mover: null,
  };

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...encounterPath), seedEncounter);
    });
  });

  it("a member may append to the log and read the encounter", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(db, ...encounterPath), { log: arrayUnion(memberAction) })
    );
    await assertSucceeds(getDoc(doc(db, ...encounterPath)));
  });

  it("a member may NOT rewrite the encounter (shrink the log, change the schema or checkpoint)", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(setDoc(doc(db, ...encounterPath), { ...seedEncounter, log: [] }));
    await assertFails(updateDoc(doc(db, ...encounterPath), { schema: 2 }));
    await assertFails(
      updateDoc(doc(db, ...encounterPath), {
        checkpoint: { through: { ms: 1, counter: 0, by: "member" }, state: {} },
      })
    );
  });

  it("the log is APPEND-ONLY, not merely longer: a rewritten prefix is denied", async () => {
    // The size check alone would let a member rewrite every stored entry as long as the
    // list ended up one longer — a silent rewrite of the DM's and the peers' history.
    // The stored log must remain a PREFIX of the written one.
    const db = testEnv.authenticatedContext("member").firestore();
    // The seeded first entry, rewritten: same id + seq slot, different author and body.
    const forged = {
      kind: "table",
      id: "t-1",
      seq: { ms: 1, counter: 0, by: "dm" },
      by: "member",
      table: { op: "end", epoch: 9 },
    };
    await assertFails(
      updateDoc(doc(db, ...encounterPath), { log: [forged, memberAction] })
    );
    // Reordering the same entries while growing is a rewrite too.
    await assertFails(
      updateDoc(doc(db, ...encounterPath), {
        log: [memberAction, ...seedEncounter.log],
      })
    );
    // The honest append — the stored entry untouched, one row added — still lands.
    await assertSucceeds(
      updateDoc(doc(db, ...encounterPath), {
        log: [...seedEncounter.log, memberAction],
      })
    );
  });

  it("a member may append onto an EMPTY log — the state a checkpoint leaves behind", async () => {
    // `l[0:0]` is an EVALUATION ERROR in the rules language, not an empty list, so the
    // prefix fence must guard the empty stored log explicitly or it denies every member
    // append the moment a checkpoint has swallowed the whole log (a table that idles past
    // the grace window, or a DM's freshly opened encounter). An empty stored log is
    // trivially a prefix of anything, so the append must land.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...encounterPath), { ...seedEncounter, log: [] });
    });
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(db, ...encounterPath), { log: arrayUnion(memberAction) })
    );
  });

  it("an EMPTY log is not an open door: a non-member still may not append", async () => {
    // The guard above must widen NOTHING but the empty-list arithmetic — membership still
    // decides, so the same append from an outsider stays denied.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), ...encounterPath), { ...seedEncounter, log: [] });
    });
    const db = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(
      updateDoc(doc(db, ...encounterPath), { log: arrayUnion(memberAction) })
    );
  });

  it("a member may NOT create an encounter document; the DM may", async () => {
    const fresh = ["campaigns", "camp1", "encounters", "enc-new"] as const;
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      setDoc(doc(member, ...fresh), { ...seedEncounter, id: "enc-new", log: [] })
    );
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(
      setDoc(doc(dm, ...fresh), { ...seedEncounter, id: "enc-new", log: [] })
    );
  });

  it("a non-member (leaked link, removed member) may neither read nor append", async () => {
    const db = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(getDoc(doc(db, ...encounterPath)));
    await assertFails(
      updateDoc(doc(db, ...encounterPath), { log: arrayUnion(memberAction) })
    );
  });

  it("the DM may append an override on a player-owned entity and may checkpoint (rewrite) the document", async () => {
    const db = testEnv.authenticatedContext("dm").firestore();
    const override = {
      kind: "override",
      id: "o-1",
      seq: { ms: 3, counter: 0, by: "dm" },
      by: "dm",
      entity: "member-character",
      path: "vitals.hp",
      value: 12,
      reason: "dm:ruling",
    };
    await assertSucceeds(
      updateDoc(doc(db, ...encounterPath), { log: arrayUnion(override) })
    );
    await assertSucceeds(
      setDoc(doc(db, ...encounterPath), {
        ...seedEncounter,
        log: [],
        checkpoint: { through: { ms: 3, counter: 0, by: "dm" }, state: { revision: 3 } },
      })
    );
  });

  it("no encounter writer gains any access to another user's character subtree", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "member", "characters", "char-m"), {
        name: "a member's PC",
        build: {},
        state: {},
      });
    });
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertFails(
      updateDoc(doc(dm, "users", "member", "characters", "char-m"), { name: "Renamed" })
    );
  });

  it("the admin, not a member, may append, checkpoint and delete", async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, ...encounterPath), { log: arrayUnion(memberAction) })
    );
    await assertSucceeds(
      setDoc(doc(db, ...encounterPath), {
        ...seedEncounter,
        log: [],
        checkpoint: {
          through: { ms: 4, counter: 0, by: ADMIN_UID },
          state: { revision: 4 },
        },
      })
    );
    await assertSucceeds(deleteDoc(doc(db, ...encounterPath)));
  });

  it("a member may NOT delete the encounter", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(deleteDoc(doc(db, ...encounterPath)));
  });
});
