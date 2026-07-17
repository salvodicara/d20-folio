/**
 * Per-spell casting-ability resolution + propagation through the Magic
 * Initiate / Fey-Touched / Shadow-Touched picker.
 *
 * 2024 RAW: Magic Initiate's spellcasting ability is the player's choice of
 * Int/Wis/Cha (not pinned to the list). The app auto-defaults it to the
 * character's BEST of that set at pick time (override-first), stamped as
 * `SrdSpellRef.spellAbilityOverride` and honored by `resolveSpellAbility`.
 */
import { describe, expect, it } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { foldLegacyClass } from "./_helpers";
import {
  resolveSpellAbility,
  SPECIES_SPELL_ABILITY_DEFAULT,
} from "@/lib/resolve-spell-ability";
import {
  pendingSpellChoicesForFeat,
  applySpellChoicePicks,
} from "@/lib/feat-spell-choices";
import { getAlwaysPreparedFromGrants, injectExpandedSpells } from "@/lib/expanded-spells";
import type { Grant } from "@/lib/grants";
import { FEATS_BY_ID } from "@/data/feats";
import { SRD_RACES } from "@/data/races";
import type { CharacterData, SrdSpellRef } from "@/types/character";

function baseChar(
  overrides: Partial<CharacterData> & {
    class?: string;
    classId?: string;
    subclass?: string;
    subclassId?: string;
    level?: number;
  } = {}
): CharacterData {
  return {
    name: assertNonEmptyString("Test"),
    quote: "",
    race: asRaceId(""),
    classes: [{ classId: "fighter", level: 4 }],
    background: "",
    alignment: asAlignmentId(""),
    playerName: "",
    speed: "30",
    ac: 10,
    armorNote: "",
    hp: { max: 30 },
    hitDieType: 10,
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
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 8, WIS: 14, CHA: 10 },
    savingThrows: [],
    skills: {},
    spellcasting: null,
    spellSlots: [],
    spells: [],
    weapons: [],
    equipment: [],
    features: [],
    combatAlgorithm: [],
    customConditions: [],
    sidebar: [],
    ...foldLegacyClass(overrides, "fighter"),
  };
}

