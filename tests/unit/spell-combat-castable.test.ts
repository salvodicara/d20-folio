/**
 * Combat-castability gate (#77, Owner-16).
 *
 * D&D 2024 RAW: a prepared caster can only cast the level-1+ spells they have
 * PREPARED (Cleric/Wizard/Bard/Sorcerer "Prepared Spells of Level 1+: …spells
 * that are available for you to cast"). The combat action panel had no such
 * filter — `resolveActions` listed every spell on the sheet, so an unprepared
 * spell (the mock's `charm-person { prepared: false }`) showed as castable.
 *
 * These tests pin the pure gate (`isSpellCombatCastable`, every branch) AND the
 * `resolveActions` seam that consumes it, so the regression can't return.
 */

import { describe, it, expect } from "vitest";
import {
  isSpellCombatCastable,
  type SpellCombatCastability,
} from "@/lib/spell-combat-castable";
import { resolveActions } from "@/lib/smart-tracker";
import { parseCharacter } from "@/lib/character-codec";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import { loc } from "../_harness/loc";

const base: SpellCombatCastability = { level: 1, preparedCaster: true };

describe("isSpellCombatCastable — the pure gate", () => {
  it("a cantrip is always castable (even unprepared, even for a prepared caster)", () => {
    expect(isSpellCombatCastable({ level: 0, preparedCaster: true })).toBe(true);
    expect(
      isSpellCombatCastable({ level: 0, preparedCaster: true, prepared: false })
    ).toBe(true);
  });

  it("a known-style caster casts every spell on their list", () => {
    expect(
      isSpellCombatCastable({ level: 3, preparedCaster: false, prepared: false })
    ).toBe(true);
  });

  it("a prepared caster's UNPREPARED level-1+ spell is NOT castable", () => {
    expect({ ...base, prepared: false }).toBeTruthy();
    expect(isSpellCombatCastable({ ...base, prepared: false })).toBe(false);
    expect(isSpellCombatCastable({ ...base })).toBe(false); // prepared undefined
  });

  it("a prepared caster's PREPARED spell is castable", () => {
    expect(isSpellCombatCastable({ ...base, prepared: true })).toBe(true);
  });

  it("always-prepared grants stay castable without a prepared flag", () => {
    expect(isSpellCombatCastable({ ...base, alwaysPrepared: true })).toBe(true);
  });

  it("Wizard Spell Mastery and Signature picks stay castable (RAW: always prepared)", () => {
    expect(isSpellCombatCastable({ ...base, wizardSpellMastery: true })).toBe(true);
    expect(isSpellCombatCastable({ ...base, wizardSignatureSpell: true })).toBe(true);
  });

  it("a free-cast spell stays castable (tracker cast, no slot, prepared-independent)", () => {
    expect(isSpellCombatCastable({ ...base, hasFreeCast: true })).toBe(true);
  });
});

describe("resolveActions — combat panel hides unprepared spells", () => {
  const actions = resolveActions(MOCK_CHARACTER);
  const spellActions = actions.filter((a) => a.source === "spell");
  const names = new Set(spellActions.map((a) => loc(a.name, "en")));

  it("the mock is a prepared caster with an unprepared Charm Person", () => {
    expect(MOCK_CHARACTER.character.spellcasting?.preparedCaster).toBe(true);
    const charm = MOCK_CHARACTER.character.spells.find(
      (s) => !("custom" in s) && s.srdId === "charm-person"
    );
    expect(charm && !("custom" in charm) && charm.prepared).toBe(false);
  });

  it("the unprepared Charm Person does NOT appear as a combat action", () => {
    expect(names.has("Charm Person")).toBe(false);
    expect(spellActions.some((a) => a.spellId === "charm-person")).toBe(false);
  });

  it("prepared spells and cantrips DO appear", () => {
    expect(names.has("Healing Word")).toBe(true); // prepared L1
    expect(names.has("Vicious Mockery")).toBe(true); // cantrip
    expect(spellActions.length).toBeGreaterThan(0);
  });
});

