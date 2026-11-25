/**
 * #1315 — the stored max-HP INPUTS: `build.hp = { rolled?, bonus? }`.
 * `rolled` is the sum of (roll − fixed value) over the rolled levels; `bonus` is a
 * hand adjustment. Max HP stays derived:
 *   by-the-book max + rolled + bonus, floored at the total level.
 * SRD content only, so the pack-free build runs the same cases.
 */
import { describe, it, expect } from "vitest";
import {
  serializeCharacterEnvelope,
  parseCharacterEnvelope,
} from "@/lib/character-codec";
import { minimizeCharacter, rehydrateCharacter } from "@/lib/character-minimal";
import { asRaceId } from "@/data/srd-names";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterData, CharacterDoc } from "@/types/character";

// Dwarf Monk 3, CON 14: 24 average + Dwarven Toughness 3 = 27 by the book.
const monk = (inputs: Partial<CharacterData> = {}, level = 3): CharacterDoc => ({
  ...MOCK_CHARACTER,
  character: {
    ...MOCK_CHARACTER.character,
    race: asRaceId("dwarf"),
    classes: [{ classId: "monk", level }],
    abilityScores: { ...MOCK_CHARACTER.character.abilityScores, CON: 14 },
    features: [],
    humanOriginFeat: "",
    bgFeat: "",
    hp: { max: 27 },
    ...inputs,
  },
});

const envelope = (doc: CharacterDoc) => structuredClone(serializeCharacterEnvelope(doc));

function parse(build: Record<string, unknown>, state: Record<string, unknown> = {}) {
  const parsed = parseCharacterEnvelope(build, state);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.character;
}

const reload = (doc: CharacterDoc) => {
  const env = envelope(doc);
  return parse(env.build, env.state);
};

describe("max HP inputs — stored and derived", () => {
  it("writes the inputs to build.hp", () => {
    expect(envelope(monk({ hpRolled: 4, hpBonus: 2 })).build.hp).toEqual({
      rolled: 4,
      bonus: 2,
    });
  });

  it("writes no build.hp for a fixed-method character with no adjustment", () => {
    expect(envelope(monk()).build).not.toHaveProperty("hp");
    expect(envelope(monk({ hpRolled: 0, hpBonus: 0 })).build).not.toHaveProperty("hp");
  });

  it("a reload keeps the inputs and derives 27 + 4 + 2 = 33", () => {
    const c = reload(monk({ hpRolled: 4, hpBonus: 2 }));
    expect(c.hpRolled).toBe(4);
    expect(c.hpBonus).toBe(2);
    expect(c.hp.max).toBe(33);
  });

  it("a level change needs no write: an old tab's Monk 4 derives 35 + 4 = 39", () => {
    // Level 4 adds 5 (fixed) + 2 (CON) + 1 (Dwarven Toughness) = 8 → 35, + rolled 4.
    const env = envelope(monk({ hpRolled: 4 }));
    env.build.classes = [{ classId: "monk", level: 4 }];
    expect(parse(env.build, env.state).hp.max).toBe(39);
  });

  it("a negative surplus never takes the max below the total level", () => {
    expect(reload(monk({ hpRolled: -100 })).hp.max).toBe(3);
  });

  it("the export codec keeps the inputs through minimize → rehydrate", () => {
    // In memory `hp.max` is already the derived value (33), so the minimizer drops it.
    const c = rehydrateCharacter(
      minimizeCharacter(monk({ hpRolled: 4, hpBonus: 2, hp: { max: 33 } }).character)
    );
    expect([c.hpRolled, c.hpBonus, c.hp.max]).toEqual([4, 2, 33]);
  });
});

describe("max HP inputs — malformed or newer stored values", () => {
  it("an invalid input loads as absent and is not written back", () => {
    const env = envelope(monk());
    env.build.hp = { rolled: "x", bonus: Number.NaN };
    const c = parse(env.build, env.state);
    expect(c.hp.max).toBe(27);
    expect(envelope({ ...monk(), character: c }).build).not.toHaveProperty("hp");
  });

  it("a non-record build.hp still loads, by the book", () => {
    const env = envelope(monk());
    env.build.hp = 7;
    expect(parse(env.build, env.state).hp.max).toBe(27);
  });

  it("an unknown sub-key of build.hp (a newer client's field) survives a save", () => {
    const env = envelope(monk({ hpBonus: 2 }));
    env.build.hp = { bonus: 2, cap: 40 };
    const c = parse(env.build, env.state);
    expect(envelope({ ...monk(), character: c }).build.hp).toEqual({ bonus: 2, cap: 40 });
  });

  it("a later input write replaces the value and keeps the unknown sub-key", () => {
    const env = envelope(monk());
    env.build.hp = { bonus: 2, cap: 40 };
    const c = parse(env.build, env.state);
    const edited = { ...monk(), character: { ...c, hpBonus: 5 } };
    expect(envelope(edited).build.hp).toEqual({ bonus: 5, cap: 40 });
  });
});
