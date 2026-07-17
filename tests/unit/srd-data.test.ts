/**
 * SRD Data Helpers — Unit Tests
 *
 * Smoke-tests every exported function in src/data/*.ts.
 * Ensures aggregator indexes are built correctly and each
 * query/filter helper returns meaningful, correctly-typed results.
 */
import { describe, it, expect } from "vitest";

import {
  getSpellsByLevel,
  getSpellsByClass,
  getSpellsBySchool,
  getSpellById,
} from "@/data/spells";

import {
  getClassTable,
  getClassFeatures,
  getFeaturesAtLevel,
  getSubclassFeatures,
} from "@/data/classes";
import { resolveClassId } from "@/data/srd-names";

import {
  getEquipment,
  getEquipmentByCategory,
  getWeapon,
  getSimpleWeapons,
  getMartialWeapons,
  getMeleeWeapons,
  getRangedWeapons,
  getArmor,
  getArmorByCategory,
  getWearableArmor,
  getGear,
  getEquipmentPacks,
  getAdventuringGear,
} from "@/data/equipment";

import {
  getMagicItem,
  getAllMagicItemIds,
  getMagicItemsByRarity,
  getMagicItemsByType,
  getMagicItemsRequiringAttunement,
} from "@/data/magic-items";

import { getBackground, getAllBackgroundIds } from "@/data/backgrounds";
import { getRace, getAllRaceIds, raceFeatureIndex } from "@/data/races";
import { getCondition, getAllConditionIds } from "@/data/conditions";

import {
  getFeat,
  getOriginFeats,
  getGeneralFeats,
  getFightingStyleFeats,
  getEpicBoonFeats,
} from "@/data/feats";

import { spells as allSpells } from "@/data/spells";

// ─── Spells ──────────────────────────────────────────────────────────────────

describe("spells", () => {
  describe("getSpellsByLevel", () => {
    it("returns cantrips (level 0)", () => {
      const cantrips = getSpellsByLevel(0);
      expect(cantrips.length).toBeGreaterThan(0);
      expect(cantrips.every((s) => s.level === 0)).toBe(true);
    });

    it("returns level-1 spells and includes 'alarm'", () => {
      const level1 = getSpellsByLevel(1);
      expect(level1.some((s) => s.id === "alarm")).toBe(true);
    });

    it("returns empty for an out-of-range level", () => {
      expect(getSpellsByLevel(99)).toEqual([]);
    });
  });

  describe("getSpellsByClass", () => {
    it("returns wizard spells; every result lists wizard (case-insensitive)", () => {
      const spells = getSpellsByClass("wizard");
      expect(spells.length).toBeGreaterThan(0);
      // The SRD data mixes casing ("wizard" vs "Wizard") — the function normalises it
      expect(
        spells.every((s) => s.classes.some((c) => c.toLowerCase() === "wizard"))
      ).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(getSpellsByClass("Wizard").length).toBe(getSpellsByClass("wizard").length);
    });

    it("returns empty for an unknown class", () => {
      expect(getSpellsByClass("unknown-class")).toEqual([]);
    });
  });

  describe("getSpellsBySchool", () => {
    it("returns abjuration spells only", () => {
      const spells = getSpellsBySchool("abjuration");
      expect(spells.length).toBeGreaterThan(0);
      expect(spells.every((s) => s.school === "abjuration")).toBe(true);
    });
  });

  describe("getSpellById", () => {
    it("returns a known cantrip", () => {
      const spell = getSpellById("acid-splash");
      expect(spell).toBeDefined();
      expect(spell?.id).toBe("acid-splash");
    });

    it("returns undefined for an unknown ID", () => {
      expect(getSpellById("no-such-spell")).toBeUndefined();
    });
  });
});

// ─── Classes ─────────────────────────────────────────────────────────────────