describe("resolveActions — always-castable spells survive the filter", () => {
  // A minimal prepared caster carrying ONLY edge-case refs: an always-prepared
  // grant, a Spell Mastery pick, and a free-cast spell — none flagged
  // `prepared: true`. All three must still surface as combat actions.
  function makePreparedCaster(spells: CharacterDoc["character"]["spells"]): CharacterDoc {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.spells = spells;
    return doc;
  }

  it("alwaysPrepared, Spell Mastery, and free-cast spells appear even with prepared:false", () => {
    const doc = makePreparedCaster([
      { srdId: "misty-step", prepared: false, alwaysPrepared: true },
      { srdId: "shatter", prepared: false, wizardSpellMastery: true },
      {
        srdId: "sleep",
        prepared: false,
        freeCastSource: { sourceId: "fey-touched", rest: "long", usesPerRest: 1 },
      },
      { srdId: "charm-person", prepared: false }, // the control — must NOT appear
    ]);
    const actions = resolveActions(doc);
    const ids = new Set(
      actions.filter((a) => a.source === "spell").map((a) => a.spellId)
    );
    expect(ids.has("misty-step")).toBe(true);
    expect(ids.has("shatter")).toBe(true);
    expect(ids.has("sleep")).toBe(true);
    expect(ids.has("charm-person")).toBe(false);
  });

  it("a known-style caster shows its whole list (no prepared subset)", () => {
    const doc = makePreparedCaster([{ srdId: "charm-person", prepared: false }]);
    if (doc.character.spellcasting) doc.character.spellcasting.preparedCaster = false;
    const actions = resolveActions(doc);
    expect(
      actions.some((a) => a.source === "spell" && a.spellId === "charm-person")
    ).toBe(true);
  });
});

describe("prepared Wizard → combat: the spellbook discrepancy (Owner-16)", () => {
  // The live-Wizard-fixture case: a prepared Wizard whose spell list mixes prepared and
  // unprepared (spellbook-only) spells. The combat tab must show only cantrips +
  // prepared spells, NOT the unprepared spellbook — so the Spells tab and Combat
  // tab agree by construction. Built through the v2 codec (the only import format).
  const v2 = JSON.stringify({
    schema: 3,
    build: {
      name: "Briox",
      race: "gnome",
      classes: [{ classId: "wizard", level: 5 }],
      background: "sage",
      abilities: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
      spells: [
        { srdId: "ray-of-frost" }, // cantrip
        { srdId: "shield", prepared: true },
        { srdId: "sleep", prepared: true },
        { srdId: "mage-armor", prepared: false }, // spellbook
        { srdId: "find-familiar", prepared: false },
        { srdId: "misty-step", prepared: true },
        { srdId: "flaming-sphere", prepared: false },
      ],
    },
    state: {},
  });

  function load(): CharacterDoc {
    const res = parseCharacter(v2);
    if (!res.success) throw new Error(res.error);
    return { id: "x", createdAt: new Date(), updatedAt: new Date(), ...res.doc };
  }

  it("rehydrates as a prepared caster and preserves prepared flags on SRD refs", () => {
    const doc = load();
    expect(doc.character.spellcasting?.preparedCaster).toBe(true);
    const byId = (id: string) =>
      doc.character.spells.find((s) => !("custom" in s) && s.srdId === id);
    expect(byId("shield")?.prepared).toBe(true);
    expect(byId("mage-armor")?.prepared).toBe(false);
  });

  it("combat shows ONLY cantrips + prepared spells, never the unprepared spellbook", () => {
    const ids = new Set(
      resolveActions(load())
        .filter((a) => a.source === "spell")
        .map((a) => a.spellId)
    );
    // Castable: 1 cantrip + 3 prepared = 4.
    expect(ids).toEqual(new Set(["ray-of-frost", "shield", "sleep", "misty-step"]));
    // The unprepared spellbook spells must be absent.
    for (const hidden of ["mage-armor", "find-familiar", "flaming-sphere"]) {
      expect(ids.has(hidden)).toBe(false);
    }
  });
});
