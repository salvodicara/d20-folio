/**
 * "Ends early if you deal damage" fires (Invisibility, Sanctuary, Potion of
 * Invisibility): the tray that lands your damage on another creature performs the
 * `deal-damage` act, and every act you perform also ends the effects others left on
 * you that end on it (an ally's Invisibility on you ends when you attack).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignIo } from "./__helpers__/campaign-io-writes";

vi.mock("@/features/campaigns/campaign-io", () => ({
  writeCampaignCombatEffect: vi.fn(() =>
    Promise.resolve({ before: {}, after: {}, spends: [], retaliations: [] })
  ),
}));
beforeAll(loadCampaignIo);

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import { concentrationValue } from "@/lib/concentration";
import { effectIdsEndingOnAct } from "@/lib/combat-effects";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { MOCK_CHARACTER } from "@/lib/mock";
import { initialTrayRow, type DamageTrayPlan } from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import type { CombatEffectOp } from "@/types/combat-effect";

const invisible = (): CharacterDoc => ({
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    spells: [{ srdId: "invisibility", prepared: true }],
  },
  session: {
    ...MOCK_CHARACTER.session,
    concentration: concentrationValue("invisibility"),
    activeFeatures: ["spell-invisibility"],
    conditions: ["invisible"],
    effectTimers: {},
  },
});

const hitGoblin = (amount: number) => {
  const plan = { effect: "damage", damageType: "slashing" } as DamageTrayPlan;
  applyTray(
    {
      characterId: MOCK_CHARACTER.id,
      actionName: "Dagger",
      source: { custom: "Dagger" },
      castLogId: null,
      actionId: "weapon-dagger",
      plan,
    },
    [{ id: "monster-1", name: "Goblin", kind: "monster" }],
    [initialTrayRow(plan, "monster-1")],
    [amount],
    ((key: string) => key) as never
  );
};

beforeEach(() => {
  useCombatStatusStore.setState({ status: null });
  useCharacterStore.setState({ character: invisible(), readonly: false });
  useCharacterStore.getState().setStateEndingActSink(null);
});

describe("dealing damage ends what ends on it", () => {
  it("your damage on a goblin ends your Invisibility", () => {
    hitGoblin(4);
    const session = useCharacterStore.getState().character?.session;
    expect(session && effectiveSessionConditions(session)).not.toContain("invisible");
    expect(session?.concentration).toBe("");
  });

  it("a tray that deals nothing ends nothing", () => {
    hitGoblin(0);
    expect(useCharacterStore.getState().character?.session.conditions).toContain(
      "invisible"
    );
  });

  it("every act reaches the effects others left on you, ending on it or not", () => {
    const sink = vi.fn();
    useCharacterStore.getState().setStateEndingActSink(sink);
    useCharacterStore.setState({ character: { ...MOCK_CHARACTER } });
    useCharacterStore.getState().performAct("attack-roll");
    expect(sink).toHaveBeenCalledWith("attack-roll");
  });
});

describe("an ally's Invisibility on you ends on your act", () => {
  const cast: CombatEffectOp = {
    id: "op-1",
    kind: "apply",
    effect: {
      id: "inv-1",
      actor: {
        kind: "pc",
        combatantId: "pc-ally",
        memberUid: "ally",
        characterId: "c-ally",
      },
      target: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: "c-me" },
      source: { kind: "spell", id: "invisibility", actionId: "spell-invisibility" },
      payload: { kind: "condition", conditionId: "invisible" },
      duration: { kind: "encounter" },
    },
  };

  for (const act of ["attack-roll", "cast-spell", "deal-damage"] as const) {
    it(`on your ${act}`, () => {
      expect(effectIdsEndingOnAct([cast], "pc-me", act)).toEqual(["inv-1"]);
    });
  }

  it("not on someone else's, nor on a loud noise", () => {
    expect(effectIdsEndingOnAct([cast], "pc-other", "attack-roll")).toEqual([]);
    expect(effectIdsEndingOnAct([cast], "pc-me", "loud-noise")).toEqual([]);
  });
});
