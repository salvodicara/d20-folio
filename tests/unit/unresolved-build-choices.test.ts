/**
 * The picks a stored character's species still owes (the old wizard never asked
 * them): the cases come from the species catalogue (src/data/races.ts).
 */
import { describe, expect, it } from "vitest";

import { asRaceId } from "@/data/srd-names";
import { owedChoiceCount, unresolvedBuildChoices } from "@/lib/unresolved-build-choices";

const build = (race: string, extra: object = {}) => ({
  race: asRaceId(race),
  skills: {},
  humanOriginFeat: "",
  ...extra,
});

describe("unresolvedBuildChoices", () => {
  it("an Elf owes its lineage, its Keen Senses skill and its spellcasting ability", () => {
    expect(unresolvedBuildChoices(build("elf"), {})).toEqual([
      { kind: "skill", traitId: "keen-senses", verifiable: true },
      { kind: "bundle", traitId: "elven-lineage", bundleKey: "elf-lineage" },
      { kind: "species-spell-ability" },
    ]);
  });

  it("an Elf with all three picked owes nothing", () => {
    expect(
      unresolvedBuildChoices(
        build("elf", {
          skills: { perception: "proficient" },
          speciesSpellAbility: "WIS",
        }),
        { grantBundleChoices: { "elf-lineage": "wood-elf" } }
      )
    ).toEqual([]);
  });

  it("a Human owes its origin feat; its any-skill pick can't be checked", () => {
    expect(unresolvedBuildChoices(build("human"), {})).toEqual([
      { kind: "skill", traitId: "skillful", verifiable: false },
      { kind: "feat", traitId: "versatile" },
    ]);
    expect(
      unresolvedBuildChoices(build("human", { humanOriginFeat: "alert" }), {})
    ).toEqual([{ kind: "skill", traitId: "skillful", verifiable: false }]);
  });

  it("a Tiefling owes its legacy and its spellcasting ability", () => {
    expect(unresolvedBuildChoices(build("tiefling"), {})).toEqual([
      { kind: "bundle", traitId: "fiendish-legacy", bundleKey: "tiefling-legacy" },
      { kind: "species-spell-ability" },
    ]);
  });

  it("a Dragonborn and a Goliath owe their ancestry", () => {
    expect(unresolvedBuildChoices(build("dragonborn"), {})).toContainEqual(
      expect.objectContaining({ kind: "bundle", bundleKey: "dragonborn-ancestry" })
    );
    expect(unresolvedBuildChoices(build("goliath"), {})).toContainEqual(
      expect.objectContaining({ kind: "bundle", bundleKey: "goliath-giant-ancestry" })
    );
  });

  it("a species with no picks, or one the catalogue doesn't know, owes nothing", () => {
    expect(unresolvedBuildChoices(build("dwarf"), {})).toEqual([]);
    expect(unresolvedBuildChoices(build("homebrew-folk"), {})).toEqual([]);
  });
});

/**
 * The «choices owed» signal the sheet's level-up note reads (E4 item 8): how many
 * picks the build still owes. A class pick counts each pick it owes; a pick the
 * sheet can't check (a Human's any-skill) counts nothing.
 */
describe("owedChoiceCount", () => {
  it("counts each owed pick, and never a pick the sheet can't check", () => {
    // Elf: Keen Senses skill + lineage + spellcasting ability.
    expect(owedChoiceCount(build("elf"), {})).toBe(3);
    // Human: the origin feat only (Skillful can't be checked).
    expect(owedChoiceCount(build("human"), {})).toBe(1);
    expect(owedChoiceCount(build("dwarf"), {})).toBe(0);
  });

  it("a Warlock 2 with no invocations owes 3 (SRD 5.2.1 Warlock Features)", () => {
    const warlock = build("dwarf", {
      classes: [{ classId: "warlock", level: 2 }],
      spells: [
        { srdId: "eldritch-blast", prepared: true },
        { srdId: "chill-touch", prepared: true },
      ],
    });
    expect(owedChoiceCount(warlock, {})).toBe(3);
  });
});
