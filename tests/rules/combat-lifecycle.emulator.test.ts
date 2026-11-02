/**
 * The combat lifecycle's member moves against the real rules (owner 2026-10-23): any
 * member starts a fight with a roll, joins it, passes a turn, ends it, reopens it and
 * cancels a fight nobody fought in. Each test writes the exact fields the app writes
 * (`planX` → `combatPatchFields`). The fight's contents stay DM-only, and an outsider or
 * a blocked member can do none of it. Runs under `pnpm test:rules`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import {
  combatPatchFields,
  planCancel,
  planEnd,
  planReopen,
  planRoll,
  type CombatPatch,
} from "@/features/campaigns/combat-lifecycle";
import type { CombatFields } from "@/features/campaigns/combat-lifecycle";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-d20folio-combat-lifecycle",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const member = (characterId: string | null) => ({
  displayName: "x",
  role: "player",
  characterId,
  character: characterId
    ? { name: characterId, race: "Human", classes: [], ac: 12, hpMax: 9 }
    : null,
});
const MEMBERS = ["dm", "ana", "ben", "banned"];
const campaign = {
  name: "Table",
  createdBy: "dm",
  dmUid: "dm",
  members: MEMBERS,
  memberDetails: {
    dm: member(null),
    ana: member("char-ana"),
    ben: member("char-ben"),
    banned: member("char-banned"),
  },
  encounterInit: {},
};

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const uid of ["dm", "ana", "ben", "out"])
      await setDoc(doc(db, "users", uid), { status: "active" });
    await setDoc(doc(db, "users", "banned"), { status: "blocked" });
    await setDoc(doc(db, "campaigns", "camp1"), campaign);
  });
});

const dbOf = (uid: string): Firestore =>
  testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
const ref = (uid: string) => doc(dbOf(uid), "campaigns", "camp1");
const bonuses = { "pc-ana": 2, "pc-ben": 1 };

async function current(): Promise<CampaignDoc & CombatFields> {
  let data: Record<string, unknown> = {};
  let kept: EncounterState | null = null;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    data = (await getDoc(doc(db, "campaigns", "camp1"))).data() ?? {};
    const keptData = (
      await getDoc(doc(db, "campaigns", "camp1", "combat", "ended"))
    ).data();
    kept = (keptData?.fight as EncounterState | undefined) ?? null;
  });
  return { ...data, id: "camp1", endedEncounter: kept } as unknown as CampaignDoc &
    CombatFields;
}
/** One move's writes, both documents in one batch (as the app's transaction). */
function batchFor(db: Firestore, patch: CombatPatch) {
  const { campaign, kept } = combatPatchFields(patch);
  const batch = writeBatch(db);
  batch.update(doc(db, "campaigns", "camp1"), campaign);
  const keptRef = doc(db, "campaigns", "camp1", "combat", "ended");
  if (kept === null) batch.delete(keptRef);
  else if (kept) batch.set(keptRef, kept);
  return batch;
}
const write = (uid: string, patch: CombatPatch | null | undefined) => {
  if (!patch) throw new Error("expected a move");
  return batchFor(dbOf(uid), patch).commit();
};
async function seedPatch(patch: CombatPatch | null | undefined): Promise<void> {
  if (!patch) throw new Error("expected a move");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await batchFor(ctx.firestore() as unknown as Firestore, patch).commit();
  });
}
const rollPatch = async (uid: string, roll: number | null) =>
  planRoll(await current(), { uid, roll, bonuses, now: Date.now() })?.patch;

