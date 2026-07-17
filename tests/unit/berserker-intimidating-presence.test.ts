/**
 * Barbarian (Path of the Berserker) — Intimidating Presence, 2024 RAW.
 *
 * 2024 Intimidating Presence (level 14) is a Bonus Action: each enemy of your
 * choice in a 30-foot Emanation makes a Wisdom save (DC = 8 + your Strength
 * modifier + Proficiency Bonus) or has the Frightened condition for 1 minute
 * (re-save at the end of each of its turns). Usable once per Long Rest, or by
 * expending a use of Rage to restore it. This mirrors the Zealot's Zealous
 * Presence modelling — a 1/long-rest tracker plus a bonus-action SrdActionDef —
 * and replaces the 2014 action / CHA-mod / single-target wording.
 */
import { describe, expect, it } from "vitest";
import { classFeatureIndex } from "@/data/classes";
import { resolveActions, resolveTrackers } from "@/lib/smart-tracker";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import { actionText, loc, srd } from "../_harness/loc";

const IP_ID = "barbarian-berserker-intimidating-presence";

describe("Intimidating Presence is the 2024 bonus-action fear aura", () => {
  const feature = classFeatureIndex.get(IP_ID);

  it("is a level-14 Berserker feature", () => {
    expect(feature?.level).toBe(14);
    expect(feature?.subclass).toBe("berserker");
  });

  it("declares a 1/long-rest tracker (mirrors Zealous Presence)", () => {
    expect(feature?.mechanics?.tracker).toMatchObject({
      total: "1",
      recovery: "long-rest",
    });
  });

  it("declares a single bonus-action with the WIS-save DC note", () => {
    const actions = feature?.mechanics?.actions ?? [];
    expect(actions).toHaveLength(1);
    expect(actions[0]?.type).toBe("bonus");
    expect(actionText(feature?.id, 0, "description", "en")).toMatch(/WIS save/i);
    expect(actionText(feature?.id, 0, "description", "en")).toMatch(
      /8 \+ STR mod \+ PB/i
    );
    expect(actionText(feature?.id, 0, "description", "it").length).toBeGreaterThan(0);
  });

  it("prose is the concise 2024 wording (Bonus Action, Emanation, STR mod, no CHA / no 'use your action')", () => {
    expect(srd("class-feature", feature?.id ?? "", "description", "en")).toMatch(
      /Bonus Action/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "en")).toMatch(
      /30-foot Emanation/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "en")).toMatch(
      /Strength modifier/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "en")).toMatch(
      /Long Rest/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "en")).toMatch(
      /expend a use of your Rage/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "en")).not.toMatch(
      /Charisma/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "en")).not.toMatch(
      /use your action/i
    );
    // IT mirrors the EN (no empty IT, 2024 terminology)
    expect(srd("class-feature", feature?.id ?? "", "description", "it")).toMatch(
      /Azione Bonus/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "it")).toMatch(
      /Emanazione/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "it")).toMatch(
      /modificatore di Forza/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "it")).toMatch(
      /Riposo Lungo/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "it")).not.toMatch(
      /Carisma/i
    );
  });
});

describe("Intimidating Presence surfaces through the aggregated read model", () => {
  function berserkerAt(level: number): CharacterDoc {
    return {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        classes: [{ classId: "barbarian", subclassId: "berserker", level: level }],
        features: [{ srdId: IP_ID }],
      },
      session: {
        ...MOCK_CHARACTER.session,
        trackers: {},
      },
    };
  }

  it("resolves as a feature-sourced bonus action at level 14", () => {
    const actions = resolveActions(berserkerAt(14));
    const ip = actions.find((a) => a.id === `${IP_ID}-bonus`);
    expect(ip).toBeDefined();
    expect(ip?.type).toBe("bonus");
    expect(ip?.source).toBe("feature");
    expect(loc(ip?.name, "en")).toBe("Intimidating Presence");
  });

  it("the resolved action reports its 1/long-rest uses", () => {
    const actions = resolveActions(berserkerAt(14));
    const ip = actions.find((a) => a.id === `${IP_ID}-bonus`);
    expect(ip?.summary.uses).toMatchObject({ current: 1, total: 1 });
    expect(ip?.costTracker).toBe(IP_ID);
  });

  it("exposes a 1/long-rest tracker through resolveTrackers", () => {
    const trackers = resolveTrackers(berserkerAt(14));
    const ip = trackers.find((t) => t.id === IP_ID);
    expect(ip).toMatchObject({
      total: 1,
      used: 0,
      recovery: "long-rest",
    });
  });
});
