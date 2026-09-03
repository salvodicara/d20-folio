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

    // ── C3: the FROZEN turn order (`encounter.order`) is DM-only STRUCTURAL state ──
    // Begin-turns FREEZES it and the DM drag-reorder rewrites it; a regular member may
    // advance the turn pointer but must NEVER touch `order`, the encounter status, or
    // the combatants array (all outside the `turnFieldsOnlyChanged()` allow-set) —
    // alone or smuggled alongside a legitimate advance.
    it("a member may change NOTHING else on the encounter, alone or smuggled", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      const denied: ReadonlyArray<Record<string, unknown>> = [
        { "encounter.status": "ended" },
        { "encounter.order": ["monster-1", "pc-member"] },
        {
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
        },
        { "encounter.round": 2, "encounter.status": "ended" },
        {
          "encounter.currentCombatantId": "pc-member",
          "encounter.round": 2,
          "encounter.order": ["pc-member", "monster-1"],
        },
      ];
      for (const patch of denied) {
        await assertFails(updateDoc(doc(db, "campaigns", "camp1"), patch));
      }
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

    it("the DM writes the WHOLE encounter, order included (structure unconstrained)", async () => {
      const dm = testEnv.authenticatedContext("dm").firestore();
      await assertSucceeds(
        updateDoc(doc(dm, "campaigns", "camp1"), {
          encounter: { ...encounter, round: 3, currentCombatantId: null },
        })
      );
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

    it("a member MAY apply damage, healing, a condition and the engine world", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.combatants": damaged,
          "encounter.events": [appliedEvent],
        })
      );
      // The resolver's monster damage/healing commits through the deterministic
      // engine's journal; the committed `encounter.world` rides the SAME member
      // transaction as the mirrored combatants + chronicle beats. A corrupt world
      // fails CLOSED at read time (`encounterWorldState` rejects; the boundary
      // degrades to legacy arithmetic), so this stays inside the coarse-grant,
      // DM-remediable posture the grant already accepts for combatants.
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
          "encounter.world": { schema: 1, revision: 1 },
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

    it("the effect-op ledger is append-only: apply, revoke and a bounded batch land", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [persistentApply],
        })
      );
      const revoke = {
        id: "revoke:heroism:1",
        kind: "revoke",
        effectId: "heroism:1",
        actorId: "pc-member",
        targetId: "monster-1",
      };
      // Malformed provenance on the appended operation is refused…
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [persistentApply, { ...revoke, actorId: "" }],
        })
      );
      // …while a revoke plus its aftereffect successor lands in ONE append.
      await assertSucceeds(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            persistentApply,
            revoke,
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

      // A whole batch of one-shot consumptions commits atomically — unless ONE row
      // in it is malformed, which fails the entire write.
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

    it("the ledger accepts every caster/feature-owned payload with bounded deltas", async () => {
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
      const markedTarget = {
        ...persistentApply,
        effect: {
          ...persistentApply.effect,
          payload: {
            kind: "target-mark",
            activeKey: "spell-hunters-mark",
            scope: "marked",
          },
        },
      };
      const conditionOccurrence = {
        ...persistentApply,
        effect: {
          ...persistentApply.effect,
          payload: { kind: "condition", conditionId: "paralyzed" },
        },
      };
      const vowedTarget = {
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
      };
      for (const operation of [aid, markedTarget, conditionOccurrence, vowedTarget]) {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
            "encounter.effectOps": [],
          });
        });
        await assertSucceeds(
          updateDoc(doc(db, "campaigns", "camp1"), {
            "encounter.effectOps": [operation],
          })
        );
      }

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
          "encounter.effectOps": [],
        });
      });
      // An amplified HP delta and a condition occurrence with no stable id are both
      // outside what the grant can express.
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            { ...aid, effect: { ...aid.effect, applied: { currentHpDelta: 10001 } } },
          ],
        })
      );
      await assertFails(
        updateDoc(doc(db, "campaigns", "camp1"), {
          "encounter.effectOps": [
            {
              ...conditionOccurrence,
              effect: {
                ...conditionOccurrence.effect,
                payload: { kind: "condition", conditionId: "" },
              },
            },
          ],
        })
      );
    });

    it("a member CANNOT append a malformed, actor-spoofed or non-canonical application", async () => {
      const db = testEnv.authenticatedContext("member").firestore();
      const denied = [
        { ...persistentApply, effect: { id: "missing-required-nested-fields" } },
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
        {
          ...persistentApply,
          effect: {
            ...persistentApply.effect,
            actor: { kind: "monster", combatantId: "monster-1" },
          },
        },
        {
          ...persistentApply,
          effect: {
            ...persistentApply.effect,
            target: {
              kind: "monster",
              combatantId: "monster-1",
              unexpectedIdentityPart: 1,
            },
          },
        },
      ];
      for (const operation of denied) {
        await assertFails(
          updateDoc(doc(db, "campaigns", "camp1"), {
            "encounter.effectOps": [operation],
          })
        );
      }
    });

    it("a member CANNOT reorder, replace, remove or overgrow prior operations", async () => {
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
      const denied: ReadonlyArray<ReadonlyArray<unknown>> = [
        [second, first, third],
        [{ id: "apply:bless:1", kind: "apply", effect: { id: "bless:1" } }],
        [],
        Array.from({ length: 513 }, (_, index) => ({
          id: `apply:${index}`,
          kind: "apply",
          effect: { id: String(index) },
        })),
      ];
      for (const effectOps of denied) {
        await assertFails(
          updateDoc(doc(db, "campaigns", "camp1"), { "encounter.effectOps": effectOps })
        );
      }
    });

    it("the damage path cannot add a combatant, shrink the chronicle or move the turn", async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
          "encounter.events": [appliedEvent, { ...appliedEvent, id: "1" }],
        });
      });
      const db = testEnv.authenticatedContext("member").firestore();
      const denied: ReadonlyArray<Record<string, unknown>> = [
        {
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
        },
        // Events only GROW: the DM's chronicle lines are never dropped.
        { "encounter.combatants": damaged, "encounter.events": [appliedEvent] },
        {
          "encounter.combatants": damaged,
          "encounter.events": [appliedEvent, { ...appliedEvent, id: "1" }],
          "encounter.status": "ended",
        },
      ];
      for (const patch of denied) {
        await assertFails(updateDoc(doc(db, "campaigns", "camp1"), patch));
      }
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

  it("the campaign DM may atomically remove a member and clear only that target's claim", async () => {
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

  it("the detach exception denies a standalone write, a non-DM, a wrong row and a bundled edit", async () => {
    const parentPath = ["users", "member", "characters", "char-member"] as const;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "member", "characters", "other"), {
        attachedCampaignId: "campA",
        build: { name: "Other" },
        state: {},
        cache: {},
      });
    });
    const dm = testEnv.authenticatedContext("dm").firestore();
    // Standalone: no roster transition proves it.
    await assertFails(
      updateDoc(doc(dm, ...parentPath), { attachedCampaignId: deleteField() })
    );
    // A non-DM member cannot drive the transition, batched or not.
    const peer = testEnv.authenticatedContext("peer").firestore();
    await assertFails(updateDoc(doc(peer, ...parentPath), { status: "retired" }));
    const peerBatch = writeBatch(peer);
    peerBatch.update(doc(peer, "campaigns", "campA"), {
      members: arrayRemove("member"),
      "memberDetails.member": deleteField(),
    });
    peerBatch.update(doc(peer, ...parentPath), { attachedCampaignId: deleteField() });
    await assertFails(peerBatch.commit());
    // The exception is row-exact and edit-free.
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

  it("campaign deletion clears every referenced claim — and only those, only by the DM", async () => {
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
      await setDoc(doc(db, "users", "member", "characters", "other"), {
        attachedCampaignId: "campA",
        build: { name: "Other" },
        state: {},
        cache: {},
      });
    });
    const dm = testEnv.authenticatedContext("dm").firestore();
    // A character the roster never referenced may not ride the deletion.
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

