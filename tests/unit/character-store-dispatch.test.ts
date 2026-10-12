/** The store's one `dispatch`: applies a play event, returns its undo, and refuses a read-only sheet. */
import { describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";

function load(readonly: boolean) {
  const doc = structuredClone(MOCK_CHARACTER);
  delete doc.session.familiar;
  useCharacterStore.setState({ character: doc, loading: false, error: null, readonly });
  return doc;
}

describe("characterStore.dispatch", () => {
  it("applies the event and its undo restores the exact prior character", () => {
    const before = load(false);
    const undo = useCharacterStore.getState().dispatch({
      kind: "summon-familiar",
      monsterId: "owl",
      creatureType: "fey",
      maxHp: 1,
    });
    expect(useCharacterStore.getState().character?.session.familiar).toEqual({
      monsterId: "owl",
      creatureType: "fey",
    });
    undo?.();
    expect(useCharacterStore.getState().character).toBe(before);
  });

  it("an event that changes nothing leaves the character and returns null", () => {
    const before = load(false);
    expect(
      useCharacterStore.getState().dispatch({ kind: "dismiss-familiar" })
    ).toBeNull();
    expect(useCharacterStore.getState().character).toBe(before);
  });

  it("a read-only sheet refuses every event", () => {
    const before = load(true);
    expect(
      useCharacterStore
        .getState()
        .dispatch({ kind: "toggle-pin", actionId: "x", defaultPinned: false })
    ).toBeNull();
    expect(useCharacterStore.getState().character).toBe(before);
  });

  it("the wrapped actions route through it", () => {
    load(false);
    const { togglePinnedAction, setCompanionHp, setActiveSpellCastLevel } =
      useCharacterStore.getState();
    togglePinnedAction("fireball");
    setCompanionHp("steel-defender", -4);
    setActiveSpellCastLevel("haste", 4);
    const session = useCharacterStore.getState().character?.session;
    expect(session?.pinnedActions).toContain("fireball");
    expect(session?.companionHp?.["steel-defender"]).toEqual({ current: 0 });
  });
});
