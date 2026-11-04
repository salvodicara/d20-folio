/**
 * "The next attack roll against it has Advantage" (edge-case M17): a state on a
 * target that the next attack spends. Guiding Bolt's hit puts one there; Stunning
 * Strike's successful save another; Faerie Fire's lasts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  reinstatePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { applyTray } from "@/features/character/center/apply-tray";
import { effectIdsConsumedByAttack, incomingAttackModes } from "@/lib/combat-effects";
import {
  initialTrayRow,
  setAttackOutcome,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { resolveActions } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

const ME = "pc-me";

function on(
  target: string,
  source: ActiveCombatEffect["source"],
  activeKey: string,
  id = `${activeKey}-${target}`
): CombatEffectOp {
  return {
    id: `op-${id}`,
    kind: "apply",
    effect: {
      id,
      actor: { kind: "pc", combatantId: "pc-ally", memberUid: "ally", characterId: "c2" },
      target: { kind: "monster", combatantId: target },
      source,
      payload: { kind: "grant-group", activeKey },
      duration: { kind: "encounter" },
    },
  };
}

const glimmer = on(
  "monster-1",
  { kind: "spell", id: "guiding-bolt", actionId: "x" },
  "guiding-bolt-glimmer"
);
const faerie = on(
  "monster-1",
  { kind: "spell", id: "faerie-fire", actionId: "x" },
  "spell-faerie-fire"
);

describe("incoming attack modes", () => {
  it("Guiding Bolt's Advantage is spent by the next attack; a lasting one is not", () => {
    const modes = incomingAttackModes([glimmer], "monster-1", ME);
    expect(modes).toEqual([
      expect.objectContaining({
        sourceId: "guiding-bolt",
        mode: "advantage",
        consumed: true,
      }),
    ]);
    expect(effectIdsConsumedByAttack([glimmer], "monster-1", ME)).toEqual([
      "guiding-bolt-glimmer-monster-1",
    ]);
    expect(effectIdsConsumedByAttack([glimmer], "monster-2", ME)).toEqual([]);
  });

  it("Stunning Strike's exposed target is spent too", () => {
    const exposed = on(
      "monster-1",
      { kind: "feature", id: "monk-stunning-strike", actionId: "x" },
      "monk-stunning-strike-exposed"
    );
    expect(incomingAttackModes([exposed], "monster-1", ME)[0]?.consumed).toBe(true);
  });

  it("Guiding Bolt's hit carries the state for the tray to write", () => {
    const cleric = makeCharacterDoc({
      classId: "cleric",
      level: 3,
      spells: [{ srdId: "guiding-bolt", prepared: true }] as never,
    });
    const bolt = resolveActions(cleric, "combat").find(
      (a) => a.spellId === "guiding-bolt"
    );
    expect(bolt?.summary.targetStateSource).toEqual({
      kind: "spell",
      id: "guiding-bolt",
    });
    expect(bolt?.summary.hitEffects?.map((e) => e.activeKey)).toEqual([
      "guiding-bolt-glimmer",
    ]);
  });
});

describe("the tray spends it", () => {
  const plan = {
    effect: "damage",
    damageType: "slashing",
    attack: { onMiss: "none" },
  } as DamageTrayPlan;
  const target = { id: "monster-1", name: "Ogre", kind: "monster" as const };
  const offer = {
    characterId: "c1",
    actionName: "Longsword",
    source: { custom: "Longsword" },
    castLogId: null,
    actionId: "weapon-longsword",
    plan,
  };
  const t = ((k: string) => k) as never;

  beforeEach(() => {
    io.appendPersistentCombatEffect.mockClear();
    io.revokePersistentCombatEffect.mockClear();
    useCharacterStore.setState({ character: makeCharacterDoc(), readonly: false });
    useCombatStatusStore.setState({
      status: {
        campaignId: "c1",
        myId: ME,
        characterId: "c1",
        round: 2,
        encounter: { effectOps: [glimmer, faerie] },
        view: { rows: [{ id: "monster-1", kind: "monster" }] },
      } as never,
    });
  });

  it("an attack, hit or miss, revokes the spent state, and undo brings it back", async () => {
    const row = setAttackOutcome(initialTrayRow(plan, "monster-1"), "miss", plan);
    applyTray(offer, [target], [row], [0], t);
    await vi.waitFor(() =>
      expect(io.revokePersistentCombatEffect).toHaveBeenCalledWith(
        "c1",
        "guiding-bolt-glimmer-monster-1"
      )
    );
    // Faerie Fire lasts.
    expect(io.revokePersistentCombatEffect).toHaveBeenCalledTimes(1);
    useUndoStore.getState().undo();
    await vi.waitFor(() =>
      expect(io.appendPersistentCombatEffect).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({
          payload: { kind: "grant-group", activeKey: "guiding-bolt-glimmer" },
        })
      )
    );
  });

  it("on the v0.26.0 rules, undo reinstates the same occurrence", async () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const row = setAttackOutcome(initialTrayRow(plan, "monster-1"), "hit", plan);
    applyTray(offer, [target], [row], [0], t);
    await vi.waitFor(() => expect(io.revokePersistentCombatEffect).toHaveBeenCalled());
    useUndoStore.getState().undo();
    await vi.waitFor(() =>
      expect(io.reinstatePersistentCombatEffect).toHaveBeenCalledWith(
        "c1",
        "guiding-bolt-glimmer-monster-1"
      )
    );
    vi.unstubAllEnvs();
  });
});