describe("classes", () => {
  describe("getClassTable", () => {
    it("returns the wizard class table", () => {
      const table = getClassTable("wizard");
      expect(table).toBeDefined();
      expect(table?.id).toBe("wizard");
    });

    it("returns undefined for an unknown class", () => {
      expect(getClassTable("unknown")).toBeUndefined();
    });
  });

  describe("resolveClassId (A1, SRD-free)", () => {
    it("returns the lowercase id directly when the input is already an id", () => {
      expect(resolveClassId("wizard")).toBe("wizard");
      expect(resolveClassId("BARD")).toBe("bard");
    });

    it("normalizes the English display name to the canonical id", () => {
      expect(resolveClassId("Wizard")).toBe("wizard");
      expect(resolveClassId("Sorcerer")).toBe("sorcerer");
    });

    it("resolves Italian class names to the canonical English id", () => {
      // "Mago" is the official Asmodee Italia translation of Wizard
      expect(resolveClassId("Mago")).toBe("wizard");
      expect(resolveClassId("Stregone")).toBe("sorcerer");
      expect(resolveClassId("Bardo")).toBe("bard");
    });

    it("returns empty for empty input + falls back to lowercase for unknown class", () => {
      expect(resolveClassId("")).toBe("");
      expect(resolveClassId("Necromancer")).toBe("necromancer");
    });
  });

  describe("getClassFeatures", () => {
    it("returns wizard features and every item belongs to wizard", () => {
      const features = getClassFeatures("wizard");
      expect(features.length).toBeGreaterThan(0);
      expect(features.every((f) => f.class === "wizard")).toBe(true);
    });

    it("returns empty for an unknown class", () => {
      expect(getClassFeatures("unknown")).toEqual([]);
    });
  });

  describe("getFeaturesAtLevel", () => {
    it("returns wizard level-1 features with correct level", () => {
      const features = getFeaturesAtLevel("wizard", 1);
      expect(features.length).toBeGreaterThan(0);
      expect(features.every((f) => f.level === 1)).toBe(true);
    });

    it("returns empty for an unknown class at any level", () => {
      expect(getFeaturesAtLevel("unknown", 1)).toEqual([]);
    });
  });

  describe("getSubclassFeatures", () => {
    it("returns Evoker (2024) features for wizard", () => {
      const features = getSubclassFeatures("wizard", "evoker");
      expect(features.length).toBeGreaterThan(0);
      expect(features.every((f) => f.subclass === "evoker")).toBe(true);
    });

    it("returns empty for an unknown subclass", () => {
      expect(getSubclassFeatures("wizard", "no-subclass")).toEqual([]);
    });
  });

  describe("subclassSpellLevels", () => {
    it.each([
      ["paladin", [3, 5, 9, 13, 17]],
      ["cleric", [3, 5, 7, 9]],
      ["druid", [3, 5, 7, 9]],
      ["warlock", [3, 5, 7, 9]],
    ])("%s has subclassSpellLevels %j", (classId, expected) => {
      const table = getClassTable(classId);
      expect(table?.subclassSpellLevels).toEqual(expected);
    });

    // 2024 Ranger subclass spells are PER-SUBCLASS (Fey Wanderer & Gloom
    // Stalker via their own `expandedSpells`), so the class table omits the
    // class-wide field — setting it would wrongly prompt Hunter/Beast Master.
    // See ranger-subclass-spells.test.ts.
    it.each(["fighter", "barbarian", "monk", "rogue", "ranger"])(
      "%s has no subclassSpellLevels",
      (classId) => {
        const table = getClassTable(classId);
        expect(table?.subclassSpellLevels).toBeUndefined();
      }
    );
  });
});

// ─── Equipment ───────────────────────────────────────────────────────────────

