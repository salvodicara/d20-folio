/**
 * Gift of the Protectors through the store (the rules session's #402 declares it as
 * an `at-zero-hp-interrupt` grant on a once-per-Long-Rest counter): "reduced to 0 Hit
 * Points but not killed outright, the creature magically drops to 1 Hit Point
 * instead. Once this magic is triggered, no creature can benefit from it until you
 * finish a Long Rest." The store's generic zero-HP interrupt applies it.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

const GIFT = "invocation:gift-of-the-protectors";
const store = () => useCharacterStore.getState();

function warlockAtZero(): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.id = `gift-${Math.random().toString(36).slice(2)}`;
  doc.character.classes = [
    {
      classId: "warlock",
      level: 9,
      invocationChoices: ["pact-of-the-tome", "gift-of-the-protectors"],
    },
  ] as never;
  doc.character.features = [];
  doc.session.trackers = {};
  doc.session.conditions = [];
  doc.session.concentration = "";
  doc.session.hp = { current: 0, temp: 0 };
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
  return doc;
}

describe("Gift of the Protectors", () => {
  beforeEach(() => useCharacterStore.setState({ character: null }));

  it("at 0 HP the warlock drops to 1 HP instead, and the gift is spent", () => {
    warlockAtZero();
    store().applyAtZeroHpInterrupt(GIFT);
    expect(store().character?.session.hp.current).toBe(1);
    expect(store().character?.session.trackers[GIFT]?.used).toBe(1);
  });

  it("once triggered, it can't save anyone again until a Long Rest", () => {
    warlockAtZero();
    store().applyAtZeroHpInterrupt(GIFT);
    store().setHP(0);
    store().applyAtZeroHpInterrupt(GIFT);
    expect(store().character?.session.hp.current).toBe(0);
    // Back on their feet, a Long Rest brings it back.
    store().setHP(5);
    store().longRest();
    expect(store().character?.session.trackers[GIFT]?.used ?? 0).toBe(0);
  });
});
