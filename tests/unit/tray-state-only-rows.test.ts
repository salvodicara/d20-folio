/**
 * A tray whose only outcome is a state (Bane: no damage, no condition) writes it on
 * the rows that failed their save, and on a hit row of an attack that deals nothing:
 * a row that applies "nothing else" still carries its state.
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
import { initialTrayRow, type DamageTrayPlan } from "@/lib/play/damage-tray";
import { useCharacterStore } from "@/stores/characterStore";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

const cleric = makeCharacterDoc({ classId: "cleric", level: 5 });
const stateOn = (targetId: string): ActiveCombatEffect[] => [
  {
    id: `fx-${targetId}`,
    actor: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: cleric.id },
    target: { kind: "monster", combatantId: targetId },
    source: { kind: "spell", id: "bane", actionId: "cast" },
    payload: { kind: "grant-group", activeKey: "spell-bane" },
    duration: { kind: "concentration", actorId: "pc-me", sourceId: "bane" },
  },
];

describe("a tray whose outcome is only a state", () => {
  beforeEach(() => {
    io.appendPersistentCombatEffect.mockClear();
    useCharacterStore.setState({ character: cleric, readonly: false });
    useCombatStatusStore.setState({
      status: {
        campaignId: "c1",
        myId: "pc-me",
        characterId: cleric.id,
        round: 2,
        encounter: { effectOps: [] },
        view: {
          rows: [
            { id: "m-1", kind: "monster" },
            { id: "m-2", kind: "monster" },
          ],
        },
      } as never,
    });
  });

  it("writes Bane's state on the target that failed, not on the one that saved", async () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const plan = {
      effect: null,
      save: { ability: "CHA", dc: 13, onSave: "none" },
      targets: ["m-1", "m-2"],
    } as DamageTrayPlan;
    const failed = initialTrayRow(plan, "m-1");
    const saved = { ...initialTrayRow(plan, "m-2"), saved: true };
    applyTray(
      {
        characterId: cleric.id,
        actionName: "Bane",
        source: { custom: "Bane" },
        castLogId: null,
        actionId: "cast",
        plan,
        onFailed: stateOn,
      },
      [
        { id: "m-1", name: "Goblin", kind: "monster" },
        { id: "m-2", name: "Orc", kind: "monster" },
      ],
      [failed, saved],
      [0, 0],
      ((key: string) => key) as never
    );
    await writesSettled();
    const targets = io.appendPersistentCombatEffect.mock.calls.map(
      (call) => (call as unknown as [string, ActiveCombatEffect])[1].target.combatantId
    );
    expect(targets).toEqual(["m-1"]);
  });

  it("writes a hit's state even when the attack deals nothing", async () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const plan = {
      effect: null,
      attack: { onMiss: "none" },
      targets: ["m-1", "m-2"],
    } as DamageTrayPlan;
    const hit = { ...initialTrayRow(plan, "m-1"), attack: "hit" as const };
    const miss = { ...initialTrayRow(plan, "m-2"), attack: "miss" as const };
    applyTray(
      {
        characterId: cleric.id,
        actionName: "Ray",
        source: { custom: "Ray" },
        castLogId: null,
        actionId: "cast",
        plan,
        onHit: stateOn,
      },
      [
        { id: "m-1", name: "Goblin", kind: "monster" },
        { id: "m-2", name: "Orc", kind: "monster" },
      ],
      [hit, miss],
      [0, 0],
      ((key: string) => key) as never
    );
    await writesSettled();
    const targets = io.appendPersistentCombatEffect.mock.calls.map(
      (call) => (call as unknown as [string, ActiveCombatEffect])[1].target.combatantId
    );
    expect(targets).toEqual(["m-1"]);
  });

  it("a willing ally makes no save and takes the state", async () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const plan = {
      effect: null,
      willing: true,
      save: { ability: "CON", dc: 13, onSave: "none" },
      targets: ["m-1"],
    } as DamageTrayPlan;
    applyTray(
      {
        characterId: cleric.id,
        actionName: "Enlarge",
        source: { custom: "Enlarge" },
        castLogId: null,
        actionId: "cast",
        plan,
        onFailed: stateOn,
      },
      [{ id: "m-1", name: "Wolf", kind: "monster" }],
      [{ ...initialTrayRow(plan, "m-1"), willing: true }],
      [0],
      ((key: string) => key) as never
    );
    await writesSettled();
    expect(io.appendPersistentCombatEffect).toHaveBeenCalledTimes(1);
  });
});
