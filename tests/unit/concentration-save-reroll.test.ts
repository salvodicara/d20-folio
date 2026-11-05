/**
 * A failed Concentration save rerolled (Indomitable: "you can reroll the save, and
 * you gain a bonus to that roll equal to your Fighter level"; Countercharm-style
 * rerolls have Advantage). The reroll is the save again with its own terms: the
 * bonus is one more modifier, Advantage one more source, and the new roll stands.
 */
import { describe, expect, it } from "vitest";

import {
  concentrationSaveD20Context,
  resolveCharacterConcentrationSave,
} from "@/lib/character-d20-tests";
import { concentrationSaveDc } from "@/lib/compute";
import { concentrationValue } from "@/lib/concentration";
import type { CharacterDoc } from "@/types/character";
import type { PendingConcentrationSave } from "@/types/combat-state";

import { makeCharacterDoc } from "./_helpers";

const fighter = makeCharacterDoc(
  {
    classes: [{ classId: "fighter", level: 13 }],
    features: [{ srdId: "fighter-indomitable" }],
    abilityScores: { STR: 16, DEX: 12, CON: 10, INT: 10, WIS: 10, CHA: 10 },
  },
  { concentration: concentrationValue("bless") }
);

const pending = (doc: CharacterDoc): PendingConcentrationSave => ({
  id: "save-1",
  spell: concentrationValue(doc.session.concentration),
  damage: 30,
  difficultyClass: concentrationSaveDc(30),
});

const sum = (
  doc: CharacterDoc,
  reroll?: Parameters<typeof concentrationSaveD20Context>[2]
) =>
  concentrationSaveD20Context(doc, pending(doc), reroll).modifierTerms.reduce(
    (total, term) => total + term.value,
    0
  );

describe("a rerolled Concentration save", () => {
  it("Indomitable adds the Fighter level to the new roll", () => {
    expect(sum(fighter, { sourceId: "fighter-indomitable", bonus: 13 })).toBe(
      sum(fighter) + 13
    );
  });

  it("a reroll with Advantage enters two faces", () => {
    const context = concentrationSaveD20Context(fighter, pending(fighter), {
      sourceId: "bard-countercharm",
      advantage: true,
    });
    expect(context.advantageSourceIds).toContain("bard-countercharm");
  });

  it("the new roll decides: a 5 fails the DC 15 alone, passes with +13", () => {
    const plain = resolveCharacterConcentrationSave(fighter, pending(fighter), [5]);
    expect(plain.reviewedOutcome.status).toBe("failure");
    const rerolled = resolveCharacterConcentrationSave(
      fighter,
      pending(fighter),
      [5],
      [],
      {
        sourceId: "fighter-indomitable",
        bonus: 13,
      }
    );
    expect(rerolled.reviewedOutcome.status).toBe("success");
  });
});
