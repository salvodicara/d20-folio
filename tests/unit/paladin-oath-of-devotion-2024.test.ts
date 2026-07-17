/**
 * Paladin Oath of Devotion — 2024 RAW corrections.
 *
 * Verified against dnd2024.wikidot.com/paladin:oath-of-devotion (offline mirror
 * at dnd2024.wikidot.com/paladin:oath-of-devotion):
 *   - Level 15 is "Smite of Protection" (2024) — replaces the 2014
 *     "Purity of Spirit", which must no longer exist.
 *   - Level 20 "Holy Nimbus" is rewritten to 2024 wording: a Bonus-Action
 *     toggle granting Advantage on saving throws forced by Fiends/Undead
 *     (Holy Ward), a 30-ft Bright-Light radiant emanation (CHA mod + PB), and
 *     1/Long Rest usage (restorable via a level-5 spell slot).
 *   - Level 3 grants Sacred Weapon ONLY — the 2014 "Turn the Unholy" Channel
 *     Divinity option was dropped in 2024, and Sacred Weapon itself is the 2024
 *     version (triggered on the Attack action, 10 minutes, minimum +1).
 */
import { describe, expect, it } from "vitest";
import { srd } from "../_harness/loc";
import { classFeatureIndex } from "@/data/classes";
import { PALADIN_TABLE } from "@/data/classes/paladin";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { resolveWeaponAttackBonuses } from "@/lib/smart-tracker";
import type { AbilityCode } from "@/data/types";

/** A full ability-score record at a single value (only CHA matters for Sacred
 *  Weapon; the others are filler). `chaScore` drives the +CHA-mod resolution. */
function scoresWithCha(chaScore: number): Record<AbilityCode, number> {
  return { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: chaScore };
}

describe("Oath of Devotion — 2024 feature roster", () => {
  it("the 2014 'Purity of Spirit' feature no longer exists", () => {
    expect(classFeatureIndex.get("paladin-devotion-purity-of-spirit")).toBeUndefined();
  });

  it("level 15 grants 'Smite of Protection' (not Purity of Spirit)", () => {
    const smite = classFeatureIndex.get("paladin-devotion-smite-of-protection");
    expect(smite).toBeDefined();
    expect(smite?.level).toBe(15);
    expect(smite?.subclass).toBe("oath-of-devotion");
    expect(srd("class-feature", smite?.id ?? "", "name", "en")).toBe(
      "Smite of Protection"
    );
    expect(srd("class-feature", smite?.id ?? "", "name", "it")).toBeTruthy();
  });

  it("the subclass featureIds list references Smite of Protection, not Purity of Spirit", () => {
    const devotion = PALADIN_TABLE.subclasses.find((s) => s.id === "oath-of-devotion");
    expect(devotion?.featureIds).toContain("paladin-devotion-smite-of-protection");
    expect(devotion?.featureIds).not.toContain("paladin-devotion-purity-of-spirit");
  });

  it("Holy Nimbus is the level-20 feature", () => {
    const nimbus = classFeatureIndex.get("paladin-devotion-holy-nimbus");
    expect(nimbus).toBeDefined();
    expect(nimbus?.level).toBe(20);
    expect(nimbus?.subclass).toBe("oath-of-devotion");
  });

  it("the 2014 'Turn the Unholy' Channel Divinity option no longer exists", () => {
    expect(classFeatureIndex.get("paladin-devotion-turn-the-unholy")).toBeUndefined();
  });

  it("the subclass featureIds grant Sacred Weapon but NOT Turn the Unholy", () => {
    const devotion = PALADIN_TABLE.subclasses.find((s) => s.id === "oath-of-devotion");
    expect(devotion?.featureIds).toContain("paladin-devotion-sacred-weapon");
    expect(devotion?.featureIds).not.toContain("paladin-devotion-turn-the-unholy");
  });
});

