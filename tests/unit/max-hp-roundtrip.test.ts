import { describe, it, expect } from "vitest";
import {
  serializeCharacterEnvelope,
  parseCharacterEnvelope,
} from "@/lib/character-codec";
import { minimizeCharacter, rehydrateCharacter } from "@/lib/character-minimal";
import { computeCharacterMaxHp, effectiveMaxHp } from "@/lib/aggregate-character";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

// A Monk 3 with CON 14 averages 24 HP (d8: 8 + 5 + 5, +2 CON per level). The Tough
// feat adds +2 per level: 30 by the book. The stored build never carries `hp`, so a
// reload must derive the WHOLE by-the-book max, the per-level HP grant included.
const toughMonk = (max: number): CharacterDoc => ({
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    classes: [{ classId: "monk", level: 3 }],
    abilityScores: { ...MOCK_CHARACTER.character.abilityScores, CON: 14 },
    features: [{ srdId: "tough" }],
    humanOriginFeat: "",
    bgFeat: "",
    hp: { max },
  },
});

function reload(doc: CharacterDoc) {
  const env = structuredClone(serializeCharacterEnvelope(doc));
  const parsed = parseCharacterEnvelope(env.build, env.state);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.character;
}

/** The max HP the sheet SHOWS after a reload (stored base + live one-shot grants). */
const shownMax = (doc: CharacterDoc) =>
  effectiveMaxHp(reload(doc), MOCK_CHARACTER.session);

describe("max HP round-trip — a per-level HP grant survives a reload", () => {
  it("the by-the-book max of a Tough Monk 3 is 30", () => {
    expect(computeCharacterMaxHp(toughMonk(30).character)).toBe(30);
  });

  it("a saved and reloaded Tough Monk 3 keeps 30 max HP, not the bare 24", () => {
    expect(reload(toughMonk(30)).hp.max).toBe(30);
  });

  it("the export codec drops a by-the-book max and re-derives it with the grant", () => {
    const min = minimizeCharacter(toughMonk(30).character);
    expect(min.hp).toBeUndefined();
    expect(rehydrateCharacter(min).hp.max).toBe(30);
  });
});

// A Draconic Sorcerer 3 with CON 14 averages 20 HP (d6: 6 + 4 + 4, +2 CON per
// level). Draconic Resilience is a DERIVED subclass feature (+1 HP per level): the
// minimizer drops its ref and the rehydrate merges it back, so the max must be
// derived after that merge: 23. (Its one-shot +3 is added live, never stored.)
const draconicSorcerer = (): CharacterDoc => ({
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    classes: [{ classId: "sorcerer", subclassId: "draconic-sorcery", level: 3 }],
    abilityScores: { ...MOCK_CHARACTER.character.abilityScores, CON: 14 },
    features: [],
    humanOriginFeat: "",
    bgFeat: "",
    hp: { max: 23 },
  },
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

// A Dwarf Monk 3 with CON 14: 24 average + Dwarven Toughness (a SPECIES trait, +1
// per level) = 27. The trait comes from the species, not from features[].
const dwarfMonk = (): CharacterDoc => ({
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    race: "dwarf",
    classes: [{ classId: "monk", level: 3 }],
    abilityScores: { ...MOCK_CHARACTER.character.abilityScores, CON: 14 },
    features: [],
    humanOriginFeat: "",
    bgFeat: "",
    hp: { max: 27 },
  },
});

describe("max HP round-trip — the sheet shows the by-the-book max, counted once", () => {
  it("a reloaded Tough Monk 3 shows 30", () => {
    expect(shownMax(toughMonk(30))).toBe(30);
  });
  it("a reloaded Draconic Sorcerer 3 shows 26 (23 + the one-shot +3)", () => {
    expect(shownMax(draconicSorcerer())).toBe(26);
  });
  it("a reloaded Dwarf Monk 3 shows 27", () => {
    expect(reload(dwarfMonk()).hp.max).toBe(27);
    expect(shownMax(dwarfMonk())).toBe(27);
  });
});
