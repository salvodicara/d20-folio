/**
 * A hit from another device lands through its target's own damage rule, read as the
 * rules read it (`effectiveDoc`): the DM hits Bren (20 HP) for 30 through the real write
 * (`writeCampaignCombatEffect`) and, with Death Ward that Mara cast on him, he drops to
 * 1 Hit Point instead of 0, whether the ward lives in the fight's effect log or in the
 * campaign's effects out of a fight. Without it he drops to 0. Before the projection,
 * the DM's hit ignored every effect others left on him. (Resistances apply earlier, in
 * the hitter's tray, from the same projection: party-stats.test.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, type Firestore } from "firebase/firestore";

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
import type { ActiveCombatEffect } from "@/types/combat-effect";
import { makeCharacterDoc } from "../unit/_helpers";

let testEnv: RulesTestEnvironment;
let brenId = "";

const as = (uid: string) =>
  (holder.db = testEnv.authenticatedContext(uid).firestore() as unknown as Firestore);

function deathWard(duration: ActiveCombatEffect["duration"]): ActiveCombatEffect {
  return {
    id: "fx-ward",
    actor: { kind: "pc", combatantId: "pc-b", memberUid: "b", characterId: "char-b" },
    target: { kind: "pc", combatantId: "pc-a", memberUid: "a", characterId: brenId },
    source: { kind: "spell", id: "death-ward", actionId: "spell-death-ward" },
    payload: { kind: "grant-group", activeKey: "spell-death-ward" },
    duration,
  };
}

async function campaign(extra: Record<string, unknown>): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "campaigns", "camp1"), {
      name: "T",
      createdBy: "dm",
      dmUid: "dm",
      members: ["dm", "a", "b"],
      memberDetails: {
        dm: { displayName: "dm", characterId: null, role: "dm" },
        a: { displayName: "a", characterId: brenId, role: "player" },
        b: { displayName: "b", characterId: "char-b", role: "player" },
      },
      status: "active",
      inviteCode: "camp1",
      ...extra,
    });
  });
}

const encounter = (effectOps: unknown[]) => ({
  nextMonsterOrdinal: 1,
  round: 2,
  currentCombatantId: "pc-b",
  order: ["pc-a", "pc-b"],
  epoch: 1,
  status: "active",
  combatants: [
    { kind: "pc", id: "pc-a", memberUid: "a", characterId: brenId },
    { kind: "pc", id: "pc-b", memberUid: "b", characterId: "char-b" },
  ],
  effectOps,
});

async function dmHitsBren(amount: number): Promise<number> {
  as("dm");
  const { after } = await writeCampaignCombatEffect("a", brenId, null, 30, {
    kind: "hp",
    operation: { kind: "damage", amount },
  });
  return after.hp.current;
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-d20folio-peer-hit",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    for (const uid of ["dm", "a", "b"])
      await setDoc(doc(ctx.firestore(), "users", uid), { status: "active" });
  });
  as("a");
  const bren = makeCharacterDoc(
    { classId: "fighter", level: 3 },
    { hp: { current: 20, temp: 0 } }
  );
  brenId = await createCharacter("a", bren);
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "users", "a", "characters", brenId), {
      attachedCampaignId: "camp1",
    });
  });
});

describe("a hit from another device reads the effects others left on its target", () => {
  it("Death Ward in the fight: the DM's 30 leaves Bren at 1", async () => {
    await campaign({
      encounter: encounter([
        {
          id: "op-bond",
          kind: "apply",
          effect: deathWard({ kind: "encounter" }),
        },
      ]),
    });
    expect(await dmHitsBren(30)).toBe(1);
  });

  it("Death Ward out of a fight (the campaign's effects): Bren stays at 1", async () => {
    await campaign({ gameClock: { minute: 0 } });
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), "campaigns", "camp1", "effects", "fx-ward"),
        deathWard({ kind: "game-clock", untilMinute: 480 })
      );
    });
    expect(await dmHitsBren(30)).toBe(1);
  });

  it("without it, Bren drops to 0", async () => {
    await campaign({});
    expect(await dmHitsBren(30)).toBe(0);
  });
});
