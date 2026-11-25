import { describe, it, expect } from "vitest";
import {
  serializeCharacterEnvelope,
  parseCharacterEnvelope,
} from "@/lib/character-codec";
import { minimizeCharacter, rehydrateCharacter } from "@/lib/character-minimal";
import { computeCharacterMaxHp, effectiveMaxHp } from "@/lib/aggregate-character";
import { asRaceId } from "@/data/srd-names";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

// SRD content only, so the public (pack-free) build runs the same cases.
//
// A Dwarf Monk 3 with CON 14 averages 24 HP (d8: 8 + 5 + 5, +2 CON per level).
// Dwarven Toughness (a SPECIES trait, +1 HP per level) makes it 27 by the book. The
// stored build never carries `hp`, so a reload must derive the WHOLE by-the-book
// max, the per-level HP grant included.
const dwarfMonk = (max: number): CharacterDoc => ({
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    race: asRaceId("dwarf"),
    classes: [{ classId: "monk", level: 3 }],
    abilityScores: { ...MOCK_CHARACTER.character.abilityScores, CON: 14 },
    features: [],
    humanOriginFeat: "",
    bgFeat: "",
    hp: { max },
  },
});

// A Draconic Sorcerer 3 with CON 14 averages 20 HP (d6: 6 + 4 + 4, +2 CON per
// level). Draconic Resilience is a DERIVED subclass feature (+1 HP per level): the
// minimizer drops its ref and the rehydrate merges it back, so the max must be
// derived after that merge: 23. (The shown max is not asserted here: the grant data
// also carries a one-shot +3, which double counts by RAW; the rules lane owns it.)
const draconicSorcerer = (): CharacterDoc => ({
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    race: asRaceId("human"),
    classes: [{ classId: "sorcerer", subclassId: "draconic-sorcery", level: 3 }],
    abilityScores: { ...MOCK_CHARACTER.character.abilityScores, CON: 14 },
    features: [],
    humanOriginFeat: "",
    bgFeat: "",
    hp: { max: 23 },
  },
});

function reload(doc: CharacterDoc) {
  const env = structuredClone(serializeCharacterEnvelope(doc));
  const parsed = parseCharacterEnvelope(env.build, env.state);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.character;
}

describe("max HP round-trip — a species HP grant survives a reload", () => {
  it("the by-the-book max of a Dwarf Monk 3 is 27", () => {
    expect(computeCharacterMaxHp(dwarfMonk(27).character)).toBe(27);
  });

  it("a saved and reloaded Dwarf Monk 3 keeps 27 max HP, not the bare 24", () => {
    expect(reload(dwarfMonk(27)).hp.max).toBe(27);
  });

  it("the sheet shows 27 after the reload, the grant counted once", () => {
    expect(effectiveMaxHp(reload(dwarfMonk(27)), MOCK_CHARACTER.session)).toBe(27);
  });

  it("the export codec drops a by-the-book max and re-derives it with the grant", () => {
    const min = minimizeCharacter(dwarfMonk(27).character);
    expect(min.hp).toBeUndefined();
    expect(rehydrateCharacter(min).hp.max).toBe(27);
  });
});

describe("max HP round-trip — a DERIVED subclass HP grant survives a reload", () => {
  it("the by-the-book max of a Draconic Sorcerer 3 is 23", () => {
    const doc = draconicSorcerer();
    expect(
      computeCharacterMaxHp(rehydrateCharacter(minimizeCharacter(doc.character)))
    ).toBe(23);
  });

  it("a saved and reloaded Draconic Sorcerer 3 keeps 23 max HP, not the bare 20", () => {
    expect(reload(draconicSorcerer()).hp.max).toBe(23);
  });
});
