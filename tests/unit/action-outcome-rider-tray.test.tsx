/**
 * The tray of a spell with a save shows, on a target's row, the Disadvantage a
 * state on it gives against THIS caster's spells (a subclass feature's rider on
 * Stunning Strike). A monster rolls at the table, so the row says it. The state's
 * feature is a fixture.
 */
import { afterAll, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { classFeatureIndex } from "@/data/classes";
import type { SrdClassFeatureData } from "@/data/types";
import { incomingSaveLabel } from "@/components/shared/damage-tray-target";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import { useTrayTargets } from "@/features/character/center/use-tray-targets";
import type { DamageTrayPlan } from "@/lib/play/damage-tray";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const RIDER_ID = "test-tray-focused-strike";
const STATE = "test-tray-spell-saves";
classFeatureIndex.set(RIDER_ID, {
  id: RIDER_ID,
  class: "monk",
  level: 11,
  targetStates: [
    {
      type: "while-active",
      activeKey: STATE,
      onlyAgainstCreator: true,
      grants: [{ type: "disadvantage-on", rollType: "save", vs: "spells" }],
    },
  ],
  source: "SRD",
} as unknown as SrdClassFeatureData);
afterAll(() => {
  classFeatureIndex.delete(RIDER_ID);
});

function fight(creator: string) {
  const effect = {
    id: "e1",
    actor: { kind: "pc", combatantId: creator, memberUid: "u", characterId: "c" },
    target: { kind: "monster", combatantId: "monster-1" },
    source: { kind: "feature", id: RIDER_ID },
    payload: { kind: "grant-group", activeKey: STATE },
    duration: {
      kind: "turn-boundary",
      combatantId: creator,
      round: 3,
      phase: "turn-start",
    },
  } as ActiveCombatEffect;
  useCombatStatusStore.setState({
    status: {
      campaignId: "c1",
      myId: "pc-me",
      round: 2,
      encounter: { effectOps: [{ id: "o1", kind: "apply", effect }] },
      view: { rows: [{ id: "monster-1", kind: "monster", name: "Ogre" }] },
    } as never,
  });
}

const spellSave = {
  effect: "damage",
  save: { ability: "DEX", dc: 15, onSave: "half", bySpell: true },
  targets: ["monster-1"],
} as DamageTrayPlan;

describe("a spell's save at a target the caster's rider marked", () => {
  it("the row shows the target's Disadvantage, named for its source", () => {
    fight("pc-me");
    const { result } = renderHook(() => useTrayTargets(spellSave));
    expect(result.current[0]?.incomingSave).toEqual([
      {
        sourceKind: "feature",
        sourceId: RIDER_ID,
        mode: "disadvantage",
        consumed: false,
      },
    ]);
    // The label names the mode and the feature (a catalogue one here, for its name).
    const t = ((key: string, values?: Record<string, string>) =>
      values ? `${key}:${values.mode}:${values.source}` : key) as never;
    const chip = {
      sourceKind: "feature" as const,
      sourceId: "monk-stunning-strike",
      mode: "disadvantage" as const,
      consumed: false,
    };
    expect(incomingSaveLabel(chip, t, "en")).toBe(
      "combat.damageTray.incomingSave:common.disadvantage:Stunning Strike"
    );
  });

  it("not for another caster's spell, nor for a save that is not a spell's", () => {
    fight("pc-other");
    expect(
      renderHook(() => useTrayTargets(spellSave)).result.current[0]?.incomingSave
    ).toBeUndefined();
    fight("pc-me");
    const featureSave = {
      ...spellSave,
      save: { ability: "CON", dc: 15, onSave: "none" },
    };
    expect(
      renderHook(() => useTrayTargets(featureSave as DamageTrayPlan)).result.current[0]
        ?.incomingSave
    ).toBeUndefined();
  });
});
