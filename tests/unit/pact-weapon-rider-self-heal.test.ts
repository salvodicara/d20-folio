/**
 * On-hit self-heal (Hit-Die-spend) primitive — Lifedrinker.
 *
 * The `pact-weapon-rider`'s `healFromHitDie` flag was previously only prose: a
 * row `effect` note read "expend a Hit Die to heal". This suite proves the
 * mechanic is now MODELED as a structured `summary.onHitHeal` facet that the
 * consumer computes from the character's Hit Die + Constitution modifier.
 *
 * SRD (dnd2024.wikidot.com/warlock:eldritch-invocations, "Lifedrinker Source:"):
 *   "Once per turn when you hit a creature with your pact weapon, you can deal
 *    an extra 1d6 … damage … and you can expend one of your Hit Point Dice to
 *    roll it and regain a number of Hit Points equal to the roll plus your
 *    Constitution modifier (minimum of 1 Hit Point)."
 *
 * → the heal = the character's class Hit Die (d8 for a Warlock) + CON mod, with
 * a 1-HP floor. Override-first: the engine NEVER auto-spends a Hit Die — it
 * emits the formula and a `spendsHitDie` marker so the (UI-owned) renderer can
 * gate the heal behind an explicit spend; no dice are rolled in the engine.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource, type PactWeapon } from "@/lib/grants";
import {
  resolveActions,
  resolvePactWeaponAttacks,
  resolvePactWeaponRiderHeal,
} from "@/lib/smart-tracker";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { AbilityCode } from "@/data/types";
import type { CharacterDoc } from "@/types/character";
import { localizeAction } from "@/lib/views/combat-action-view";

const pactOfTheBlade: GrantSource = {
  id: "pact-of-the-blade",
  name: { en: "Pact Weapon", it: "Arma del Patto" },
  grants: [
    {
      type: "pact-weapon",
      id: "pact-of-the-blade",
      name: { en: "Pact Weapon", it: "Arma del Patto" },
      attackAbility: "CHA",
      damageTypeChoices: ["necrotic", "psychic", "radiant"],
      isFocus: true,
      conjureSlot: "bonus",
      defaultDamageDie: "1d8",
      defaultDamageType: "slashing",
    },
  ],
};

const lifedrinker: GrantSource = {
  id: "lifedrinker",
  name: { en: "Lifedrinker", it: "" },
  grants: [
    {
      type: "pact-weapon-rider",
      id: "lifedrinker",
      name: { en: "Lifedrinker", it: "" },
      dice: "1d6",
      damageTypeChoices: ["necrotic", "psychic", "radiant"],
      healFromHitDie: true,
    },
  ],
};

// Eldritch Smite has NO heal — the slot-cost/Prone rider, used to prove the
// consumer emits NO onHitHeal facet for a rider that does not heal.
const eldritchSmite: GrantSource = {
  id: "eldritch-smite",
  name: { en: "Eldritch Smite", it: "" },
  grants: [
    {
      type: "pact-weapon-rider",
      id: "eldritch-smite",
      name: { en: "Eldritch Smite", it: "" },
      dice: "1d8",
      damageType: "force",
      costsPactSlot: true,
      scalesPerSlotLevel: true,
      prone: "huge-or-smaller",
    },
  ],
};

// ── Pure helper: the heal formula (Hit Die + CON mod, min 1) ──────────────────

describe("resolvePactWeaponRiderHeal — Hit Die + CON mod, min 1", () => {
  it("builds 1d8 + CON for a Warlock (d8) with a positive modifier", () => {
    expect(resolvePactWeaponRiderHeal(8, 2)).toEqual({
      formula: "1d8 + 2, min 1",
      dice: "1d8",
      abilityMod: 2,
      minimum: 1,
      spendsHitDie: true,
    });
  });

  it("omits the +N clause when the Constitution modifier is 0", () => {
    const heal = resolvePactWeaponRiderHeal(8, 0);
    expect(heal.formula).toBe("1d8, min 1");
    expect(heal.abilityMod).toBe(0);
  });

  it("renders a negative modifier as a subtraction (the min-1 floor still shows)", () => {
    // A low-CON character: a single Hit Die roll + a negative mod can dip below
    // 1, so the SRD's "minimum of 1 Hit Point" floor must always be surfaced.
    const heal = resolvePactWeaponRiderHeal(8, -1);
    expect(heal.formula).toBe("1d8 - 1, min 1");
    expect(heal.abilityMod).toBe(-1);
    expect(heal.minimum).toBe(1);
  });

  it("rolls the character's OWN Hit Die face, not a fixed d8", () => {
    // (Pact of the Blade is a Warlock feature = d8, but multiclass / overrides
    //  can change the character's hitDieType; the heal must follow it.)
    expect(resolvePactWeaponRiderHeal(10, 3).dice).toBe("1d10");
    expect(resolvePactWeaponRiderHeal(6, 1).dice).toBe("1d6");
    expect(resolvePactWeaponRiderHeal(12, 0).formula).toBe("1d12, min 1");
  });

  it("always marks the heal as Hit-Die-spending (override-first gate)", () => {
    expect(resolvePactWeaponRiderHeal(8, 5).spendsHitDie).toBe(true);
  });
});

// ── Consumer: the row carries the structured onHitHeal facet ──────────────────

const SCORES: Record<AbilityCode, number> = {
  STR: 8,
  DEX: 12,
  CON: 14, // +2
  INT: 10,
  WIS: 10,
  CHA: 18,
};

const baseCtx = {
  abilityScores: SCORES,
  pb: 3,
  exPenalty: 0,
  unpinnedSet: new Set<string>(),
};

const pacts: ReadonlyArray<PactWeapon> = evaluateGrants([pactOfTheBlade]).pactWeapons;

describe("resolvePactWeaponAttacks — Lifedrinker self-heal facet", () => {
  it("attaches a computed onHitHeal facet from the ctx Hit Die + CON mod", () => {
    const riders = evaluateGrants([lifedrinker]).pactWeaponRiders;
    const [row] = resolvePactWeaponAttacks(pacts, {
      ...baseCtx,
      riders,
      conMod: 2,
      hitDieFace: 8,
    });
    // `toMatchObject` allows the additive `source` provenance ref (A1) while
    // pinning the heal facets.
    expect(row?.summary.onHitHeal).toMatchObject({
      formula: "1d8 + 2, min 1",
      dice: "1d8",
      abilityMod: 2,
      minimum: 1,
      spendsHitDie: true,
    });
  });

  it("defaults to a d8 + CON 0 when the ctx omits the Hit Die / CON (Warlock default)", () => {
    const riders = evaluateGrants([lifedrinker]).pactWeaponRiders;
    const [row] = resolvePactWeaponAttacks(pacts, { ...baseCtx, riders });
    expect(row?.summary.onHitHeal?.dice).toBe("1d8");
    expect(row?.summary.onHitHeal?.abilityMod).toBe(0);
    expect(row?.summary.onHitHeal?.spendsHitDie).toBe(true);
  });

  it("emits NO onHitHeal for a rider that does not heal (Eldritch Smite alone)", () => {
    const riders = evaluateGrants([eldritchSmite]).pactWeaponRiders;
    const [row] = resolvePactWeaponAttacks(pacts, {
      ...baseCtx,
      riders,
      pactSlotLevel: 3,
      conMod: 2,
      hitDieFace: 8,
    });
    expect(row?.summary.onHitHeal).toBeUndefined();
    // The (Prone) secondary clause surfaces as a localized effect note (the view
    // composes it from the rider name ref the engine carries).
    const view = row ? localizeAction(row, "en") : undefined;
    expect(view?.summary.effect).toContain("Prone");
  });

  it("emits NO onHitHeal for a plain pact weapon (no riders)", () => {
    const [row] = resolvePactWeaponAttacks(pacts, baseCtx);
    expect(row?.summary.onHitHeal).toBeUndefined();
  });

  it("attaches both the damage chip AND the heal facet when Eldritch Smite + Lifedrinker stack", () => {
    const riders = evaluateGrants([eldritchSmite, lifedrinker]).pactWeaponRiders;
    const [row] = resolvePactWeaponAttacks(pacts, {
      ...baseCtx,
      riders,
      pactSlotLevel: 5,
      conMod: 2,
      hitDieFace: 8,
    });
    expect(row?.summary.extraDamage).toHaveLength(2); // Force + chosen element
    expect(row?.summary.onHitHeal?.formula).toBe("1d8 + 2, min 1"); // Lifedrinker's heal
    const view = row ? localizeAction(row, "en") : undefined;
    expect(view?.summary.effect).toContain("Prone"); // Eldritch Smite's note
  });

  it("only one heal facet even if two heal riders were declared (first wins)", () => {
    const second: GrantSource = {
      id: "lifedrinker-2",
      name: { en: "Lifedrinker (alt)", it: "" },
      grants: [
        {
          type: "pact-weapon-rider",
          id: "lifedrinker-2",
          name: { en: "Lifedrinker (alt)", it: "" },
          dice: "1d6",
          damageTypeChoices: ["necrotic", "psychic", "radiant"],
          healFromHitDie: true,
        },
      ],
    };
    const riders = evaluateGrants([lifedrinker, second]).pactWeaponRiders;
    expect(riders).toHaveLength(2);
    const [row] = resolvePactWeaponAttacks(pacts, {
      ...baseCtx,
      riders,
      conMod: 2,
      hitDieFace: 8,
    });
    expect(row?.summary.onHitHeal).toBeDefined();
  });
});

// ── Override-first: the engine surfaces the heal, never auto-applies it ───────

describe("resolvePactWeaponAttacks — override-first (no auto Hit-Die spend)", () => {
  it("never spends a Hit Die or rolls dice — only emits the formula + spend marker", () => {
    const riders = evaluateGrants([lifedrinker]).pactWeaponRiders;
    const [row] = resolvePactWeaponAttacks(pacts, {
      ...baseCtx,
      riders,
      conMod: 2,
      hitDieFace: 8,
    });
    // The facet is descriptive: a formula STRING + a 'spendsHitDie' gate, never a
    // concrete rolled number (no Math.random / dice in the engine).
    expect(row?.summary.onHitHeal?.formula).toMatch(/^1d8/);
    expect(row?.summary.onHitHeal?.spendsHitDie).toBe(true);
    expect(typeof row?.summary.onHitHeal?.formula).toBe("string");
  });
});

// ── End-to-end through resolveActions (the Combat-page attack list) ───────────

function bladelock(level: number, invocations: string[], con: number): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      classes: [{ classId: "warlock", level, invocationChoices: invocations }],
      hitDieType: 8, // Warlock d8
      abilityScores: { ...SCORES, CON: con },
      features: [],
      weapons: [],
    },
    session: {
      ...MOCK_CHARACTER.session,
      exhaustion: 0,
      conditions: [],
      concentration: "",
    },
  };
}

describe("resolveActions — Lifedrinker self-heal end-to-end", () => {
  it("reads the character's real Hit Die (d8) + CON mod into the pact-weapon row", () => {
    // CON 16 → +3, Warlock d8 → heal = 1d8 + 3, min 1.
    const row = resolveActions(
      bladelock(9, ["pact-of-the-blade", "lifedrinker"], 16)
    ).find((a) => a.id === "pact-weapon-pact-of-the-blade");
    expect(row?.summary.onHitHeal).toMatchObject({
      formula: "1d8 + 3, min 1",
      dice: "1d8",
      abilityMod: 3,
      minimum: 1,
      spendsHitDie: true,
    });
  });

  it("omits the +N clause for a CON-10 (mod 0) bladelock", () => {
    const row = resolveActions(
      bladelock(9, ["pact-of-the-blade", "lifedrinker"], 10)
    ).find((a) => a.id === "pact-weapon-pact-of-the-blade");
    expect(row?.summary.onHitHeal?.formula).toBe("1d8, min 1");
  });

  it("a Bladelock WITHOUT Lifedrinker has no self-heal on the pact-weapon row", () => {
    const row = resolveActions(bladelock(9, ["pact-of-the-blade"], 16)).find(
      (a) => a.id === "pact-weapon-pact-of-the-blade"
    );
    expect(row).toBeDefined();
    expect(row?.summary.onHitHeal).toBeUndefined();
  });
});
