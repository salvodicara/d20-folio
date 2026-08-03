/**
 * Evoker Empowered Evocation (Wizard L10) — "add your Intelligence modifier to
 * one damage roll of a Wizard Evocation spell." Wired via `spell-damage-bonus`
 * with the new `schools` filter (the school-scoped sibling of `scope`/`cantripOnly`).
 * Verified against http://dnd2024.wikidot.com/wizard:evoker.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants } from "@/lib/grants";
import { resolveSpellDamageBonus } from "@/lib/compute";
import { resolveActions } from "@/lib/smart-tracker";
import { classFeatureIndex } from "@/data/classes";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import type { AbilityCode } from "@/data/types";

const scores = (over: Partial<Record<AbilityCode, number>> = {}) => ({
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 18,
  WIS: 10,
  CHA: 10,
  ...over,
});

describe("resolveSpellDamageBonus — schools filter", () => {
  const entries = evaluateGrants([
    {
      id: "x",
      name: { en: "Empowered Evocation", it: "Invocazione Potenziata" },
      grants: [
        {
          type: "spell-damage-bonus",
          damageTypes: [],
          ability: "INT",
          value: "modifier",
          scope: "wizard",
          schools: ["evocation"],
        },
      ],
    },
  ]).spellDamageBonuses;

  it("applies +INT to an Evocation Wizard spell", () => {
    expect(
      resolveSpellDamageBonus(entries, ["fire"], scores(), "wizard", 3, "evocation")
    ).toBe(4);
  });
  it("does NOT apply to a non-Evocation spell (conjuration)", () => {
    expect(
      resolveSpellDamageBonus(entries, ["fire"], scores(), "wizard", 3, "conjuration")
    ).toBe(0);
  });
  it("does NOT apply when the school is unknown (conservative)", () => {
    expect(resolveSpellDamageBonus(entries, ["fire"], scores(), "wizard", 3)).toBe(0);
  });
  it("does NOT apply to another class's spell", () => {
    expect(
      resolveSpellDamageBonus(entries, ["fire"], scores(), "sorcerer", 3, "evocation")
    ).toBe(0);
  });
});

describe("Wizard Empowered Evocation declares the schooled spell-damage-bonus", () => {
  it("carries +INT to evocation (wizard scope)", () => {
    const grants =
      classFeatureIndex.get("wizard-evoker-empowered-evocation")?.grants ?? [];
    expect(grants.find((g) => g.type === "spell-damage-bonus")).toEqual({
      type: "spell-damage-bonus",
      damageTypes: [],
      ability: "INT",
      value: "modifier",
      scope: "wizard",
      schools: ["evocation"],
    });
  });
});

describe("Wizard Potent Cantrip declares a generic outcome rule", () => {
  it("deals half damage after a miss or successful save without a spell-id branch", () => {
    const grants = classFeatureIndex.get("wizard-evoker-potent-cantrip")?.grants ?? [];
    expect(grants).toContainEqual({
      type: "spell-damage-outcome",
      scope: "wizard",
      cantripOnly: true,
      damageOnMiss: "half",
      damageOnSave: "half",
    });

    const spec = DEV_SCENARIOS["evoker-wizard"];
    if (!spec) throw new Error("scenario missing");
    const actions = resolveActions(buildScenario(spec));
    const fireBolt = actions.find((action) => action.spellId === "fire-bolt");
    expect(fireBolt?.summary.damageOnMiss).toBe("half");
    expect(fireBolt?.summary.damageOnSave).toBe("half");
    expect(
      actions.find((action) => action.spellId === "fireball")?.summary.damageOnMiss
    ).toBeUndefined();
  });
});

describe("resolveActions — an Evoker's Fireball gains +INT", () => {
  it("Fireball (Evocation) damage chip ends in +4 (INT 18)", () => {
    const spec = DEV_SCENARIOS["evoker-wizard"];
    if (!spec) throw new Error("scenario missing");
    const fb = resolveActions(buildScenario(spec)).find((a) => a.spellId === "fireball");
    expect(fb?.summary.damage).toMatch(/\+4$/);
  });

  it("keeps +INT separate for Magic Missile so it applies to exactly one dart", () => {
    const spec = DEV_SCENARIOS["evoker-wizard"];
    if (!spec) throw new Error("scenario missing");
    const missile = resolveActions(buildScenario(spec)).find(
      (action) => action.spellId === "magic-missile"
    );
    expect(missile?.summary.damage).toBe("1d4+1");
    expect(missile?.summary.instances).toBe(3);
    expect(missile?.summary.oneRollDamageBonus).toBe(4);
  });
});
