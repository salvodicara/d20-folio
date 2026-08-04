import { describe, expect, it } from "vitest";
import { serializeCharacter, parseCharacter } from "@/lib/character-io";
import { resolveActions } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

describe("feature action effect contract", () => {
  it("keeps same-economy homebrew actions distinct and resolves their effects", () => {
    const actions = resolveActions(
      makeCharacterDoc({
        classId: "cleric",
        level: 5,
        abilityScores: { STR: 8, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 10 },
        features: [
          {
            custom: true,
            title: "Table Blessing",
            emoji: "✨",
            source: "Homebrew",
            tags: [],
            contentBlocks: [],
            actions: [
              {
                id: "restore",
                type: "action",
                label: "Restore",
                description: "Restore Hit Points.",
                heal: {
                  dice: "1d6",
                  plus: { kind: "ability-mod", ability: "WIS" },
                },
                targeting: { affinity: "any", maxTargets: 1 },
              },
              {
                id: "ward",
                type: "action",
                label: "Ward",
                description: "Grant Temporary Hit Points.",
                tempHpRoll: { rolls: 2, die: "d4" },
                targeting: { affinity: "any", maxTargets: 1 },
              },
            ],
          },
        ],
      })
    );

    expect(actions.find((a) => a.id.endsWith("-restore"))).toMatchObject({
      name: { custom: "Restore" },
      summary: { heal: { dice: "1d6", bonus: 4 } },
    });
    expect(actions.find((a) => a.id.endsWith("-ward"))).toMatchObject({
      name: { custom: "Ward" },
      summary: { tempHpRoll: { dice: "2d4" } },
    });
  });

  it("applies and persists action overrides on an inferred class feature", () => {
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 16, CHA: 8 },
      features: [
        {
          srdId: "fighter-second-wind",
          actionOverrides: [
            {
              label: "Field Remedy",
              description: "Use the table's alternate recovery.",
              heal: { dice: "1d6", plus: { kind: "flat", value: 2 } },
              targeting: {
                affinity: "any",
                maxTargets: "WIS",
              },
            },
          ],
        },
      ],
    });

    const parsed = parseCharacter(serializeCharacter(doc));
    if (!parsed.success) throw new Error(parsed.error);
    const feature = parsed.doc.character.features.find(
      (candidate) => !("custom" in candidate) && candidate.srdId === "fighter-second-wind"
    );
    expect(feature).toMatchObject({
      actionOverrides: [
        {
          label: "Field Remedy",
          heal: { dice: "1d6", plus: { kind: "flat", value: 2 } },
        },
      ],
    });

    const imported = {
      ...parsed.doc,
      id: "round-trip",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
    };
    const action = resolveActions(imported).find(
      (candidate) => candidate.id === "fighter-second-wind-bonus"
    );
    expect(action).toMatchObject({
      name: { custom: "Field Remedy" },
      summary: {
        heal: { dice: "1d6", bonus: 2 },
        targeting: { affinity: "any", maxTargets: 3 },
      },
    });
  });
});
