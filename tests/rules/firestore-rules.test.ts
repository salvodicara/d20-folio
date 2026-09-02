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
  it("admin powers come from the user doc's role, not a hardcoded uid", async () => {
    // ADMIN_UID is privileged ONLY because its seeded doc carries role:"admin".
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(admin, "users", "member"))); // read another's doc
  });

  it("a normal user (no role) is NOT admin — own doc only, no cross-user read", async () => {
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

  it("a non-admin cannot update any user doc (so cannot grant itself a role)", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(updateDoc(doc(db, "users", "member"), { role: "admin" }));
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
  });

  it("a non-admin CANNOT self-assign role:admin on UPDATE — even bundled with lastActiveAt", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(updateDoc(doc(db, "users", "member"), { role: "admin" }));
    // The escalation must stay denied even when smuggled alongside an allowed field.
    await assertFails(
      updateDoc(doc(db, "users", "member"), {
        role: "admin",
        lastActiveAt: Timestamp.now(),
      })
    );
  });

  it("a non-admin CANNOT change their own status (self-unblock vector denied)", async () => {
    const db = testEnv.authenticatedContext("blocked").firestore();
    // A blocked user must not be able to flip themselves back to active.
    await assertFails(updateDoc(doc(db, "users", "blocked"), { status: "active" }));
    // Nor an active member bundling status alongside the allowed telemetry field.
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      updateDoc(doc(member, "users", "member"), {
        status: "blocked",
        lastActiveAt: Timestamp.now(),
      })
    );
  });

  it("a non-admin CANNOT bump ANOTHER user's lastActiveAt (only their own doc)", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "outsider"), { lastActiveAt: Timestamp.now() })
    );
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

  it("a member may opt only themselves out of encounter participation", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(member, "campaigns", "camp1"), {
        "encounterSkipped.member": true,
      })
    );
    await assertSucceeds(
      updateDoc(doc(member, "campaigns", "camp1"), {
        "encounterSkipped.member": deleteField(),
      })
    );
    await assertFails(
      updateDoc(doc(member, "campaigns", "camp1"), {
        "encounterSkipped.dm": true,
      })
    );
  });

  it("encounter participation stays member-scoped; the DM may correct anyone", async () => {
    const outsider = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(
      updateDoc(doc(outsider, "campaigns", "camp1"), {
        "encounterSkipped.outsider": true,
      })
    );

    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(
      updateDoc(doc(dm, "campaigns", "camp1"), {
        "encounterSkipped.member": true,
      })
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

  it("the DM may manage the roster; only the DM may delete", async () => {
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
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(deleteDoc(doc(member, "campaigns", "camp1")));
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

  // ── encounter tracker (DM tool) ──────────────────────────────────────────────
  // The `encounter` field is a DM tool: the DM (and the admin) may write it; a
  // regular member may not. A member's normal shared-artifact writes are unaffected.
  const encounter = {
    combatants: [
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        // The picker's bestiary reference + per-creature XP —
        // pinned here so the existing DM/admin/member assertions exercise the
        // encounter blob WITH the new nested keys end-to-end (opaque DM-owned map:
        // zero rules diff by construction).
        srdId: "goblin-warrior",
        xp: 50,
        ac: 13,
        initiative: 12,
        conditions: [],
        hp: { current: 7, temp: 0, max: 7 },
      },
    ],
    nextMonsterOrdinal: 2,
    round: 1,
    currentCombatantId: "monster-1",
    epoch: 1,
    status: "active",
  };

  it("the DM may write the encounter field", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(updateDoc(doc(dm, "campaigns", "camp1"), { encounter }));
  });

  it("the admin may write the encounter field (DM-tool override)", async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(updateDoc(doc(admin, "campaigns", "camp1"), { encounter }));
  });

  it("a non-DM member may NOT write the encounter field", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(updateDoc(doc(db, "campaigns", "camp1"), { encounter }));
  });

  it("a member's shared-artifact write still succeeds (encounter guard doesn't block it)", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "campaigns", "camp1"), {
        treasury: { pp: 0, gp: 7, ep: 0, sp: 0, cp: 0 },
      })
    );
  });

  // ── P2 turn-advance: the shared turn pointer (diff-scoped member grant) ────────
  // A running encounter's {currentCombatantId, round} is the ONE source of truth,
  // advanceable from the campaign OR a player's sheet. A regular member may write
  // ONLY those two fields (the `turnFieldsOnlyChanged()` diff grant); any other
  // encounter edit (status / combatants / add-monster) stays DM-only; a non-member
  // is denied entirely. Seed the encounter first (camp1 is seeded encounter-less).
  describe("the turn pointer is a diff-scoped member grant", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), { encounter });
      });
    });

    it("a member MAY advance the turn (writes only currentCombatantId + round)", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.currentCombatantId": "pc-member",
          "encounter.round": 2,
        })
      );
    });

    it("a member CANNOT change the encounter status (beyond the turn fields)", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), { "encounter.status": "ended" })
      );
    });

    it("a member CANNOT add a monster / rewrite the combatants array", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.combatants": [
            ...encounter.combatants,
            {
              kind: "monster",
              id: "monster-2",
              name: "Worg",
              ac: 13,
              initiative: 8,
              conditions: [],
              hp: { current: 26, temp: 0, max: 26 },
            },
          ],
        })
      );
    });

    it("a member CANNOT smuggle a turn change alongside a structure change", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.round": 2,
          "encounter.status": "ended",
        })
      );
    });

    it("the DM may still write the WHOLE encounter (structure unconstrained)", async () => {
      const dm = testEnv.authenticatedContext("dm").firestore();
      await assertSucceeds(
        updateDoc(doc(dm, "campaigns", "camp1"), {
          encounter: { ...encounter, round: 3, currentCombatantId: null },
        })
      );
    });

    it("a non-member is denied a turn-only write", async () => {
      const db = testEnv.authenticatedContext("outsider").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.currentCombatantId": "pc-member",
          "encounter.round": 2,
        })
      );
    });

    // ── C3: the FROZEN turn order (`encounter.order`) is DM-only STRUCTURAL state ──
    // Begin-turns FREEZES it and the DM drag-reorder rewrites it; a regular member may
    // advance the turn pointer but must NEVER touch `order` (it's outside the
    // `turnFieldsOnlyChanged()` allow-set), so the frozen order stays DM-owned.
    it("a non-DM member may NOT change the frozen order (DM-only structural)", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.order": ["monster-1", "pc-member"],
        })
      );
    });

    it("a non-DM member may NOT smuggle an order change alongside a turn advance", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.currentCombatantId": "pc-member",
          "encounter.round": 2,
          "encounter.order": ["pc-member", "monster-1"],
        })
      );
    });

    it("the DM may freeze / drag-reorder the order", async () => {
      const dm = testEnv.authenticatedContext("dm").firestore();
      await assertSucceeds(
        updateDoc(doc(dm, "campaigns", "camp1"), {
          "encounter.order": ["monster-1", "pc-member"],
        })
      );
    });

    it("the admin may write the order (DM-tool override)", async () => {
      const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
      await assertSucceeds(
        updateDoc(doc(admin, "campaigns", "camp1"), {
          "encounter.order": ["pc-member", "monster-1"],
        })
      );
    });
  });

  // ── COMBAT RESOLUTION: a player auto-applies reviewed monster effects ──
  // The source-of-truth flip (owner 2026-08-02): a player who types the damage they
  // rolled writes the target MONSTER's HP + the appended chronicle events on the
  // CAMPAIGN doc the DM owns. The two-user topology is exactly DM (owns camp1) + a
  // MEMBER-owned PC applying to it. A member may write ONLY `encounter.{combatants,
  // events, world}` for new actions (the `combatEffectFieldsOnlyChanged()` grant):
  // monster HP plus chronicle events plus the engine layer the adversary world seam
  // commits in the same transaction. Legacy `memberEffects` remains append-only solely for
  // transition draining. The combatants COUNT is unchanged (no add/remove) while events
  // only GROW (no deleting the DM's lines). Any other encounter edit, a combatant add/remove,
  // or an events shrink stays DM-only; a non-member is denied outright.
  describe("a player applies reviewed combat effects (diff-scoped member grant)", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), { encounter });
      });
    });

    // The monster after the player's declared 1 damage lands on its scalar HP record.
    const damaged = [{ ...encounter.combatants[0], hp: { current: 6, temp: 0, max: 7 } }];
    const appliedEvent = {
      id: "0",
      round: 1,
      kind: "hp-damage",
      targetId: "monster-1",
      amount: 1,
      current: 6,
      max: 7,
    };
    const persistentApply = {
      id: "apply:heroism:1",
      kind: "apply",
      effect: {
        id: "heroism:1",
        actor: {
          kind: "pc",
          combatantId: "pc-member",
          memberUid: "member",
          characterId: "char-member",
        },
        target: { kind: "monster", combatantId: "monster-1" },
        source: { kind: "spell", id: "heroism", actionId: "cast-1" },
        payload: { kind: "grant-group", activeKey: "heroism-active" },
        duration: {
          kind: "concentration",
          actorId: "pc-member",
          sourceId: "heroism",
        },
      },
    };

    it("a member MAY apply damage (writes only encounter.combatants + events)", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.combatants": damaged,
          "encounter.events": [appliedEvent],
        })
      );
    });

    it("a member MAY persist the engine world beside the mirrored fields (adversary world seam)", async () => {
      // The resolver's monster damage/healing commits through the deterministic
      // engine's journal; the committed `encounter.world` rides the SAME member
      // transaction as the mirrored combatants + chronicle beats. A corrupt world
      // fails CLOSED at read time (`encounterWorldState` rejects; the boundary
      // degrades to legacy arithmetic), so this stays inside the coarse-grant,
      // DM-remediable posture the grant already accepts for combatants.
      const db = testEnv.authenticatedContext("member").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.combatants": damaged,
          "encounter.events": [{ ...appliedEvent, engineActionId: "adversary-damage:x" }],
          "encounter.world": { schema: 1, revision: 1 },
        })
      );
    });

    it("a member MAY heal or add a condition through the same narrow effect path", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
          "encounter.combatants": damaged,
          "encounter.events": [appliedEvent],
        });
      });
      const db = testEnv.authenticatedContext("member").firestore();
      const affected = [
        {
          ...encounter.combatants[0],
          hp: { current: 7, temp: 0, max: 7 },
          conditions: ["prone"],
        },
      ];
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.combatants": affected,
          "encounter.events": [
            appliedEvent,
            {
              id: "1",
              round: 1,
              kind: "hp-heal",
              targetId: "monster-1",
              amount: 1,
              current: 7,
              max: 7,
            },
            {
              id: "2",
              round: 1,
              kind: "condition-gain",
              targetId: "monster-1",
              conditionId: "prone",
            },
          ],
        })
      );
    });

    it("a member MAY append a PC effect delivery but cannot remove one", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      const effect = {
        id: "1:0",
        targetId: "pc-member",
        kind: "healing",
        amount: 5,
      };
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.memberEffects": [effect],
        })
      );
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.memberEffects": [],
        })
      );
    });

    it("a member MAY append apply/revoke operations without rewriting prior history", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [persistentApply],
        })
      );
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            persistentApply,
            {
              id: "revoke:heroism:1",
              kind: "revoke",
              effectId: "heroism:1",
              actorId: "pc-member",
              targetId: "monster-1",
            },
          ],
        })
      );
    });

    it("accepts bounded effect bindings/applied deltas and rejects an amplified HP delta", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      const aid = {
        ...persistentApply,
        effect: {
          ...persistentApply.effect,
          id: "aid:1",
          source: { kind: "spell", id: "aid", actionId: "cast-aid", castLevel: 4 },
          payload: {
            kind: "grant-group",
            activeKey: "spell-aid",
            phase: "active",
          },
          bindings: { spellcastingModifier: 4 },
          applied: { currentHpDelta: 15 },
        },
      };
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [aid],
        })
      );

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
          "encounter.effectOps": [],
        });
      });
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            {
              ...aid,
              effect: { ...aid.effect, applied: { currentHpDelta: 10001 } },
            },
          ],
        })
      );
    });

    it("accepts a caster-owned marked-target payload", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            {
              ...persistentApply,
              effect: {
                ...persistentApply.effect,
                payload: {
                  kind: "target-mark",
                  activeKey: "spell-hunters-mark",
                  scope: "marked",
                },
              },
            },
          ],
        })
      );
    });

    it("accepts a caster-owned condition occurrence", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            {
              ...persistentApply,
              effect: {
                ...persistentApply.effect,
                payload: { kind: "condition", conditionId: "paralyzed" },
              },
            },
          ],
        })
      );
    });

    it("rejects a condition occurrence without a stable condition id", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            {
              ...persistentApply,
              effect: {
                ...persistentApply.effect,
                payload: { kind: "condition", conditionId: "" },
              },
            },
          ],
        })
      );
    });

    it("accepts a feature-owned vowed-target payload", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            {
              ...persistentApply,
              effect: {
                ...persistentApply.effect,
                source: {
                  kind: "feature",
                  id: "paladin-vengeance-vow-of-enmity",
                  actionId: "paladin-vengeance-vow-of-enmity-free",
                },
                payload: {
                  kind: "target-mark",
                  activeKey: "paladin-vengeance-vow-of-enmity",
                  scope: "vowed",
                },
              },
            },
          ],
        })
      );
    });

    it("a member CANNOT append a malformed or actor-spoofed application", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            {
              ...persistentApply,
              effect: { id: "missing-required-nested-fields" },
            },
          ],
        })
      );
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            {
              ...persistentApply,
              effect: {
                ...persistentApply.effect,
                actor: {
                  ...persistentApply.effect.actor,
                  memberUid: "peer",
                  combatantId: "pc-peer",
                },
              },
            },
          ],
        })
      );
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            {
              ...persistentApply,
              effect: {
                ...persistentApply.effect,
                actor: { kind: "monster", combatantId: "monster-1" },
              },
            },
          ],
        })
      );
    });

    it("rejects non-canonical fields on a monster combatant reference", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      const withExtraIdentity = {
        ...persistentApply,
        effect: {
          ...persistentApply.effect,
          target: {
            kind: "monster",
            combatantId: "monster-1",
            unexpectedIdentityPart: 1,
          },
        },
      };
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [withExtraIdentity],
        })
      );
    });

    it("a member may append a bounded lifecycle batch but not malformed provenance", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
          "encounter.effectOps": [persistentApply],
        });
      });
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            persistentApply,
            {
              id: "revoke:heroism:1",
              kind: "revoke",
              effectId: "heroism:1",
              actorId: "",
              targetId: "monster-1",
            },
          ],
        })
      );
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            persistentApply,
            {
              id: "revoke:heroism:1",
              kind: "revoke",
              effectId: "heroism:1",
              actorId: "pc-member",
              targetId: "monster-1",
            },
            {
              ...persistentApply,
              id: "apply:heroism:aftereffect",
              effect: {
                ...persistentApply.effect,
                id: "heroism:aftereffect",
                payload: { ...persistentApply.effect.payload, phase: "aftereffect" },
              },
            },
          ],
        })
      );
    });

    it("a member may atomically consume several one-shot effects", async () => {
      const applied = Array.from({ length: 8 }, (_, index) => ({
        ...persistentApply,
        id: `apply:ward:${index}`,
        effect: { ...persistentApply.effect, id: `ward:${index}` },
      }));
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
          "encounter.effectOps": applied,
        });
      });
      const revokes = applied.map((operation, index) => ({
        id: `revoke:ward:${index}`,
        kind: "revoke",
        effectId: operation.effect.id,
        actorId: "pc-member",
        targetId: "monster-1",
      }));
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            ...applied,
            ...revokes.slice(0, -1),
            { ...revokes.at(-1), actorId: 42 },
          ],
        })
      );
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [...applied, ...revokes],
        })
      );
    });

    it("a member CANNOT reorder prior operations while appending a new one", async () => {
      const first = persistentApply;
      const second = {
        ...persistentApply,
        id: "apply:heroism:2",
        effect: { ...persistentApply.effect, id: "heroism:2" },
      };
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
          "encounter.effectOps": [first, second],
        });
      });
      const db = testEnv.authenticatedContext("member").firestore();
      const third = {
        ...persistentApply,
        id: "apply:heroism:3",
        effect: { ...persistentApply.effect, id: "heroism:3" },
      };
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [second, first, third],
        })
      );
    });

    it("a member CANNOT replace or remove prior persistent-effect operations", async () => {
      const applied = {
        id: "apply:heroism:1",
        kind: "apply",
        effect: { id: "heroism:1" },
      };
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
          "encounter.effectOps": [applied],
        });
      });
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            { id: "apply:bless:1", kind: "apply", effect: { id: "bless:1" } },
          ],
        })
      );
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [],
        })
      );
    });

    it("a member CANNOT grow the persistent-effect ledger beyond its document cap", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      const oversized = Array.from({ length: 513 }, (_, index) => ({
        id: `apply:${index}`,
        kind: "apply",
        effect: { id: String(index) },
      }));
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": oversized,
        })
      );
    });

    it("a member CANNOT add / remove a combatant through the damage path", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.combatants": [
            ...damaged,
            {
              kind: "monster",
              id: "monster-2",
              name: "Worg",
              ac: 13,
              initiative: 8,
              conditions: [],
              hp: { current: 26, temp: 0, max: 26 },
            },
          ],
          "encounter.events": [appliedEvent],
        })
      );
    });

    it("a member CANNOT delete the DM's chronicle lines (events only grow)", async () => {
      // Seed an existing event first, then attempt a write that shrinks the array.
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
          "encounter.events": [appliedEvent, { ...appliedEvent, id: "1" }],
        });
      });
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.combatants": damaged,
          "encounter.events": [appliedEvent], // dropped id "1"
        })
      );
    });

    it("a member CANNOT smuggle a turn / status change alongside the damage", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.combatants": damaged,
          "encounter.events": [appliedEvent],
          "encounter.status": "ended",
        })
      );
    });

    it("a non-member is denied a damage write", async () => {
      const db = testEnv.authenticatedContext("outsider").firestore();
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.combatants": damaged,
          "encounter.events": [appliedEvent],
        })
      );
    });

    it("the DM may still write the applied damage (unconstrained)", async () => {
      const dm = testEnv.authenticatedContext("dm").firestore();
      await assertSucceeds(
        updateDoc(doc(dm, "campaigns", "camp1"), {
          "encounter.combatants": damaged,
          "encounter.events": [appliedEvent],
        })
      );
    });
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