describe("equipment", () => {
  describe("getEquipment", () => {
    it("looks up a weapon by ID", () => {
      expect(getEquipment("club")?.id).toBe("club");
    });

    it("looks up armor by ID", () => {
      expect(getEquipment("padded-armor")?.id).toBe("padded-armor");
    });

    it("looks up adventuring gear by ID", () => {
      expect(getEquipment("acid")?.id).toBe("acid");
    });

    it("returns undefined for an unknown ID", () => {
      expect(getEquipment("no-such-item")).toBeUndefined();
    });
  });

  describe("getEquipmentByCategory", () => {
    it("returns weapons", () => {
      const items = getEquipmentByCategory("weapon");
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.category === "weapon")).toBe(true);
    });

    it("returns armor only", () => {
      const items = getEquipmentByCategory("armor");
      expect(items.every((i) => i.category === "armor")).toBe(true);
    });
  });

  // ── Weapon sub-helpers ──

  describe("getWeapon", () => {
    it("returns a known weapon", () => {
      expect(getWeapon("club")?.id).toBe("club");
    });

    it("returns undefined for an unknown ID", () => {
      expect(getWeapon("no-weapon")).toBeUndefined();
    });
  });

  describe("getSimpleWeapons", () => {
    it("returns only simple weapons", () => {
      const weapons = getSimpleWeapons();
      expect(weapons.length).toBeGreaterThan(0);
      expect(weapons.every((w) => w.weaponCategory === "simple")).toBe(true);
    });
  });

  describe("getMartialWeapons", () => {
    it("returns only martial weapons", () => {
      const weapons = getMartialWeapons();
      expect(weapons.length).toBeGreaterThan(0);
      expect(weapons.every((w) => w.weaponCategory === "martial")).toBe(true);
    });

    it("includes the battleaxe", () => {
      expect(getMartialWeapons().some((w) => w.id === "battleaxe")).toBe(true);
    });
  });

  describe("getMeleeWeapons", () => {
    it("returns only melee weapons", () => {
      const weapons = getMeleeWeapons();
      expect(weapons.length).toBeGreaterThan(0);
      expect(weapons.every((w) => w.weaponType === "melee")).toBe(true);
    });
  });

  describe("getRangedWeapons", () => {
    it("returns only ranged weapons", () => {
      const weapons = getRangedWeapons();
      expect(weapons.length).toBeGreaterThan(0);
      expect(weapons.every((w) => w.weaponType === "ranged")).toBe(true);
    });

    it("includes the shortbow", () => {
      expect(getRangedWeapons().some((w) => w.id === "shortbow")).toBe(true);
    });
  });

  describe("weapon mastery", () => {
    it("every weapon has a mastery property", () => {
      const weapons = getEquipmentByCategory("weapon");
      const missing = weapons.filter((w) => !w.mastery);
      expect(missing.map((w) => w.id)).toEqual([]);
    });

    it("mastery values are valid", () => {
      const valid = new Set([
        "Cleave",
        "Graze",
        "Nick",
        "Push",
        "Sap",
        "Slow",
        "Topple",
        "Vex",
      ]);
      const weapons = getEquipmentByCategory("weapon");
      weapons.forEach((w) => {
        expect(
          valid.has(w.mastery ?? ""),
          `${w.id} has invalid mastery: ${w.mastery}`
        ).toBe(true);
      });
    });
  });

  // ── Armor sub-helpers ──

  describe("getArmor", () => {
    it("returns padded armor", () => {
      expect(getArmor("padded-armor")?.id).toBe("padded-armor");
    });

    it("returns undefined for an unknown ID", () => {
      expect(getArmor("no-armor")).toBeUndefined();
    });
  });

  describe("getArmorByCategory", () => {
    it("returns light armor", () => {
      const armor = getArmorByCategory("light");
      expect(armor.length).toBeGreaterThan(0);
      expect(armor.every((a) => a.armorCategory === "light")).toBe(true);
    });

    it("returns heavy armor including chain mail", () => {
      expect(getArmorByCategory("heavy").some((a) => a.id === "chain-mail")).toBe(true);
    });

    it("returns the shield when requesting 'shield' category", () => {
      expect(getArmorByCategory("shield").some((a) => a.id === "shield")).toBe(true);
    });
  });

  describe("getWearableArmor", () => {
    it("returns only items with category === 'armor' (excludes shield)", () => {
      const armor = getWearableArmor();
      expect(armor.every((a) => a.category === "armor")).toBe(true);
      expect(armor.every((a) => a.id !== "shield")).toBe(true);
    });

    it("includes padded armor", () => {
      expect(getWearableArmor().some((a) => a.id === "padded-armor")).toBe(true);
    });
  });

  // ── Gear sub-helpers ──

  describe("getGear", () => {
    it("returns a known gear item", () => {
      expect(getGear("acid")?.id).toBe("acid");
    });

    it("returns undefined for an unknown ID", () => {
      expect(getGear("zzz-unknown")).toBeUndefined();
    });
  });

  describe("getEquipmentPacks", () => {
    it("returns only pack items", () => {
      const packs = getEquipmentPacks();
      expect(packs.length).toBeGreaterThan(0);
      expect(packs.every((p) => p.category === "pack")).toBe(true);
    });

    it("includes the burglar's pack", () => {
      expect(getEquipmentPacks().some((p) => p.id === "burglars-pack")).toBe(true);
    });
  });

  describe("getAdventuringGear", () => {
    it("returns only gear items (category === 'gear')", () => {
      const gear = getAdventuringGear();
      expect(gear.length).toBeGreaterThan(0);
      expect(gear.every((g) => g.category === "gear")).toBe(true);
    });

    it("includes acid", () => {
      expect(getAdventuringGear().some((g) => g.id === "acid")).toBe(true);
    });
  });
});

