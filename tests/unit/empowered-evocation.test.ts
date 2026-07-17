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

describe("resolveActions — an Evoker's Fireball gains +INT", () => {
  it("Fireball (Evocation) damage chip ends in +4 (INT 18)", () => {
    const spec = DEV_SCENARIOS["evoker-wizard"];
    if (!spec) throw new Error("scenario missing");
    const fb = resolveActions(buildScenario(spec)).find((a) => a.spellId === "fireball");
    expect(fb?.summary.damage).toMatch(/\+4$/);
  });
});
