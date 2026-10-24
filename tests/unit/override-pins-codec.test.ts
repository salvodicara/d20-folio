/**
 * The hand-set numbers that had no stored home (owner direction row 13: overrides
 * always possible): effective ability scores, save DCs of features and actions,
 * carrying capacity and jump distances. They live in their own `build.pins` key, all
 * optional: a character that never pinned anything stores no `pins`, and every older
 * document reads unchanged.
 *
 * Why a new top-level key and not `build.overrides`: the v0.25.0 reader (c6c88a53)
 * reads `build.overrides` only through its fixed OVERRIDE_MAP and rebuilds it from that
 * map on write (character-codec.ts:1213-1219 and :1137-1142), so a new sub-key there
 * would be dropped by an old client's next save. An unknown TOP-LEVEL build key is kept
 * verbatim instead (leftover over KNOWN_BUILD_KEYS, :1270/:1275, written back last at
 * :1163). The v0.25.0 closed world below is copied from that commit (:1062-1084).
 */
import { describe, expect, it } from "vitest";
import {
  KNOWN_BUILD_KEYS,
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

const V025_KNOWN_BUILD_KEYS = [
  "name",
  "player",
  "quote",
  "race",
  "classes",
  "background",
  "alignment",
  "abilities",
  "speed",
  "hitDieType",
  "savingThrows",
  "abilityBudget",
  "spellcasting",
  "spellSlots",
  "speciesSpellAbility",
  "levelUpChecklist",
  "toolChoices",
  "languageIds",
  "customLanguages",
  "toolProficiencyIds",
  "customToolProficiencies",
  "skills",
  "spells",
  "weapons",
  "equipment",
  "combatAlgorithm",
  "asi",
  "originFeats",
  "overrides",
  "features",
  "customs",
  "lore",
  "experience",
];

const pinned: CharacterDoc = {
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    abilityScoreOverrides: { STR: 19 },
    saveDcOverrides: { "rogue-cunning-strike": 16 },
    carryingCapacityOverride: 300,
    jumpOverrides: { long: 25 },
  },
};

function envelope(doc: CharacterDoc) {
  return structuredClone(serializeCharacterEnvelope(doc));
}

function reparse(build: Record<string, unknown>, state: Record<string, unknown>) {
  const parsed = parseCharacterEnvelope(build, state);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed;
}

describe("character codec — pins", () => {
  it("writes the pins to their own build key and reads them back", () => {
    const env = envelope(pinned);
    expect(env.build.pins).toEqual({
      abilities: { STR: 19 },
      saveDcs: { "rogue-cunning-strike": 16 },
      carry: 300,
      jump: { long: 25 },
    });
    const { character } = reparse(env.build, env.state);
    expect(character.abilityScoreOverrides).toEqual({ STR: 19 });
    expect(character.saveDcOverrides).toEqual({ "rogue-cunning-strike": 16 });
    expect(character.carryingCapacityOverride).toBe(300);
    expect(character.jumpOverrides).toEqual({ long: 25 });
  });

  it("a stored build with pins round-trips byte-identically", () => {
    const env = envelope(pinned);
    const { character, session } = reparse(env.build, env.state);
    const again = serializeCharacterEnvelope({ ...pinned, character, session });
    expect(JSON.stringify(again)).toBe(JSON.stringify(env));
  });

  it("a character that never pinned anything stores no pins key", () => {
    const env = envelope(MOCK_CHARACTER);
    expect("pins" in env.build).toBe(false);
    const { character } = reparse(env.build, env.state);
    expect(character.abilityScoreOverrides).toBeUndefined();
    expect(character.carryingCapacityOverride).toBeUndefined();
  });

  it("a non-finite pin falls back to the computed value; a malformed pins survives", () => {
    const env = envelope(MOCK_CHARACTER);
    env.build.pins = { abilities: { STR: "high" }, carry: Number.NaN };
    const { character } = reparse(env.build, env.state);
    expect(character.abilityScoreOverrides?.STR).toBeUndefined();
    expect(character.carryingCapacityOverride ?? null).toBeNull();

    const odd = envelope(MOCK_CHARACTER);
    odd.build.pins = "not a record";
    const parsed = reparse(odd.build, odd.state);
    const back = serializeCharacterEnvelope({ ...MOCK_CHARACTER, ...parsed });
    expect(back.build.pins).toBe("not a record");
  });

  it("is a key the v0.25.0 reader keeps verbatim (an unknown top-level build key)", () => {
    expect(V025_KNOWN_BUILD_KEYS).not.toContain("pins");
    expect(KNOWN_BUILD_KEYS).toContain("pins");
  });
});
