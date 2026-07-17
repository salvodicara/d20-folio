/**
 * `resolveCunningStrikeOptions` — the consumer for the `cunning-strike-option`
 * primitive. Proves the catalogue resolves END-TO-END from real SRD rogue data
 * (not synthetic grants): the base L5 options, Devious Strikes L14, the Thief
 * Supreme Sneak "Stealth Attack" 2024 adder, and the Scion "Terrify" adder, all
 * with the resolved save DC (8 + DEX mod + PB) and the Improved-Cunning-Strike
 * max-simultaneous count. Override-first: the PB override flows into the DC.
 */
import { describe, it, expect } from "vitest";
import { resolveCunningStrikeOptions } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";
import type { CharacterData, SessionState } from "@/types/character";
import { loc } from "../_harness/loc";

const rogue = (
  char: Partial<CharacterData> & { class?: string; subclass?: string; level?: number },
  session: Partial<SessionState> = {}
) => resolveCunningStrikeOptions(makeCharacterDoc({ class: "rogue", ...char }, session));

describe("resolveCunningStrikeOptions — base Cunning Strike (L5)", () => {
  it("surfaces the three base options with resolved save DCs", () => {
    // DEX 14 (+2 mod), level 5 (PB +3) → save DC = 8 + 2 + 3 = 13.
    const { options, maxSimultaneous } = rogue({
      level: 5,
      abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 8 },
      features: [{ srdId: "rogue-cunning-strike" }],
    });
    expect(options.map((o) => o.optionId).sort()).toEqual(["poison", "trip", "withdraw"]);

    const poison = options.find((o) => o.optionId === "poison");
    expect(poison?.saveAbility).toBe("CON");
    expect(poison?.saveDc).toBe(13);
    expect(poison?.condition).toBe("poisoned");
    expect(poison?.cost).toBe(1);

    // Withdraw forces no save → null DC, no condition.
    const withdraw = options.find((o) => o.optionId === "withdraw");
    expect(withdraw?.saveAbility).toBeNull();
    expect(withdraw?.saveDc).toBeNull();
    expect(withdraw?.condition).toBeUndefined();

    // Without Improved Cunning Strike, only one option per Sneak Attack.
    expect(maxSimultaneous).toBe(1);
  });

  it("returns an empty catalogue for a Rogue before L5 (feature not yet taken)", () => {
    const { options } = rogue({
      level: 4,
      features: [{ srdId: "rogue-sneak-attack" }],
    });
    expect(options).toEqual([]);
  });

  it("returns an empty catalogue for a non-Rogue", () => {
    const result = resolveCunningStrikeOptions(
      makeCharacterDoc({ class: "fighter", level: 5, features: [] })
    );
    expect(result.options).toEqual([]);
    expect(result.maxSimultaneous).toBe(1);
  });
});

describe("resolveCunningStrikeOptions — Improved + Devious (L11/L14)", () => {
  it("Improved Cunning Strike raises max simultaneous options to 2", () => {
    const { maxSimultaneous } = rogue({
      level: 11,
      features: [
        { srdId: "rogue-cunning-strike" },
        { srdId: "rogue-improved-cunning-strike" },
      ],
    });
    expect(maxSimultaneous).toBe(2);
  });

  it("Devious Strikes adds Daze/Knock Out/Obscure to the catalogue", () => {
    const { options } = rogue({
      level: 14,
      abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 12, CHA: 8 },
      features: [{ srdId: "rogue-cunning-strike" }, { srdId: "rogue-devious-strikes" }],
    });
    const ids = options.map((o) => o.optionId);
    expect(ids).toContain("daze");
    expect(ids).toContain("knock-out");
    expect(ids).toContain("obscure");

    // Knock Out costs 6 dice; Obscure forces a DEX save.
    expect(options.find((o) => o.optionId === "knock-out")?.cost).toBe(6);
    expect(options.find((o) => o.optionId === "obscure")?.saveAbility).toBe("DEX");

    // DEX 16 (+3), level 14 (PB +5) → DC = 8 + 3 + 5 = 16.
    expect(options.find((o) => o.optionId === "daze")?.saveDc).toBe(16);

    // Options are sorted by cost ascending (1d6 base options before 6d6 KO).
    const costs = options.map((o) => o.cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});

describe("resolveCunningStrikeOptions — subclass adders (2024 RAW)", () => {
  it("Thief Supreme Sneak (L9) adds the Stealth Attack option (no save, 2024 fix)", () => {
    const { options } = rogue({
      level: 9,
      subclass: "thief",
      features: [
        { srdId: "rogue-cunning-strike" },
        { srdId: "rogue-thief-supreme-sneak" },
      ],
    });
    const stealth = options.find((o) => o.optionId === "stealth-attack");
    expect(stealth).toBeDefined();
    expect(stealth?.sourceId).toBe("rogue-thief-supreme-sneak");
    expect(stealth?.cost).toBe(1);
    // 2024: Stealth Attack forces NO save (the old 2014 Stealth-advantage
    // mechanic is gone).
    expect(stealth?.saveAbility).toBeNull();
    expect(stealth?.saveDc).toBeNull();
    expect(loc(stealth?.name, "en")).toBe("Stealth Attack");
  });

  // The Scion "Terrify" adder (a PACK subclass) is pinned in
  // content-pack/tests/unit/cunning-strike-consumer.pack.test.ts.
});

describe("resolveCunningStrikeOptions — override-first + i18n", () => {
  it("honors the proficiency-bonus override in the save DC", () => {
    const { options } = rogue({
      level: 5,
      abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 8 },
      proficiencyBonusOverride: 6,
      features: [{ srdId: "rogue-cunning-strike" }],
    });
    // DC = 8 + DEX mod (+2) + override PB (6) = 16 (not the level-5 default 13).
    expect(options.find((o) => o.optionId === "poison")?.saveDc).toBe(16);
  });

  it("returns bilingual names/descriptions resolvable per locale", () => {
    const it = resolveCunningStrikeOptions(
      makeCharacterDoc({
        classes: [{ classId: "rogue", level: 5 }],
        features: [{ srdId: "rogue-cunning-strike" }],
      })
    );
    const trip = it.options.find((o) => o.optionId === "trip");
    expect(loc(trip?.name, "it")).toBe("Sgambetto");
    expect(loc(trip?.name, "en")).toBe("Trip");
  });
});
