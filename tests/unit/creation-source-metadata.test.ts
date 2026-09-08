import { describe, expect, it } from "vitest";
import { getClassTable, classFeatures } from "@/data/classes";
import { SRD_RACES } from "@/data/races";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { SRD_ORIGIN_LANGUAGES, STANDARD_LANGUAGE_IDS } from "@/data/languages";
import { SRD_FEATS } from "@/data/feats";

const publicCasters = [
  "bard",
  "cleric",
  "druid",
  "paladin",
  "ranger",
  "sorcerer",
  "warlock",
  "wizard",
];
describe("public creation source metadata", () => {
  it("preserves the High Elf cantrip while declaring its allowed replacement", () => {
    const lineage = SRD_RACES.find((race) => race.id === "elf")?.traits.find(
      (trait) => trait.id === "elven-lineage"
    );
    expect(lineage).toHaveProperty("cantripReplacement", {
      spellId: "prestidigitation",
      classSpellList: "wizard",
      boundary: "long-rest",
    });
    const grant = lineage?.grants?.find((entry) => entry.type === "choice-grant-bundle");
    expect(
      grant?.type === "choice-grant-bundle"
        ? grant.options.find((option) => option.id === "high-elf")?.grants
        : []
    ).toContainEqual({
      type: "always-prepared-spell",
      spellId: "prestidigitation",
      spellAbilitySource: "species",
    });
  });
  it("separates the known language from two distinct standard choices", () => {
    expect(SRD_ORIGIN_LANGUAGES.known).toEqual(["common"]);
    expect(SRD_ORIGIN_LANGUAGES.choice.count).toBe(2);
    expect(SRD_ORIGIN_LANGUAGES.choice.options).toEqual(
      STANDARD_LANGUAGE_IDS.filter((id) => id !== "common")
    );
    expect(new Set(SRD_ORIGIN_LANGUAGES.choice.options).size).toBe(
      SRD_ORIGIN_LANGUAGES.choice.options.length
    );
  });
  it("explicitly shares Tiefling trait ability and each Magic Initiate feat's spell ability", () => {
    const tiefling = SRD_RACES.find((race) => race.id === "tiefling");
    const policies = tiefling?.traits
      .filter((trait) => ["fiendish-legacy", "otherworldly-presence"].includes(trait.id))
      .map((trait) => trait.spellcastingAbility);
    const choice = {
      kind: "choice",
      id: "spellcasting-ability",
      abilities: ["INT", "WIS", "CHA"],
    };
    expect(policies).toEqual([choice, choice]);
    for (const id of [
      "magic-initiate-cleric",
      "magic-initiate-druid",
      "magic-initiate-wizard",
    ]) {
      expect(SRD_FEATS.find((feat) => feat.id === id)?.spellcastingAbility).toEqual(
        choice
      );
    }
  });
  it.each(publicCasters)(
    "declares %s casting policy without changing its first-level table",
    (id) => {
      expect(getClassTable(id)?.spellcasting).toHaveProperty("policy");
      expect(getClassTable(id)?.levels[0]?.level).toBe(1);
    }
  );
  it("distinguishes Wizard acquisition from preparation and pact slots from contribution", () => {
    expect(getClassTable("wizard")?.spellcasting).toMatchObject({
      policy: {
        mode: "full",
        acquisition: { kind: "spellbook", initialSpells: 6, initialSpellLevel: 1 },
      },
    });
    expect(getClassTable("warlock")?.spellcasting).toMatchObject({
      policy: { mode: "pact", multiclass: { contributes: false } },
    });
    expect(getClassTable("warlock")).toMatchObject({
      invocationChoices: { countKey: "invocationsKnown" },
    });
  });
  it.each(["paladin", "ranger"])("declares the limited rest replacement for %s", (id) => {
    expect(getClassTable(id)?.spellcasting).toMatchObject({
      policy: {
        acquisition: { kind: "selected-spells", replaceOn: "long-rest", replaceCount: 1 },
        multiclass: { contributes: true, divisor: 2, rounding: "up" },
      },
    });
  });
  it("declares first-level Fighting Style and Expertise choices", () => {
    expect(
      classFeatures.find((feature) => feature.id === "fighter-fighting-style")?.grants
    ).toContainEqual({ type: "choice-feat", category: "fighting-style", amount: 1 });
    expect(
      classFeatures.find((feature) => feature.id === "rogue-expertise")?.grants
    ).toContainEqual({ type: "choice-expertise", amount: 2 });
  });
  it.each(["barbarian", "fighter", "paladin", "ranger", "rogue"])(
    "pins %s mastery eligibility to its declared count",
    (id) => {
      expect(getClassTable(id)).toMatchObject({
        weaponMastery: { countKey: "weaponMastery", proficientOnly: true },
      });
      expect(getClassTable(id)?.levels[0]?.classSpecific?.weaponMastery).toBeGreaterThan(
        0
      );
    }
  );
  it("restricts Rogue mastery to the declared property union", () => {
    expect(getClassTable("rogue")).toMatchObject({
      weaponMastery: { propertiesAnyOf: ["finesse", "light"] },
    });
  });
  it("declares typed prerequisites for every invocation and five level-one options", () => {
    for (const invocation of SRD_INVOCATIONS)
      expect(invocation).toHaveProperty("prerequisites.minimumClassLevel");
    const eligible = SRD_INVOCATIONS.filter(
      (entry) => entry.prerequisites?.minimumClassLevel === 1
    );
    expect(eligible.map((entry) => entry.id)).toEqual([
      "armor-of-shadows",
      "eldritch-mind",
      "pact-of-the-blade",
      "pact-of-the-chain",
      "pact-of-the-tome",
    ]);
  });
  it("gates Large Form and paired later spell free casts", () => {
    expect(
      SRD_RACES.find((race) => race.id === "goliath")?.traits.find(
        (trait) => trait.id === "large-form"
      )
    ).toMatchObject({ minLevel: 5 });
    for (const race of SRD_RACES.filter((entry) =>
      ["elf", "tiefling"].includes(entry.id)
    )) {
      for (const trait of race.traits)
        for (const grant of trait.grants ?? []) {
          if (grant.type !== "choice-grant-bundle") continue;
          for (const option of grant.options)
            for (const spell of option.grants) {
              if (spell.type !== "always-prepared-spell" || !spell.minLevel) continue;
              const free = option.grants.find(
                (other) =>
                  other.type === "free-cast-spell" && other.spellId === spell.spellId
              );
              if (free) expect(free).toHaveProperty("minLevel", spell.minLevel);
            }
        }
    }
  });
});