describe("firestore.rules — character reads: owner + admin + LIVE campaign membership", () => {
  // Cross-user access is DERIVED LIVE: the char doc carries only the
  // `attachedCampaignId` pointer (written atomically with the roster by the attach
  // transaction); the grant is "requester + target owner are CURRENT members of
  // THAT campaign and the target's roster row names this exact character", read off
  // the campaign doc at request time. NO stored reader list (the old
  // client-recomputed dmReaders/campaignReaders ACLs are deleted), so there is
  // nothing to go stale — the convergence failures behind the "DM access out of
  // date" outages are structurally impossible.
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
      await setDoc(doc(db, "users", "member", "characters", "char-versioned"), {
        status: "active",
        playStateVersion: 1,
        build: { name: "Versioned" },
        state: {},
        cache: {},
        revision: 3,
      });
    });
  });

  it("the owner may read + write their own character", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      getDoc(doc(member, "users", "member", "characters", "char-member"))
    );
    await assertSucceeds(
      updateDoc(doc(member, "users", "member", "characters", "char-member"), {
        status: "retired",
      })
    );
  });

  it("an owner may create unmarked, but a parent-only v1 marker fails closed", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    const character = { build: { name: "New" }, state: {}, cache: {}, revision: 0 };
    await assertSucceeds(
      setDoc(doc(owner, "users", "member", "characters", "new-unmarked"), character)
    );
    await assertFails(
      setDoc(doc(owner, "users", "member", "characters", "new-v1"), {
        ...character,
        playStateVersion: 1,
      })
    );
    await assertFails(
      setDoc(doc(owner, "users", "member", "characters", "new-v2"), {
        ...character,
        playStateVersion: 2,
      })
    );
    await assertFails(
      setDoc(doc(owner, "users", "member", "characters", "new-null"), {
        ...character,
        playStateVersion: null,
      })
    );
  });

  it("an owner may atomically create a v1 parent with its valid combat owner", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    const parent = doc(owner, "users", "member", "characters", "new-v1-atomic");
    const combat = doc(parent, "combat", "state");
    const batch = writeBatch(owner);
    batch.set(parent, {
      playStateVersion: 1,
      build: { name: "Atomic" },
      state: {},
      cache: {},
      revision: 0,
    });
    batch.set(combat, {
      actionRevision: 0,
      hp: { current: 10, temp: 0 },
      conditions: [],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      playState: { version: 1, state: {} },
      updatedAt: Timestamp.now(),
    });
    await assertSucceeds(batch.commit());
  });

  it("an owner cannot publish v1 by updating an unmarked parent", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      updateDoc(doc(owner, "users", "member", "characters", "char-member"), {
        playStateVersion: 1,
      })
    );
  });

  it("an owner may perform the legacy parent + combat-owner cutover atomically", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          "users",
          "member",
          "characters",
          "char-member",
          "combat",
          "state"
        ),
        {
          actionRevision: 0,
          hp: { current: 9, temp: 0 },
          conditions: [],
          initiativeRoll: null,
          deathSaves: { successes: 0, failures: 0 },
        }
      );
    });
    const owner = testEnv.authenticatedContext("member").firestore();
    const parent = doc(owner, "users", "member", "characters", "char-member");
    const combat = doc(parent, "combat", "state");
    const batch = writeBatch(owner);
    batch.update(combat, { playState: { version: 1, state: { exhaustion: 2 } } });
    batch.update(parent, { playStateVersion: 1 });
    await assertSucceeds(batch.commit());
  });

  it("rejects a legacy-to-v1 cutover that leaves stale session state on the parent", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          "users",
          "member",
          "characters",
          "char-member",
          "combat",
          "state"
        ),
        {
          hp: { current: 9, temp: 0 },
          conditions: [],
          initiativeRoll: null,
          deathSaves: { successes: 0, failures: 0 },
        }
      );
    });
    const owner = testEnv.authenticatedContext("member").firestore();
    const parent = doc(owner, "users", "member", "characters", "char-member");
    const combat = doc(parent, "combat", "state");
    const batch = writeBatch(owner);
    batch.update(combat, { playState: { version: 1, state: {} } });
    batch.update(parent, {
      playStateVersion: 1,
      state: { usedSlots: { "1": 1 } },
    });
    await assertFails(batch.commit());
  });

  it("an owner cannot remove or change an existing v1 marker", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    const ref = doc(owner, "users", "member", "characters", "char-versioned");
    await assertFails(updateDoc(ref, { playStateVersion: deleteField() }));
    await assertFails(updateDoc(ref, { playStateVersion: 2 }));
  });

  it("owner updates succeed when marker presence and value are preserved exactly", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(owner, "users", "member", "characters", "char-private"), {
        status: "retired",
      })
    );
    await assertSucceeds(
      updateDoc(doc(owner, "users", "member", "characters", "char-versioned"), {
        status: "retired",
        playStateVersion: 1,
      })
    );
  });

  it("allows normal owner updates for a v1 parent whose state stays empty", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(owner, "users", "member", "characters", "char-versioned"), {
        status: "retired",
        state: {},
      })
    );
  });

  it("a build write must carry revision + 1; a stale revision is denied; metadata leaves it alone", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    const ref = doc(owner, "users", "member", "characters", "char-member");
    await assertFails(updateDoc(ref, { build: { name: "Mara II" }, revision: 3 }));
    await assertFails(updateDoc(ref, { build: { name: "Mara II" }, revision: 5 }));
    await assertSucceeds(updateDoc(ref, { build: { name: "Mara II" }, revision: 4 }));
    await assertFails(updateDoc(ref, { status: "retired", revision: 5 }));
    await assertSucceeds(updateDoc(ref, { status: "retired" }));
  });

  it("a character is born at revision 0", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      setDoc(doc(owner, "users", "member", "characters", "new-1"), {
        status: "active",
        build: {},
        state: {},
        cache: {},
        revision: 1,
      })
    );
    await assertSucceeds(
      setDoc(doc(owner, "users", "member", "characters", "new-2"), {
        status: "active",
        build: {},
        state: {},
        cache: {},
        revision: 0,
      })
    );
  });

  it("a CO-MEMBER of the attached campaign MAY read the teammate's REAL character doc (open sheets)", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertSucceeds(
      getDoc(doc(peer, "users", "member", "characters", "char-member"))
    );
  });

  it("the DM (a member like any other) MAY read the member's character", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(getDoc(doc(dm, "users", "member", "characters", "char-member")));
  });

  it("a user OUTSIDE the campaign may NOT read the character (no ambient cross-user read)", async () => {
    const stranger = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(
      getDoc(doc(stranger, "users", "member", "characters", "char-member"))
    );
  });

  it("nobody but owner/admin reads an UNATTACHED char (no campaign pointer)", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertFails(getDoc(doc(peer, "users", "member", "characters", "char-private")));
    await assertFails(getDoc(doc(dm, "users", "member", "characters", "char-private")));
  });

  it("a DANGLING pointer (campaign deleted) fails CLOSED for peers; the owner keeps access", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), "campaigns", "campA"));
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertFails(getDoc(doc(peer, "users", "member", "characters", "char-member")));
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      getDoc(doc(owner, "users", "member", "characters", "char-member"))
    );
  });

  it("a member REMOVED from the campaign loses the peer read IMMEDIATELY (live convergence — no ACL recompute)", async () => {
    // The cured disease: with the stored-ACL model this revocation needed the
    // OWNER's client to recompute a reader list; now the very next request reads
    // the live roster and denies.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "campA"), {
        members: arrayRemove("peer"),
        "memberDetails.peer": deleteField(),
      });
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertFails(getDoc(doc(peer, "users", "member", "characters", "char-member")));
  });

  it("the campaign DM may atomically remove a member and clear only that target's attachment claim", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    const batch = writeBatch(dm);
    batch.update(doc(dm, "campaigns", "campA"), {
      members: arrayRemove("member"),
      "memberDetails.member": deleteField(),
    });
    batch.update(doc(dm, "users", "member", "characters", "char-member"), {
      attachedCampaignId: deleteField(),
    });
    await assertSucceeds(batch.commit());
  });

  it("campaign detach authority denies a standalone DM write and every non-DM write", async () => {
    const parentPath = ["users", "member", "characters", "char-member"] as const;
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertFails(
      updateDoc(doc(dm, ...parentPath), { attachedCampaignId: deleteField() })
    );

    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertFails(
      updateDoc(doc(peer, ...parentPath), { attachedCampaignId: deleteField() })
    );
    await assertFails(updateDoc(doc(peer, ...parentPath), { status: "retired" }));

    const peerBatch = writeBatch(peer);
    peerBatch.update(doc(peer, "campaigns", "campA"), {
      members: arrayRemove("member"),
      "memberDetails.member": deleteField(),
    });
    peerBatch.update(doc(peer, ...parentPath), {
      attachedCampaignId: deleteField(),
    });
    await assertFails(peerBatch.commit());
  });

  it("the DM detach exception rejects a wrong character row and any bundled parent edit", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "member", "characters", "other"), {
        attachedCampaignId: "campA",
        build: { name: "Other" },
        state: {},
        cache: {},
      });
    });

    for (const [characterId, parentPatch] of [
      ["other", { attachedCampaignId: deleteField() }],
      ["char-member", { attachedCampaignId: deleteField(), status: "retired" }],
    ] as const) {
      const batch = writeBatch(dm);
      batch.update(doc(dm, "campaigns", "campA"), {
        members: arrayRemove("member"),
        "memberDetails.member": deleteField(),
      });
      batch.update(doc(dm, "users", "member", "characters", characterId), parentPatch);
      await assertFails(batch.commit());
    }
  });

  it("the campaign DM may delete a campaign while atomically clearing every referenced claim", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, "campaigns", "campA"), {
        "memberDetails.peer.characterId": "char-peer",
      });
      await setDoc(doc(db, "users", "peer", "characters", "char-peer"), {
        attachedCampaignId: "campA",
        build: { name: "Peer" },
        state: {},
        cache: {},
      });
    });
    const dm = testEnv.authenticatedContext("dm").firestore();
    const batch = writeBatch(dm);
    batch.update(doc(dm, "users", "member", "characters", "char-member"), {
      attachedCampaignId: deleteField(),
    });
    batch.update(doc(dm, "users", "peer", "characters", "char-peer"), {
      attachedCampaignId: deleteField(),
    });
    batch.delete(doc(dm, "campaigns", "campA"));
    await assertSucceeds(batch.commit());
  });

  it("campaign deletion cannot detach a wrong character or be driven by a non-DM", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "member", "characters", "other"), {
        attachedCampaignId: "campA",
        build: { name: "Other" },
        state: {},
        cache: {},
      });
    });

    const dm = testEnv.authenticatedContext("dm").firestore();
    const wrongBatch = writeBatch(dm);
    wrongBatch.update(doc(dm, "users", "member", "characters", "other"), {
      attachedCampaignId: deleteField(),
    });
    wrongBatch.delete(doc(dm, "campaigns", "campA"));
    await assertFails(wrongBatch.commit());

    const peer = testEnv.authenticatedContext("peer").firestore();
    const peerBatch = writeBatch(peer);
    peerBatch.update(doc(peer, "users", "member", "characters", "char-member"), {
      attachedCampaignId: deleteField(),
    });
    peerBatch.delete(doc(peer, "campaigns", "campA"));
    await assertFails(peerBatch.commit());
  });

  it("a co-member may READ but may NOT write the peer's character (read-only grant)", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertFails(
      updateDoc(doc(peer, "users", "member", "characters", "char-member"), {
        status: "dead",
      })
    );
  });

  it("the DM may READ but may NOT write the member's character either (owner-only write)", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertFails(
      updateDoc(doc(dm, "users", "member", "characters", "char-member"), {
        status: "dead",
      })
    );
  });

  it("a BLOCKED co-member is still denied the read (isNotBlocked gate)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "campaigns", "campA"),
        campaignDoc(["dm", "member", "blocked"])
      );
    });
    const blocked = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(
      getDoc(doc(blocked, "users", "member", "characters", "char-member"))
    );
  });

  it("the admin may read any character (stats override)", async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      getDoc(doc(admin, "users", "member", "characters", "char-member"))
    );
    await assertSucceeds(
      getDoc(doc(admin, "users", "member", "characters", "char-private"))
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
  const LEGACY_SHARED_PARENT = [
    "users",
    "member",
    "characters",
    "char-legacy-shared",
  ] as const;
  const LEGACY_PUBLIC_SHEET = [...LEGACY_SHARED_PARENT, "public", "sheet"] as const;
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
      playStateVersion: 1,
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
      const legacyShared = parentDoc({
        state: { usedSlots: { "1": 1 } },
        attachedCampaignId: null,
      });
      delete (legacyShared as Record<string, unknown>).playStateVersion;
      await setDoc(doc(db, ...LEGACY_SHARED_PARENT), legacyShared);
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

  it("an existing shared legacy parent may autosave while its absent public projection stays absent", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(owner, ...LEGACY_SHARED_PARENT), {
        state: { usedSlots: { "1": 2 } },
        // A `state` change is a build write: it must advance the CAS generation.
        revision: 4,
        updatedAt: NEXT_UPDATED_AT,
      })
    );

    const parent = await getDoc(doc(owner, ...LEGACY_SHARED_PARENT));
    expect(parent.data()?.state).toEqual({ usedSlots: { "1": 2 } });
    expect(parent.data()).not.toHaveProperty("playStateVersion");
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), ...LEGACY_PUBLIC_SHEET))
    );
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
      "playStateVersion",
      "attachedCampaignId",
      "inviteCode",
      "internalMetadata",
    ]) {
      expect(snapshot.data()).not.toHaveProperty(privateKey);
    }
  });

  it("anonymous access never reaches the raw parent, private children, wrong id, or a LIST", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
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
      publicSheet({ playStateVersion: 1 }),
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
  });

  it("anonymous reads require the one current private ownership generation", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    const withoutMarker = parentDoc();
    delete (withoutMarker as Record<string, unknown>).playStateVersion;
    for (const parent of [
      withoutMarker,
      parentDoc({ playStateVersion: 2 }),
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

  it("normalizes an absent private crop when the character has no portrait", async () => {
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
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, ...PUBLIC_SHEET)));
  });

  it("anonymous callers can never write either side of the projection", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, ...PUBLIC_SHEET), publicSheet()));
    await assertFails(deleteDoc(doc(anon, ...PUBLIC_SHEET)));
    await assertFails(updateDoc(doc(anon, ...SHARED_PARENT), { shared: false }));
  });

  it("owner writes cannot smuggle invite, attachment, portrait URL, state, marker, or metadata keys", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    for (const [key, value] of [
      ["attachedCampaignId", "campPublic"],
      ["inviteCode", "secret"],
      ["portraitUrl", "https://storage.invalid/token"],
      ["state", { notes: "private" }],
      ["playStateVersion", 1],
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
  });

  it("owner projection writes fail for every parent mismatch, even inside a batch", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
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

    const batch = writeBatch(owner);
    batch.update(doc(owner, ...PRIVATE_PARENT), {
      shared: true,
      updatedAt: NEXT_UPDATED_AT,
    });
    batch.set(
      doc(owner, ...PRIVATE_SHEET),
      publicSheet({
        hasPortrait: false,
        portraitCrop: null,
        sourceUpdatedAt: NEXT_UPDATED_AT,
      })
    );
    await assertSucceeds(batch.commit());

    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, ...PRIVATE_SHEET)));
    await assertFails(getDoc(doc(anon, ...PRIVATE_PARENT)));
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

  it("revoking requires one atomic parent update + projection delete", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertFails(updateDoc(doc(owner, ...SHARED_PARENT), { shared: false }));
    await assertFails(deleteDoc(doc(owner, ...PUBLIC_SHEET)));

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
  });

  it("deleting a shared character requires deleting its projection atomically", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertFails(deleteDoc(doc(owner, ...SHARED_PARENT)));

    const batch = writeBatch(owner);
    batch.delete(doc(owner, ...PUBLIC_SHEET));
    batch.delete(doc(owner, ...SHARED_PARENT));
    await assertSucceeds(batch.commit());
  });

  it("a DM's attachment-only removal keeps an unchanged public projection valid", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    const batch = writeBatch(dm);
    batch.update(doc(dm, "campaigns", "campPublic"), {
      members: arrayRemove("member"),
      "memberDetails.member": deleteField(),
    });
    batch.update(doc(dm, ...SHARED_PARENT), {
      attachedCampaignId: deleteField(),
    });
    await assertSucceeds(batch.commit());

    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, ...PUBLIC_SHEET)));
    const owner = testEnv.authenticatedContext("member").firestore();
    const parent = await assertSucceeds(getDoc(doc(owner, ...SHARED_PARENT)));
    expect(parent.data()).not.toHaveProperty("attachedCampaignId");
    expect(parent.data()?.updatedAt).toEqual(SOURCE_UPDATED_AT);
  });
});

