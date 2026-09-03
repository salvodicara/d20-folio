import { describe, expect, it } from "vitest";
import { serializeCharacter, parseCharacter } from "@/lib/character-io";
import { resolveActions } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";

describe("feature action effect contract", () => {
  it("projects Bardic Inspiration as a one-target held-die grant", () => {
    const action = resolveActions(
      makeCharacterDoc({
        classId: "bard",
        level: 3,
        features: [{ srdId: "bard-bardic-inspiration" }],
      })
    ).find((candidate) => candidate.id === "bard-bardic-inspiration-bonus");

    expect(action).toMatchObject({
      summary: {
        grantedDie: { kind: "bardic-inspiration", die: "d6" },
        targeting: { affinity: "ally", maxTargets: 1, excludeSelf: true },
      },
    });
  });

  it("projects Uncanny Metabolism as one paid heal + Focus restore action", () => {
    const actions = resolveActions(
      makeCharacterDoc(
        {
          classId: "monk",
          level: 3,
          features: [{ srdId: "monk-focus" }, { srdId: "monk-uncanny-metabolism" }],
        },
        {
          hp: { current: 7, temp: 0 },
          trackers: {
            "monk-focus": { used: 3 },
            "monk-uncanny-metabolism": { used: 0 },
          },
        }
      )
    );

    expect(
      actions.find((action) => action.id === "monk-uncanny-metabolism-free")
    ).toMatchObject({
      costTracker: "monk-uncanny-metabolism",
      trackerCost: 1,
      summary: {
        heal: { dice: "1d6", bonus: 3 },
        targeting: { affinity: "self", maxTargets: 1 },
        trackerTopUp: { trackerId: "monk-focus", upTo: "full" },
      },
    });
  });

  it("scales Deflect Attacks redirect dice and eligible damage types", () => {
    const redirectAt = (level: number) =>
      resolveActions(
        makeCharacterDoc({
          classId: "monk",
          level,
          features: [{ srdId: "monk-focus" }, { srdId: "monk-deflect-attacks" }],
        })
      ).find((candidate) => candidate.id === "monk-deflect-attacks-redirect");

    expect(redirectAt(3)).toMatchObject({
      summary: {
        damage: "2d6+2",
        damageTypes: ["bludgeoning", "piercing", "slashing"],
        saveAbility: "DEX",
        targeting: { affinity: "any", maxTargets: 1 },
      },
    });
    const level13 = redirectAt(13);
    expect(level13?.summary.damage).toBe("2d10+2");
    expect(level13?.summary.damageTypes).toEqual(
      expect.arrayContaining(["acid", "force", "radiant", "thunder"])
    );
  });

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
            instanceId: customInstanceId("Table Blessing"),
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
              trackerTopUp: { trackerId: "fighter-second-wind", upTo: "full" },
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
          trackerTopUp: { trackerId: "fighter-second-wind", upTo: "full" },
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
        trackerTopUp: { trackerId: "fighter-second-wind", upTo: "full" },
        targeting: { affinity: "any", maxTargets: 3 },
      },
    });
  });
});
