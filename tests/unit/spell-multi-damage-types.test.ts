/**
 * Multi / player-choice spell damage types primitive.
 *
 * The single `SrdSpellData.damageType` field cannot represent spells that deal
 * MULTIPLE simultaneous damage types (Prismatic Spray's eight rays, Prismatic
 * Wall's layers, Storm of Vengeance's rounds) or a PLAYER-CHOSEN type (Chromatic
 * Orb, Dragon's Breath, Glyph of Warding's Explosive Rune). Those spells stored
 * null, so the combat action summary showed no damage type for them.
 *
 * This primitive adds two fields:
 *   - `damageTypes`  — several types that all apply at once (multi-element);
 *   - `damageChoice` — the set the caster picks ONE of.
 * The pure helper `resolveSpellDamageTypes` normalises the three fields into a
 * `SpellDamageTypeFacet`, and the `resolveActions` consumer populates
 * `summary.damageTypes` + `summary.multiDamageTypeFlavor` so the combat card
 * surfaces every type. Override-first: the engine never picks a `choice` type.
 */
import { describe, expect, it } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { resolveActions, resolveSpellDamageTypes } from "@/lib/smart-tracker";
import { spellIndex } from "@/data/spells";
import type { CharacterDoc } from "@/types/character";
import type { DamageType } from "@/data/types";

// ─── Pure helper: resolveSpellDamageTypes ────────────────────────────────────

describe("resolveSpellDamageTypes — facet normalisation", () => {
  it("returns a single facet for a one-type spell (legacy field)", () => {
    expect(resolveSpellDamageTypes({ damageType: "fire" })).toEqual({
      kind: "single",
      damageType: "fire",
    });
  });

  it("returns a multi facet for several simultaneous types", () => {
    expect(resolveSpellDamageTypes({ damageTypes: ["fire", "acid", "cold"] })).toEqual({
      kind: "multi",
      damageTypes: ["fire", "acid", "cold"],
    });
  });

  it("returns a choice facet for a player-chosen set", () => {
    expect(resolveSpellDamageTypes({ damageChoice: ["acid", "cold", "fire"] })).toEqual({
      kind: "choice",
      damageTypes: ["acid", "cold", "fire"],
    });
  });

  it("returns null when the spell deals no typed damage", () => {
    expect(resolveSpellDamageTypes({})).toBeNull();
  });

  it("treats an empty array as absent (no degenerate facet)", () => {
    expect(resolveSpellDamageTypes({ damageTypes: [] })).toBeNull();
    expect(resolveSpellDamageTypes({ damageChoice: [] })).toBeNull();
  });

  it("single (damageType) wins over multi/choice when both are set", () => {
    // Mutually exclusive by data convention, but precedence is pinned so a
    // mis-authored row never silently drops the fixed single type.
    expect(
      resolveSpellDamageTypes({
        damageType: "force",
        damageTypes: ["fire", "cold"],
      })
    ).toEqual({ kind: "single", damageType: "force" });
  });

  it("multi wins over choice when both arrays are set", () => {
    expect(
      resolveSpellDamageTypes({
        damageTypes: ["fire", "cold"],
        damageChoice: ["acid"],
      })
    ).toEqual({ kind: "multi", damageTypes: ["fire", "cold"] });
  });
});

// ─── Data wiring: the six target spells declare the right fields ─────────────

describe("SRD data declares multi / choice damage types", () => {
  it("Prismatic Spray deals five simultaneous elements (rays)", () => {
    expect(spellIndex.get("prismatic-spray")?.damageTypes).toEqual([
      "fire",
      "acid",
      "lightning",
      "poison",
      "cold",
    ]);
    expect(spellIndex.get("prismatic-spray")?.damageType).toBeUndefined();
  });

  it("Prismatic Wall deals five simultaneous layer elements", () => {
    expect(spellIndex.get("prismatic-wall")?.damageTypes).toEqual([
      "fire",
      "acid",
      "lightning",
      "poison",
      "cold",
    ]);
  });

  it("Storm of Vengeance cycles five elements over its rounds", () => {
    expect(spellIndex.get("storm-of-vengeance")?.damageTypes).toEqual([
      "thunder",
      "acid",
      "lightning",
      "bludgeoning",
      "cold",
    ]);
  });

  it("Chromatic Orb is a player-chosen six-element pick", () => {
    expect(spellIndex.get("chromatic-orb")?.damageChoice).toEqual([
      "acid",
      "cold",
      "fire",
      "lightning",
      "poison",
      "thunder",
    ]);
    expect(spellIndex.get("chromatic-orb")?.damageType).toBeUndefined();
    expect(spellIndex.get("chromatic-orb")?.damageTypes).toBeUndefined();
  });

  it("Dragon's Breath is a player-chosen five-element pick", () => {
    expect(spellIndex.get("dragons-breath")?.damageChoice).toEqual([
      "acid",
      "cold",
      "fire",
      "lightning",
      "poison",
    ]);
  });

  it("Glyph of Warding's Explosive Rune is a five-element pick", () => {
    expect(spellIndex.get("glyph-of-warding")?.damageChoice).toEqual([
      "acid",
      "cold",
      "fire",
      "lightning",
      "thunder",
    ]);
  });

  it("every declared multi/choice type is a canonical DamageType", () => {
    const VALID: ReadonlySet<DamageType> = new Set<DamageType>([
      "acid",
      "bludgeoning",
      "cold",
      "fire",
      "force",
      "lightning",
      "necrotic",
      "piercing",
      "poison",
      "psychic",
      "radiant",
      "slashing",
      "thunder",
    ]);
    for (const id of [
      "prismatic-spray",
      "prismatic-wall",
      "storm-of-vengeance",
      "chromatic-orb",
      "dragons-breath",
      "glyph-of-warding",
    ]) {
      const spell = spellIndex.get(id);
      for (const t of spell?.damageTypes ?? []) expect(VALID.has(t)).toBe(true);
      for (const t of spell?.damageChoice ?? []) expect(VALID.has(t)).toBe(true);
    }
  });
});

