/**
 * Smite of Protection (SRD 5.2.1 Oath of Devotion 15): "Whenever you cast Divine
 * Smite, you and your allies have Half Cover while in your Aura of Protection. The
 * aura has this benefit until the start of your next turn." Casting Divine Smite
 * lights the state with its next-turn-start end; casting again re-arms it; the cast's
 * undo takes back exactly what the cast did. A Paladin below 15 lights nothing.
 */
import { afterEach, describe, expect, it } from "vitest";

import { activateActionState } from "@/features/character/center/action-state-commit";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const KEY = "paladin-devotion-smite-of-protection";
const divineSmite = {
  id: "spell-divine-smite",
  source: "spell",
  spellId: "divine-smite",
  summary: {},
} as unknown as ResolvedAction;

function load(level: number): void {
  const doc = makeCharacterDoc({
    classes: [{ classId: "paladin", level, subclassId: "oath-of-devotion" }],
    // The sheet carries the features its level has earned.
    features: level >= 15 ? [{ srdId: KEY }] : [],
    spells: [{ srdId: "divine-smite", prepared: true }],
  });
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
}

const session = () => useCharacterStore.getState().character?.session;

afterEach(() => {
  useCharacterStore.setState({ character: null });
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
});

describe("a cast that lights another state", () => {
  it("Divine Smite lights Smite of Protection until your next turn starts; undo takes it back", () => {
    load(15);
    const round = useCombatStore.getState().round;
    const { restore } = activateActionState(divineSmite, 1);
    expect(session()?.activeFeatures).toContain(KEY);
    expect(session()?.effectBoundaries?.[KEY]).toEqual({
      round: round + 1,
      phase: "turn-start",
    });
    restore();
    expect(session()?.activeFeatures ?? []).not.toContain(KEY);
    expect(session()?.effectBoundaries?.[KEY]).toBeUndefined();
  });

  it("casting again while lit re-arms the end; its undo leaves the earlier cast's state lit", () => {
    load(15);
    activateActionState(divineSmite, 1);
    useCombatStore.setState({ round: useCombatStore.getState().round + 1 });
    const round = useCombatStore.getState().round;
    const { restore } = activateActionState(divineSmite, 1);
    expect(session()?.effectBoundaries?.[KEY]).toEqual({
      round: round + 1,
      phase: "turn-start",
    });
    restore();
    expect(session()?.activeFeatures).toContain(KEY);
    expect(session()?.effectBoundaries?.[KEY]).toEqual({ round, phase: "turn-start" });
  });

  it("a Paladin below 15 lights nothing", () => {
    load(5);
    activateActionState(divineSmite, 1);
    expect(session()?.activeFeatures ?? []).not.toContain(KEY);
  });
});
