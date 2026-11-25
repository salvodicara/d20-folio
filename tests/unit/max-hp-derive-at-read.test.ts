/**
 * #1334 — max HP is computed where it is read: `effectiveMaxHp` derives the base from
 * the build (`deriveMaxHp`), so a path that changes a derive input without
 * re-deriving the stored number (a sold attuned item, a feat written directly) never
 * shows a stale max. Magic Jar's host stage keeps the host's max.
 * SRD content only.
 */
import { describe, it, expect } from "vitest";
import { effectiveMaxHp, maxHpBase } from "@/lib/aggregate-character";
import { asRaceId } from "@/data/srd-names";
import { MOCK_CHARACTER } from "@/lib/mock";
import { deriveCharacter } from "@/lib/views/derive-character";
import type { CharacterData, CharacterDoc } from "@/types/character";

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

const session = MOCK_CHARACTER.session;
const amulet = { srdId: "amulet-of-health", equipped: true, attuned: true };

describe("max HP is derived where it is read (#1334)", () => {
  it("an attuned Amulet of Health written without a re-derive still counts: 33, not the stored 27", () => {
    // The stored number is the pre-attunement 27 (a purchase or a trade path).
    const c = monk({ equipment: [amulet], hp: { max: 27 } });
    expect(effectiveMaxHp(c, session)).toBe(33);
  });

  it("selling the attuned amulet drops the max at once: 27, not the stale 33", () => {
    const c = monk({ equipment: [], hp: { max: 33 } });
    expect(effectiveMaxHp(c, session)).toBe(27);
  });

  it("the sheet view shows the derived max", () => {
    const doc: CharacterDoc = {
      ...MOCK_CHARACTER,
      character: monk({ equipment: [amulet], hp: { max: 27 } }),
    };
    expect(deriveCharacter(doc).hp.max).toBe(33);
  });

  it("the max-HP inputs still apply: a rolled surplus of 3 and a bonus of 2 give 32", () => {
    const c = monk({ hpRolled: 3, hpBonus: 2, hp: { max: 1 } });
    expect(maxHpBase(c, session)).toBe(32);
  });

  it("an unknown (homebrew) class keeps its stored max", () => {
    const c = monk({
      classes: [{ classId: "homebrew-class", level: 3 }],
      hp: { max: 40 },
    });
    expect(effectiveMaxHp(c, session)).toBe(40);
  });

  it("Magic Jar's host stage keeps the host's max, not the caster's derive", () => {
    const host = monk({ hp: { max: 11 } });
    const jarred = {
      ...session,
      magicJar: {
        stage: "host" as const,
        hostId: "guard",
        prior: {
          abilityScores: { STR: 10, DEX: 10, CON: 14 },
          speedOverride: null,
          speedOverrides: {},
          senseRangeOverrides: {},
          hpMax: 27,
          hpCurrent: 27,
          hpMaxReduction: 0,
          hitDieType: 8 as const,
          hitDiceTotalOverride: null,
          hitDiceUsed: 0,
        },
      },
    };
    expect(effectiveMaxHp(host, jarred)).toBe(11);
  });
});
