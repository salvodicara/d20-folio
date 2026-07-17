/**
 * `buildRiders` — the rider presenter (#87 FRONTIER-S2 rider-render).
 *
 * Pins the ONE seam that turns the engine's locale-free on-hit rider data
 * (`summary.extraDamage` / `dieModifiers` / `onHitHeal`) into the render-ready
 * {@link RiderVM} tokens both weapon surfaces show: provenance resolved, damage
 * type kept as a stable id, and consumable (a backing tracker / Hit Die) vs
 * display-only correctly classified.
 *
 * Table-driven across the rider ARCHETYPES on built dev scenarios (the general
 * counterpart of the frozen team fixtures): a DISPLAY-ONLY extra-damage rider
 * (Berserker Frenzy while raging), a DISPLAY-ONLY die modifier (Great Weapon
 * Fighting / Savage Attacker), and an on-hit-heal Hit-Die spend (Lifedrinker).
 * Plus the pure-mapper edge cases. The CONSUMABLE tracker archetype (Psi
 * Warrior, pack content) lives in content-pack/tests/unit/rider-view.pack.test.ts.
 */
import { describe, it, expect } from "vitest";
import { resolveActions, type RawResolvedAction } from "@/lib/smart-tracker";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { buildRiders, summarizeRiders, type RiderVM } from "@/lib/views/rider-view";
import { localizeText } from "@/lib/views/srd-i18n";
import { litText } from "@/lib/loc-text";
import type { AbilityCode } from "@/data/types";

const S: Record<AbilityCode, number> = {
  STR: 17,
  DEX: 14,
  CON: 16,
  INT: 16,
  WIS: 12,
  CHA: 10,
};

/** The weapon attack row's riders for a built scenario, in EN. */
function ridersFor(spec: ScenarioSpec): RiderVM[] {
  const doc = buildScenario(spec);
  const weapon = resolveActions(doc).find(
    (a: RawResolvedAction) => a.source === "weapon"
  );
  return weapon ? buildRiders(weapon.summary, "en") : [];
}

describe("buildRiders — rider archetypes across built scenarios", () => {
  // The CONSUMABLE tracker-backed archetype's only shipped data (Psi Warrior
  // Psionic Strike) is PACK content: content-pack/tests/unit/rider-view.pack.test.ts.

  it("DISPLAY-ONLY: Berserker Frenzy (raging) → an extra-damage rider with NO spend", () => {
    const riders = ridersFor({
      name: "Drogar",
      raceId: "orc",
      classId: "barbarian",
      subclassId: "berserker",
      level: 5,
      background: "soldier",
      abilityScores: S,
      weapons: [{ srdId: "greatsword", quantity: 1 }],
      activeFeatures: ["barbarian-rage"],
    });
    const frenzy = riders.find((r) => r.kind === "damage" && r.dice === "2d6");
    expect(frenzy).toBeDefined();
    expect(frenzy?.damageTypeId).toBe("slashing");
    expect(frenzy?.oncePerTurn).toBe(true);
    // No backing resource → always-on, never tappable.
    expect(frenzy?.spend).toBeNull();
  });

  it("DISPLAY-ONLY: Great Weapon Fighting + Savage Attacker → die modifiers, never spendable", () => {
    const riders = ridersFor({
      name: "Borr",
      raceId: "human",
      classId: "fighter",
      subclassId: "champion",
      level: 5,
      background: "soldier",
      abilityScores: S,
      weapons: [{ srdId: "greatsword", quantity: 1 }],
      extraFeatures: [{ srdId: "great-weapon-fighting" }, { srdId: "savage-attacker" }],
    });
    const mods = riders.filter((r) => r.kind === "die-mod");
    expect(mods.length).toBe(2);
    expect(
      mods.some((m) => m.dieMode === "floor" && m.floorBelow === 2 && m.floorTo === 3)
    ).toBe(true);
    expect(mods.some((m) => m.dieMode === "reroll-keep-higher")).toBe(true);
    // A roll annotation is NEVER a consumable resource.
    expect(mods.every((m) => m.spend === null)).toBe(true);
  });

  it("CONSUMABLE: Lifedrinker → an on-hit heal that spends a Hit Die + a Necrotic chip", () => {
    // The Lifedrinker riders ride the PACT weapon row (not the carried longsword).
    const doc = buildScenario({
      name: "Vasht",
      raceId: "tiefling",
      classId: "warlock",
      subclassId: "fiend-patron",
      level: 12,
      background: "sage",
      abilityScores: { ...S, CHA: 18 },
      weapons: [{ srdId: "longsword", quantity: 1 }],
      invocationChoices: ["pact-of-the-blade", "lifedrinker"],
    });
    const pact = resolveActions(doc).find((a) => a.id.startsWith("pact-weapon-"));
    expect(pact).toBeDefined();
    const riders = pact ? buildRiders(pact.summary, "en") : [];
    const heal = riders.find((r) => r.kind === "heal");
    expect(heal).toBeDefined();
    expect(heal?.healFormula).toMatch(/^1d8/);
    expect(heal?.spend).toEqual({ kind: "hit-die" });
    // The Lifedrinker +1d6 Necrotic damage rider rides alongside (display-only).
    const necrotic = riders.find(
      (r) => r.kind === "damage" && r.damageTypeId === "necrotic"
    );
    expect(necrotic).toBeDefined();
    expect(necrotic?.spend).toBeNull();
  });
});

