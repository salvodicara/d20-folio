/**
 * A condition that can end early lands in the fight as a sourced effect, so the
 * fight can end it (edge-case M3): Abjure Foes' Frightened.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import { initialTrayRow, type DamageTrayPlan } from "@/lib/play/damage-tray";
import { resolveActions } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const paladin = makeCharacterDoc({
  classId: "paladin",
  level: 9,
  features: [{ srdId: "paladin-abjure-foes" }],
});

describe("sourced conditions from the tray", () => {
  beforeEach(() => {
    io.appendPersistentCombatEffect.mockClear();
    useCharacterStore.setState({ character: paladin, readonly: false });
    useCombatStatusStore.setState({
      status: {
        campaignId: "c1",
        myId: "pc-me",
        characterId: paladin.id,
        round: 2,
        view: { rows: [{ id: "monster-1", kind: "monster" }] },
      } as never,
    });
  });

  it("Abjure Foes names its source", () => {
    const abjure = resolveActions(paladin, "combat").find((a) =>
      a.id.includes("abjure-foes")
    );
    expect(abjure?.summary.conditionSource).toEqual({
      kind: "feature",
      id: "paladin-abjure-foes",
    });
  });

  it("its Frightened is written to the fight on the monster", async () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const plan = {
      effect: null,
      save: { ability: "WIS", dc: 15, onSave: "none" },
      conditions: { options: ["frightened"], pickOne: false },
    } as DamageTrayPlan;
    applyTray(
      {
        characterId: paladin.id,
        actionName: "Abjure Foes",
        source: { custom: "Abjure Foes" },
        castLogId: null,
        actionId: "abjure",
        plan,
        conditionSource: { kind: "feature", id: "paladin-abjure-foes" },
      },
      [{ id: "monster-1", name: "Ogre", kind: "monster" }],
      [initialTrayRow(plan, "monster-1")],
      [0],
      ((k: string) => k) as never
    );
    await vi.waitFor(() =>
      expect(io.appendPersistentCombatEffect).toHaveBeenCalledTimes(1)
    );
    expect(io.appendPersistentCombatEffect.mock.calls[0]).toEqual([
      "c1",
      expect.objectContaining({
        source: { kind: "feature", id: "paladin-abjure-foes", actionId: "abjure" },
        payload: { kind: "condition", conditionId: "frightened" },
        target: { kind: "monster", combatantId: "monster-1" },
        bindings: { saveDc: 15 },
      }),
    ]);
    vi.unstubAllEnvs();
  });
});