describe("firestore.rules — combat/state peer effect fence", () => {
  // BLIND SPOT: rules can constrain changed top-level roots and the monotonic CAS
  // revision, but cannot prove the table's arithmetic. The campaign transaction's
  // fresh-read reducers own HP/DC math; campaign-io unit tests pin that layer.
  const COMBAT_PATH = [
    "users",
    "member",
    "characters",
    "char-cbt",
    "combat",
    "state",
  ] as const;
  const PARENT_PATH = ["users", "member", "characters", "char-cbt"] as const;
  const COMBAT_UPDATED_AT = Timestamp.fromMillis(1_720_000_000_000);

  function combatState(overrides: Record<string, unknown> = {}) {
    return {
      actionRevision: 7,
      actionHead: "owner-command",
      actionLifecycles: {
        "owner-command": actionLifecycle({
          payloadIdentity: "payload:owner-command",
        }),
      },
      hp: { current: 10, temp: 0 },
      conditions: [] as string[],
      bardicInspirationDie: "",
      heroicInspiration: false,
      initiativeRoll: 15,
      deathSaves: { successes: 0, failures: 0 },
      round: 1,
      recentActions: [{ id: "attack-1", targetIds: ["monster-1"], outcome: "hit" }],
      playState: { version: 1, state: { exhaustion: 2 } },
      updatedAt: COMBAT_UPDATED_AT,
      ...overrides,
    };
  }

  function legacyPeerCreate(overrides: Record<string, unknown> = {}) {
    return {
      hp: { current: 7, temp: 0 },
      conditions: ["prone"],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      updatedAt: Timestamp.now(),
      ...overrides,
    };
  }

  function actionLifecycle(overrides: Record<string, unknown> = {}) {
    return {
      payloadIdentity: "payload:attack-2",
      actor: {
        kind: "pc",
        surface: "local",
        uid: "member",
        characterId: "char-cbt",
        combatantId: "pc-member",
      },
      state: "committed",
      generation: 1,
      predecessor: null,
      ...overrides,
    };
  }

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(
        doc(db, "campaigns", "campA"),
        campaignDoc(["dm", "member", "peer"], "dm", {
          member: "char-cbt",
        })
      );
      await setDoc(doc(db, "users", "member", "characters", "char-cbt"), {
        status: "active",
        attachedCampaignId: "campA",
        playStateVersion: 1,
        build: { name: "Mara" },
        state: {},
        cache: {},
      });
      await setDoc(doc(db, ...COMBAT_PATH), combatState());
    });
  });

  it("the owner may read + write their own combat state", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(getDoc(doc(member, ...COMBAT_PATH)));
    await assertSucceeds(
      setDoc(
        doc(member, ...COMBAT_PATH),
        combatState({ hp: { current: 5, temp: 2 }, ownerFutureField: 42 })
      )
    );
  });

  it("the seeded v1 combat fixture is exact and parser-canonical by construction", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    const snapshot = await getDoc(doc(owner, ...COMBAT_PATH));
    expect(snapshot.data()).toEqual(combatState());
  });

  it("the owner overwrite may shed obsolete action metadata like the production writer", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    const ref = doc(owner, ...COMBAT_PATH);
    await assertSucceeds(
      setDoc(ref, {
        hp: { current: 9, temp: 0 },
        conditions: [],
        bardicInspirationDie: "",
        heroicInspiration: false,
        initiativeRoll: 15,
        deathSaves: { successes: 0, failures: 0 },
        round: 1,
        recentActions: [],
        playState: { version: 1, state: { usedSlots: { "1": 1 } } },
        updatedAt: Timestamp.now(),
      })
    );
    const stored = await getDoc(ref);
    expect(stored.data()).not.toHaveProperty("actionRevision");
    expect(stored.data()).not.toHaveProperty("actionHead");
    expect(stored.data()).not.toHaveProperty("actionLifecycles");
  });

  it("an attached peer may apply the runtime effect patch without obsolete revision metadata", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertSucceeds(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
        updatedAt: Timestamp.now(),
      })
    );
  });

  it("an attached peer may persist the concentration queue and encounter receipt emitted by the runtime writer", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "campA"), {
        encounter: { epoch: 4 },
      });
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertSucceeds(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        pendingConcentrationSaves: [
          { id: "hit-1", spell: "bless", damage: 12, difficultyClass: 10 },
        ],
        appliedEncounterEffects: { epoch: 4, ids: ["effect-1"] },
        updatedAt: Timestamp.now(),
      })
    );
  });

  it("the peer effect fence cannot change action metadata or any owner root", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    for (const smuggled of [
      { actionRevision: 8 },
      { actionHead: "attack-2" },
      { "actionLifecycles.attack-2": actionLifecycle() },
      { initiativeRoll: 20 },
      { round: 2 },
    ]) {
      await assertFails(
        updateDoc(doc(peer, ...COMBAT_PATH), {
          hp: { current: 9, temp: 0 },
          ...smuggled,
        })
      );
    }
  });

  it("an attached peer may change every legitimate effect root", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertSucceeds(getDoc(doc(peer, ...COMBAT_PATH)));
    const mutations: ReadonlyArray<Record<string, unknown>> = [
      { hp: { current: 8, temp: 1 } },
      { conditions: ["prone"] },
      { bardicInspirationDie: "d8" },
      { heroicInspiration: true },
      { deathSaves: { successes: 1, failures: 0 } },
    ];
    for (const mutation of mutations) {
      await assertSucceeds(
        updateDoc(doc(peer, ...COMBAT_PATH), {
          ...mutation,
          updatedAt: Timestamp.now(),
        })
      );
    }
  });

  it("a peer cannot mutate obsolete revision metadata or write a timestamp without an effect", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
        actionRevision: 8,
      })
    );
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
        actionRevision: 9,
      })
    );
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        updatedAt: Timestamp.now(),
      })
    );
  });

  it("an unchanged legacy/custom string condition does not block a peer HP delivery", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), ...COMBAT_PATH), {
        conditions: ["custom:bleeding"],
      });
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertSucceeds(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
      })
    );
  });

  it("a peer may add/remove only core conditions around a preserved custom condition", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), ...COMBAT_PATH), {
        conditions: ["custom:bleeding"],
      });
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertSucceeds(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        conditions: ["custom:bleeding", "prone"],
      })
    );
    await assertSucceeds(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        conditions: ["custom:bleeding"],
      })
    );
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        conditions: ["custom:bleeding", "custom:burning"],
      })
    );
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        conditions: [],
      })
    );
  });

  it("a peer cannot remove or corrupt the parseable combat core", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    for (const malformed of [
      { hp: deleteField() },
      { hp: { current: "all", temp: 0 } },
      { conditions: {} },
      { deathSaves: deleteField() },
    ]) {
      await assertFails(
        updateDoc(doc(peer, ...COMBAT_PATH), {
          ...malformed,
        })
      );
    }
  });

  it("a peer payload must keep every rules-expressible effect value canonical", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    const malformed: ReadonlyArray<Record<string, unknown>> = [
      { hp: { current: -1, temp: 0 } },
      { hp: { current: Number.NaN, temp: 0 } },
      { conditions: ["prone", 7] },
      { conditions: ["prone", "prone"] },
      { conditions: ["not-a-condition"] },
      { updatedAt: "eventually" },
    ];
    for (const mutation of malformed) {
      await assertFails(
        updateDoc(doc(peer, ...COMBAT_PATH), {
          ...mutation,
        })
      );
    }
  });

  it("a peer cannot mutate or remove owner-private roots, even beside a valid HP write", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    const forbidden: ReadonlyArray<Record<string, unknown>> = [
      { playState: { version: 1, state: { exhaustion: 6 } } },
      { playState: deleteField() },
      { actionRevision: 8 },
      { actionHead: "peer-command" },
      { actionLifecycles: {} },
      { round: 99 },
      { recentActions: [] },
      { turnEconomy: { key: "stolen-turn" } },
      { initiativeRoll: 20 },
      { effectOps: [] },
      { activeEffects: [] },
      { someFutureOwnerField: true },
    ];
    for (const smuggled of forbidden) {
      await assertFails(
        updateDoc(doc(peer, ...COMBAT_PATH), {
          hp: { current: 9, temp: 0 },
          ...smuggled,
        })
      );
    }

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), ...COMBAT_PATH), {
        playState: deleteField(),
      });
    });
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
        playState: { version: 1, state: { exhaustion: 0 } },
      })
    );
  });

  it("a peer queue must be a list and an encounter receipt must match the live epoch", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "campA"), {
        encounter: { epoch: 4 },
      });
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    for (const malformed of [
      { pendingConcentrationSaves: {} },
      { appliedEncounterEffects: { epoch: 3, ids: ["effect-1"] } },
      { appliedEncounterEffects: { epoch: 4, ids: ["effect-1", "effect-1"] } },
      { appliedEncounterEffects: { epoch: 4, ids: [], extra: true } },
    ]) {
      await assertFails(
        updateDoc(doc(peer, ...COMBAT_PATH), {
          hp: { current: 9, temp: 0 },
          ...malformed,
        })
      );
    }
  });

  it("a marked-v1 missing combat document fails closed for every attached peer", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), ...COMBAT_PATH));
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertFails(setDoc(doc(peer, ...COMBAT_PATH), legacyPeerCreate()));
    await assertFails(setDoc(doc(dm, ...COMBAT_PATH), legacyPeerCreate()));
  });

  it("a legacy peer create fails closed for every present non-v1 marker too", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    for (const marker of [2, null, "1"]) {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await updateDoc(doc(db, ...PARENT_PATH), { playStateVersion: marker });
        await deleteDoc(doc(db, ...COMBAT_PATH));
      });
      await assertFails(setDoc(doc(peer, ...COMBAT_PATH), legacyPeerCreate()));
    }
  });

  it("an unmarked legacy parent permits only a parseable private-free first peer write", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, "users", "member", "characters", "char-cbt"), {
        playStateVersion: deleteField(),
      });
      await updateDoc(doc(db, "campaigns", "campA"), {
        encounter: { epoch: 1 },
      });
      await deleteDoc(doc(db, ...COMBAT_PATH));
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertFails(setDoc(doc(peer, ...COMBAT_PATH), legacyPeerCreate({ round: 3 })));
    await assertFails(
      setDoc(
        doc(peer, ...COMBAT_PATH),
        legacyPeerCreate({ playState: { version: 1, state: {} } })
      )
    );
    await assertSucceeds(
      setDoc(
        doc(peer, ...COMBAT_PATH),
        legacyPeerCreate({
          pendingConcentrationSaves: [],
          appliedEncounterEffects: { epoch: 1, ids: [] },
        })
      )
    );
  });

  it("owner/admin remain additive-field tolerant while preserving action metadata", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(owner, ...COMBAT_PATH), {
        playState: { version: 1, state: { exhaustion: 4 } },
        ownerFutureField: 42,
        actionRevision: 7,
      })
    );
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(admin, ...COMBAT_PATH), {
        playState: { version: 1, state: { exhaustion: 5 } },
        adminFutureField: true,
        actionRevision: 7,
      })
    );
  });

  it("a user outside the campaign and an anonymous caller are denied", async () => {
    const stranger = testEnv.authenticatedContext("outsider").firestore();
    const anonymous = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(stranger, ...COMBAT_PATH)));
    await assertFails(
      updateDoc(doc(stranger, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
      })
    );
    await assertFails(getDoc(doc(anonymous, ...COMBAT_PATH)));
    await assertFails(
      updateDoc(doc(anonymous, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
      })
    );
  });

  it("removing a table member revokes their combat-state access immediately", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, "campaigns", "campA"), {
        members: ["dm", "member"],
        "memberDetails.peer": deleteField(),
      });
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertFails(getDoc(doc(peer, ...COMBAT_PATH)));
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
      })
    );
  });

  it("removing the target owner revokes a remaining peer's parent + child read and child mutation", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // Deliberately leave the stale memberDetails row behind: either reciprocal
      // half must fail closed independently.
      await updateDoc(doc(ctx.firestore(), "campaigns", "campA"), {
        members: ["dm", "peer"],
      });
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertFails(getDoc(doc(peer, ...PARENT_PATH)));
    await assertFails(getDoc(doc(peer, ...COMBAT_PATH)));
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
      })
    );

    // Reciprocal peer fencing never weakens the direct owner path.
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(getDoc(doc(owner, ...PARENT_PATH)));
    await assertSucceeds(getDoc(doc(owner, ...COMBAT_PATH)));
  });

  it("swapping the target's memberDetails characterId revokes the old parent and child", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "campA"), {
        "memberDetails.member.characterId": "char-replacement",
      });
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertFails(getDoc(doc(peer, ...PARENT_PATH)));
    await assertFails(getDoc(doc(peer, ...COMBAT_PATH)));
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        conditions: ["prone"],
      })
    );
  });

  it("the DM is effect-fenced and still cannot write the parent character doc", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(getDoc(doc(dm, ...COMBAT_PATH)));
    await assertSucceeds(
      updateDoc(doc(dm, ...COMBAT_PATH), {
        conditions: ["prone"],
      })
    );
    await assertFails(
      updateDoc(doc(dm, ...COMBAT_PATH), {
        hp: { current: 8, temp: 0 },
        anotherFutureField: true,
      })
    );
    await assertFails(
      updateDoc(doc(dm, "users", "member", "characters", "char-cbt"), {
        status: "dead",
      })
    );
  });

  it("a blocked attached member is denied by isNotBlocked", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "campA"), {
        members: arrayUnion("blocked"),
        "memberDetails.blocked": {
          displayName: "blocked",
          characterId: null,
          role: "player",
        },
      });
    });
    const blocked = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(getDoc(doc(blocked, ...COMBAT_PATH)));
    await assertFails(
      updateDoc(doc(blocked, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
      })
    );
  });

  it("an UNATTACHED char's subdoc is owner/admin-only (no campaign pointer → no cross-user grant)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "users", "member", "characters", "char-cbt"), {
        attachedCampaignId: deleteField(),
      });
    });
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertFails(getDoc(doc(dm, ...COMBAT_PATH)));
    await assertFails(
      updateDoc(doc(dm, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
      })
    );
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(setDoc(doc(owner, ...COMBAT_PATH), combatState()));
  });
});

