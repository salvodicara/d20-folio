/**
 * The roll dialogs' Advantage / Disadvantage on the new Play screen (headless), from
 * the classic rules. SRD 5.2.1 Initiative: a surprised combatant «has Disadvantage on
 * their Initiative roll». 2024 Champion Survivor: «you have Advantage on Death Saving
 * Throws».
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import {
  deathSaveRollModel,
  initiativeRollModel,
  toggleSurprise,
} from "@/domains/play/roll-dialog-state";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const t = ((key: string) => key) as unknown as TFunction;

describe("initiativeRollModel", () => {
  it("a plain roll: one d20, not surprised", () => {
    expect(initiativeRollModel(makeCharacterDoc())).toEqual({
      mode: "none",
      faces: 1,
      surprised: false,
    });
  });

  it("surprised: Disadvantage, two d20", () => {
    const doc = makeCharacterDoc({}, { activeFeatures: ["surprised"] });
    expect(initiativeRollModel(doc)).toEqual({
      mode: "disadvantage",
      faces: 2,
      surprised: true,
    });
  });

  it("the manual override still wins over Surprise", () => {
    const doc = makeCharacterDoc(
      { initiativeAdvantageOverride: "off" },
      { activeFeatures: ["surprised"] }
    );
    expect(initiativeRollModel(doc).mode).toBe("none");
  });
});

describe("toggleSurprise", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(makeCharacterDoc());
    useUndoStore.getState().clear();
  });

  it("lights Surprise on the open sheet, and the undo clears it", () => {
    toggleSurprise(t);
    const lit = useCharacterStore.getState().character;
    if (!lit) throw new Error("no sheet");
    expect(initiativeRollModel(lit).surprised).toBe(true);
    useUndoStore.getState().undo();
    const back = useCharacterStore.getState().character;
    if (!back) throw new Error("no sheet");
    expect(initiativeRollModel(back).surprised).toBe(false);
  });
});

describe("deathSaveRollModel", () => {
  it("no source: one d20", () => {
    expect(deathSaveRollModel(makeCharacterDoc())).toEqual({ mode: "none", faces: 1 });
  });

  it("the Champion's Survivor: Advantage, two d20", () => {
    const doc = makeCharacterDoc({
      classes: [{ classId: "fighter", level: 18, subclassId: "champion" }],
      features: [{ srdId: "fighter-champion-survivor" }],
    });
    expect(deathSaveRollModel(doc)).toEqual({ mode: "advantage", faces: 2 });
  });
});
