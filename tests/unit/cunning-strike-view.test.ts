/**
 * `buildCunningStrikeOptions` (the Cunning Strike presenter) — turns the engine's
 * resolved Rogue Cunning Strike catalogue into render-ready tokens. Driven on the
 * REAL resolved options (`resolveCunningStrikeOptions` over real SRD rogue data),
 * so the engine→view LocText pipeline is exercised end-to-end. Pins:
 *  - LOCALIZATION: name/description/condition resolve per locale; the save splits
 *    into the ability abbreviation + the concrete DC (the component composes "DC").
 *  - LEGALITY (constrained input, golden rule 20): an option is legal only while
 *    the Sneak Attack use is unspent AND its dice cost is within the dice budget.
 *  - ORDER preserved (the engine already sorted by cost, then optionId).
 */
import { describe, it, expect } from "vitest";
import {
  buildCunningStrikeOptions,
  type CunningStrikeVM,
} from "@/lib/views/cunning-strike-view";
import { resolveCunningStrikeOptions } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";
import type { Locale } from "@/lib/locale";

/** Build VMs from a real Rogue's resolved catalogue. */
function vms(
  ctx: { sneakAttackAvailable: boolean; sneakAttackDice: number },
  locale: Locale = "en",
  level = 14
): CunningStrikeVM[] {
  const doc = makeCharacterDoc({
    class: "rogue",
    level,
    abilityScores: { STR: 10, DEX: 14, CON: 12, INT: 10, WIS: 12, CHA: 8 },
    features: [{ srdId: "rogue-cunning-strike" }, { srdId: "rogue-devious-strikes" }],
  });
  const { options } = resolveCunningStrikeOptions(doc);
  return buildCunningStrikeOptions(options, ctx, locale);
}

const AVAIL = { sneakAttackAvailable: true, sneakAttackDice: 3 };

describe("buildCunningStrikeOptions — localization", () => {
  it("resolves name/condition + splits the save into ability + dc", () => {
    const poisonEn = vms(AVAIL, "en").find((v) => v.optionId === "poison");
    expect(poisonEn?.name).toBe("Poison");
    expect(poisonEn?.condition).toBe("Poisoned");
    // Poison forces a CON save. DEX 14 (+2), level 14 (PB +5) → DC 8 + 2 + 5 = 15.
    expect(poisonEn?.save).toEqual({ ability: "CON", dc: 15 });

    const tripIt = vms(AVAIL, "it").find((v) => v.optionId === "trip");
    expect(tripIt?.name).toBe("Sgambetto");
    expect(tripIt?.condition).toBe("Prono");
  });

  it("a no-save option (Withdraw) carries a null save + null condition", () => {
    const withdraw = vms(AVAIL, "en").find((v) => v.optionId === "withdraw");
    expect(withdraw?.save).toBeNull();
    expect(withdraw?.condition).toBeNull();
  });

  it("preserves the engine's order (cost ascending)", () => {
    const costs = vms(AVAIL, "en").map((v) => v.cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});

describe("buildCunningStrikeOptions — legality (constrained input)", () => {
  it("legal only when the use is available AND cost ≤ dice budget", () => {
    // 3 dice, use unspent → 1-die options legal; the 6-die Knock Out is not.
    const all = vms(AVAIL, "en");
    expect(all.find((v) => v.optionId === "poison")?.legal).toBe(true);
    expect(all.find((v) => v.optionId === "knock-out")?.legal).toBe(false);
  });

  it("every option is illegal once the Sneak Attack use is spent", () => {
    const all = vms({ sneakAttackAvailable: false, sneakAttackDice: 10 }, "en");
    expect(all.every((v) => !v.legal)).toBe(true);
  });

  it("returns an empty list for a non-Rogue (no catalogue)", () => {
    const doc = makeCharacterDoc({ class: "fighter", level: 5, features: [] });
    const { options } = resolveCunningStrikeOptions(doc);
    expect(buildCunningStrikeOptions(options, AVAIL, "en")).toEqual([]);
  });
});
