import { describe, expect, it } from "vitest";
import enCombat from "@/i18n/en/ui/combat.json";
import itCombat from "@/i18n/it/ui/combat.json";
import enCommon from "@/i18n/en/ui/common.json";
import itCommon from "@/i18n/it/ui/common.json";

/**
 * The damage-math labels sit side by side in the HP popover ("10 → 5 · …"): they
 * must read as one family. Italian uses the three nouns of the SRD (Immunità,
 * Resistenza, Vulnerabilità); English must too, not "Immune · Resisted · Vulnerability".
 */
const KEYS = ["damageMathImmune", "damageMathVulnerable"] as const;

describe("damage-math labels read as one family", () => {
  it("Italian uses the SRD nouns", () => {
    expect([
      ...KEYS.map((key) => itCombat.combat[key]),
      itCommon.common.resistance,
    ]).toEqual(["Immunità", "Vulnerabilità", "Resistenza"]);
  });

  it("English uses the matching nouns", () => {
    expect([
      ...KEYS.map((key) => enCombat.combat[key]),
      enCommon.common.resistance,
    ]).toEqual(["Immunity", "Vulnerability", "Resistance"]);
  });
});