describe("a member starts, joins, ends and reopens a fight", () => {
  it("the first roll starts the fight", async () => {
    await assertSucceeds(write("ana", await rollPatch("ana", 13)));
  });

  it("a second player's roll joins and re-sorts the order", async () => {
    await seedPatch(await rollPatch("ana", 13));
    await assertSucceeds(write("ben", await rollPatch("ben", 18)));
  });

  it("anyone passes the turn of a lifecycle fight, not only its owner", async () => {
    await seedPatch(await rollPatch("ana", 13));
    const fight = (await current()).encounter as EncounterState;
    await assertSucceeds(
      updateDoc(ref("ben"), {
        "encounter.currentCombatantId": "pc-ana",
        "encounter.round": 2,
        "encounter.clock": { ...fight.clock, turnsBegun: true, turnStartedAt: 99 },
      })
    );
  });

  it("anyone ends the fight, and anyone reopens it", async () => {
    await seedPatch(await rollPatch("ana", 13));
    await assertSucceeds(
      write("ben", planEnd(await current(), { reason: "manual", now: 5 }))
    );
    await assertSucceeds(write("ana", planReopen(await current(), { now: 6 })));
  });

  it("the starter cancels a fight nobody fought in", async () => {
    await seedPatch(await rollPatch("ana", 13));
    const epoch = (await current()).encounter?.epoch ?? 0;
    await assertSucceeds(
      write("ana", planCancel(await current(), { uid: "ana", epoch }))
    );
  });
});