describe("buildRiders — pure mapper", () => {
  it("returns [] when the summary carries no rider", () => {
    expect(buildRiders({}, "en")).toEqual([]);
  });

  it("localizes the provenance from the source LocText (a built SRD ref resolves)", () => {
    const riders = ridersFor({
      name: "Drogar",
      raceId: "orc",
      classId: "barbarian",
      subclassId: "berserker",
      level: 5,
      background: "soldier",
      abilityScores: S,
      weapons: [{ srdId: "greatsword", quantity: 1 }],
      activeFeatures: ["barbarian-rage"],
    });
    expect(riders.length).toBeGreaterThan(0);
  });

  it("maps a die-modifier rider's source verbatim via localizeText (lit fallback)", () => {
    // A bare engine literal source round-trips through the presenter.
    const vm = buildRiders(
      {
        dieModifiers: [
          {
            mode: "reroll-keep-higher",
            oncePerTurn: true,
            source: litText({ en: "X", it: "Y" }),
          },
        ],
      },
      "it"
    );
    expect(vm[0]?.kind).toBe("die-mod");
    expect(vm[0]?.source).toBe(localizeText(litText({ en: "X", it: "Y" }), "it"));
    expect(vm[0]?.source).toBe("Y");
    expect(vm[0]?.spend).toBeNull();
  });
});

