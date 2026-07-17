import { describe, it, expect } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { resolveTrackers, resolveActions } from "@/lib/smart-tracker";
import { getClassTable } from "@/data/classes";
import type { CharacterDoc } from "@/types/character";
import { loc } from "../_harness/loc";

interface MkOpts {
  weapons?: CharacterDoc["character"]["weapons"];
  activeFeatures?: string[];
  /** Extra features beyond `barbarian-rage` (e.g. a feat under test). */
  extraFeatures?: { srdId: string }[];
}

function mk(level: number, opts: MkOpts = {}): CharacterDoc {
  return {
    id: "t",
    createdAt: new Date(),
    updatedAt: new Date(),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
    status: "active",
    character: {
      name: assertNonEmptyString("B"),
      quote: "",
      race: asRaceId("human"),
      classes: [{ classId: "barbarian", level: level }],
      background: "soldier",
      alignment: asAlignmentId("neutral-good"),
      playerName: "",
      speed: "30 ft",
      ac: 14,
      armorNote: "",
      hp: { max: 50 },
      hitDieType: 12,
      languageIds: [],
      customLanguages: [],
      toolProficiencyIds: [],
      customToolProficiencies: [],
      abilityBudget: 27,
      proficiencyBonusOverride: null,
      levelUpChecklist: null,
      backgroundAsi: {},
      humanOriginFeat: "",
      bgFeat: "",
      lore: {
        traits: "",
        ideals: "",
        bonds: "",
        flaws: "",
        backstory: "",
        age: "",
        height: "",
        weight: "",
        eyes: "",
        hair: "",
        skin: "",
      },
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      savingThrows: ["STR", "CON"],
      skills: {},
      spellcasting: null,
      spellSlots: [],
      spells: [],
      weapons: opts.weapons ?? [],
      equipment: [],
      features: [{ srdId: "barbarian-rage" }, ...(opts.extraFeatures ?? [])],
      combatAlgorithm: [],
      customConditions: [],
      sidebar: [],
    },
    session: {
      hp: { current: 50, temp: 0 },
      hitDice: { used: 0 },
      trackers: {},
      spellSlots: {},
      currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      concentration: "",
      initiative: "",
      conditions: [],
      deathSucc: 0,
      deathFail: 0,
      inspiration: false,
      exhaustion: 0,
      pinnedActions: [],
      unpinnedActions: [],
      notes: "",
      logEntries: [],
      ...(opts.activeFeatures ? { activeFeatures: opts.activeFeatures } : {}),
    },
  };
}

const rageUses = (level: number) =>
  resolveTrackers(mk(level)).find((t) => t.id === "barbarian-rage")?.total;

describe("Barbarian Rage uses (C3 — driven by the class table, not 'PB')", () => {
  it("scales 2 / 3 / 4 / 5 / 6 at levels 1 / 3 / 6 / 12 / 17 (capped at 6)", () => {
    expect(rageUses(1)).toBe(2);
    expect(rageUses(2)).toBe(2);
    expect(rageUses(3)).toBe(3); // was wrongly 2 (PB) before
    expect(rageUses(5)).toBe(3);
    expect(rageUses(6)).toBe(4);
    expect(rageUses(11)).toBe(4);
    expect(rageUses(12)).toBe(5);
    expect(rageUses(17)).toBe(6);
    expect(rageUses(20)).toBe(6);
  });

  it("class table rages cap at 6 — no 2014 'Unlimited' at level 20", () => {
    const barb = getClassTable("barbarian");
    if (!barb) throw new Error("no barbarian class table");
    expect(barb.levels.find((l) => l.level === 20)?.classSpecific?.rages).toBe(6);
  });

  it("H10 — surfaces Rage Damage as a rider on the rage tracker (2/3/4)", () => {
    const rider = (level: number) =>
      resolveTrackers(mk(level)).find((t) => t.id === "barbarian-rage")?.rider;
    expect(rider(1)?.value).toBe("+2");
    expect(loc(rider(1)?.label, "en")).toBe("Rage Damage");
    expect(loc(rider(1)?.label, "it")).toBe("Danno da Ira");
    expect(rider(9)?.value).toBe("+3");
    expect(rider(16)?.value).toBe("+4");
    expect(rider(20)?.value).toBe("+4");
  });
});