// ─── Magic Items ─────────────────────────────────────────────────────────────

describe("magic-items", () => {
  describe("getMagicItem", () => {
    it("returns the Potion of Healing", () => {
      expect(getMagicItem("potion-of-healing")?.id).toBe("potion-of-healing");
    });

    it("returns undefined for an unknown ID", () => {
      expect(getMagicItem("no-item")).toBeUndefined();
    });
  });

  describe("getAllMagicItemIds", () => {
    it("returns a non-empty array of strings", () => {
      const ids = getAllMagicItemIds();
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every((id) => typeof id === "string")).toBe(true);
    });

    it("includes potion-of-healing", () => {
      expect(getAllMagicItemIds()).toContain("potion-of-healing");
    });
  });

  describe("getMagicItemsByRarity", () => {
    it("returns common items only", () => {
      const items = getMagicItemsByRarity("common");
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.rarity === "common")).toBe(true);
    });

    it("returns uncommon items", () => {
      expect(getMagicItemsByRarity("uncommon").length).toBeGreaterThan(0);
    });
  });

  describe("getMagicItemsByType", () => {
    it("returns potions only", () => {
      const items = getMagicItemsByType("potion");
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.type === "potion")).toBe(true);
    });

    it("returns weapon magic items", () => {
      expect(getMagicItemsByType("weapon").length).toBeGreaterThan(0);
    });
  });

  describe("getMagicItemsRequiringAttunement", () => {
    it("returns only items that require attunement", () => {
      const items = getMagicItemsRequiringAttunement();
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((i) => i.attunement)).toBe(true);
    });
  });
});

// ─── Backgrounds ─────────────────────────────────────────────────────────────

describe("backgrounds", () => {
  describe("getBackground", () => {
    it("returns the Acolyte background", () => {
      expect(getBackground("acolyte")?.id).toBe("acolyte");
    });

    it("returns undefined for an unknown ID", () => {
      expect(getBackground("no-background")).toBeUndefined();
    });
  });

  describe("getAllBackgroundIds", () => {
    it("returns a non-empty list containing 'acolyte'", () => {
      const ids = getAllBackgroundIds();
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain("acolyte");
    });
  });
});

// ─── Races ───────────────────────────────────────────────────────────────────

describe("races", () => {
  describe("getRace", () => {
    it("returns the Human race", () => {
      expect(getRace("human")?.id).toBe("human");
    });

    it("returns undefined for an unknown ID", () => {
      expect(getRace("no-race")).toBeUndefined();
    });
  });

  describe("getAllRaceIds", () => {
    it("returns a non-empty list containing 'human'", () => {
      const ids = getAllRaceIds();
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain("human");
    });
  });

  describe("racial feature trackers", () => {
    // (The pack-species tracker pins — Shifter / Boggart / Dhampir — live in
    // `content-pack/tests/unit/srd-data.pack.test.ts`.)
    it.each([
      ["dwarf-stonecunning", "PB"],
      ["orc-adrenaline-rush", "PB"],
      ["dragonborn-breath-weapon", "PB"],
    ])("%s has tracker with total=%s", (featureId, expectedTotal) => {
      const entry = raceFeatureIndex.get(featureId);
      expect(entry).toBeDefined();
      expect(entry?.mechanics?.tracker).toBeDefined();
      expect(entry?.mechanics?.tracker?.total).toBe(expectedTotal);
    });

    // S10 (2026-06-24) — the Faerie / Flamekin / Rimekin lineage MAGIC traits no
    // longer carry a hand-declared "1 use → 2 at L5" pool tracker: they were
    // rewired to per-spell `free-cast-spell` rows (each its own 1/LR counter),
    // which supersede the pool (golden rules 2 + 6 + 10). The spell-side wiring is
    // pinned in `s10-data-wiring.table.test.ts`; here we pin the tracker REMOVAL.
    it.each([
      ["faerie-fairy-magic"],
      ["flamekin-reach-to-the-blaze"],
      ["rimekin-cold-fire-magic"],
    ])(
      "%s no longer carries a pool tracker (superseded by per-spell free-casts)",
      (id) => {
        expect(raceFeatureIndex.get(id)?.mechanics).toBeUndefined();
      }
    );

    it("Orc Adrenaline Rush has a bonus action", () => {
      const entry = raceFeatureIndex.get("orc-adrenaline-rush");
      expect(entry?.mechanics?.actions).toBeDefined();
      expect(entry?.mechanics?.actions?.[0]?.type).toBe("bonus");
    });
  });
});

