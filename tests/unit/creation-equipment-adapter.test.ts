import { expect, it } from "vitest";
import { normalizeStartingEquipment } from "@/lib/character-creation/equipment-adapter";
import { catalogueSnapshot } from "@/lib/character-creation/catalogue";

it("preserves package gold, explicit quantities and nested choices without fallback grants", () => {
  const result = normalizeStartingEquipment(
    [
      {
        label: "A",
        gold: 8,
        items: [
          { srdId: "dagger", quantity: 2 },
          {
            srdId: "dice-set",
            choice: {
              id: "gaming",
              count: 1,
              pool: { kind: "tool", category: "gaming" },
            },
          },
        ],
      },
      { label: "B", gold: 50, items: [] },
    ],
    "equipment",
    catalogueSnapshot
  );
  expect(result.choices[0]?.options[0]?.benefits).toEqual([
    { kind: "gold", amount: 8 },
    { kind: "equipment", dependency: expect.any(String) as unknown, quantity: 2 },
  ]);
  expect(Object.values(result.dependencies)).toHaveLength(1);
  expect(result.choices[1]).toMatchObject({
    parent: { choiceId: "equipment", optionId: "A" },
    pool: { query: { kind: "equipment", toolCategories: ["gaming"] } },
    selectedGrant: { kind: "equipment", quantity: 1 },
  });
  expect(result.choices[0]?.options[1]?.benefits).toEqual([{ kind: "gold", amount: 50 }]);
});

it("offers one physical tool without multiplying the proficiency count", () => {
  const result = normalizeStartingEquipment(
    [{ label: "A", gold: 0, items: [{ fromToolChoice: true, quantity: 1 }] }],
    "gear",
    catalogueSnapshot,
    "class:monk"
  );
  expect(result.choices[1]).toMatchObject({
    count: 1,
    selectedGrant: { kind: "equipment", quantity: 1 },
    pool: {
      query: {
        proficientOnly: true,
        proficiencySource: "class:monk",
        categories: ["tool"],
      },
    },
  });
});
