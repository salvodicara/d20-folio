import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/storage", () => ({ deleteCampaignBanner: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  arrayRemove: vi.fn(),
  arrayUnion: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  getDocsFromServer: vi.fn(),
  increment: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => ({})),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock("@/lib/resolve-grant-sources", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/resolve-grant-sources")>();
  return {
    ...original,
    resolveCombatEffectGrants: () => [
      {
        type: "damage-retaliation" as const,
        amount: 5,
        damageType: "cold" as const,
      },
    ],
  };
});

import { reduceDirectPcEffects } from "@/features/campaigns/campaign-io";
import { NO_DEFENSES } from "@/lib/damage-intake";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const armor: ActiveCombatEffect = {
  id: "armor-1",
  actor: { kind: "monster", combatantId: "warlock" },
  target: { kind: "monster", combatantId: "warlock" },
  source: {
    kind: "spell",
    id: "armor-of-agathys",
    actionId: "spell-armor-of-agathys",
  },
  payload: { kind: "grant-group", activeKey: "spell-armor-of-agathys" },
  duration: { kind: "encounter" },
};

const target = {
  targetId: "warlock",
  memberUid: "warlock-user",
  characterId: "warlock-character",
  currentHp: 18,
  tempHp: 5,
  maxHp: 18,
  conditions: [],
  defenses: NO_DEFENSES,
};

describe("campaign reactive effects", () => {
  it("queues exact retaliation even when a successful melee hit lands 0 damage", () => {
    const result = reduceDirectPcEffects(
      target,
      [{ kind: "damage", intake: "resolved", targetId: "warlock", amount: 0 }],
      {
        actorId: "fighter",
        action: { custom: "Unarmed Strike" },
        round: 2,
        persistentEffects: [armor],
        hit: {
          attacker: { kind: "monster", combatantId: "fighter" },
          attackMode: "melee",
        },
      }
    );

    expect(result?.transfers).toEqual([
      {
        target: { kind: "monster", combatantId: "fighter" },
        amount: 5,
        effectId: "armor-1",
        intake: "raw",
        actorId: "warlock",
        action: {
          srd: { kind: "spell", key: "armor-of-agathys", field: "name" },
        },
        damageType: "cold",
        damageSource: "spell",
      },
    ]);
  });

  it("revokes a temp-HP-bound effect when a stronger pool replaces it", () => {
    const result = reduceDirectPcEffects(
      target,
      [{ kind: "temp-hp", targetId: "warlock", amount: 9 }],
      {
        actorId: "cleric",
        action: { custom: "Fortify" },
        round: 2,
        persistentEffects: [armor],
      }
    );

    expect(result?.hp.temp).toBe(9);
    expect(result?.consumedEffectIds).toEqual(["armor-1"]);
  });
});
