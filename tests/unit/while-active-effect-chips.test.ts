/**
 * While-active EFFECT-CHIP suffix (cluster-c1-activechip) — the presenter parity
 * that lets EVERY effect chip gated on a `while-active` toggle (Rage, Innate
 * Sorcery, Trance of Order, …) self-label "· active", not just the weapon-damage
 * breakdown note.
 *
 * Before this seam, only `weaponDamageBonuses` carried `whileActiveKey`, so a
 * damage-RIDER, an ADVANTAGE clause, and a ROLL-FLOOR clause that arrive through
 * the SAME while-active block rendered WITHOUT the suffix even while the toggle
 * was up. The fix threads `whileActiveKey` onto those three aggregate structs
 * (mirroring `weapon-damage-bonus`) and surfaces it as `whileActive` on each
 * presenter VM.
 *
 * Pinned at the engine seam (`evaluateGrants`) + the `lib/views` presenters (the
 * cheapest test — pure functions, no full render): a synthetic source whose
 * while-active block carries all three grant kinds yields VMs with
 * `whileActive: true`, while an UNCONDITIONAL source of the same kinds does not.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { deriveAdvantageChips } from "@/lib/views/sheet-view";
import { advantageChipVMs, rollFloorVMs } from "@/lib/views/tracker-view";
import { buildRiders } from "@/lib/views/rider-view";
import { resolveActions, type RawResolvedAction } from "@/lib/smart-tracker";
import { buildScenario } from "@/lib/dev-scenarios";
import type { AbilityCode } from "@/data/types";

const ACTIVE = "demo-toggle";

/** A source whose while-active block carries a damage-rider + advantage + roll-floor. */
const gatedSource: GrantSource = {
  id: "gated",
  name: { en: "Demo Toggle", it: "Interruttore" },
  grants: [
    {
      type: "while-active",
      activeKey: ACTIVE,
      label: { en: "Demo Toggle", it: "Interruttore" },
      grants: [
        {
          type: "damage-rider",
          dice: "1d6",
          damageType: "radiant",
          appliesTo: "melee-weapon",
          oncePerTurn: true,
        },
        {
          type: "advantage-on",
          rollType: "check",
          vs: "str",
          description: { en: "Advantage on STR checks", it: "Vantaggio TS FOR" },
        },
        {
          type: "roll-floor",
          rollType: "check",
          floor: 10,
          appliesTo: "all",
          description: { en: "Treat ≤9 as 10", it: "Tratta ≤9 come 10" },
        },
      ],
    },
  ],
};

/** An UNCONDITIONAL source of the same three grant kinds (no while-active wrapper). */
const plainSource: GrantSource = {
  id: "plain",
  name: { en: "Plain Feature", it: "Tratto" },
  grants: [
    {
      type: "damage-rider",
      dice: "1d6",
      damageType: "radiant",
      appliesTo: "melee-weapon",
      oncePerTurn: true,
    },
    {
      type: "advantage-on",
      rollType: "check",
      vs: "dex",
      description: { en: "Advantage on DEX checks", it: "Vantaggio Prove DES" },
    },
    {
      type: "roll-floor",
      rollType: "check",
      floor: 10,
      appliesTo: "proficient",
      description: { en: "Treat ≤9 as 10 (proficient)", it: "Tratta ≤9 come 10" },
    },
  ],
};

describe("while-active effect chips carry the active suffix", () => {
  it("threads whileActiveKey onto the three aggregate structs when the toggle is up", () => {
    const agg = evaluateGrants([gatedSource], new Set([ACTIVE]));
    expect(agg.damageRiders[0]?.whileActiveKey).toBe(ACTIVE);
    expect(agg.advantages[0]?.whileActiveKey).toBe(ACTIVE);
    expect(agg.rollFloors[0]?.whileActiveKey).toBe(ACTIVE);
  });

  it("ADVANTAGE chip VM is flagged whileActive (suffix · active)", () => {
    const agg = evaluateGrants([gatedSource], new Set([ACTIVE]));
    const vm = advantageChipVMs(deriveAdvantageChips(agg), "en");
    expect(vm[0]?.whileActive).toBe(true);
  });

  it("ROLL-FLOOR note VM is flagged whileActive (suffix · active)", () => {
    const agg = evaluateGrants([gatedSource], new Set([ACTIVE]));
    const vm = rollFloorVMs(agg.rollFloors, "en");
    expect(vm[0]?.whileActive).toBe(true);
  });

  it("DAMAGE-RIDER chip VM is flagged whileActive end-to-end (Berserker Frenzy while raging)", () => {
    // Full path: a raging Berserker's Frenzy `damage-rider` (gated on the
    // `barbarian-rage` while-active toggle) → `extraDamage` → the rider VM. The
    // melee-weapon rider rides the carried greataxe ONLY while raging.
    const S: Record<AbilityCode, number> = {
      STR: 18,
      DEX: 14,
      CON: 16,
      INT: 8,
      WIS: 12,
      CHA: 10,
    };
    const doc = buildScenario({
      name: "Santaera",
      raceId: "orc",
      classId: "barbarian",
      subclassId: "berserker",
      level: 3,
      background: "soldier",
      abilityScores: S,
      weapons: [{ srdId: "greataxe", quantity: 1 }],
      activeFeatures: ["barbarian-rage"],
    });
    const weapon = resolveActions(doc).find(
      (a: RawResolvedAction) => a.source === "weapon"
    );
    const riders = weapon ? buildRiders(weapon.summary, "en") : [];
    const frenzy = riders.find((r) => r.kind === "damage");
    expect(frenzy).toBeDefined();
    expect(frenzy?.whileActive).toBe(true);
  });

  it("UNCONDITIONAL effects of the same kinds are NOT flagged (no suffix)", () => {
    const agg = evaluateGrants([plainSource]);
    expect(agg.damageRiders[0]?.whileActiveKey).toBeUndefined();
    expect(agg.advantages[0]?.whileActiveKey).toBeUndefined();
    expect(agg.rollFloors[0]?.whileActiveKey).toBeUndefined();

    const advVm = advantageChipVMs(deriveAdvantageChips(agg), "en");
    expect(advVm[0]?.whileActive).toBeUndefined();

    const floorVm = rollFloorVMs(agg.rollFloors, "en");
    expect(floorVm[0]?.whileActive).toBeUndefined();

    const riderVm = buildRiders(
      {
        extraDamage: [
          {
            dice: "1d6",
            damageType: "radiant",
            oncePerTurn: true,
            source: { lit: { en: "Plain Feature", it: "Tratto" } },
          },
        ],
      },
      "en"
    );
    expect(riderVm[0]?.whileActive).toBeUndefined();
  });
});
