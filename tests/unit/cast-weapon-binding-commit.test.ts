/**
 * A Magic Weapon cast that names a weapon binds it (SRD 5.2.1: "You touch a
 * nonmagical weapon"): lighting the state stores the pick, and the cast's undo puts
 * the prior pick back. A cast that names no weapon (no picker yet) lights the state
 * and binds nothing: nothing is shown that wasn't chosen.
 */
import { afterEach, describe, expect, it } from "vitest";

import { activateActionState } from "@/features/character/center/action-state-commit";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const magicWeapon = {
  id: "spell-magic-weapon",
  source: "spell",
  spellId: "magic-weapon",
  activatesKey: "spell-magic-weapon",
  summary: {},
} as unknown as ResolvedAction;

function load(): void {
  const doc = makeCharacterDoc({
    classId: "wizard",
    level: 5,
    spells: [{ srdId: "magic-weapon", prepared: true }],
    weapons: [{ srdId: "longsword" }, { srdId: "dagger" }] as never,
  });
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
}

const choices = () =>
  useCharacterStore.getState().character?.session.grantBundleChoices ?? {};
const lit = () => useCharacterStore.getState().character?.session.activeFeatures ?? [];

afterEach(() => {
  useCharacterStore.setState({ character: null });
  useUndoStore.getState().clear(null);
});

describe("a weapon-binding cast", () => {
  it("binds the weapon it names; its undo unbinds it", () => {
    load();
    const { restore } = activateActionState(magicWeapon, 2, {
      weapon: { kind: "srd", index: 1, srdId: "dagger" },
    });
    expect(lit()).toContain("spell-magic-weapon");
    expect(choices()["spell-magic-weapon:weapon"]).toBe("srd:1:dagger");
    restore();
    expect(lit()).not.toContain("spell-magic-weapon");
    expect(choices()["spell-magic-weapon:weapon"]).toBeUndefined();
  });

  it("names no weapon: the state lights, nothing is bound", () => {
    load();
    activateActionState(magicWeapon, 2);
    expect(lit()).toContain("spell-magic-weapon");
    expect(choices()["spell-magic-weapon:weapon"]).toBeUndefined();
  });

  it("a weapon not carried binds nothing", () => {
    load();
    activateActionState(magicWeapon, 2, {
      weapon: { kind: "srd", index: 7, srdId: "greataxe" },
    });
    expect(choices()["spell-magic-weapon:weapon"]).toBeUndefined();
  });
});
