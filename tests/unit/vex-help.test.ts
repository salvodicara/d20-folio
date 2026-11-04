/**
 * Vex and Help (edge-case M17): a state on the enemy that one creature's next attack
 * spends. Vex: the attacker that hit. Help: the ally the helper named.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCampaignIo, writesSettled } from "./__helpers__/campaign-io-writes";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

beforeAll(loadCampaignIo);

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import {
  fightSideOf,
  giveHelp,
  helpEffect,
  vexWriter,
} from "@/features/character/center/outcome-offer";
import { effectIdsConsumedByAttack, incomingAttackModes } from "@/lib/combat-effects";
import type { CombatEffectOp } from "@/types/combat-effect";

const op = (effect: CombatEffectOp & { kind: "apply" }) => effect;

beforeEach(() => {
  io.appendPersistentCombatEffect.mockClear();
  useCombatStatusStore.setState({
    status: {
      campaignId: "c1",
      myId: "pc-me",
      characterId: "c1",
      round: 3,
      encounter: { effectOps: [] },
      view: { rows: [{ id: "goblin", kind: "monster" }] },
    } as never,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("Vex", () => {
  it("a hit leaves Advantage for the attacker's next attack against that creature only", () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const write = vexWriter(
      { id: "weapon-rapier", masteryRiders: [{ id: "vex" }] },
      "c1"
    );
    const [vexed] = write?.("goblin") ?? [];
    if (!vexed) throw new Error("no Vex state");
    const ops = [op({ id: "op-1", kind: "apply", effect: vexed })];
    expect(incomingAttackModes(ops, "goblin", "pc-me")).toEqual([
      expect.objectContaining({
        sourceId: "mastery-vex",
        mode: "advantage",
        consumed: true,
      }),
    ]);
    expect(incomingAttackModes(ops, "goblin", "pc-ally")).toEqual([]);
    expect(vexed.duration).toEqual({
      kind: "turn-boundary",
      combatantId: "pc-me",
      round: 4,
      phase: "turn-end",
    });
  });

  it("no Vex state from a weapon without it, or before the v0.26.0 rules", () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    expect(
      vexWriter({ id: "w", masteryRiders: [{ id: "topple" }] }, "c1")
    ).toBeUndefined();
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "");
    expect(vexWriter({ id: "w", masteryRiders: [{ id: "vex" }] }, "c1")).toBeUndefined();
  });
});

describe("Help", () => {
  const help = helpEffect({
    helper: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: "c1" },
    enemy: { kind: "monster", combatantId: "goblin" },
    round: 3,
    effectId: "help-1",
  });
  const ops = [op({ id: "op-h", kind: "apply", effect: help })];

  it("is spent by the next attack of any of the helper's allies, not the helper's own", () => {
    expect(effectIdsConsumedByAttack(ops, "goblin", "pc-ally")).toEqual(["help-1"]);
    expect(effectIdsConsumedByAttack(ops, "goblin", "pc-other")).toEqual(["help-1"]);
    expect(incomingAttackModes(ops, "goblin", "pc-me")).toEqual([]);
    // Another enemy attacking the goblin gets nothing.
    expect(incomingAttackModes(ops, "goblin", "orc")).toEqual([]);
    expect(help.duration).toMatchObject({
      combatantId: "pc-me",
      round: 4,
      phase: "turn-start",
    });
  });

  it("an allied summon counts as one of the helper's allies", () => {
    const sideOf = fightSideOf([
      { id: "pc-me", kind: "pc" },
      { id: "wolf", kind: "monster", side: "ally" },
      { id: "goblin", kind: "monster" },
    ]);
    expect(effectIdsConsumedByAttack(ops, "goblin", "wolf", sideOf)).toEqual(["help-1"]);
  });

  it("giveHelp writes it in a fight on the v0.26.0 rules, and its undo takes it back", async () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const undo = giveHelp("goblin", "c1");
    expect(undo).not.toBeNull();
    await writesSettled();
    expect(io.appendPersistentCombatEffect).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({
        target: { kind: "monster", combatantId: "goblin" },
        payload: { kind: "grant-group", activeKey: "helped-against" },
      })
    );
    undo?.();
    await writesSettled();
    expect(io.revokePersistentCombatEffect).toHaveBeenCalled();
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "");
    expect(giveHelp("goblin", "c1")).toBeNull();
  });
});