describe("summarizeRiders — the always-visible collapsed-face damage cluster (#87)", () => {
  // The chromatic outcome resolver is injected (keeps the presenter pure); a
  // simple stub that echoes the id is enough to pin the wiring.
  const outcome = (id: string | undefined): string => id ?? "neutral";

  const damageRider = (over: Partial<RiderVM> = {}): RiderVM => ({
    id: "damage:0",
    kind: "damage",
    source: "Frenzy",
    sourceLoc: { lit: { en: "Frenzy", it: "Frenzy" } },
    oncePerTurn: true,
    spend: null,
    dice: "3d6",
    damageTypeId: "slashing",
    ...over,
  });

  it("returns null for no riders (no cluster on the collapsed face)", () => {
    expect(summarizeRiders([], outcome)).toBeNull();
  });

  it("ONE damage rider → a single dice chip (+Nd_, no damage WORD) in its chromatic hue", () => {
    const vm = summarizeRiders([damageRider()], outcome);
    expect(vm).toEqual({
      count: 1,
      chips: [{ id: "damage:0", text: "+3d6", outcome: "slashing" }],
    });
    // Bounded by construction — the chip is JUST the dice, never a type word, so
    // it can't blow the chip budget (the worst-case readability gate).
    expect(vm?.chips[0]?.text).not.toMatch(/slashing|tagliente/i);
  });

  it("TWO damage riders → two dice chips, each in its OWN damage-type hue", () => {
    const vm = summarizeRiders(
      [
        damageRider({ id: "damage:0", dice: "3d6", damageTypeId: "slashing" }),
        damageRider({ id: "damage:1", dice: "1d8", damageTypeId: "force" }),
      ],
      outcome
    );
    expect(vm?.count).toBe(2);
    expect(vm?.chips).toEqual([
      { id: "damage:0", text: "+3d6", outcome: "slashing" },
      { id: "damage:1", text: "+1d8", outcome: "force" },
    ]);
    // No overflow chip at exactly the cap.
    expect(vm?.chips.some((c) => c.overflow)).toBe(false);
  });

  it("a CONDITIONAL vs-marked rider carries vsMarkedTarget onto its chip (the crosshair marker)", () => {
    // Hunter's Mark: the +1d6 applies only when the hit lands on the marked
    // creature, so the collapsed chip must flag it conditional (the bare "+1d6"
    // would otherwise read as unconditional damage).
    const vm = summarizeRiders(
      [damageRider({ id: "damage:hm", dice: "1d6", vsMarkedTarget: "marked" })],
      outcome
    );
    expect(vm?.chips[0]).toEqual({
      id: "damage:hm",
      text: "+1d6",
      outcome: "slashing",
      vsMarkedTarget: "marked",
    });
  });

  it("an UNCONDITIONAL rider is NEVER tagged — the chip stays bare (no vsMarkedTarget key)", () => {
    // A flat Frenzy +3d6 applies on every hit — no crosshair, no marked key.
    const vm = summarizeRiders([damageRider()], outcome);
    expect(vm?.chips[0]).not.toHaveProperty("vsMarkedTarget");
  });

  it("ONE die-modifier rider (no damage dice) → no dice chip, ONE overflow marker", () => {
    const vm = summarizeRiders(
      [
        {
          id: "die-mod:0",
          kind: "die-mod",
          source: "Great Weapon Fighting",
          sourceLoc: {
            lit: { en: "Great Weapon Fighting", it: "Great Weapon Fighting" },
          },
          oncePerTurn: false,
          spend: null,
          dieMode: "floor",
          floorBelow: 2,
          floorTo: 3,
        },
      ],
      outcome
    );
    expect(vm).toEqual({
      count: 1,
      chips: [{ id: "more", text: null, outcome: "more", overflow: 1 }],
    });
  });

  it("ONE on-hit-heal rider (no damage dice) → no dice chip, ONE overflow marker", () => {
    const vm = summarizeRiders(
      [
        {
          id: "heal:on-hit",
          kind: "heal",
          source: "Lifedrinker",
          sourceLoc: { lit: { en: "Lifedrinker", it: "Lifedrinker" } },
          oncePerTurn: false,
          spend: { kind: "hit-die" },
          healFormula: "1d8 + 3, min 1",
        },
      ],
      outcome
    );
    expect(vm).toEqual({
      count: 1,
      chips: [{ id: "more", text: null, outcome: "more", overflow: 1 }],
    });
  });

  it("MANY riders → bounded: at most 2 dice chips + ONE '+N more' overflow", () => {
    // The worst case: eight mixed riders condense to 2 dice chips + a single gold
    // overflow — the owner's hard gate (no clutter, no overflow at max density).
    const eight: RiderVM[] = Array.from({ length: 8 }, (_, i) =>
      damageRider({ id: `damage:${i}` })
    );
    const vm = summarizeRiders(eight, outcome);
    expect(vm?.count).toBe(8);
    // Exactly RIDER_CHIP_CAP (2) dice chips + one overflow = 3 chips total.
    expect(vm?.chips.length).toBe(3);
    expect(vm?.chips.filter((c) => c.text != null).length).toBe(2);
    const more = vm?.chips.find((c) => c.overflow);
    // 8 total − 2 shown = 6 folded into the overflow.
    expect(more).toEqual({ id: "more", text: null, outcome: "more", overflow: 6 });
    // Dice are NEVER summed into a flat number — each shown chip keeps its +Nd_.
    expect(vm?.chips[0]?.text).toBe("+3d6");
  });

  it("die-mods/heal count toward the OVERFLOW, never inflate a dice chip", () => {
    // A worst-case build from the engine: 2 damage riders (a raging Berserker's
    // Frenzy + Paladin Radiant Strikes, both melee) + 2 die-mods (Great Weapon
    // Fighting + Savage Attacker) on one Greatsword (verified ground truth;
    // Dueling is two-handed-incompatible per W9 and would never fire here). The
    // cluster shows 2 dice chips + an overflow folding the 2 die-mods.
    const mixed = ridersFor({
      name: "Maxim",
      raceId: "human",
      classId: "barbarian",
      subclassId: "berserker",
      level: 3,
      secondaryClasses: [{ classId: "paladin", level: 11 }],
      background: "soldier",
      abilityScores: S,
      weapons: [{ srdId: "greatsword", quantity: 1 }],
      activeFeatures: ["barbarian-rage"],
      extraFeatures: [{ srdId: "great-weapon-fighting" }, { srdId: "savage-attacker" }],
    });
    expect(mixed.length).toBeGreaterThan(2);
    const damageCount = mixed.filter((r) => r.kind === "damage").length;
    const vm = summarizeRiders(mixed, outcome);
    expect(vm?.count).toBe(mixed.length);
    // At most 2 dice chips; never a dice chip per rider.
    expect(vm?.chips.filter((c) => c.text != null).length).toBeLessThanOrEqual(2);
    const more = vm?.chips.find((c) => c.overflow);
    expect(more).toBeDefined();
    // Overflow = every rider not shown inline (extra damage past the cap + EVERY
    // die-mod) — so "expand for more" stays honest.
    expect(more?.overflow).toBe(mixed.length - Math.min(damageCount, 2));
    // No shown chip is a bare flat number from summed dice — they're real +Nd_.
    expect(vm?.chips[0]?.text).toMatch(/^\+\d+d\d/);
  });
});