describe("firestore.rules — combat/state: the play owner and its peer effect fence", () => {
  // BLIND SPOT: rules can constrain changed top-level roots and the monotonic CAS
  // revision, but cannot prove the table's arithmetic. The campaign transaction's
  // fresh-read reducers own HP/DC math; campaign-io unit tests pin that layer.
  //
  // P4 deletion: the peer fence (`isAttachedPeer`, `peerEffectUpdate` and its
  // validators) dies with the encounter document.
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

  it("the read matrix: owner, admin and a current attached peer in; everyone else out", async () => {
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
      await assertFails(
        updateDoc(doc(db, ...COMBAT_PATH), { hp: { current: 9, temp: 0 } })
      );
    }
    // A BLOCKED attached member is denied by the isNotBlocked gate.
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
      updateDoc(doc(blocked, ...COMBAT_PATH), { hp: { current: 9, temp: 0 } })
    );
  });

  it("owner and admin own the whole document: additive fields in, obsolete metadata shed", async () => {
    const owner = testEnv.authenticatedContext("member").firestore();
    const ref = doc(owner, ...COMBAT_PATH);
    // The seeded fixture is exact and parser-canonical by construction.
    expect((await getDoc(ref)).data()).toEqual(combatState());
    await assertSucceeds(
      setDoc(ref, combatState({ hp: { current: 5, temp: 2 }, ownerFutureField: 42 }))
    );
    // The production overwrite (no `merge`) sheds the retired effect-program roots.
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
    expect(stored.data()).not.toHaveProperty("actionLifecycles");
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(admin, ...COMBAT_PATH), {
        playState: { version: 1, state: { exhaustion: 5 } },
        adminFutureField: true,
      })
    );
  });

  it("an attached peer may write every legitimate effect root", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "campA"), {
        encounter: { epoch: 4 },
      });
    });
    const peer = testEnv.authenticatedContext("peer").firestore();
    const mutations: ReadonlyArray<Record<string, unknown>> = [
      { hp: { current: 8, temp: 1 } },
      { conditions: ["prone"] },
      { bardicInspirationDie: "d8" },
      { heroicInspiration: true },
      { deathSaves: { successes: 1, failures: 0 } },
      {
        pendingConcentrationSaves: [
          { id: "hit-1", spell: "bless", damage: 12, difficultyClass: 10 },
        ],
        appliedEncounterEffects: { epoch: 4, ids: ["effect-1"] },
      },
    ];
    for (const mutation of mutations) {
      await assertSucceeds(
        updateDoc(doc(peer, ...COMBAT_PATH), { ...mutation, updatedAt: Timestamp.now() })
      );
    }
  });

  it("a peer cannot touch an owner-private root, action metadata, or stamp a bare timestamp", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    const forbidden: ReadonlyArray<Record<string, unknown>> = [
      { playState: { version: 1, state: { exhaustion: 6 } } },
      { playState: deleteField() },
      { actionRevision: 8 },
      { actionHead: "peer-command" },
      { "actionLifecycles.attack-2": actionLifecycle() },
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
    // A timestamp with no landed effect is not a delivery.
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), { updatedAt: Timestamp.now() })
    );
    // An ABSENT play owner may not be manufactured by a peer either.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), ...COMBAT_PATH), { playState: deleteField() });
    });
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        hp: { current: 9, temp: 0 },
        playState: { version: 1, state: { exhaustion: 0 } },
      })
    );
  });

  it("a peer payload must keep the parseable core and every effect value canonical", async () => {
    const peer = testEnv.authenticatedContext("peer").firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "campA"), {
        encounter: { epoch: 4 },
      });
    });
    const malformed: ReadonlyArray<Record<string, unknown>> = [
      { hp: deleteField() },
      { hp: { current: "all", temp: 0 } },
      { hp: { current: -1, temp: 0 } },
      { hp: { current: Number.NaN, temp: 0 } },
      { conditions: {} },
      { conditions: ["prone", 7] },
      { conditions: ["prone", "prone"] },
      { conditions: ["not-a-condition"] },
      { deathSaves: deleteField() },
      { updatedAt: "eventually" },
      { pendingConcentrationSaves: {} },
      { appliedEncounterEffects: { epoch: 3, ids: ["effect-1"] } },
      { appliedEncounterEffects: { epoch: 4, ids: ["effect-1", "effect-1"] } },
      { appliedEncounterEffects: { epoch: 4, ids: [], extra: true } },
    ];
    for (const mutation of malformed) {
      await assertFails(updateDoc(doc(peer, ...COMBAT_PATH), { ...mutation }));
    }

    // A pre-existing custom/legacy condition string is PRESERVED, never a blocker: a
    // peer may add and remove core conditions around it, but not author or drop it.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), ...COMBAT_PATH), {
        conditions: ["custom:bleeding"],
      });
    });
    await assertSucceeds(
      updateDoc(doc(peer, ...COMBAT_PATH), { conditions: ["custom:bleeding", "prone"] })
    );
    await assertSucceeds(
      updateDoc(doc(peer, ...COMBAT_PATH), { conditions: ["custom:bleeding"] })
    );
    await assertFails(
      updateDoc(doc(peer, ...COMBAT_PATH), {
        conditions: ["custom:bleeding", "custom:burning"],
      })
    );
    await assertFails(updateDoc(doc(peer, ...COMBAT_PATH), { conditions: [] }));
  });

  it("only the owner (or an admin) creates the play owner — never a peer or the DM", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), ...COMBAT_PATH));
    });
    const firstWrite = {
      hp: { current: 7, temp: 0 },
      conditions: ["prone"],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      updatedAt: Timestamp.now(),
    };
    for (const uid of ["peer", "dm", "outsider"]) {
      await assertFails(
        setDoc(
          doc(testEnv.authenticatedContext(uid).firestore(), ...COMBAT_PATH),
          firstWrite
        )
      );
    }
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(setDoc(doc(owner, ...COMBAT_PATH), combatState()));
  });

  it("the peer grant dies live with either reciprocal half of the attachment", async () => {
    const revocations: ReadonlyArray<Record<string, unknown>> = [
      // The requester leaves the table.
      { members: ["dm", "member"], "memberDetails.peer": deleteField() },
      // The TARGET's owner leaves — deliberately leaving the stale memberDetails row
      // behind, since either half must fail closed independently.
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
      await assertFails(
        updateDoc(doc(peer, ...COMBAT_PATH), { hp: { current: 9, temp: 0 } })
      );
    }
    // Reciprocal peer fencing never weakens the direct owner path.
    const owner = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(getDoc(doc(owner, ...PARENT_PATH)));
    await assertSucceeds(getDoc(doc(owner, ...COMBAT_PATH)));
  });

  it("the DM is effect-fenced too, and an UNATTACHED char has no cross-user grant", async () => {
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(updateDoc(doc(dm, ...COMBAT_PATH), { conditions: ["prone"] }));
    await assertFails(
      updateDoc(doc(dm, ...COMBAT_PATH), {
        hp: { current: 8, temp: 0 },
        anotherFutureField: true,
      })
    );
    // …and the DM never writes the parent character doc.
    await assertFails(updateDoc(doc(dm, ...PARENT_PATH), { status: "dead" }));

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), ...PARENT_PATH), {
        attachedCampaignId: deleteField(),
      });
    });
    await assertFails(getDoc(doc(dm, ...COMBAT_PATH)));
    await assertFails(
      updateDoc(doc(dm, ...COMBAT_PATH), { hp: { current: 9, temp: 0 } })
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

  it("the DM (and the admin) may set ANY member's initiative", async () => {
    // The owner's exact failing action: rolling for a player.
    const dm = testEnv.authenticatedContext("dm").firestore();
    await assertSucceeds(
      updateDoc(doc(dm, "campaigns", "camp1"), { "encounterInit.member": 14 })
    );
    await assertSucceeds(
      updateDoc(doc(dm, "campaigns", "camp1"), { "encounterInit.dm": 9 })
    );
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(admin, "campaigns", "camp1"), { "encounterInit.member": 8 })
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
    // get(..., {}) on both diff sides: an absent table reads as empty, so the first
    // roll on a PRE-FEATURE doc validates too.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
        encounterInit: deleteField(),
      });
    });
    await assertSucceeds(
      updateDoc(doc(member, "campaigns", "camp1"), { "encounterInit.member": 17 })
    );
  });

  it("a member's row scope holds against a peer write, a smuggle and a whole-table replace", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
        "encounterInit.dm": 11,
      });
    });
    const member = testEnv.authenticatedContext("member").firestore();
    for (const patch of [
      { "encounterInit.dm": 20 },
      { "encounterInit.member": 12, "encounterInit.dm": 20 },
      { encounterInit: { member: 12 } },
      // Only the DM starts/ends a fight, so only the DM resets the table.
      { encounterInit: {} },
    ]) {
      await assertFails(updateDoc(doc(member, "campaigns", "camp1"), patch));
    }
  });

  it("a NON-MEMBER and a BLOCKED member may not write any row", async () => {
    const outsider = testEnv.authenticatedContext("outsider").firestore();
    await assertFails(
      updateDoc(doc(outsider, "campaigns", "camp1"), { "encounterInit.outsider": 15 })
    );
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

  it("the init guard diffs to the empty set for a member's other writes", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
        "encounter.currentCombatantId": "pc-member",
        "encounter.order": ["pc-member"],
      });
    });
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      updateDoc(doc(member, "campaigns", "camp1"), {
        treasury: { pp: 0, gp: 7, ep: 0, sp: 0, cp: 0 },
      })
    );
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
