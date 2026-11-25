/**
 * #1318 — max HP follows the character's EFFECTIVE CON modifier (2024 RAW: "If your
 * Constitution modifier changes, your Hit Point maximum changes as well"), not the
 * raw score: a hand-set ability pin and an attuned item that sets CON count.
 * SRD content only.
 */
import { describe, it, expect } from "vitest";
import {
  serializeCharacterEnvelope,
  parseCharacterEnvelope,
} from "@/lib/character-codec";
import { deriveMaxHp, effectiveMaxHp } from "@/lib/aggregate-character";
import { asRaceId } from "@/data/srd-names";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterData } from "@/types/character";

// Dwarf Monk 3, CON 14 (+2): 24 + Dwarven Toughness 3 = 27 by the book.
const monk = (inputs: Partial<CharacterData> = {}): CharacterData => ({
  ...MOCK_CHARACTER.character,
  race: asRaceId("dwarf"),
  classes: [{ classId: "monk", level: 3 }],
  hitDieType: 8,
  abilityScores: { ...MOCK_CHARACTER.character.abilityScores, CON: 14 },
  features: [],
  equipment: [],
  humanOriginFeat: "",
  bgFeat: "",
  hp: { max: 27 },
  ...inputs,
});

function reload(character: CharacterData): CharacterData {
  const env = structuredClone(
    serializeCharacterEnvelope({ ...MOCK_CHARACTER, character })
  );
  const parsed = parseCharacterEnvelope(env.build, env.state);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.character;
}

describe("max HP uses the effective CON (#1318)", () => {
  it("the raw score alone: 27", () => {
    expect(deriveMaxHp(monk())).toBe(27);
  });

  it("a hand-set CON 18 (+4) adds 2 per level: 33, in session and after a reload", () => {
    const c = monk({ abilityScoreOverrides: { CON: 18 } });
    expect(deriveMaxHp(c)).toBe(33);
    expect(reload(c).hp.max).toBe(33);
  });

  it("an attuned Amulet of Health (CON 19, +4) adds 2 per level: 33", () => {
    const c = monk({
      equipment: [{ srdId: "amulet-of-health", equipped: true, attuned: true }],
    });
    expect(deriveMaxHp(c)).toBe(33);
    expect(reload(c).hp.max).toBe(33);
  });

  it("the amulet not attuned does nothing: 27", () => {
    const c = monk({
      equipment: [{ srdId: "amulet-of-health", equipped: true, attuned: false }],
    });
    expect(deriveMaxHp(c)).toBe(27);
  });

  it("the sheet shows the derived max, counted once", () => {
    const c = monk({ abilityScoreOverrides: { CON: 18 }, hp: { max: 33 } });
    expect(effectiveMaxHp(c, MOCK_CHARACTER.session)).toBe(33);
  });
});