describe("resolveSpellAbility", () => {
  it("override wins over class spellcasting ability", () => {
    const ref: SrdSpellRef = { srdId: "sacred-flame", spellAbilityOverride: "WIS" };
    const wizard = baseChar({
      classes: [{ classId: "wizard", level: 5 }],
      spellcasting: {
        ability: "INT",
        preparedCaster: true,
        preparedMax: 4,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
    });
    expect(resolveSpellAbility(ref, wizard)).toBe("WIS");
  });

  it("falls back to class spellcasting ability when no override is set", () => {
    const ref: SrdSpellRef = { srdId: "fireball" };
    const wizard = baseChar({
      spellcasting: {
        ability: "INT",
        preparedCaster: true,
        preparedMax: 4,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
    });
    expect(resolveSpellAbility(ref, wizard)).toBe("INT");
  });

  it("returns null on a non-caster with no override (no class ability available)", () => {
    const ref: SrdSpellRef = { srdId: "fireball" };
    const fighter = baseChar();
    expect(resolveSpellAbility(ref, fighter)).toBeNull();
  });

  it("species-deferred ref → default ability when the species pick is unset", () => {
    const ref: SrdSpellRef = { srdId: "thaumaturgy", speciesSpellAbility: true };
    const tiefling = baseChar({ speciesSpellAbility: undefined });
    expect(resolveSpellAbility(ref, tiefling)).toBe(SPECIES_SPELL_ABILITY_DEFAULT);
    expect(SPECIES_SPELL_ABILITY_DEFAULT).toBe("CHA");
  });

  it("species-deferred ref → the chosen ability when the species pick is set", () => {
    const ref: SrdSpellRef = { srdId: "thaumaturgy", speciesSpellAbility: true };
    expect(resolveSpellAbility(ref, baseChar({ speciesSpellAbility: "INT" }))).toBe(
      "INT"
    );
    expect(resolveSpellAbility(ref, baseChar({ speciesSpellAbility: "WIS" }))).toBe(
      "WIS"
    );
  });

  it("a concrete spellAbilityOverride still beats the species deferral", () => {
    const ref: SrdSpellRef = {
      srdId: "thaumaturgy",
      speciesSpellAbility: true,
      spellAbilityOverride: "WIS",
    };
    // Even though the character chose INT for the species, an explicit
    // per-spell pin wins (override-first manual edit).
    expect(resolveSpellAbility(ref, baseChar({ speciesSpellAbility: "INT" }))).toBe(
      "WIS"
    );
  });

  it("species-deferred ignores the class spellcasting ability", () => {
    const ref: SrdSpellRef = { srdId: "thaumaturgy", speciesSpellAbility: true };
    const wizardTiefling = baseChar({
      speciesSpellAbility: "WIS",
      spellcasting: {
        ability: "INT",
        preparedCaster: true,
        preparedMax: 4,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
    });
    expect(resolveSpellAbility(ref, wizardTiefling)).toBe("WIS");
  });

  it("custom spell respects override too", () => {
    const ref = {
      custom: true as const,
      name: "Test",
      level: 1,
      school: "evocation" as const,
      castingTime: "1 action",
      range: "Self",
      components: { v: true, s: false, m: false },
      duration: "Instantaneous",
      concentration: false,
      description: "",
      spellAbilityOverride: "CHA" as const,
    };
    const wizard = baseChar({
      spellcasting: {
        ability: "INT",
        preparedCaster: true,
        preparedMax: 4,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
    });
    expect(resolveSpellAbility(ref, wizard)).toBe("CHA");
  });
});

describe("multiclass owning-class casting ability (2024 RAW)", () => {
  // 2024 SRD 5.2.1, Multiclassing → Spellcasting: a spell is cast with the
  // ability of the CLASS it was learned through. A Cleric / Wizard casts
  // Guiding Bolt (Cleric) with WIS and Fireball (Wizard) with INT — one
  // character, two abilities, derived from each spell's class-list membership.
  function clericWizard(): CharacterData {
    return baseChar({
      classes: [
        { classId: "cleric", subclassId: "life-domain", level: 5 },
        { classId: "wizard", subclassId: "evoker", level: 5 },
      ],
      // The primary (highest-level, ties → first) is Cleric → WIS.
      spellcasting: {
        ability: "WIS",
        preparedCaster: true,
        preparedMax: 4,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 18, CHA: 10 },
    });
  }

  // Table-driven: each spell → the OWNING class's ability, on one Cleric/Wizard.
  for (const [srdId, classes, expected] of [
    ["guiding-bolt", ["cleric"], "WIS"], // Cleric-only → WIS
    ["fireball", ["wizard", "sorcerer"], "INT"], // Wizard-only (of this build) → INT
    ["sacred-flame", ["cleric"], "WIS"],
    ["magic-missile", ["wizard", "sorcerer"], "INT"],
  ] as const) {
    it(`${srdId} resolves to its owning class ability (${expected})`, () => {
      const ref: SrdSpellRef = { srdId };
      expect(resolveSpellAbility(ref, clericWizard(), classes)).toBe(expected);
    });
  }

  it("a spell on BOTH the character's caster lists is ambiguous → primary fallback", () => {
    // Cure Wounds is on Cleric AND (say) Bard, but here Cleric AND Wizard don't
    // both have it; use a spell shared by both this build's classes to force the
    // tie: with classes ["cleric","wizard"] it falls back to the primary (WIS).
    const ref: SrdSpellRef = { srdId: "some-shared-spell" };
    expect(resolveSpellAbility(ref, clericWizard(), ["cleric", "wizard"])).toBe("WIS");
  });

  it("a spell on NEITHER list → primary fallback", () => {
    const ref: SrdSpellRef = { srdId: "barbarian-only" };
    expect(resolveSpellAbility(ref, clericWizard(), ["barbarian"])).toBe("WIS");
  });

  it("single-class caster is UNCHANGED — every spell uses the one ability", () => {
    const wizard = baseChar({
      classes: [{ classId: "wizard", level: 8 }],
      spellcasting: {
        ability: "INT",
        preparedCaster: true,
        preparedMax: 6,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
    });
    expect(resolveSpellAbility({ srdId: "fireball" }, wizard, ["wizard"])).toBe("INT");
    // Even a Cleric-list spell on a single-class Wizard resolves to INT (the one
    // caster ability) — there is no second class to attribute it to.
    expect(resolveSpellAbility({ srdId: "guiding-bolt" }, wizard, ["cleric"])).toBe(
      "INT"
    );
  });

  it("a per-spell override still wins over the multiclass owning ability", () => {
    const ref: SrdSpellRef = { srdId: "guiding-bolt", spellAbilityOverride: "CHA" };
    expect(resolveSpellAbility(ref, clericWizard(), ["cleric"])).toBe("CHA");
  });

  // (The subclass-caster pin — Eldritch Knight, a pack subclass — lives in
  // `content-pack/tests/unit/resolve-spell-ability.pack.test.ts`.)
});

describe("Magic Initiate grants defer to a player ability choice (2024)", () => {
  // 2024 RAW: "Intelligence, Wisdom, or Charisma is your spellcasting ability for
  // this feat's spells (choose when you select this feat)." No hard pin.
  for (const id of [
    "magic-initiate-cleric",
    "magic-initiate-druid",
    "magic-initiate-wizard",
  ]) {
    it(`${id} slots carry the Int/Wis/Cha choice set (no hard pin)`, () => {
      const slots = pendingSpellChoicesForFeat(FEATS_BY_ID.get(id) ?? {});
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot.spellAbility).toBeUndefined();
        expect(slot.spellAbilityChoice).toEqual(["INT", "WIS", "CHA"]);
      }
    });
  }

  // (The Fey-Touched no-pin pins — a pack feat — live in
  // `content-pack/tests/unit/resolve-spell-ability.pack.test.ts`.)
});

describe("applySpellChoicePicks lands the override on each new ref", () => {
  // 2024 Magic Initiate: ability is the player's choice of Int/Wis/Cha,
  // auto-defaulted to the character's BEST of that set (override-first).
  const HIGH_CHA = { STR: 16, DEX: 12, CON: 14, INT: 8, WIS: 10, CHA: 18 } as const;
  const HIGH_INT = { STR: 8, DEX: 14, CON: 12, INT: 18, WIS: 10, CHA: 10 } as const;

  it("MI(Cleric) picks → each new ref overrides to the character's best of Int/Wis/Cha", () => {
    const slots = pendingSpellChoicesForFeat(
      FEATS_BY_ID.get("magic-initiate-cleric") ?? {}
    );
    const cantripSlot = slots.find((s) => s.kind === "cantrip");
    const spellSlot = slots.find((s) => s.kind === "spell");
    const picks = {
      [cantripSlot?.slotId ?? "x"]: ["sacred-flame", "guidance"],
      [spellSlot?.slotId ?? "y"]: ["bless"],
    };
    const after = applySpellChoicePicks([], picks, slots, HIGH_CHA);
    expect(after).toHaveLength(3);
    for (const ref of after) {
      if (!("custom" in ref)) {
        expect(ref.spellAbilityOverride).toBe("CHA");
      }
    }
  });

  it("MI(Wizard) picks → best-of-set (high-INT character → INT)", () => {
    const slots = pendingSpellChoicesForFeat(
      FEATS_BY_ID.get("magic-initiate-wizard") ?? {}
    );
    const cantripSlot = slots.find((s) => s.kind === "cantrip");
    const picks = {
      [cantripSlot?.slotId ?? "x"]: ["fire-bolt", "mage-hand"],
    };
    const after = applySpellChoicePicks([], picks, slots, HIGH_INT);
    expect(after).toHaveLength(2);
    for (const ref of after) {
      if (!("custom" in ref)) {
        expect(ref.spellAbilityOverride).toBe("INT");
      }
    }
  });

  it("legacy call without slots (back-compat) does NOT set an override", () => {
    const after = applySpellChoicePicks([], { "slot-0": ["bless"] });
    const ref = after[0];
    if (!ref || "custom" in ref) throw new Error("expected SrdSpellRef");
    expect(ref.spellAbilityOverride).toBeUndefined();
  });
});

describe("species-deferred always-prepared-spell grant wiring", () => {
  it("getAlwaysPreparedFromGrants emits a species-deferred entry (no concrete pin)", () => {
    const grants: Grant[] = [
      {
        type: "always-prepared-spell",
        spellId: "thaumaturgy",
        spellAbilitySource: "species",
      },
    ];
    const out = getAlwaysPreparedFromGrants([{ grants }]);
    expect(out).toEqual([{ spellId: "thaumaturgy", speciesSpellAbility: true }]);
  });

  it("injectExpandedSpells stamps speciesSpellAbility (not spellAbilityOverride)", () => {
    const after = injectExpandedSpells(
      [],
      [{ spellId: "thaumaturgy", speciesSpellAbility: true }]
    );
    const ref = after[0];
    if (!ref || "custom" in ref) throw new Error("expected SrdSpellRef");
    expect(ref.speciesSpellAbility).toBe(true);
    expect(ref.spellAbilityOverride).toBeUndefined();
    expect(ref.alwaysPrepared).toBe(true);
    expect(ref.prepared).toBe(true);
  });

  it("a concrete spellAbility pin still wins over species deferral in injection", () => {
    const after = injectExpandedSpells(
      [],
      // Defensive: both arrive — concrete pin must take precedence.
      [{ spellId: "thaumaturgy", spellAbility: "CHA", speciesSpellAbility: true }]
    );
    const ref = after[0];
    if (!ref || "custom" in ref) throw new Error("expected SrdSpellRef");
    expect(ref.spellAbilityOverride).toBe("CHA");
    expect(ref.speciesSpellAbility).toBeUndefined();
  });

  it("Tiefling Otherworldly Presence grants Thaumaturgy deferred to the species pick", () => {
    const tiefling = SRD_RACES.find((r) => r.id === "tiefling");
    if (!tiefling) throw new Error("expected the Tiefling species");
    const grantSources = tiefling.traits.map((t) => ({ grants: t.grants }));
    const out = getAlwaysPreparedFromGrants(grantSources);
    expect(out).toContainEqual({
      spellId: "thaumaturgy",
      speciesSpellAbility: true,
    });
    // End-to-end: inject, then resolve with the player's chosen ability.
    const after = injectExpandedSpells([], out);
    const thaum = after.find((s) => !("custom" in s) && s.srdId === "thaumaturgy");
    if (!thaum || "custom" in thaum) throw new Error("expected Thaumaturgy ref");
    expect(resolveSpellAbility(thaum, baseChar({ speciesSpellAbility: "WIS" }))).toBe(
      "WIS"
    );
    expect(resolveSpellAbility(thaum, baseChar())).toBe(SPECIES_SPELL_ABILITY_DEFAULT);
  });
});