describe("what a member may not do", () => {
  it("an outsider or a blocked member starts nothing", async () => {
    const patch = await rollPatch("ana", 13);
    await assertFails(write("out", patch));
    await assertFails(write("banned", patch));
  });

  it("a start may hold no creature and no other round", async () => {
    const patch = await rollPatch("ana", 13);
    const fight = patch?.encounter as EncounterState;
    const goblin = {
      kind: "monster",
      id: "monster-1",
      name: "Goblin",
      ac: 13,
      initiative: 12,
      conditions: [],
      hp: { current: 7, temp: 0, max: 7 },
    };
    await assertFails(
      updateDoc(ref("ana"), {
        ...combatPatchFields(patch ?? {}).campaign,
        encounter: {
          ...fight,
          combatants: [...fight.combatants, goblin],
          nextMonsterOrdinal: 2,
        },
      })
    );
    await assertFails(
      updateDoc(ref("ana"), {
        ...combatPatchFields(patch ?? {}).campaign,
        "encounter.round": 3,
      })
    );
  });

  it("joining adds only the writer's own PC, never someone else's", async () => {
    await seedPatch(await rollPatch("ana", 13));
    await assertFails(write("ana", await rollPatch("ben", 18)));
  });

  it("a member adds or removes no creature in a running fight", async () => {
    await seedPatch(await rollPatch("ana", 13));
    const fight = (await current()).encounter as EncounterState;
    await assertFails(
      updateDoc(ref("ben"), {
        "encounter.combatants": [
          ...fight.combatants,
          {
            kind: "monster",
            id: "monster-1",
            name: "Ogre",
            ac: 11,
            initiative: 8,
            conditions: [],
            hp: { current: 59, temp: 0, max: 59 },
          },
        ],
        "encounter.nextMonsterOrdinal": 2,
      })
    );
    await assertFails(
      updateDoc(ref("ben"), { "encounter.combatants": fight.combatants.slice(1) })
    );
  });

  it("an end keeps the fight as it was: no edit smuggled in", async () => {
    await seedPatch(await rollPatch("ana", 13));
    const patch = planEnd(await current(), { reason: "manual", now: 5 });
    const kept = patch?.endedEncounter as EncounterState;
    await assertFails(write("ben", { ...patch, endedEncounter: { ...kept, round: 9 } }));
    await assertFails(
      write("ben", {
        ...patch,
        endedEncounter: { ...kept, ended: { reason: "won", at: 5 } },
      } as unknown as CombatPatch)
    );
  });

  it("a reopen brings back the kept fight, not another one", async () => {
    await seedPatch(await rollPatch("ana", 13));
    await seedPatch(planEnd(await current(), { reason: "manual", now: 5 }));
    const patch = planReopen(await current(), { now: 6 });
    const back = patch?.encounter as EncounterState;
    await assertFails(write("ana", { ...patch, encounter: { ...back, round: 4 } }));
  });

  it("the kept fight is written only as the other half of an end", async () => {
    await seedPatch(await rollPatch("ana", 13));
    const fight = (await current()).encounter as EncounterState;
    const keptRef = doc(dbOf("ben"), "campaigns", "camp1", "combat", "ended");
    const ended = { reason: "manual", at: 1 };
    // Alone, beside a running fight: denied, whether faithful or forged.
    await assertFails(setDoc(keptRef, { fight: { ...fight, ended } }));
    await assertFails(
      setDoc(keptRef, { fight: { ...fight, nextMonsterOrdinal: 5, ended } })
    );
    // An outsider reads nothing of it.
    await assertFails(getDoc(doc(dbOf("out"), "campaigns", "camp1", "combat", "ended")));
  });

  it("the keep is not taken away without reopening its fight", async () => {
    await seedPatch(await rollPatch("ana", 13));
    await seedPatch(planEnd(await current(), { reason: "manual", now: 5 }));
    const db = dbOf("ben");
    await assertFails(
      writeBatch(db)
        .delete(doc(db, "campaigns", "camp1", "combat", "ended"))
        .commit()
    );
  });

  it("a start's PCs are only PCs, even with the creature counter untouched", async () => {
    const patch = await rollPatch("ana", 13);
    const fight = patch?.encounter as EncounterState;
    const goblin = {
      kind: "monster",
      id: "monster-1",
      name: "Goblin",
      ac: 13,
      initiative: 12,
      conditions: [],
      hp: { current: 7, temp: 0, max: 7 },
    };
    // Sent raw: the app's own parser already refuses to write this fight.
    await assertFails(
      updateDoc(ref("ana"), {
        ...combatPatchFields(patch ?? {}).campaign,
        encounter: {
          ...fight,
          combatants: [goblin],
          order: [],
          currentCombatantId: null,
        },
      })
    );
  });

  it("a join appends the writer's own PC only, not a friend's", async () => {
    await seedPatch(await rollPatch("ana", 13));
    const fight = (await current()).encounter as EncounterState;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
        "encounter.combatants": fight.combatants.slice(0, 1),
      });
    });
    const friend = {
      kind: "pc",
      id: "pc-ben",
      memberUid: "ben",
      characterId: "char-ben",
    };
    await assertFails(
      updateDoc(ref("ana"), { "encounter.combatants": [fight.combatants[0], friend] })
    );
    const me = { kind: "pc", id: "pc-ben", memberUid: "ben", characterId: "char-ben" };
    await assertSucceeds(
      updateDoc(ref("ben"), { "encounter.combatants": [fight.combatants[0], me] })
    );
  });

  it("a cancel cannot slip a forged fight into the keep", async () => {
    await seedPatch(await rollPatch("ana", 13));
    const fight = (await current()).encounter as EncounterState;
    const epoch = fight.epoch;
    const cancel = planCancel(await current(), { uid: "ana", epoch });
    await assertFails(
      write("ana", {
        ...cancel,
        endedEncounter: { ...fight, round: 7, ended: { reason: "manual", at: 1 } },
      })
    );
  });

  it("an end must keep this fight, not lean on an older keep", async () => {
    await seedPatch(await rollPatch("ana", 13));
    await seedPatch(planEnd(await current(), { reason: "manual", now: 5 }));
    await seedPatch(await rollPatch("ben", 18));
    // The new fight ends without being kept, while the older one sits in the keep.
    await assertFails(updateDoc(ref("ana"), { encounter: null }));
  });

  it("no cancel once another player has rolled", async () => {
    await seedPatch(await rollPatch("ana", 13));
    const epoch = (await current()).encounter?.epoch ?? 0;
    await seedPatch(await rollPatch("ben", 18));
    await assertFails(write("ana", { encounter: null, encounterInit: {} }));
    void epoch;
  });

  it("in a fight the DM runs by hand, a member's roll leaves the DM's order alone", async () => {
    const handRun: EncounterState = {
      combatants: [
        { kind: "pc", id: "pc-ana", memberUid: "ana", characterId: "char-ana" },
        { kind: "pc", id: "pc-ben", memberUid: "ben", characterId: "char-ben" },
      ],
      nextMonsterOrdinal: 1,
      round: 2,
      currentCombatantId: "pc-ana",
      order: ["pc-ana", "pc-ben"],
      epoch: 3,
      status: "active",
    };
    await seedPatch({ encounter: handRun });
    await assertSucceeds(write("ben", await rollPatch("ben", 18)));
    await assertFails(updateDoc(ref("ben"), { "encounter.order": ["pc-ben", "pc-ana"] }));
  });
});
