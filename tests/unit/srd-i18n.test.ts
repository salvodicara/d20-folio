/**
 * SRD i18n Utilities — Unit Tests
 *
 * Verifies every exported function in src/lib/srd-i18n.ts.
 * All functions are pure lookups; tests cover both locales,
 * fallback behaviour, case-insensitivity and the weapon-property
 * pattern-matching branches.
 */
import { describe, it, expect } from "vitest";
import {
  localizeClassName,
  localizeRaceName,
  localizeBackgroundName,
  localizeSubclassName,
  localizeCharacterIdentity,
  localizeWeaponProperty,
  localizeWeaponCategory,
} from "@/lib/views/srd-i18n";

describe("localizeSubclassName", () => {
  it("resolves a kebab-case srdId to the EN display name", () => {
    expect(localizeSubclassName("college-of-lore", "en")).toBe("College of Lore");
  });

  it("resolves the IT display name", () => {
    expect(localizeSubclassName("college-of-lore", "it")).toBe("Collegio della Sapienza");
  });

  it("title-cases an unmapped id rather than leaking the raw srdId", () => {
    expect(localizeSubclassName("path-of-the-homebrew", "en")).toBe(
      "Path Of The Homebrew"
    );
  });
});

// ─── localizeCharacterIdentity ───────────────────────────────────────────────

describe("localizeCharacterIdentity", () => {
  it("localizes the race · class level line in IT", () => {
    expect(
      localizeCharacterIdentity(
        { race: "Elf", classes: [{ classId: "bard", level: 9 }] },
        "it"
      )
    ).toBe("Elfo · Bardo 9");
  });

  it("keeps English in EN", () => {
    expect(
      localizeCharacterIdentity(
        { race: "Elf", classes: [{ classId: "bard", level: 9 }] },
        "en"
      )
    ).toBe("Elf · Bard 9");
  });

  it("omits empty parts (race-only / class-only)", () => {
    expect(localizeCharacterIdentity({ race: "Elf" }, "it")).toBe("Elfo");
    expect(
      localizeCharacterIdentity({ classes: [{ classId: "bard", level: 3 }] }, "it")
    ).toBe("Bardo 3");
    expect(localizeCharacterIdentity({}, "it")).toBe("");
  });
});

// ─── localizeClassName ───────────────────────────────────────────────────────

describe("localizeClassName", () => {
  it("returns the English name unchanged for 'en' locale", () => {
    expect(localizeClassName("wizard", "en")).toBe("Wizard");
  });

  it("returns the Italian translation for 'it' locale", () => {
    expect(localizeClassName("wizard", "it")).toBe("Mago");
  });

  it("is case-insensitive (full-caps input)", () => {
    expect(localizeClassName("WIZARD", "it")).toBe("Mago");
  });

  it("falls back to the original string for an unknown class", () => {
    expect(localizeClassName("mystic", "en")).toBe("mystic");
    expect(localizeClassName("mystic", "it")).toBe("mystic");
  });
});

// ─── localizeRaceName ────────────────────────────────────────────────────────

describe("localizeRaceName", () => {
  it("resolves a 2024 SRD race by ID", () => {
    expect(localizeRaceName("human", "en")).toBe("Human");
    expect(localizeRaceName("human", "it")).toBe("Umano");
  });

  it("resolves a 2024 SRD race by English display name", () => {
    expect(localizeRaceName("Human", "it")).toBe("Umano");
  });

  it("falls back to the original string for an unknown race", () => {
    expect(localizeRaceName("Kender", "en")).toBe("Kender");
    expect(localizeRaceName("Kender", "it")).toBe("Kender");
  });
});

// ─── localizeBackgroundName ──────────────────────────────────────────────────

describe("localizeBackgroundName", () => {
  it("resolves a background by ID", () => {
    expect(localizeBackgroundName("acolyte", "en")).toBe("Acolyte");
    expect(localizeBackgroundName("acolyte", "it")).toBe("Accolito");
  });

  it("resolves a background by English display name", () => {
    expect(localizeBackgroundName("Acolyte", "it")).toBe("Accolito");
  });

  it("falls back to the original string for an unknown background", () => {
    expect(localizeBackgroundName("Gladiator", "en")).toBe("Gladiator");
    expect(localizeBackgroundName("Gladiator", "it")).toBe("Gladiator");
  });
});

// ─── localizeWeaponProperty ──────────────────────────────────────────────────

describe("localizeWeaponProperty", () => {
  it("returns the property unchanged for 'en' locale", () => {
    expect(localizeWeaponProperty("Finesse", "en")).toBe("Finesse");
    expect(localizeWeaponProperty("Thrown (Range 20/60)", "en")).toBe(
      "Thrown (Range 20/60)"
    );
  });

  it("translates a simple property (exact match)", () => {
    expect(localizeWeaponProperty("Finesse", "it")).toBe("Accurata");
    expect(localizeWeaponProperty("Light", "it")).toBe("Leggera");
    expect(localizeWeaponProperty("Heavy", "it")).toBe("Pesante");
    expect(localizeWeaponProperty("Loading", "it")).toBe("Ricarica");
    expect(localizeWeaponProperty("Reach", "it")).toBe("Portata");
    expect(localizeWeaponProperty("Two-Handed", "it")).toBe("Due Mani");
  });

  it("translates 'Thrown (Range X/Y)' to Italian with metre conversion", () => {
    // 20 ft → 6 m, 60 ft → 18 m — unit appears once at end (Asmodee Italia style)
    expect(localizeWeaponProperty("Thrown (Range 20/60)", "it")).toBe(
      "Da Lancio (Gittata 6/18 m)"
    );
  });

  it("keeps 'Versatile (dX)' unchanged in Italian", () => {
    expect(localizeWeaponProperty("Versatile (1d10)", "it")).toBe("Versatile (1d10)");
    expect(localizeWeaponProperty("Versatile (2d6)", "it")).toBe("Versatile (2d6)");
  });

  it("translates 'Ammunition (Range X/Y; Type)' to Italian with metre conversion", () => {
    // 80 ft → 24 m, 320 ft → 96 m; 30 ft → 9 m, 120 ft → 36 m — unit once at end
    expect(localizeWeaponProperty("Ammunition (Range 80/320; Arrow)", "it")).toBe(
      "Munizioni (Gittata 24/96 m; Freccia)"
    );
    expect(localizeWeaponProperty("Ammunition (Range 30/120; Bolt)", "it")).toBe(
      "Munizioni (Gittata 9/36 m; Dardo)"
    );
  });

  it("falls back to original for an unknown property in Italian", () => {
    expect(localizeWeaponProperty("Silvered", "it")).toBe("Silvered");
  });
});

// ─── localizeWeaponCategory ──────────────────────────────────────────────────

describe("localizeWeaponCategory", () => {
  it("capitalises the category for 'en' locale", () => {
    expect(localizeWeaponCategory("simple", "en")).toBe("Simple");
    expect(localizeWeaponCategory("martial", "en")).toBe("Martial");
  });

  it("translates 'simple' to Italian", () => {
    expect(localizeWeaponCategory("simple", "it")).toBe("Semplice");
  });

  it("translates 'martial' to Italian", () => {
    expect(localizeWeaponCategory("martial", "it")).toBe("Marziale");
  });

  it("falls back to the original for an unknown category in Italian", () => {
    expect(localizeWeaponCategory("exotic", "it")).toBe("exotic");
  });
});
