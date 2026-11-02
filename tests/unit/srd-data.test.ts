/**
 * SRD Data Helpers — Unit Tests
 *
 * Smoke-tests every exported function in src/data/*.ts.
 * Ensures aggregator indexes are built correctly and each
 * query/filter helper returns meaningful, correctly-typed results.
 */
import { describe, it, expect } from "vitest";

import { getSpellById } from "@/data/spells";

import {
  getClassTable,
  getClassFeatures,
  getFeaturesAtLevel,
  getSubclassFeatures,
} from "@/data/classes";
import { resolveClassId } from "@/data/srd-names";

import { getEquipment } from "@/data/equipment";
import { SRD_WEAPONS } from "@/data/weapons";

import { getMagicItem } from "@/data/magic-items";

import { getBackground } from "@/data/backgrounds";
import { getRace, raceFeatureIndex } from "@/data/races";
import { getAllConditionIds } from "@/data/conditions";

import {
  getFeat,
  getOriginFeats,
  getGeneralFeats,
  getFightingStyleFeats,
} from "@/data/feats";

import { spells as allSpells } from "@/data/spells";

// ─── Spells ──────────────────────────────────────────────────────────────────

describe("spells", () => {
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

  describe("weapon mastery", () => {
    it("every weapon has a mastery property", () => {
      const weapons = SRD_WEAPONS;
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
      const weapons = SRD_WEAPONS;
      weapons.forEach((w) => {
        expect(
          valid.has(w.mastery ?? ""),
          `${w.id} has invalid mastery: ${w.mastery}`
        ).toBe(true);
      });
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
});

// ─── Class Spell Lists (data consistency, M-A) ────────────────────────────────
// The app derives class→spell membership directly from each spell's own
// `classes` field (SpellAddModal), so these assertions guard
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
