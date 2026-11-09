/**
 * Concentration and the effect rows on the new Play screen (headless): the classic
 * status ledge's facts and actions, from the same functions. SRD 2024: Concentration
 * ends «if you have the Incapacitated condition», and you can end it «at any time (no
 * action required)».
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  concentrationModel,
  dropConcentration,
  effectRowAction,
  runEffectRowAction,
} from "@/domains/play/concentration-model";
import { playEffectsView } from "@/domains/play/play-effects-view";
import { concentrationValue } from "@/lib/concentration";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const cleric = (session: Partial<CharacterDoc["session"]> = {}) =>
  makeCharacterDoc(
    { classes: [{ classId: "cleric", level: 5 }] },
    { concentration: concentrationValue("bless"), ...session }
  );

describe("concentrationModel", () => {
  it("names the held spell; nothing blocks it with no condition", () => {
    expect(concentrationModel(cleric(), "en")).toMatchObject({
      spell: { id: "bless", name: "Bless" },
      blockedBy: null,
    });
  });

  it("Incapacitated breaks it: the model names the condition", () => {
    expect(
      concentrationModel(cleric({ conditions: ["incapacitated"] }), "en").blockedBy
    ).toEqual({ id: "incapacitated", name: "Incapacitated" });
  });

  it("a condition that does not break it (Prone) blocks nothing", () => {
    expect(concentrationModel(cleric({ conditions: ["prone"] }), "en").blockedBy).toBe(
      null
    );
  });

  it("not concentrating: no spell, nothing blocked", () => {
    expect(concentrationModel(cleric({ concentration: "" as const }), "en")).toEqual({
      spell: null,
      roundsLeft: null,
      blockedBy: null,
    });
  });
});

describe("dropConcentration", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(cleric());
    useUndoStore.getState().clear();
  });

  it("ends the held spell on the open sheet, and the undo brings it back", () => {
    dropConcentration();
    expect(useCharacterStore.getState().character?.session.concentration).toBe("");
    useUndoStore.getState().undo();
    expect(useCharacterStore.getState().character?.session.concentration).toBe("bless");
  });
});

describe("effect row actions", () => {
  const raging = () =>
    makeCharacterDoc(
      { classes: [{ classId: "barbarian", level: 3 }] },
      { activeFeatures: ["barbarian-rage"] }
    );

  it("the character's own buff can be ended; an ally's cannot (its caster ends it)", () => {
    const [own] = playEffectsView(raging(), "en", () => "").rows;
    if (!own) throw new Error("no row");
    expect(effectRowAction(own)).toEqual({ kind: "end", key: "barbarian-rage" });
    expect(effectRowAction({ ...own, from: "Mira" })).toBe(null);
  });

  it("ending the own buff turns its state off on the open sheet", () => {
    useCharacterStore.getState().setCharacter(raging());
    runEffectRowAction({ kind: "end", key: "barbarian-rage" });
    expect(useCharacterStore.getState().character?.session.activeFeatures ?? []).toEqual(
      []
    );
  });
});