describe("Sacred Weapon — 2024 mechanics (L3)", () => {
  const sacred = classFeatureIndex.get("paladin-devotion-sacred-weapon");

  it("exists at level 3 on the Devotion subclass", () => {
    expect(sacred).toBeDefined();
    expect(sacred?.level).toBe(3);
    expect(sacred?.subclass).toBe("oath-of-devotion");
    expect(srd("class-feature", sacred?.id ?? "", "name", "it")).toBeTruthy();
  });

  it("triggers off the Attack action (free), consuming a Channel Divinity use", () => {
    const action = sacred?.mechanics?.actions?.[0];
    expect(action?.type).toBe("free");
    expect(action?.costTracker).toBe("paladin-channel-divinity");
  });

  it("uses the 2024 wording — 10 minutes, minimum +1, Radiant option", () => {
    const en = srd("class-feature", sacred?.id ?? "", "description", "en") || "";
    expect(en).toContain("Attack action");
    expect(en).toContain("10 minutes");
    expect(en).toContain("minimum bonus of +1");
    expect(en).toContain("Radiant");
    // The 2014 "1 minute" / standalone-action wording must be gone.
    expect(en).not.toContain("For 1 minute");
  });
});

describe("Sacred Weapon — +CHA-mod (min +1) to-hit (S10 ability-derived weapon-attack-bonus)", () => {
  const id = "paladin-devotion-sacred-weapon";
  const sacred = classFeatureIndex.get(id);

  // ── Data: the to-hit half is wired inside a self-keyed while-active toggle ──

  it("wraps a single ability-derived weapon-attack-bonus in a self-keyed while-active toggle", () => {
    const grant = sacred?.grants?.[0];
    expect(grant?.type).toBe("while-active");
    if (grant?.type !== "while-active") throw new Error("expected while-active grant");
    expect(grant.activeKey).toBe(id);
    // ONLY the to-hit half is modeled — the Radiant-type election and the Light
    // emission are prose by doctrine.
    expect(grant.grants).toHaveLength(1);
    const inner = grant.grants[0];
    expect(inner?.type).toBe("weapon-attack-bonus");
    if (inner?.type !== "weapon-attack-bonus") {
      throw new Error("expected weapon-attack-bonus grant");
    }
    // +CHA modifier (minimum +1), melee scope (RAW imbues a Melee weapon).
    expect(inner.amount).toEqual({ ability: "CHA", min: 1 });
    expect(inner.scope).toBe("melee");
  });

  // ── Aggregate: the bonus rides ONLY while the toggle is LIT ─────────────────

  const source: GrantSource = {
    id,
    name: { en: "Sacred Weapon", it: "Arma Sacra" },
    grants: sacred?.grants ?? [],
  };

  it("the to-hit bonus is absent when Sacred Weapon is off (and surfaces the toggle)", () => {
    const off = evaluateGrants([source]);
    expect(off.weaponAttackBonuses).toHaveLength(0);
    expect(off.activatableGroups.map((g) => g.key)).toContain(id);
  });

  it("the to-hit bonus enters the aggregate (unresolved, while-active-tagged) when lit", () => {
    const on = evaluateGrants([source], new Set([id]));
    expect(on.weaponAttackBonuses).toEqual([
      {
        amount: { ability: "CHA", min: 1 },
        scope: "melee",
        sourceId: id,
        whileActiveKey: id,
      },
    ]);
  });

  // ── Resolver: +CHA mod with the min floor, melee-scoped, retracts when off ──

  it("resolves to +CHA modifier on a melee weapon — CHA 16 → +3", () => {
    const on = evaluateGrants([source], new Set([id]));
    const resolved = resolveWeaponAttackBonuses(on.weaponAttackBonuses, {
      isRanged: false,
      scores: scoresWithCha(16),
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.amount).toBe(3);
    expect(resolved[0]?.sourceId).toBe(id);
    expect(resolved[0]?.whileActive).toBe(true);
  });

  it("clamps to the +1 minimum — CHA 10 (modifier +0) → +1, NOT +0", () => {
    const on = evaluateGrants([source], new Set([id]));
    const resolved = resolveWeaponAttackBonuses(on.weaponAttackBonuses, {
      isRanged: false,
      scores: scoresWithCha(10),
    });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.amount).toBe(1);
  });

  it("does NOT ride a RANGED weapon (melee scope) — even when lit", () => {
    const on = evaluateGrants([source], new Set([id]));
    const resolved = resolveWeaponAttackBonuses(on.weaponAttackBonuses, {
      isRanged: true,
      scores: scoresWithCha(16),
    });
    expect(resolved).toHaveLength(0);
  });

  it("retracts entirely when the toggle is OFF (nothing to resolve)", () => {
    const off = evaluateGrants([source]);
    const resolved = resolveWeaponAttackBonuses(off.weaponAttackBonuses, {
      isRanged: false,
      scores: scoresWithCha(16),
    });
    expect(resolved).toHaveLength(0);
  });

  it("a non-Devotion source grants no Sacred-Weapon to-hit (others unaffected)", () => {
    // An unrelated GrantSource carries no weapon-attack-bonus; the aggregate is
    // empty whether or not the Sacred Weapon key is (spuriously) active.
    const other: GrantSource = { id: "x", name: { en: "x", it: "x" }, grants: [] };
    const agg = evaluateGrants([other], new Set([id]));
    expect(agg.weaponAttackBonuses).toHaveLength(0);
  });
});

