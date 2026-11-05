/**
 * A rider's condition that lasts "until the end of your next turn" (Brew Poison's
 * Poisoned) lands in the fight as a sourced effect that ends at the attacker's next
 * turn end: on the attacker's own turn that is the end of the following one, off it
 * (a Reactive Strike) the attacker's coming turn.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignIo, writesSettled } from "./__helpers__/campaign-io-writes";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

beforeAll(loadCampaignIo);

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import {
  initialTrayRow,
  toggleCondition,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc();
const plan = {
  effect: "damage",
  attack: { onMiss: "none" },
  conditions: {
    options: ["poisoned"],
    pickOne: false,
    optIn: true,
    save: { ability: "CON", dc: 14 },
    source: { kind: "feature", id: "poisoner" },
    lifetimes: { poisoned: { kind: "turn-boundary", phase: "turn-end", turns: 1 } },
  },
  targets: ["monster-1"],
} as DamageTrayPlan;

function fight(currentCombatantId: string): void {
  useCombatStatusStore.setState({
    status: {
      campaignId: "c1",
      myId: "pc-me",
      characterId: doc.id,
      round: 3,
      encounter: {
        effectOps: [],
        currentCombatantId,
        order: ["pc-me", "monster-1"],
      },
      view: { rows: [{ id: "monster-1", kind: "monster" }], turnOrderIds: [] },
    } as never,
  });
}

async function poison(): Promise<unknown> {
  io.appendPersistentCombatEffect.mockClear();
  const row = toggleCondition(initialTrayRow(plan, "monster-1"), "poisoned", plan);
  applyTray(
    {
      characterId: doc.id,
      actionName: "Shortsword",
      source: { custom: "Shortsword" },
      castLogId: null,
      actionId: "weapon-shortsword",
      plan,
    },
    [{ id: "monster-1", name: "Ogre", kind: "monster" }],
    [row],
    [7],
    ((k: string) => k) as never
  );
  await writesSettled();
  return io.appendPersistentCombatEffect.mock.calls[0];
}

describe("a rider condition's duration in the fight", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    useCharacterStore.setState({ character: doc, readonly: false });
  });

  it("on the attacker's turn: Poisoned until the end of the attacker's next turn", async () => {
    fight("pc-me");
    expect(await poison()).toEqual([
      "c1",
      expect.objectContaining({
        source: { kind: "feature", id: "poisoner", actionId: "weapon-shortsword" },
        payload: { kind: "condition", conditionId: "poisoned" },
        target: { kind: "monster", combatantId: "monster-1" },
        duration: {
          kind: "turn-boundary",
          combatantId: "pc-me",
          round: 4,
          phase: "turn-end",
        },
      }),
    ]);
  });

  it("off the attacker's turn: until the end of the attacker's coming turn", async () => {
    fight("monster-1");
    expect(await poison()).toEqual([
      "c1",
      expect.objectContaining({
        duration: {
          kind: "turn-boundary",
          combatantId: "pc-me",
          round: 4,
          phase: "turn-end",
        },
      }),
    ]);
  });
});
