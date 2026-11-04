/**
 * The encounter-effects projection is written from a listener effect on every
 * render of the global combat mount. Writing the same projection again must not
 * publish a new character, or a subscriber to the character re-renders the mount,
 * the effect writes again, and React stops with "Maximum update depth exceeded".
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import type { ActiveCombatEffect } from "@/types/combat-effect";

function effect(id: string): ActiveCombatEffect {
  return {
    id,
    actor: { kind: "monster", combatantId: "monster-1" },
    target: {
      kind: "pc",
      combatantId: "pc-me",
      memberUid: "me",
      characterId: MOCK_CHARACTER.id,
    },
    source: { kind: "spell", id: "web", actionId: "web" },
    payload: { kind: "grant-group", activeKey: "web" },
    duration: { kind: "encounter" },
  };
}

const store = () => useCharacterStore.getState();

beforeEach(() => {
  useCharacterStore.setState({
    character: structuredClone(MOCK_CHARACTER),
    readonly: false,
    encounterEffectProjection: null,
  });
});

describe("setEncounterEffects", () => {
  it("publishes nothing when the projection is unchanged", () => {
    store().setEncounterEffects(MOCK_CHARACTER.id, [effect("a")]);
    const first = store().character;
    // The listener rebuilds equal effects as new objects on every run.
    store().setEncounterEffects(MOCK_CHARACTER.id, [effect("a")]);
    expect(store().character).toBe(first);
    store().setEncounterEffects(null);
    const cleared = store().character;
    store().setEncounterEffects(null);
    expect(store().character).toBe(cleared);
  });

  it("publishes a new character when the projection changes", () => {
    store().setEncounterEffects(MOCK_CHARACTER.id, [effect("a")]);
    const first = store().character;
    store().setEncounterEffects(MOCK_CHARACTER.id, [effect("b")]);
    expect(store().character).not.toBe(first);
  });
});
