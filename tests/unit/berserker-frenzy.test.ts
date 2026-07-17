/**
 * Barbarian (Path of the Berserker) — Frenzy, 2024 RAW.
 *
 * 2024 Frenzy is a dynamic damage rider, NOT the 2014 bonus-action attack +
 * exhaustion: if you use Reckless Attack while raging, the first target you hit
 * on your turn with a Strength-based attack takes extra d6s equal to your Rage
 * Damage bonus — +2 at L1, +3 at L9, +4 at L16 (matching the Barbarian table) —
 * of the weapon's damage type. Modelled via the `damage-rider` grant's dynamic
 * `diceByLevel` count, resolved at the character's level by `resolveRiderDice`
 * and surfaced as `summary.extraDamage` on melee weapon attack rows.
 */
import { describe, expect, it } from "vitest";
import { srd } from "../_harness/loc";
import { classFeatureIndex } from "@/data/classes";
import { resolveActions } from "@/lib/smart-tracker";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

const FRENZY_ID = "barbarian-berserker-frenzy";

describe("Frenzy is the 2024 dynamic damage rider (no 2014 attack/exhaustion)", () => {
  const feature = classFeatureIndex.get(FRENZY_ID);

  it("declares a dynamic damage-rider grant wrapped in the Rage while-active gate (M15)", () => {
    // RAW: the extra damage applies only "while your Rage is active", so the rider
    // is nested in the `barbarian-rage` while-active block (mirroring Divine Fury) —
    // NOT a bare top-level grant that would render unconditionally on weapon rows.
    const rage = feature?.grants?.find((g) => g.type === "while-active");
    expect(rage).toMatchObject({ type: "while-active", activeKey: "barbarian-rage" });
    const rider =
      rage?.type === "while-active"
        ? rage.grants.find((g) => g.type === "damage-rider")
        : undefined;
    expect(rider).toMatchObject({
      type: "damage-rider",
      dice: "2d6",
      diceByLevel: { 1: "2d6", 9: "3d6", 16: "4d6" },
      damageType: "slashing",
      appliesTo: "melee-weapon",
      oncePerTurn: true,
    });
  });

  it("no longer carries the 2014 bonus-action Frenzy Attack mechanic", () => {
    expect(feature?.mechanics).toBeUndefined();
  });

  it("prose is the concise 2024 wording (EN + IT, mentions Reckless Attack, no exhaustion)", () => {
    expect(srd("class-feature", feature?.id ?? "", "description", "en")).toMatch(
      /Reckless Attack/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "en")).not.toMatch(
      /exhaustion/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "it")).toMatch(
      /Attacco Spericolato/i
    );
    expect(srd("class-feature", feature?.id ?? "", "description", "it")).not.toMatch(
      /affaticamento/i
    );
    expect(
      srd("class-feature", feature?.id ?? "", "description", "it").length
    ).toBeGreaterThan(0);
  });
});

describe("Frenzy rider dice scale on melee attack rows at L1 / L9 / L16 (while raging)", () => {
  function berserkerAt(level: number, activeRage = true): CharacterDoc {
    return {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        classes: [{ classId: "barbarian", subclassId: "berserker", level: level }],
        // The Rage feature must be present for its while-active toggle to exist.
        features: [{ srdId: "barbarian-rage" }, { srdId: FRENZY_ID }],
        weapons: [{ srdId: "greataxe", quantity: 1 }],
      },
      session: {
        ...MOCK_CHARACTER.session,
        activeFeatures: activeRage ? ["barbarian-rage"] : [],
      },
    };
  }

  function frenzyDice(level: number): string | undefined {
    const actions = resolveActions(berserkerAt(level));
    const axe = actions.find((a) => a.source === "weapon");
    return axe?.summary.extraDamage?.find((d) => d.damageType === "slashing")?.dice;
  }

  it("L1 → 2d6", () => {
    expect(frenzyDice(1)).toBe("2d6");
  });

  it("L9 → 3d6", () => {
    expect(frenzyDice(9)).toBe("3d6");
  });

  it("L16 → 4d6", () => {
    expect(frenzyDice(16)).toBe("4d6");
  });

  it("the extra damage is once per turn", () => {
    const actions = resolveActions(berserkerAt(9));
    const axe = actions.find((a) => a.source === "weapon");
    const rider = axe?.summary.extraDamage?.find((d) => d.damageType === "slashing");
    expect(rider?.oncePerTurn).toBe(true);
  });

  it("with Rage INACTIVE, the Frenzy rider does NOT show on the weapon row (M15 gate)", () => {
    // fail-before: the rider was a bare top-level grant, so it rendered even when
    // not raging. Now the while-active gate hides it until Rage is active.
    const actions = resolveActions(berserkerAt(9, false));
    const axe = actions.find((a) => a.source === "weapon");
    expect(
      axe?.summary.extraDamage?.find((d) => d.damageType === "slashing")
    ).toBeUndefined();
  });
});