describe("Oath of Devotion — subclass features resolve at the corrected levels", () => {
  // W10: the BASE class `levels[]` table is subclass-AGNOSTIC — these features live
  // on their own `f.subclass`-tagged rows (surfaced by `getFeaturesAtLevel` + the
  // subclass filter at level-up), NEVER in the base table. So we assert against the
  // subclass feature DEFINITIONS (the single source of truth), not the base table.
  const subclassFeatureAt = (id: string, level: number) => {
    const f = classFeatureIndex.get(id);
    return f?.subclass === "oath-of-devotion" && f.level === level;
  };

  it("Smite of Protection is the L15 Devotion feature (and Purity of Spirit is gone)", () => {
    expect(subclassFeatureAt("paladin-devotion-smite-of-protection", 15)).toBe(true);
    expect(classFeatureIndex.get("paladin-devotion-purity-of-spirit")).toBeUndefined();
  });

  it("Holy Nimbus is the L20 Devotion feature", () => {
    expect(subclassFeatureAt("paladin-devotion-holy-nimbus", 20)).toBe(true);
  });

  it("Sacred Weapon is the L3 Devotion feature (and Turn the Unholy is gone)", () => {
    expect(subclassFeatureAt("paladin-devotion-sacred-weapon", 3)).toBe(true);
    expect(classFeatureIndex.get("paladin-devotion-turn-the-unholy")).toBeUndefined();
  });
});

describe("Holy Nimbus — 2024 mechanics", () => {
  const nimbus = classFeatureIndex.get("paladin-devotion-holy-nimbus");

  it("activates via a Bonus Action with a 1/Long Rest tracker", () => {
    expect(nimbus?.mechanics?.actions?.[0]?.type).toBe("bonus");
    expect(nimbus?.mechanics?.tracker).toEqual({ total: "1", recovery: "long-rest" });
  });

  it("wraps the Holy Ward advantage in a while-active toggle keyed to itself", () => {
    const grant = nimbus?.grants?.[0];
    expect(grant?.type).toBe("while-active");
    if (grant?.type !== "while-active") throw new Error("expected while-active grant");
    expect(grant.activeKey).toBe("paladin-devotion-holy-nimbus");
    expect(grant.grants[0]?.type).toBe("advantage-on");
  });

  it("Holy Ward advantage applies only while the toggle is active", () => {
    const source: GrantSource = {
      id: "paladin-devotion-holy-nimbus",
      name: { en: "Holy Nimbus", it: "Nimbo Sacro" },
      grants: nimbus?.grants ?? [],
    };

    // Off — no advantage reported, but the toggle is surfaced for the UI.
    const off = evaluateGrants([source]);
    expect(off.advantages).toHaveLength(0);
    expect(off.activatableGroups.map((g) => g.key)).toContain(
      "paladin-devotion-holy-nimbus"
    );

    // On — the save advantage merges into the aggregate.
    const on = evaluateGrants([source], new Set(["paladin-devotion-holy-nimbus"]));
    expect(on.advantages).toHaveLength(1);
    expect(on.advantages[0]?.rollType).toBe("save");
    expect(on.advantages[0]?.sourceId).toBe("paladin-devotion-holy-nimbus");
    expect(on.advantages[0]?.vs).toBe("fiend-undead-saves");
  });
});