// ─── Conditions ──────────────────────────────────────────────────────────────

describe("conditions", () => {
  describe("getCondition", () => {
    it("returns the Blinded condition", () => {
      expect(getCondition("blinded")?.id).toBe("blinded");
    });

    it("returns undefined for an unknown ID", () => {
      expect(getCondition("no-condition")).toBeUndefined();
    });
  });

  describe("getAllConditionIds", () => {
    it("returns all 15 standard conditions", () => {
      const ids = getAllConditionIds();
      expect(ids.length).toBe(15);
      expect(ids).toContain("blinded");
      expect(ids).toContain("poisoned");
    });
  });
});

// ─── Feats ───────────────────────────────────────────────────────────────────

describe("feats", () => {
  describe("getFeat", () => {
    it("returns the Alert feat", () => {
      expect(getFeat("alert")?.id).toBe("alert");
    });

    it("returns undefined for an unknown ID", () => {
      expect(getFeat("no-feat")).toBeUndefined();
    });
  });

  describe("getOriginFeats", () => {
    it("returns only origin feats", () => {
      const feats = getOriginFeats();
      expect(feats.length).toBeGreaterThan(0);
      expect(feats.every((f) => f.category === "origin")).toBe(true);
    });

    it("includes Alert", () => {
      expect(getOriginFeats().some((f) => f.id === "alert")).toBe(true);
    });
  });

  describe("getGeneralFeats", () => {
    it("returns only general feats", () => {
      const feats = getGeneralFeats();
      expect(feats.length).toBeGreaterThan(0);
      expect(feats.every((f) => f.category === "general")).toBe(true);
    });

    it("includes Grappler", () => {
      expect(getGeneralFeats().some((f) => f.id === "grappler")).toBe(true);
    });
  });

  describe("getFightingStyleFeats", () => {
    it("returns only fighting-style feats", () => {
      const feats = getFightingStyleFeats();
      expect(feats.length).toBeGreaterThan(0);
      expect(feats.every((f) => f.category === "fighting-style")).toBe(true);
    });

    it("includes Archery", () => {
      expect(getFightingStyleFeats().some((f) => f.id === "archery")).toBe(true);
    });
  });

  describe("getEpicBoonFeats", () => {
    it("returns only epic-boon feats", () => {
      const feats = getEpicBoonFeats();
      expect(feats.length).toBeGreaterThan(0);
      expect(feats.every((f) => f.category === "epic-boon")).toBe(true);
    });

    it("includes Boon of Dimensional Travel", () => {
      expect(getEpicBoonFeats().some((f) => f.id === "boon-of-dimensional-travel")).toBe(
        true
      );
    });
  });
});

// ─── Class Spell Lists (data consistency, M-A) ────────────────────────────────
// The app derives class→spell membership directly from each spell's own
// `classes` field (SpellAddModal + getSpellsByClass), so these assertions guard
// that canonical source rather than a duplicate lookup table.

describe("spell class membership (M-A)", () => {
  // Every 2024 spellcasting class — half/third casters included.
  const CASTER_CLASS_IDS = [
    "artificer",
    "bard",
    "cleric",
    "druid",
    "paladin",
    "ranger",
    "sorcerer",
    "warlock",
    "wizard",
  ];

  it.each(CASTER_CLASS_IDS)(
    "%s has at least one spell on its list (no empty caster lists)",
    (classId) => {
      const classSpells = allSpells.filter((s) =>
        s.classes.some((c) => c.toLowerCase() === classId)
      );
      expect(classSpells.length).toBeGreaterThan(0);
    }
  );

  it("every class id appearing in a spell's `classes` array is a known class", () => {
    const knownClassIds = new Set([
      "artificer",
      "barbarian",
      "bard",
      "cleric",
      "druid",
      "fighter",
      "monk",
      "paladin",
      "ranger",
      "rogue",
      "sorcerer",
      "warlock",
      "wizard",
    ]);
    const seen = new Set<string>();
    for (const spell of allSpells) {
      for (const cls of spell.classes) {
        seen.add(cls.toLowerCase());
      }
    }
    const unknown = [...seen].filter((id) => !knownClassIds.has(id));
    expect(unknown).toEqual([]);
  });
});