/** The resolved attack row for `weaponId` (active = raging). */
const weaponRow = (level: number, weaponId: string, active: boolean) =>
  resolveActions(
    mk(level, {
      weapons: [{ srdId: weaponId, quantity: 1 }],
      activeFeatures: active ? ["barbarian-rage"] : [],
    })
  ).find((a) => a.id === `weapon-${weaponId}`);

describe("Rage Damage on weapon attacks (issue #27 — weapon-damage-bonus)", () => {
  // STR 16 → +3. Rage Damage scales 2 / 3 / 4 at barbarian levels 1 / 9 / 16
  // and rides every STRENGTH-based attack (greatsword, thrown handaxe) while
  // raging — never a DEX-resolved attack (longbow), never while calm.
  it.each([
    // [weapon, level, raging, expected damage formula]
    ["greatsword", 3, false, "2d6+3"],
    ["greatsword", 3, true, "2d6+5"],
    ["greatsword", 9, true, "2d6+6"],
    ["greatsword", 16, true, "2d6+7"],
    ["handaxe", 3, true, "1d6+5"],
    ["longbow", 3, true, "1d8+2"],
  ] as const)("%s at L%d (raging=%s) → %s", (weapon, level, raging, expected) => {
    expect(weaponRow(level, weapon, raging)?.summary.damage).toBe(expected);
  });

  it("composes the per-source damage breakdown — die + STR + Rage (active)", () => {
    const parts = weaponRow(3, "greatsword", true)?.summary.damageBreakdown ?? [];
    expect(parts).toHaveLength(3);
    const [die, ability, rage] = parts;
    // The die row: an SRD-name `loc` label + a verbatim `dice` string.
    expect(die && "dice" in die && die.dice).toBe("2d6");
    if (die && "loc" in die.label) expect(loc(die.label.loc, "en")).toBe("Greatsword");
    // The ability row: a signed `value` under an `ability` label.
    expect(ability).toMatchObject({ label: { ability: "STR" }, value: 3 });
    // The Rage row: an SRD-name `loc` label, +2, marked while-active.
    expect(rage && "value" in rage && rage.value).toBe(2);
    expect(rage?.note).toEqual({ whileActive: true });
    if (rage && "loc" in rage.label) {
      expect(loc(rage.label.loc, "en")).toBe("Rage");
      expect(loc(rage.label.loc, "it")).toBe("Ira");
    }
  });

  it("calm → the breakdown has NO Rage line (die + STR only)", () => {
    const parts = weaponRow(3, "greatsword", false)?.summary.damageBreakdown ?? [];
    expect(parts).toHaveLength(2);
    // No named flat-bonus row (the Rage `loc` part with a numeric value).
    expect(parts.some((p) => "loc" in p.label && "value" in p)).toBe(false);
  });
});

// GWM Heavy Weapon Mastery (G8 — +PB damage on a HEAVY-weapon hit) exercises
// the PACK great-weapon-master feat: content-pack/tests/unit/
// barbarian-rage.pack.test.ts.

describe("Rage activation seam (action ⇒ while-active state)", () => {
  it("the Rage bonus action carries activatesKey = barbarian-rage (inferred)", () => {
    const rage = resolveActions(mk(3)).find((a) => a.id === "barbarian-rage-bonus");
    expect(rage?.activatesKey).toBe("barbarian-rage");
  });

  it("a tracker action WITHOUT a while-active grant carries no activatesKey", () => {
    // Every resolved action either has no activatesKey or names a real toggle —
    // and non-activation features (e.g. base actions, weapons) carry none.
    const rows = resolveActions(
      mk(3, { weapons: [{ srdId: "greatsword", quantity: 1 }] })
    );
    expect(rows.find((a) => a.id === "weapon-greatsword")?.activatesKey).toBeUndefined();
  });
});