describe("firestore.rules — encounterInit: the four-direction initiative matrix (INIT-SSOT)", () => {
  // THE PERMANENT REGRESSION for the owner's "none of us can set initiative" bug:
  // PC initiative lives in the campaign's `encounterInit` table (`uid → raw d20
  // roll`), so BOTH writers edit the ONE doc they are already authorized on. The
  // owner-mandated matrix: the DM writes ANY row; a member writes their OWN row; a
  // member may NOT touch a peer's row; a non-member writes nothing.
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
        encounter: {
          combatants: [
            { kind: "pc", id: "pc-member", memberUid: "member", characterId: "char-1" },
          ],
          round: 1,
          currentCombatantId: null,
          epoch: 1720000000000,
          status: "active",
        },
        encounterInit: {},
      });
    });
  });

  it("the DM may set ANY member's initiative (rolling for a player — the owner's exact failing action)", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(
      updateDoc(doc(dm, "campaigns", "camp1"), { "encounterInit.member": 14 })
    );
    await assertSucceeds(
      updateDoc(doc(dm, "campaigns", "camp1"), { "encounterInit.dm": 9 })
    );
  });

  it("a member may set / re-roll / clear their OWN initiative", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(member, "campaigns", "camp1"), { "encounterInit.member": 17 })
    );
    await assertSucceeds(
      updateDoc(doc(member, "campaigns", "camp1"), { "encounterInit.member": 3 })
    );
    await assertSucceeds(
      updateDoc(doc(member, "campaigns", "camp1"), {
        "encounterInit.member": deleteField(),
      })
    );
  });

  it("a member may NOT set a PEER's initiative (own-row scope)", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      updateDoc(doc(member, "campaigns", "camp1"), { "encounterInit.dm": 20 })
    );
  });

  it("a member may NOT smuggle a peer's row alongside their own", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      updateDoc(doc(member, "campaigns", "camp1"), {
        "encounterInit.member": 12,
        "encounterInit.dm": 20,
      })
    );
  });

  it("a member may NOT clear a peer's roll by replacing the whole table", async () => {
    // Seed a peer roll, then attempt a whole-map overwrite that drops it.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
        "encounterInit.dm": 11,
      });
    });
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      updateDoc(doc(member, "campaigns", "camp1"), { encounterInit: { member: 12 } })
    );
  });

  it("a NON-MEMBER may not write any row", async () => {
    const outsider = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(
      updateDoc(doc(outsider, "campaigns", "camp1"), { "encounterInit.outsider": 15 })
    );
  });

  it("a BLOCKED member may not write their row (isNotBlocked gate)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
        members: arrayUnion("blocked"),
        "memberDetails.blocked": {
          displayName: "blocked",
          characterId: null,
          role: "player",
        },
      });
    });
    const blocked = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(
      updateDoc(doc(blocked, "campaigns", "camp1"), { "encounterInit.blocked": 15 })
    );
  });

  it("the admin may write any row (override)", async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(admin, "campaigns", "camp1"), { "encounterInit.member": 8 })
    );
  });

  it("a member's roll lands even on a PRE-FEATURE doc with NO encounterInit field", async () => {
    // get(..., {}) on both diff sides: an absent table reads as empty, so the first
    // roll on a doc written before this feature validates.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
        encounterInit: deleteField(),
      });
    });
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(member, "campaigns", "camp1"), { "encounterInit.member": 17 })
    );
  });

  it("the DM may START a fight with the atomic table reset (encounter + encounterInit: {})", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(
      updateDoc(doc(dm, "campaigns", "camp1"), {
        encounter: {
          combatants: [
            { kind: "pc", id: "pc-member", memberUid: "member", characterId: "char-1" },
          ],
          round: 1,
          currentCombatantId: null,
          epoch: 1720000000001,
          status: "active",
        },
        encounterInit: {},
      })
    );
  });

  it("a member may NOT reset the whole table when it holds a peer's roll (only the DM starts/ends fights)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
        "encounterInit.dm": 11,
      });
    });
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      updateDoc(doc(member, "campaigns", "camp1"), { encounterInit: {} })
    );
  });

  it("a member's OTHER shared-artifact writes still pass (the init guard diffs to the empty set)", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(member, "campaigns", "camp1"), {
        treasury: { pp: 0, gp: 7, ep: 0, sp: 0, cp: 0 },
      })
    );
  });

  it("a member's turn-advance still passes alongside the init guard", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
        "encounter.currentCombatantId": "pc-member",
        "encounter.order": ["pc-member"],
      });
    });
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(member, "campaigns", "camp1"), {
        "encounter.currentCombatantId": "pc-member",
        "encounter.round": 2,
      })
    );
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

  it("a member CAN read + list revealed notes", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(getDoc(doc(member, ...revealed("r1"))));
    await assertSucceeds(getDocs(collection(member, "campaigns", "camp1", "notes")));
  });

  it("a member CANNOT read a hidden note — even an UNSCOPED list of dmNotes is denied (list-safe)", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(getDoc(doc(member, ...hidden("h1"))));
    // The crux: path-based gating denies the whole-collection list, so there is no
    // unscoped-query hole that a content-flag rule would leave open.
    await assertFails(getDocs(collection(member, "campaigns", "camp1", "dmNotes")));
  });

  it("the DM and the admin CAN read + list hidden notes", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(getDoc(doc(dm, ...hidden("h1"))));
    await assertSucceeds(getDocs(collection(dm, "campaigns", "camp1", "dmNotes")));
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(admin, ...hidden("h1"))));
    await assertSucceeds(getDocs(collection(admin, "campaigns", "camp1", "dmNotes")));
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

  it("the admin may read AND write a hidden note (override)", async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(updateDoc(doc(admin, ...hidden("h1")), { pinned: true }));
    await assertSucceeds(deleteDoc(doc(admin, ...hidden("h1"))));
  });

  it("REGRESSION: the generic subcollection grant does NOT leak dmNotes to a member", async () => {
    // Firestore OR-combines matching rules; without `subcol != 'dmNotes'` on the
    // generic /campaigns/{campId}/{subcol}/{docId} rule, its broad member grant
    // would override the DM-only dmNotes gate and let a member read a hidden note.
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(getDoc(doc(member, ...hidden("h1"))));
    await assertFails(getDocs(collection(member, "campaigns", "camp1", "dmNotes")));
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

  it("a blocked user cannot create a report", async () => {
    const db = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(setDoc(doc(db, "bug_reports", "rb"), reportDoc("blocked")));
  });

  it("cannot spoof another user's reporterUid", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
    await assertFails(setDoc(doc(db, "bug_reports", "rs"), reportDoc("outsider")));
  });

  it("rejects a missing/empty title and a non-'new' status", async () => {
    const db = testEnv.authenticatedContext("member").firestore();
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
});
