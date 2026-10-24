/**
 * Relentless Hunter (SRD 5.2.1 Ranger 13): "Taking damage can't break your
 * Concentration on Hunter's Mark." Damage queues no Concentration save while Hunter's
 * Mark is the held spell, through both damage seams of the store. Any other spell
 * still asks, and 0 Hit Points still ends Concentration outright.
 */
import { afterEach, describe, expect, it } from "vitest";

import { concentrationValue } from "@/lib/concentration";
import { characterTrackerSeeds, characterWorldState } from "@/lib/mechanics-world-store";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function ranger(spell: string): CharacterDoc {
  const doc = makeCharacterDoc(
    {
      classId: "ranger",
      level: 13,
      features: [{ srdId: "ranger-relentless-hunter" }],
      spells: [
        { srdId: "hunters-mark", prepared: true },
        { srdId: "spike-growth", prepared: true },
      ],
    },
    { concentration: concentrationValue(spell), hp: { current: 60, temp: 0 } }
  );
  const world = characterWorldState(
    doc,
    "test-uid",
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  if (world) doc.session = { ...doc.session, world: structuredClone(world) };
  return doc;
}

function load(doc: CharacterDoc): void {
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
    combatPersistence: null,
    combatPendingConcentrationSaves: [],
  });
}

const pending = () => useCharacterStore.getState().combatPendingConcentrationSaves;

afterEach(() => {
  useCharacterStore.setState({ character: null, combatPendingConcentrationSaves: [] });
  useUndoStore.getState().clear(null);
  useToastStore.setState({ toasts: [], timers: {} });
});

describe("Relentless Hunter", () => {
  it("damage on Hunter's Mark asks no Concentration save (both damage seams)", () => {
    load(ranger("hunters-mark"));
    useCharacterStore.getState().applyDamage(12);
    expect(pending()).toEqual([]);
    useCharacterStore.getState().queueConcentrationSaveForDamage(12);
    expect(pending()).toEqual([]);
    expect(useCharacterStore.getState().character?.session.concentration).toBe(
      "hunters-mark"
    );
  });

  it("any other spell still asks", () => {
    load(ranger("spike-growth"));
    useCharacterStore.getState().applyDamage(12);
    expect(pending()).toHaveLength(1);
    useCharacterStore.getState().queueConcentrationSaveForDamage(12);
    expect(pending()).toHaveLength(2);
  });

  it("0 Hit Points still ends Hunter's Mark", () => {
    load(ranger("hunters-mark"));
    useCharacterStore.getState().applyDamage(60);
    expect(useCharacterStore.getState().character?.session.concentration).toBe("");
  });
});
