/**
 * The party chest against the real rules (Tesoro). Each test sends the exact writes the
 * app sends (`planX` → `writeChestMove` / `unwriteChestMove`). Any member moves things;
 * shapes are checked; pickups and log lines never change; an outsider and a blocked
 * member do nothing. Runs under `pnpm test:rules`.
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
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import {
  planLoot,
  planPut,
  planTake,
  type ChestMove,
  type MoveContext,
} from "@/features/campaigns/chest";
import { unwriteChestMove, writeChestMove } from "@/features/campaigns/chest-writes";
import type { ChestItem } from "@/types/campaign";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-d20folio-chest",
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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const uid of ["dm", "kaela", "brann", "out"])
      await setDoc(doc(db, "users", uid), { status: "active" });
    await setDoc(doc(db, "users", "banned"), { status: "blocked" });
    await setDoc(doc(db, "campaigns", "camp1"), {
      name: "Table",
      createdBy: "dm",
      dmUid: "dm",
      members: ["dm", "kaela", "brann", "banned"],
      memberDetails: {
        dm: member(null),
        kaela: member("char-k"),
        brann: member("char-b"),
        banned: member("char-x"),
      },
      treasury: { pp: 0, gp: 10, ep: 0, sp: 0, cp: 0 },
      treasuryLog: [],
    });
  });
});

const dbOf = (uid: string): Firestore =>
  testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
let n = 0;
const ctx = (uid: string): MoveContext => ({ uid, now: 1000, newId: () => `id${++n}` });
const potion = { srdId: "potion-of-healing" };

function send(uid: string, move: ChestMove | null, back = false) {
  if (!move) throw new Error("expected a move");
  const db = dbOf(uid);
  const batch = writeBatch(db);
  if (back) unwriteChestMove(batch, db, "camp1", move);
  else writeChestMove(batch, db, "camp1", move);
  return batch.commit();
}
async function seed(move: ChestMove | null): Promise<void> {
  if (!move) throw new Error("expected a move");
  await testEnv.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore() as unknown as Firestore;
    const batch = writeBatch(db);
    writeChestMove(batch, db, "camp1", move);
    await batch.commit();
  });
}

describe("any member moves things in the chest, and undoes them", () => {
  it("puts an item in, and takes it back out with the undo", async () => {
    const move = planPut(ctx("brann"), { item: potion, quantity: 2 });
    await assertSucceeds(send("brann", move));
    await assertSucceeds(send("brann", move, true));
  });

  it("takes part of someone else's stack, and the undo puts it back", async () => {
    const put = planPut(ctx("brann"), { item: potion, quantity: 3 });
    await seed(put);
    const stack = put?.created[0]?.data as ChestItem;
    const take = planTake(ctx("kaela"), stack, { quantity: 1 });
    await assertSucceeds(send("kaela", take));
    await assertSucceeds(send("kaela", take, true));
  });

  it("empties someone else's stack, and the undo recreates it as it was", async () => {
    const put = planPut(ctx("brann"), { item: potion, quantity: 1 });
    await seed(put);
    const take = planTake(ctx("kaela"), put?.created[0]?.data as ChestItem, {
      quantity: 1,
    });
    await assertSucceeds(send("kaela", take));
    await assertSucceeds(send("kaela", take, true));
  });

  it("splits loot into named shares, the remainder to the treasury, and undoes it", async () => {
    const loot = planLoot(ctx("kaela"), {
      coins: { gp: 7 },
      items: [{ item: { custom: true, name: "Gemma" }, quantity: 2 }],
      to: "split",
      sharers: ["kaela", "brann"],
    });
    await assertSucceeds(send("kaela", loot));
    await assertSucceeds(send("kaela", loot, true));
  });

  it("a player collects their own pickup", async () => {
    const loot = planLoot(ctx("kaela"), {
      coins: { gp: 4 },
      items: [],
      to: "split",
      sharers: ["kaela", "brann"],
    });
    await seed(loot);
    const share = loot?.created.find(
      (d) =>
        d.collection === "pickups" &&
        (d.data as { ownerUid: string }).ownerUid === "brann"
    );
    await assertSucceeds(
      deleteDoc(doc(dbOf("brann"), "campaigns", "camp1", "pickups", share?.id ?? ""))
    );
  });
});

describe("what nobody may do", () => {
  it("an outsider or a blocked member moves nothing and reads nothing", async () => {
    const move = planPut(ctx("out"), { item: potion, quantity: 1 });
    await assertFails(send("out", move));
    await assertFails(
      send("banned", planPut(ctx("banned"), { item: potion, quantity: 1 }))
    );
    await assertFails(getDoc(doc(dbOf("out"), "campaigns", "camp1", "chest", "x")));
  });

  it("a stack holds a real item and a real count", async () => {
    const db = dbOf("kaela");
    const base = { id: "s1", item: potion, quantity: 1, addedBy: "kaela", at: 1 };
    const ref = doc(db, "campaigns", "camp1", "chest", "s1");
    await assertFails(setDoc(ref, { ...base, quantity: 0 }));
    await assertFails(setDoc(ref, { ...base, item: { srdId: "" } }));
    await assertFails(
      setDoc(ref, { ...base, item: { custom: true, name: "x", ac: 20 } })
    );
    await assertFails(setDoc(ref, { ...base, addedBy: "out" }));
    await assertFails(setDoc(ref, { ...base, cursed: true }));
    await assertSucceeds(setDoc(ref, base));
    // Only the count changes afterwards.
    await assertFails(updateDoc(ref, { item: { srdId: "bag-of-holding" } }));
    await assertSucceeds(updateDoc(ref, { quantity: 2 }));
  });

  it("a pickup is made in one's own name, for a member, and never edited", async () => {
    const db = dbOf("kaela");
    const ref = doc(db, "campaigns", "camp1", "pickups", "p1");
    const base = {
      id: "p1",
      ownerUid: "brann",
      coins: { gp: 3 },
      reason: "share",
      by: "kaela",
      at: 1,
    };
    await assertFails(setDoc(ref, { ...base, by: "brann" }));
    await assertFails(setDoc(ref, { ...base, ownerUid: "out" }));
    await assertFails(setDoc(ref, { ...base, coins: { gp: -3 } }));
    await assertFails(setDoc(ref, { ...base, coins: { diamonds: 3 } }));
    await assertSucceeds(setDoc(ref, base));
    await assertFails(updateDoc(ref, { coins: { gp: 300 } }));
  });

  it("a third member cannot delete someone else's pickup", async () => {
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "campaigns", "camp1", "pickups", "p1"), {
        id: "p1",
        ownerUid: "brann",
        coins: { gp: 3 },
        reason: "share",
        by: "dm",
        at: 1,
      });
    });
    await assertFails(
      deleteDoc(doc(dbOf("kaela"), "campaigns", "camp1", "pickups", "p1"))
    );
    await assertSucceeds(
      deleteDoc(doc(dbOf("dm"), "campaigns", "camp1", "pickups", "p1"))
    );
  });

  it("a log line is written in one's own name and deleted only by its author or the DM", async () => {
    const db = dbOf("kaela");
    const ref = doc(db, "campaigns", "camp1", "chestLog", "l1");
    const line = { id: "l1", kind: "put", by: "kaela", at: 1, item: potion, quantity: 1 };
    await assertFails(setDoc(ref, { ...line, by: "brann" }));
    await assertSucceeds(setDoc(ref, line));
    await assertFails(updateDoc(ref, { quantity: 9 }));
    await assertFails(
      deleteDoc(doc(dbOf("brann"), "campaigns", "camp1", "chestLog", "l1"))
    );
    await assertSucceeds(deleteDoc(ref));
  });

  it("the chest's grants reach no other subcollection", async () => {
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), "campaigns", "camp1", "dmNotes", "n1"), {
        text: "secret",
      });
    });
    await assertFails(getDoc(doc(dbOf("kaela"), "campaigns", "camp1", "dmNotes", "n1")));
    await assertFails(
      deleteDoc(doc(dbOf("kaela"), "campaigns", "camp1", "dmNotes", "n1"))
    );
  });
});
