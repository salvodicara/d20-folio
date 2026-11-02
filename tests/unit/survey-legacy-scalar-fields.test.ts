/**
 * The read-only count that decides whether stored homebrew still carries the
 * legacy scaling fields (edge-case family M11). Counts only; never writes.
 */
import { describe, expect, it } from "vitest";
import { surveyLegacyScalarFields } from "../../scripts/survey-legacy-scalar-fields";

const rider = (extra: Record<string, unknown>) => ({
  type: "damage-rider",
  dice: "1d6",
  damageType: "fire",
  appliesTo: "weapon",
  oncePerTurn: true,
  ...extra,
});

describe("survey of legacy scaling fields in stored homebrew", () => {
  it("counts a damage rider with diceByLevel and an amount with castLevelScaling, at any depth", () => {
    const counts = surveyLegacyScalarFields([
      {
        path: "users/u1/library/index",
        data: { features: [{ id: "f", grants: [rider({ diceByLevel: { 5: "2d6" } })] }] },
      },
      {
        path: "users/u1/characters/c1",
        data: {
          character: {
            customFeatures: [
              {
                grants: [
                  {
                    type: "while-active",
                    grants: [
                      {
                        type: "hp-flat",
                        amount: 5,
                        castLevelScaling: { baseLevel: 2, perLevel: 5 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    ]);
    expect(counts).toEqual({
      documents: 2,
      libraries: 1,
      characters: 1,
      diceByLevel: 1,
      castLevelScaling: 1,
      documentsWithLegacy: 2,
    });
  });

  it("ignores the new notation and other paths", () => {
    const counts = surveyLegacyScalarFields([
      { path: "users/u1/library/index", data: { features: [{ grants: [rider({})] }] } },
      { path: "campaigns/x", data: { grants: [rider({ diceByLevel: { 5: "2d6" } })] } },
    ]);
    expect(counts.diceByLevel).toBe(0);
    expect(counts.documents).toBe(1);
  });

  it("a diceByLevel outside a damage rider is not the retired notation", () => {
    const counts = surveyLegacyScalarFields([
      {
        path: "users/u1/characters/c1",
        data: { actions: [{ type: "action", attack: { diceByLevel: { 5: "2d6" } } }] },
      },
    ]);
    expect(counts.diceByLevel).toBe(0);
  });
});
