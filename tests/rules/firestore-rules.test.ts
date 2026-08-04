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
 * · member-mutation guard (+ the controlled self-join) · character reads gated to
 * owner + admin + the `dmReaders` ACL (the DM "View Sheet" single read path:
 * read-only, blocked denied, peer denied, owner-only write).
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
} from "firebase/firestore";

const PROJECT_ID = "demo-d20folio";
// Admin is DATA-DRIVEN (owner-ratified — CLAUDE.md → Firebase essentials): a uid is admin iff its user doc carries
// role:"admin" — no hardcoded uid. So this is just an ordinary test uid that the
// seed below grants the role to.
const ADMIN_UID = "admin-user";
const EMPTY_TREASURY = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

let testEnv: RulesTestEnvironment;

/** A well-formed campaign document seeded for the access-matrix tests. */
function campaignDoc(members: string[], dmUid = "dm") {
  return {
    name: "Test Table",
    createdBy: dmUid,
    dmUid,
    members,
    memberDetails: Object.fromEntries(
      members.map((m) => [
        m,
        { displayName: m, characterId: null, role: m === dmUid ? "dm" : "player" },
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
        // The picker's additive bestiary reference + the seeded per-token XP —
        // pinned here so the existing DM/admin/member assertions exercise the
        // encounter blob WITH the new nested keys end-to-end (opaque DM-owned map:
        // zero rules diff by construction).
        srdId: "goblin-warrior",
        xp: 50,
        ac: 13,
        initiative: 12,
        conditions: [],
        maxHp: 7,
        tokens: [7, 7, 0],
      },
    ],
    round: 1,
    currentCombatantId: "monster-1",
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
              maxHp: 26,
              tokens: [26],
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
  // events}` for new actions (the `combatEffectFieldsOnlyChanged()` grant): monster HP
  // plus chronicle events. Legacy `memberEffects` remains append-only solely for
  // transition draining. The combatants COUNT is unchanged (no add/remove) while events
  // only GROW (no deleting the DM's lines). Any other encounter edit, a combatant add/remove,
  // or an events shrink stays DM-only; a non-member is denied outright.
  describe("a player applies reviewed combat effects (diff-scoped member grant)", () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), { encounter });
      });
    });

    // The lone monster after the player's declared 1 damage lands on its first live token.
    const damaged = [{ ...encounter.combatants[0], tokens: [6, 7, 0] }];
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

    it("a member MAY heal or add a condition through the same narrow effect path", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
          "encounter.combatants": damaged,
          "encounter.events": [appliedEvent],
        });
      });
      const db = testEnv.authenticatedContext("member").firestore();
      const affected = [
        { ...encounter.combatants[0], tokens: [7, 7, 0], conditions: ["prone"] },
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

    it("accepts a concrete monster token target and rejects invalid indexes", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      const withToken = {
        ...persistentApply,
        effect: {
          ...persistentApply.effect,
          target: {
            kind: "monster",
            combatantId: "monster-1",
            tokenIndex: 1,
          },
        },
      };
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [withToken],
        })
      );
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
          "encounter.effectOps": [],
        });
      });
      for (const tokenIndex of [-1, 1.5]) {
        await assertFails(
          updateDoc(doc(db, "campaigns", "camp1"), {
            "encounter.effectOps": [
              {
                ...withToken,
                effect: {
                  ...withToken.effect,
                  target: { ...withToken.effect.target, tokenIndex },
                },
              },
            ],
          })
        );
      }
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
              maxHp: 26,
              tokens: [26],
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
  // transaction); the grant is "requester is a CURRENT member of THAT campaign",
  // read off the campaign doc at request time. NO stored reader list (the old
  // client-recomputed dmReaders/campaignReaders ACLs are deleted), so there is
  // nothing to go stale — the convergence failures behind the "DM access out of
  // date" outages are structurally impossible.
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // campA: dm + member + peer. `char-member` is attached to it; `char-private`
      // is unattached (no pointer) → owner/admin only.
      await setDoc(doc(db, "campaigns", "campA"), campaignDoc(["dm", "member", "peer"]));
      await setDoc(doc(db, "users", "member", "characters", "char-member"), {
        status: "active",
        attachedCampaignId: "campA",
        build: { name: "Mara Quickfingers" },
        state: {},
        cache: {},
      });
      await setDoc(doc(db, "users", "member", "characters", "char-private"), {
        status: "active",
        build: { name: "Secret" },
        state: {},
        cache: {},
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

describe("firestore.rules — public share links: ANONYMOUS get of a shared character", () => {
  // The whole point of the feature is a viewer with NO ACCOUNT, so every test here
  // drives `testEnv.unauthenticatedContext()`. A second SIGNED-IN uid would prove a
  // different rule entirely (the outsider arm above already covers that) and would
  // sail past an `isAuth()` the anonymous grant must never require — the topology
  // mistake this block exists to avoid.
  //
  // BLIND SPOT: rules tests prove the grant, not the client. That an anonymous
  // BROWSER actually renders the sheet is pinned separately by the route render
  // test (tests/unit/shared-character-view.test.tsx), and portrait images are not
  // covered here at all — they are served by tokenized Storage download URLs, which
  // bypass storage.rules by construction.
  const SHARED = ["users", "member", "characters", "char-shared"] as const;
  const PRIVATE = ["users", "member", "characters", "char-unshared"] as const;

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, ...SHARED), {
        status: "active",
        shared: true,
        build: { name: "Mara Quickfingers" },
        state: {},
        cache: {},
      });
      // No `shared` field at all — the shape every already-live character has.
      await setDoc(doc(db, ...PRIVATE), {
        status: "active",
        build: { name: "Secret" },
        state: {},
        cache: {},
      });
      await setDoc(doc(db, ...SHARED, "snapshots", "snap1"), { build: {}, state: {} });
      await setDoc(doc(db, ...SHARED, "combat", "state"), {
        hp: { current: 10, temp: 0 },
        conditions: [] as string[],
      });
    });
  });

  it("an ANONYMOUS visitor may get a character flagged shared", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, ...SHARED)));
  });

  it("an ANONYMOUS visitor may NOT get an unshared character", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, ...PRIVATE)));
  });

  it("REVOKE: flipping the flag off denies the very next anonymous read", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, ...SHARED)));
    // The owner revokes through the ordinary owner write path — no second surface.
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(updateDoc(doc(owner, ...SHARED), { shared: false }));
    await assertFails(getDoc(doc(anon, ...SHARED)));
  });

  it("an ANONYMOUS visitor may NOT write a shared character (read-only, always)", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(anon, ...SHARED), { status: "dead" }));
    await assertFails(deleteDoc(doc(anon, ...SHARED)));
    // Nor may it share someone else's character by setting the flag itself.
    await assertFails(updateDoc(doc(anon, ...PRIVATE), { shared: true }));
  });

  it("an ANONYMOUS visitor may NOT read the shared character's SUBCOLLECTIONS", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, ...SHARED, "snapshots", "snap1")));
    await assertFails(getDoc(doc(anon, ...SHARED, "combat", "state")));
    await assertFails(getDocs(collection(anon, ...SHARED, "snapshots")));
  });

  it("the share grant is GET-only — it can never be turned into an enumeration LIST", async () => {
    // Rules are not filters: had the grant been `read`, this scoped query would
    // have handed an anonymous caller every character a known uid has ever shared.
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      getDocs(
        query(
          collection(anon, "users", "member", "characters"),
          where("shared", "==", true)
        )
      )
    );
    await assertFails(getDocs(collection(anon, "users", "member", "characters")));
  });
});

