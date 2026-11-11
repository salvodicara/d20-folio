/**
 * A save the target picks (2024 Grapple and Shove: Strength or Dexterity) reads
 * both abilities on the card; a fixed save reads its one ability.
 */
import { describe, expect, it } from "vitest";
import { saveAbilityShort } from "@/lib/views/save-ability-short";

const t = (key: string) =>
  ({
    "abilities.STR_short": "FOR",
    "abilities.DEX_short": "DES",
    "abilities.WIS_short": "SAG",
  })[key] ?? key;

describe("saveAbilityShort", () => {
  it("names both abilities when the target picks", () => {
    expect(saveAbilityShort("STR", ["STR", "DEX"], t)).toBe("FOR/DES");
  });

  it("names the one ability of a fixed save", () => {
    expect(saveAbilityShort("WIS", undefined, t)).toBe("SAG");
  });
});
