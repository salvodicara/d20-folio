/**
 * Post-roll sources on the d20 tests the app judges itself (death saves, Concentration
 * saves): what a character may add to the entered roll, read in one seam
 * (`postRollSources`). Cases from the 2024 text:
 *
 * - Bardic Inspiration: «Once within the next hour when the creature fails a D20 Test,
 *   the creature can roll the Bardic Inspiration die and add the number rolled to the
 *   d20, potentially turning the failure into a success.»
 * - A paid Advantage on your own d20 test (the shape a Luck Point takes): opted into
 *   at the roll, it makes the test take two faces and keep the higher.
 *
 * Engine only: no caller passes a post-roll use yet, so every entered save resolves
 * exactly as before (the last block pins that).
 */
import { describe, expect, it } from "vitest";

import {
  BARDIC_INSPIRATION_DIE_SOURCE,
  concentrationSaveD20Context,
  deathSaveD20Context,
  enteredD20FaceCount,
  postRollSources,
  resolveCharacterConcentrationSave,
  resolveCharacterDeathSave,
} from "@/lib/character-d20-tests";
import { concentrationSaveDc } from "@/lib/compute";
import { concentrationValue } from "@/lib/concentration";
import type { ActionRollEffect } from "@/data/types";
import type { CharacterDoc } from "@/types/character";
import type { PendingConcentrationSave } from "@/types/combat-state";

import { makeCharacterDoc } from "./_helpers";

/** A wizard with CON 10 and no CON save proficiency: the save is the bare d20. */
function wizard(session: Partial<CharacterDoc["session"]> = {}): CharacterDoc {
  return makeCharacterDoc(
    {
      classes: [{ classId: "wizard", level: 5 }],
      abilityScores: { STR: 8, DEX: 14, CON: 10, INT: 16, WIS: 12, CHA: 10 },
      savingThrows: ["INT", "WIS"],
    },
    { concentration: concentrationValue("bless"), ...session }
  );
}

const pending = (doc: CharacterDoc): PendingConcentrationSave => ({
  id: "save-1",
  spell: concentrationValue(doc.session.concentration),
  damage: 30,
  difficultyClass: concentrationSaveDc(30), // 15
});

/** A sheet action that pays for Advantage on your own saves (a Luck Point's shape). */
const paidAdvantage: { id: string; summary: { rollEffect: ActionRollEffect } } = {
  id: "luck-advantage",
  summary: { rollEffect: { kind: "advantage", rolls: ["save", "check", "attack"] } },
};
const rerollOnly: { id: string; summary: { rollEffect: ActionRollEffect } } = {
  id: "indomitable",
  summary: { rollEffect: { kind: "reroll", rolls: ["save"], whose: "self" } },
};

describe("postRollSources: what a character may add after the roll", () => {
  it("a held Bardic Inspiration die is one optional entered die of its size", () => {
    const sources = postRollSources(wizard({ bardicInspirationDie: "d8" }));
    expect(sources.enteredModifiers).toEqual([
      {
        kind: "dice-formula",
        formula: {
          terms: [
            {
              kind: "dice",
              count: { kind: "fixed", value: 1 },
              operation: "add",
              sides: 8,
              termId: BARDIC_INSPIRATION_DIE_SOURCE,
            },
          ],
        },
        required: false,
        sourceId: BARDIC_INSPIRATION_DIE_SOURCE,
      },
    ]);
  });

  it("no die held, nothing to add", () => {
    expect(postRollSources(wizard()).enteredModifiers).toEqual([]);
  });

  it("an action that pays for Advantage on your own saves is an opt-in; a reroll is not", () => {
    expect(
      postRollSources(wizard(), [paidAdvantage, rerollOnly]).advantageOptIns
    ).toEqual(["luck-advantage"]);
  });
});

describe("Bardic Inspiration turns a failed save into a success", () => {
  it("Concentration: a 12 fails DC 15; the same 12 plus a 4 on the d8 passes", () => {
    const doc = wizard({ bardicInspirationDie: "d8" });
    expect(
      resolveCharacterConcentrationSave(doc, pending(doc), [12]).outcome.status
    ).toBe("failure");
    const helped = resolveCharacterConcentrationSave(
      doc,
      pending(doc),
      [12],
      [],
      undefined,
      {
        enteredModifierFaces: { [BARDIC_INSPIRATION_DIE_SOURCE]: [4] },
      }
    );
    expect(helped.outcome.status).toBe("success");
    expect(helped.total).toBe(16);
  });

  it("Death save: an 8 fails; the same 8 plus a 3 on the d6 succeeds", () => {
    const doc = wizard({ bardicInspirationDie: "d6", hp: { current: 0, temp: 0 } });
    expect(resolveCharacterDeathSave(doc, [8]).outcome.status).toBe("failure");
    const helped = resolveCharacterDeathSave(doc, [8], [], {
      enteredModifierFaces: { [BARDIC_INSPIRATION_DIE_SOURCE]: [3] },
    });
    expect(helped.outcome.status).toBe("success");
  });

  it("with no die held, a die face entered for it is refused", () => {
    const doc = wizard();
    expect(() =>
      resolveCharacterConcentrationSave(doc, pending(doc), [12], [], undefined, {
        enteredModifierFaces: { [BARDIC_INSPIRATION_DIE_SOURCE]: [4] },
      })
    ).toThrow();
  });
});

describe("a paid Advantage on your own save", () => {
  it("opted in, the save takes two faces and keeps the higher", () => {
    const doc = wizard();
    const result = resolveCharacterConcentrationSave(
      doc,
      pending(doc),
      [3, 17],
      [],
      undefined,
      { advantage: { sourceId: "luck-advantage", actions: [paidAdvantage] } }
    );
    expect(result.mode).toBe("advantage");
    expect(result.outcome.status).toBe("success");
  });

  it("an Advantage the sheet has no action for is refused", () => {
    const doc = wizard();
    expect(() =>
      resolveCharacterConcentrationSave(doc, pending(doc), [3, 17], [], undefined, {
        advantage: { sourceId: "luck-advantage", actions: [rerollOnly] },
      })
    ).toThrow();
  });
});

describe("nothing a player sees changes until a caller passes a use", () => {
  it("the save contexts keep their Advantage sources and one face", () => {
    const doc = wizard({ bardicInspirationDie: "d8" });
    const conc = concentrationSaveD20Context(doc, pending(doc));
    expect(conc.advantageSourceIds).toEqual([]);
    expect(enteredD20FaceCount(conc)).toBe(1);
    expect(enteredD20FaceCount(deathSaveD20Context(doc))).toBe(1);
  });

  it("a held die left unentered resolves exactly as without one", () => {
    const held = wizard({ bardicInspirationDie: "d8" });
    const none = wizard();
    for (const face of [1, 12, 15, 20]) {
      expect(resolveCharacterConcentrationSave(held, pending(held), [face]).total).toBe(
        resolveCharacterConcentrationSave(none, pending(none), [face]).total
      );
      expect(resolveCharacterDeathSave(held, [face]).outcome).toEqual(
        resolveCharacterDeathSave(none, [face]).outcome
      );
    }
  });
});
