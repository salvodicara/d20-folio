/**
 * The PDF prints the character's Hit Point Dice the way the sheet counts them
 * (2024 multiclassing): one die per level at each class's own size, dice of the
 * same size grouped, largest die first — the sheet's order ("d10/d6"). Cases come
 * from the SRD class tables: Fighter and Paladin d10, Wizard d6, Barbarian d12,
 * Cleric d8.
 */
import { describe, it, expect } from "vitest";
import i18n from "@/i18n";
import { buildScenario, DEV_SCENARIOS, type ScenarioSpec } from "@/lib/dev-scenarios";
import { buildCharacterPdfViewModel } from "@/lib/pdf/character-pdf-view";
import type { CharacterDoc } from "@/types/character";

const base: ScenarioSpec = (() => {
  const spec = DEV_SCENARIOS["wizard-cleric-multiclass"];
  if (!spec) throw new Error("missing dev scenario: wizard-cleric-multiclass");
  return spec;
})();

function build(
  classes: [string, number][],
  patch: (doc: CharacterDoc) => CharacterDoc = (doc) => doc
): CharacterDoc {
  const [[classId, level], ...rest] = classes as [
    [string, number],
    ...[string, number][],
  ];
  const spec: ScenarioSpec = {
    ...base,
    name: classes.map(([id, lvl]) => `${id} ${lvl}`).join(" / "),
    classId,
    subclassId: undefined,
    level,
    secondaryClasses: rest.map(([id, lvl]) => ({ classId: id, level: lvl })),
  };
  return patch(buildScenario(spec));
}

const hitDice = (doc: CharacterDoc, locale: "en" | "it" = "en"): string =>
  buildCharacterPdfViewModel(doc, locale, i18n.getFixedT(locale)).combat.hitDice;

describe("PDF Hit Dice line", () => {
  it("a single class prints its level in its own die", () => {
    expect(hitDice(build([["fighter", 6]]))).toBe("6d10");
  });

  it("two classes with different dice print each die, largest first", () => {
    expect(
      hitDice(
        build([
          ["wizard", 1],
          ["fighter", 5],
        ])
      )
    ).toBe("5d10 + 1d6");
  });

  it("two classes with the same die merge into one group", () => {
    expect(
      hitDice(
        build([
          ["fighter", 3],
          ["paladin", 2],
        ])
      )
    ).toBe("5d10");
  });

  it("a manual Hit Dice total prints as the sheet counts it", () => {
    const doc = build([["fighter", 6]], (d) => ({
      ...d,
      character: { ...d.character, hitDiceTotalOverride: 4 },
    }));
    expect(hitDice(doc)).toBe("4d10");
  });

  it("the Italian sheet prints the same dice under «Dadi Vita»", () => {
    const doc = build([
      ["wizard", 1],
      ["fighter", 5],
    ]);
    const vm = buildCharacterPdfViewModel(doc, "it", i18n.getFixedT("it"));
    expect(vm.labels.hitDice).toBe("Dadi Vita");
    expect(vm.combat.hitDice).toBe("5d10 + 1d6");
  });
});