describe("firestore.rules — combat/state subdoc: LIVE-derived table-member access", () => {
  // The subdoc grants derive from the parent char's `attachedCampaignId` pointer +
  // the campaign doc, exactly like the char-doc read above: READ = any current
  // member; WRITE = any current table member (plus owner/admin). No stored
  // grant, no shape validation (see the version-skew class guard below).
  const COMBAT_PATH = [
    "users",
    "member",
    "characters",
    "char-cbt",
    "combat",
    "state",
  ] as const;

  function combatState(overrides: Record<string, unknown> = {}) {
    return {
      hp: { current: 10, temp: 0 },
      conditions: [] as string[],
      initiativeRoll: 15,
      deathSaves: { successes: 0, failures: 0 },
      round: 1,
      updatedAt: Timestamp.now(),
      ...overrides,
    };
  }

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "campaigns", "campA"), campaignDoc(["dm", "member", "peer"]));
      await setDoc(doc(db, "users", "member", "characters", "char-cbt"), {
        status: "active",
        attachedCampaignId: "campA",
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
      setDoc(doc(member, ...COMBAT_PATH), combatState({ hp: { current: 5, temp: 2 } }))
    );
  });

  it("the attached campaign's CURRENT DM may read + WRITE — with NO stored grant anywhere", async () => {
    // The headline of the re-architecture: the DM's authority comes from being
    // `campA.dmUid` at request time. Nothing was written on the member's docs to
    // enable this, so nothing can ever be stale.
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(getDoc(doc(dm, ...COMBAT_PATH)));
    await assertSucceeds(
      setDoc(doc(dm, ...COMBAT_PATH), combatState({ conditions: ["prone"] }))
    );
  });

  it("a co-member may apply combat state while the target client is offline", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertSucceeds(getDoc(doc(peer, ...COMBAT_PATH)));
    await assertSucceeds(
      setDoc(doc(peer, ...COMBAT_PATH), combatState({ conditions: ["prone"] }))
    );
  });

  it("a user outside the campaign is denied read AND write", async () => {
    const stranger = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(getDoc(doc(stranger, ...COMBAT_PATH)));
    await assertFails(setDoc(doc(stranger, ...COMBAT_PATH), combatState()));
  });

  it("removing a table member revokes their combat-state write immediately", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, "campaigns", "campA"), {
        members: ["dm", "member"],
        "memberDetails.peer": deleteField(),
      });
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertFails(setDoc(doc(peer, ...COMBAT_PATH), combatState()));
  });

  it("the DM STILL cannot write the PARENT character doc (owner-only rule untouched)", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertFails(
      updateDoc(doc(dm, "users", "member", "characters", "char-cbt"), { status: "dead" })
    );
  });

  it("a BLOCKED DM is denied (isNotBlocked gate)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "campA"), { dmUid: "blocked" });
    });
    const blocked = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(getDoc(doc(blocked, ...COMBAT_PATH)));
    await assertFails(setDoc(doc(blocked, ...COMBAT_PATH), combatState()));
  });

  it("the admin may read + write any combat state (override)", async () => {
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(admin, ...COMBAT_PATH)));
    await assertSucceeds(setDoc(doc(admin, ...COMBAT_PATH), combatState()));
  });

  it("an UNATTACHED char's subdoc is owner/admin-only (no campaign pointer → no cross-user grant)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "users", "member", "characters", "char-cbt"), {
        attachedCampaignId: deleteField(),
      });
    });
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertFails(getDoc(doc(dm, ...COMBAT_PATH)));
    await assertFails(setDoc(doc(dm, ...COMBAT_PATH), combatState()));
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(setDoc(doc(owner, ...COMBAT_PATH), combatState()));
  });

  it("VERSION-SKEW CLASS GUARD: a payload with fields these rules have never heard of is ACCEPTED", async () => {
    // THE REGRESSION PIN for the "initiative never saves" production outage: the old
    // field-locked isValidCombatState() rejected EVERY combat write the moment the
    // client's payload gained a field the DEPLOYED rules didn't list yet (new client
    // wrote `round`; prod rules lagged → permission-denied on the owner's OWN doc,
    // mislabeled by a catch-all toast). Authorization is the rule's job; shape
    // tolerance is the client's (parseCombatState reads defensively). This pins that
    // a future additive field can never re-open the outage class.
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      setDoc(doc(owner, ...COMBAT_PATH), combatState({ someFutureField: 42 }))
    );
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(
      setDoc(doc(dm, ...COMBAT_PATH), combatState({ anotherFutureField: true }))
    );
  });

  it("a FRESH (absent-subdoc) offline write is authorized for the OWNER and the DM", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), ...COMBAT_PATH));
    });
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      setDoc(doc(owner, ...COMBAT_PATH), combatState({ initiativeRoll: 17 }), {
        merge: true,
      })
    );
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), ...COMBAT_PATH));
    });
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(setDoc(doc(dm, ...COMBAT_PATH), combatState(), { merge: true }));
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
