/**
 * The owner's `combat/state` write never drops a peer's write it had not seen yet.
 *
 * The race (live since v0.25, frequent with the spends ledger): the DM's hit on Bren
 * commits (`writeCampaignCombatEffect`), and before its snapshot reaches Bren's sheet,
 * the sheet persists an edit built on the state from BEFORE the hit: an HP edit, End
 * Turn, a rest, the ledger fold. A whole-document write from memory erased the hit.
 * Now the owner writes only what it changed, against the state its edit was built on
 * (`writeCombatState(…, base)`), so both land. Also when the owner's write was queued
 * offline and replays after the hit.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  disableNetwork,
  doc,
  enableNetwork,
  getDoc,
  setDoc,
  updateDoc,
  waitForPendingWrites,
  type Firestore,
} from "firebase/firestore";

const holder = vi.hoisted(() => ({ db: null as Firestore | null }));
vi.mock("@/lib/firebase", () => ({
  get db() {
    return holder.db;
  },
  app: {},
  auth: {},
  functions: {},
  storage: {},
}));

import { writeCampaignCombatEffect } from "@/features/campaigns/campaign-io";
import { createCharacter } from "@/lib/firestore";
import { parseCombatState, writeCombatState } from "@/lib/combat-state-io";
import type { CombatState } from "@/types/combat-state";
import { makeCharacterDoc } from "../unit/_helpers";

let testEnv: RulesTestEnvironment;
let brenId = "";

const as = (uid: string) =>
  (holder.db = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore);

async function stored(): Promise<CombatState> {
  const db = holder.db;
  if (!db) throw new Error("no db");
  const snap = await getDoc(
    doc(db, "users", "a", "characters", brenId, "combat", "state")
  );
  const parsed = parseCombatState(snap.data());
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.state;
}

/** The DM hits Bren for `amount` through the real peer write. */
async function dmHits(amount: number): Promise<void> {
  as("dm");
  await writeCampaignCombatEffect("a", brenId, null, 40, {
    kind: "hp",
    operation: { kind: "damage", amount },
  });
}

function withState(base: CombatState, state: Record<string, unknown>): CombatState {
  const play = base.playState;
  if (!play) throw new Error("no play state");
  return {
    ...base,
    playState: { ...play, state: { ...play.state, ...state } },
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-d20folio-owner-merge",
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    for (const uid of ["dm", "a"])
      await setDoc(doc(ctx.firestore(), "users", uid), { status: "active" });
    await setDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
      name: "T",
      createdBy: "dm",
      dmUid: "dm",
      members: ["dm", "a"],
      memberDetails: {
        dm: { displayName: "dm", characterId: null, role: "dm" },
        a: { displayName: "a", characterId: "pending", role: "player" },
      },
      status: "active",
      inviteCode: "camp1",
    });
  });
  as("a");
  brenId = await createCharacter(
    "a",
    makeCharacterDoc(
      { classId: "fighter", level: 3 },
      { hp: { current: 30, temp: 0 }, exhaustion: 2 }
    )
  );
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "users", "a", "characters", brenId), {
      attachedCampaignId: "camp1",
    });
    await updateDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
      "memberDetails.a.characterId": brenId,
    });
  });
});

describe("the owner's write after a DM hit it had not seen", () => {
  it.each([
    {
      path: "an HP edit (a heal of 5)",
      edit: (base: CombatState) => ({
        ...base,
        hp: { ...base.hp, current: base.hp.current + 5 },
      }),
      delta: 5,
      check: () => undefined,
    },
    {
      path: "End Turn (the next round)",
      edit: (base: CombatState) => ({ ...base, round: base.round + 1 }),
      delta: 0,
      check: (after: CombatState, base: CombatState) =>
        expect(after.round).toBe(base.round + 1),
    },
    {
      path: "a rest (HP back, one Exhaustion level less)",
      edit: (base: CombatState) =>
        withState(
          { ...base, hp: { ...base.hp, current: base.hp.current + 4 } },
          {
            exhaustion: 1,
          }
        ),
      delta: 4,
      check: (after: CombatState) => expect(after.playState?.state.exhaustion).toBe(1),
    },
    {
      path: "the ledger fold (a use spent by an ally's hit)",
      edit: (base: CombatState) => withState(base, { exhaustion: 3 }),
      delta: 0,
      check: (after: CombatState) => expect(after.playState?.state.exhaustion).toBe(3),
    },
  ])("$path keeps the hit", async ({ edit, delta, check }) => {
    as("a");
    const base = await stored();
    await dmHits(8);
    as("a");
    const hit = await stored(); // what the server holds after the hit
    expect(hit.hp.current).toBeLessThan(base.hp.current);
    await writeCombatState("a", brenId, edit(base), base);
    const after = await stored();
    // The hit and the owner's own change both land on the stored HP.
    expect(after.hp.current).toBe(hit.hp.current + delta);
    check(after, base);
  });

  it("an owner edit queued offline replays after the hit, and both land", async () => {
    const owner = as("a");
    const base = await stored();
    await disableNetwork(owner);
    const queued = writeCombatState(
      "a",
      brenId,
      {
        ...base,
        hp: { ...base.hp, current: base.hp.current + 5 },
      },
      base
    );
    await dmHits(8);
    as("a"); // another, online instance of the owner's account reads the server
    const hit = await stored();
    holder.db = owner;
    await enableNetwork(owner);
    await queued;
    await waitForPendingWrites(owner);
    const fresh = as("a");
    void fresh;
    expect(hit.hp.current).toBeLessThan(base.hp.current);
    expect((await stored()).hp.current).toBe(hit.hp.current + 5);
  });
});
