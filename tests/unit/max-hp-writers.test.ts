/**
 * #1315 PR B — every max-HP writer records its INPUT (`hpRolled`, `hpBonus`), so a
 * reload derives the player's number.
 * SRD content only, so the pack-free build runs the same cases.
 */
import { describe, it, expect } from "vitest";
import {
  serializeCharacterEnvelope,
  parseCharacterEnvelope,
} from "@/lib/character-codec";
import { levelUp } from "@/lib/level-up";
import { commitLevelUp, type LevelUpPicks } from "@/lib/level-up-commit";
import { makeCharacterDoc } from "./_helpers";
import { EMPTY_CHOICE_PICKS } from "@/lib/feature-choices";
import {
  deriveMaxHp,
  effectiveMaxHp,
  effectiveMaxHpBreakdown,
  maxHpWithoutBonus,
  withConScore,
  withMaxHpEdit,
  withoutMaxHpBonus,
} from "@/lib/aggregate-character";
import { asRaceId } from "@/data/srd-names";
import { breakdownTotal } from "@/lib/value-breakdown";
import { buildNewCharacter } from "@/lib/creation/build";
import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterData } from "@/types/character";

// Dwarf Monk 3, CON 14: 24 average + Dwarven Toughness 3 = 27 by the book. A Monk
// level is d8: fixed value 5, + 2 CON, + 1 Dwarven Toughness.
const monk = (inputs: Partial<CharacterData> = {}): CharacterData => ({
  ...MOCK_CHARACTER.character,
  race: asRaceId("dwarf"),
  classes: [{ classId: "monk", level: 3 }],
  hitDieType: 8,
  abilityScores: { ...MOCK_CHARACTER.character.abilityScores, CON: 14 },
  features: [],
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

const envelopeBuild = (character: CharacterData) =>
  serializeCharacterEnvelope({ ...MOCK_CHARACTER, character }).build;

describe("level-up — a rolled hit die survives a reload", () => {
  it("a roll of 8 on the d8 (fixed 5) records a surplus of 3: 38 after a reload", () => {
    const { updatedCharacter } = levelUp(monk(), 4, { hpGain: 8 });
    expect(updatedCharacter.hpRolled).toBe(3);
    expect(reload(updatedCharacter).hp.max).toBe(38);
  });

  it("a roll of 2 records a surplus of −3: 32 after a reload", () => {
    const { updatedCharacter } = levelUp(monk(), 4, { hpGain: 2 });
    expect(updatedCharacter.hpRolled).toBe(-3);
    expect(reload(updatedCharacter).hp.max).toBe(32);
  });

  it("the fixed value records nothing: 35 after a reload", () => {
    const { updatedCharacter } = levelUp(monk(), 4);
    expect(updatedCharacter.hpRolled).toBeUndefined();
    expect(reload(updatedCharacter).hp.max).toBe(35);
  });

  it("a second roll adds to the earlier surplus", () => {
    const first = levelUp(monk(), 4, { hpGain: 8 }).updatedCharacter;
    const second = levelUp(first, 5, { hpGain: 7 }).updatedCharacter;
    // 27 + (5 + 3 surplus + 2 CON + 1) + (5 + 2 surplus + 2 CON + 1) = 48.
    expect(second.hpRolled).toBe(5);
    expect(reload(second).hp.max).toBe(48);
  });
});

describe("the header's hand edit of max HP — stored as a bonus over the derived max", () => {
  it("entering 30 on a 27 character stores a bonus of +3; the reload shows 30", () => {
    const edited = withMaxHpEdit(monk(), 30);
    expect([edited.hpBonus, edited.hp.max]).toEqual([3, 30]);
    expect(reload(edited).hp.max).toBe(30);
  });

  it("the bonus survives a level-up: 30 + 8 = 38 after a reload", () => {
    const leveled = levelUp(withMaxHpEdit(monk(), 30), 4).updatedCharacter;
    expect(reload(leveled).hp.max).toBe(38);
  });

  it("the bonus sits on top of a rolled surplus, never replacing it", () => {
    const rolled = monk({ hpRolled: 4, hp: { max: 31 } });
    const edited = withMaxHpEdit(rolled, 33);
    expect([edited.hpRolled, edited.hpBonus]).toEqual([4, 2]);
    expect(reload(edited).hp.max).toBe(33);
  });

  it("entering the derived value clears the bonus", () => {
    const edited = withMaxHpEdit(monk({ hpBonus: 3, hp: { max: 30 } }), 27);
    expect(edited.hpBonus).toBeUndefined();
    expect(envelopeBuild(edited)).not.toHaveProperty("hp");
  });

  it("reset clears the bonus and keeps the rolls", () => {
    const reset = withoutMaxHpBonus(monk({ hpRolled: 4, hpBonus: 3, hp: { max: 34 } }));
    expect([reset.hpRolled, reset.hpBonus, reset.hp.max]).toEqual([4, undefined, 31]);
  });

  it("maxHpWithoutBonus is the value the reset returns to", () => {
    expect(maxHpWithoutBonus(monk({ hpRolled: 4, hpBonus: 3 }))).toBe(31);
  });
});

describe("creation — rolled hit dice become the max-HP input", () => {
  // The level-1 Fighter quickbuild raised to level 2: d10, fixed dice 10 + 6 = 16.
  const fighter2 = (rolledHp: number | null) =>
    [
      { type: "setName", name: "Ada" },
      { type: "setLevel", level: 2 },
      { type: "setHpMethod", method: "rolled" },
      { type: "setRolledHp", rolledHp },
    ].reduce(
      (d, a) => creationDraftReducer(d, a as CreationDraftAction),
      initialCreationDraft()
    );
  const build = (rolledHp: number | null) => {
    const result = buildNewCharacter(fighter2(rolledHp), { displayName: null });
    if (!result.ok) throw new Error(result.error);
    return result.payload.character;
  };

  it("rolled dice of 19 store a surplus of 3 and add CON: the fixed max + 3", () => {
    const fixed = build(null).hp.max; // the fixed method (no roll entered)
    const rolled = build(19);
    expect(rolled.hpRolled).toBe(3);
    expect(rolled.hp.max).toBe(fixed + 3);
    expect(reload(rolled).hp.max).toBe(fixed + 3);
  });

  it("the fixed dice total stores nothing", () => {
    expect(build(16).hpRolled).toBeUndefined();
  });

  it("the facts show the same max the build stores", () => {
    expect(creationFacts(fighter2(19)).maxHp).toBe(build(19).hp.max);
  });
});

describe("in session, the max HP is the number a reload derives", () => {
  it("a Dwarf level-up counts Dwarven Toughness in session too: 38 both ways", () => {
    const { updatedCharacter, changes } = levelUp(monk(), 4, { hpGain: 8 });
    expect(updatedCharacter.hp.max).toBe(38);
    expect(reload(updatedCharacter).hp.max).toBe(38);
    expect(changes.find((c) => c.type === "hp")?.description).toMatch(
      /^HP \+11 .*→ 38 max$/
    );
  });
});

describe("the rolled surplus respects the 1-HP-per-level floor", () => {
  it("rolling 1 on a d6 with CON −4 gains 1, as the fixed value would: surplus 0", () => {
    const wizard = monk({
      race: asRaceId("human"),
      classes: [{ classId: "wizard", level: 2 }],
      hitDieType: 6,
      abilityScores: { ...MOCK_CHARACTER.character.abilityScores, CON: 3 },
      hp: { max: 3 },
    });
    const { updatedCharacter } = levelUp(wizard, 3, { hpGain: 1 });
    expect(updatedCharacter.hpRolled).toBeUndefined();
    expect([updatedCharacter.hp.max, reload(updatedCharacter).hp.max]).toEqual([4, 4]);
  });
});

const none = (classId: string): LevelUpPicks => ({
  classId,
  asi: null,
  subclassId: null,
  fightingStyle: null,
  expertise: [],
  weaponMasteries: null,
  metamagic: [],
  maneuvers: [],
  invocations: [],
  newCantrips: [],
  newSpells: [],
  choiceSlots: {
    skill: [],
    tool: [],
    skillOrTool: [],
    language: [],
    spell: [],
    expertise: [],
    feat: [],
  },
  choicePicks: EMPTY_CHOICE_PICKS,
  multiclass: null,
  spellMastery: null,
  signatureSpells: null,
  swap: { removeId: null, replaceId: null },
  bundlePicks: {},
});

describe("commitLevelUp — the max HP after every pick is the derived one", () => {
  // A loaded Fighter 3 has the derived max; an ASI at Fighter 4 raises CON 14 → 16.
  const fighter = () => {
    const stub = makeCharacterDoc({ classId: "fighter", level: 3 });
    const character = {
      ...stub.character,
      abilityScores: { ...stub.character.abilityScores, CON: 14 },
    };
    return { ...stub, character: { ...character, hp: { max: deriveMaxHp(character) } } };
  };
  const plus2Con = {
    mode: "plus2" as const,
    plusTwo: "CON" as const,
    plusOneA: null,
    plusOneB: null,
    featId: null,
    featAbility: null,
  };

  it("CON +1 modifier is retroactive over all 4 levels, in session and after a reload", () => {
    const before = fighter();
    const next = commitLevelUp(before, { ...none("fighter"), asi: plus2Con });
    // 28 (Fighter 3, CON +2) + 8 (level 4: 6 + 2) + 4 (CON +3 now, over 4 levels) = 40.
    expect(next.character.hp.max).toBe(40);
    expect(reload(next.character).hp.max).toBe(40);
    expect(next.session.hp.current - before.session.hp.current).toBe(40 - 28);
  });
});

describe("a CON edit on the sheet re-derives max HP (RA-22)", () => {
  // Dwarf Monk 3 at CON 14 is 27; CON 16 (+1 modifier) adds 1 per level → 30.
  it("a rise adds the modifier change across every level", () => {
    expect(withConScore(monk(), 16).hp.max).toBe(30);
  });
  it("a fall subtracts it: CON 12 → 24", () => {
    expect(withConScore(monk(), 12).hp.max).toBe(24);
  });
  it("an even→odd bump with no modifier change leaves it: CON 15 → 27", () => {
    expect(withConScore(monk(), 15).hp.max).toBe(27);
  });
  it("the max-HP inputs carry over: rolled 4 + bonus 2 at CON 16 → 36, after a reload too", () => {
    const edited = withConScore(monk({ hpRolled: 4, hpBonus: 2, hp: { max: 33 } }), 16);
    expect([edited.hpRolled, edited.hpBonus, edited.hp.max]).toEqual([4, 2, 36]);
    expect(reload(edited).hp.max).toBe(36);
  });
});

describe("the max-HP tip explains the inputs (#1315)", () => {
  const session = MOCK_CHARACTER.session;
  it("a rolled surplus and a hand bonus are their own rows, summing to the shown max", () => {
    const c = monk({ hpRolled: 4, hpBonus: 2, hp: { max: 33 } });
    const parts = effectiveMaxHpBreakdown(c, session);
    expect(parts).toContainEqual(expect.objectContaining({ value: 4 }));
    expect(
      parts.filter((p) => JSON.stringify(p).includes("breakdown.hpRolled"))
    ).toHaveLength(1);
    expect(
      parts.filter((p) => JSON.stringify(p).includes("breakdown.hpBonus"))
    ).toHaveLength(1);
    expect(breakdownTotal(parts)).toBe(effectiveMaxHp(c, session));
  });

  it("no input, no extra row", () => {
    const parts = effectiveMaxHpBreakdown(monk(), session);
    expect(JSON.stringify(parts)).not.toMatch(/breakdown\.hp(Rolled|Bonus)/);
  });
});