// ─── Consumer: resolveActions surfaces the facet in the action summary ───────

/**
 * A minimal bard caster carrying ONLY the given spells (no features / weapons),
 * built inline rather than cloning MOCK_CHARACTER so the test exercises the
 * spell action-summary path in isolation.
 */
function charWithSpells(srdIds: string[]): CharacterDoc {
  return {
    id: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
    status: "active",
    character: {
      name: assertNonEmptyString("Caster"),
      quote: "",
      race: asRaceId("human"),
      classes: [{ classId: "bard", level: 9 }],
      background: "criminal",
      alignment: asAlignmentId("neutral-good"),
      playerName: "Tester",
      speed: "30 ft",
      ac: 14,
      armorNote: "",
      hp: { max: 50 },
      hitDieType: 8,
      languageIds: ["common"],
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
      abilityScores: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 18 },
      savingThrows: ["DEX", "CHA"],
      skills: {},
      spellcasting: {
        ability: "CHA",
        preparedCaster: false,
        preparedMax: 0,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
        { level: 3, total: 3 },
      ],
      spells: srdIds.map((srdId) => ({ srdId })),
      weapons: [],
      equipment: [],
      features: [],
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
    },
  };
}

describe("resolveActions — multi/choice spell damage type in summary", () => {
  it("surfaces all simultaneous types with flavor 'all' (Prismatic Spray)", () => {
    const actions = resolveActions(charWithSpells(["prismatic-spray"]));
    const row = actions.find((a) => a.spellId === "prismatic-spray");
    expect(row).toBeDefined();
    expect(row?.summary.damageTypes).toEqual([
      "fire",
      "acid",
      "lightning",
      "poison",
      "cold",
    ]);
    expect(row?.summary.multiDamageTypeFlavor).toBe("all");
    // Legacy single-chip consumers still get the first type.
    expect(row?.summary.damageType).toBe("fire");
  });

  it("surfaces the player-chosen set with flavor 'choice' (Chromatic Orb)", () => {
    const actions = resolveActions(charWithSpells(["chromatic-orb"]));
    const row = actions.find((a) => a.spellId === "chromatic-orb");
    expect(row?.summary.damageTypes).toEqual([
      "acid",
      "cold",
      "fire",
      "lightning",
      "poison",
      "thunder",
    ]);
    expect(row?.summary.multiDamageTypeFlavor).toBe("choice");
    expect(row?.summary.damageType).toBe("acid");
  });

  it("a single-type spell keeps the legacy shape (no multi fields)", () => {
    // Fireball is a plain `damageType: "fire"` spell.
    const actions = resolveActions(charWithSpells(["fireball"]));
    const row = actions.find((a) => a.spellId === "fireball");
    expect(row?.summary.damageType).toBe("fire");
    expect(row?.summary.damageTypes).toBeUndefined();
    expect(row?.summary.multiDamageTypeFlavor).toBeUndefined();
  });

  it("a non-damaging spell exposes no damage type and no false heal", () => {
    // Misty Step teleports — no damage, no healing.
    const actions = resolveActions(charWithSpells(["misty-step"]));
    const row = actions.find((a) => a.spellId === "misty-step");
    expect(row?.summary.damageType).toBeUndefined();
    expect(row?.summary.damageTypes).toBeUndefined();
  });

  it("multi-element save spells no longer trip healing detection", () => {
    // Storm of Vengeance has a CON save AND multi-element damage; the healing
    // regex must NOT run on it (its prose mentions no HP restore, but the guard
    // now keys on the resolved damage facet, not the absent `damageType`).
    const actions = resolveActions(charWithSpells(["storm-of-vengeance"]));
    const row = actions.find((a) => a.spellId === "storm-of-vengeance");
    expect(row?.summary.multiDamageTypeFlavor).toBe("all");
    expect(row?.summary.healing).toBeUndefined();
  });
});
