/**
 * The PDF prints the character's Hit Point Dice the way the sheet counts them
 * (2024 multiclassing): one die per level at each class's own size, dice of the
 * same size grouped, largest die first — the sheet's order ("d10/d6"). Cases come
 * from the SRD class tables: Fighter and Paladin d10, Wizard d6, Barbarian d12,
 * Cleric d8.
 */
import { describe, it, expect, vi } from "vitest";
import { PDFPage } from "pdf-lib";
import i18n from "@/i18n";
import { buildScenario, DEV_SCENARIOS, type ScenarioSpec } from "@/lib/dev-scenarios";
import { buildCharacterPdfViewModel } from "@/lib/pdf/character-pdf-view";
import { renderCharacterPdf } from "@/lib/pdf/character-pdf";
import { P1 } from "@/lib/pdf/sheet-geometry";
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

describe("PDF Hit Dice box", () => {
  // The Hit Dice column: 47pt between its two dividers, the dice between the
  // title's hairline and the "max" caption.
  const cb = P1.combat;
  const x0 = cb.x + 112;
  const BOX = 47;
  const LEGIBLE = 8;

  /** Every line drawn in the dice slot of the Hit Dice column, top to bottom. */
  async function drawn(
    doc: CharacterDoc
  ): Promise<{ text: string; size: number; width: number }[]> {
    const vm = buildCharacterPdfViewModel(doc, "en", i18n.getFixedT("en"));
    const spy = vi.spyOn(PDFPage.prototype, "drawText");
    try {
      await renderCharacterPdf(vm);
      return spy.mock.calls
        .flatMap(([text, o]) =>
          o?.font &&
          o.size &&
          o.x !== undefined &&
          o.y !== undefined &&
          o.x >= x0 &&
          o.x <= x0 + BOX &&
          o.y > cb.y + 28 &&
          o.y < cb.y + 56
            ? [
                {
                  text,
                  y: o.y,
                  size: o.size,
                  width: o.font.widthOfTextAtSize(text, o.size),
                },
              ]
            : []
        )
        .sort((a, b) => b.y - a.y)
        .map(({ text, size, width }) => ({ text, size, width }));
    } finally {
      spy.mockRestore();
    }
  }

  it("a single class keeps one full-size line", async () => {
    const lines = await drawn(build([["fighter", 6]]));
    expect(lines.map((l) => [l.text, l.size])).toEqual([["6d10", 13]]);
  });

  it.each([
    [
      "two die types stay on one line",
      [
        ["wizard", 1],
        ["fighter", 5],
      ],
      ["5d10 + 1d6"],
    ],
    [
      "three die types split over two lines",
      [
        ["barbarian", 2],
        ["fighter", 2],
        ["wizard", 2],
      ],
      ["2d12 + 2d10", "2d6"],
    ],
    [
      "three die types with a high-level class split over two lines",
      [
        ["barbarian", 17],
        ["fighter", 2],
        ["wizard", 1],
      ],
      ["17d12 + 2d10", "1d6"],
    ],
    [
      "four die types split over two lines",
      [
        ["barbarian", 2],
        ["fighter", 2],
        ["cleric", 2],
        ["wizard", 2],
      ],
      ["2d12 + 2d10", "2d8 + 2d6"],
    ],
  ] as [string, [string, number][], string[]][])(
    "%s, legible and inside the box",
    async (_name, classes, expected) => {
      const lines = await drawn(build(classes));
      expect(lines.map((l) => l.text)).toEqual(expected);
      for (const line of lines) {
        expect(line.size).toBeGreaterThanOrEqual(LEGIBLE);
        expect(line.width).toBeLessThan(BOX);
      }
    }
  );
});
