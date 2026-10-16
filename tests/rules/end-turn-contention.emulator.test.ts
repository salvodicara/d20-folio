/**
 * End Turn latency (diagnosed 2026-10-16): ending a turn changes the sheet (per-turn
 * recovery, timers), the sheet's save refreshes the player's party card
 * (`memberDetails.<uid>.character`) on the campaign doc, and that write lands inside
 * the `advanceEncounterTurn` transaction, which has just read the same doc. The commit
 * fails with FAILED_PRECONDITION and the SDK retries after a backoff of a second or
 * more (five failures abort the turn). The card holds only name, race, classes, AC,
 * max HP and portrait, which End Turn never changes: the write was redundant.
 *
 * Real functions, the emulator and the real rules (`pnpm test:rules`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, type Firestore } from "firebase/firestore";

const holder = vi.hoisted(() => ({ db: undefined }));
vi.mock("@/lib/firebase", () => ({
  get db() {
    return holder.db;
  },
  app: {},
  auth: {},
  functions: {},
  storage: {},
}));

import { advanceEncounterTurn } from "@/features/campaigns/campaign-io";
import { buildMemberSnapshot } from "@/features/campaigns/member-snapshot";
import {
  createAttachedCampaignTracker,
  refreshAttachedSheets,
} from "@/features/campaigns/refresh-attached-sheets";
import { stripUndefined } from "@/lib/strip-undefined";
import { makeCharacterDoc } from "../unit/_helpers";

let testEnv: RulesTestEnvironment;

const hero = { ...makeCharacterDoc({ classId: "bard", level: 3 }), id: "char-a" };

const encounter = {
  nextMonsterOrdinal: 2,
  round: 2,
  currentCombatantId: "pc-a",
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
      hp: { current: 5, temp: 0, max: 7 },
    },
  ],
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-d20folio-end-turn",
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
    const db = ctx.firestore();
    for (const uid of ["dm", "a"])
      await setDoc(doc(db, "users", uid), { status: "active" });
    await setDoc(doc(db, "campaigns", "camp1"), {
      name: "T",
      createdBy: "dm",
      dmUid: "dm",
      members: ["dm", "a"],
      memberDetails: {
        dm: { displayName: "dm", characterId: null, role: "dm" },
        a: {
          displayName: "a",
          characterId: "char-a",
          role: "player",
          character: stripUndefined(buildMemberSnapshot(hero)),
        },
      },
      status: "active",
      inviteCode: "camp1",
      encounter,
      updatedAt: 1,
    });
  });
  holder.db = testEnv.authenticatedContext("a").firestore() as unknown;
});

interface StoredCampaign {
  updatedAt: unknown;
  memberDetails: Record<string, { character: { name: string } }>;
  encounter: { currentCombatantId: string };
}

const campaign = async () =>
  (await getDoc(doc(holder.db as Firestore, "campaigns", "camp1"))).data() as
    | StoredCampaign
    | undefined;

describe("End Turn and the party card refresh", () => {
  it("a sheet save that leaves the party card unchanged writes nothing", async () => {
    const tracker = createAttachedCampaignTracker("a", "char-a");
    await refreshAttachedSheets(tracker, "a", hero);
    expect((await campaign())?.updatedAt).toBe(1);
  });

  it("a changed party card is still written, once", async () => {
    const tracker = createAttachedCampaignTracker("a", "char-a");
    const renamed = {
      ...hero,
      character: { ...hero.character, name: "Bo" },
    } as typeof hero;
    await refreshAttachedSheets(tracker, "a", renamed);
    const written = await campaign();
    expect(written?.memberDetails.a.character.name).toBe("Bo");
    const stamp = JSON.stringify(written?.updatedAt);
    await refreshAttachedSheets(tracker, "a", renamed);
    expect(JSON.stringify((await campaign())?.updatedAt)).toBe(stamp);
  });

  it("End Turn beside the sheet's save commits on its first attempt", async () => {
    const tracker = createAttachedCampaignTracker("a", "char-a");
    await tracker.ensure();
    // Warm the client so the timing below measures the transaction, not setup.
    await getDoc(doc(holder.db as Firestore, "campaigns", "camp1"));
    const started = performance.now();
    await Promise.all([
      advanceEncounterTurn("camp1", "next", { uid: "a", isDm: false }, "pc-a"),
      refreshAttachedSheets(tracker, "a", hero),
    ]);
    const ms = performance.now() - started;
    expect((await campaign())?.encounter.currentCombatantId).toBe("monster-1");
    // A retry waits at least 500 ms (the SDK's 1 s backoff, minus jitter).
    expect(ms).toBeLessThan(400);
  });
});
