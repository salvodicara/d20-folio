/**
 * Wild Shape as a form (edge-case family M2, step 3; docs/architecture/2026-11-forms-layer.md).
 * The cases come from the 2024 Druid's Wild Shape feature: the Beast Shapes table
 * (max CR 1/4 → 1/2 at 4 → 1 at 8, Fly Speed only from 8), "you retain your
 * personality, memories, ... Intelligence, Wisdom, and Charisma scores", Temporary
 * Hit Points equal to the Druid level, and the form lasting until you have the
 * Incapacitated condition or die. The engine ends a form itself (`takeDamage`,
 * `addCondition`), so every path that applies a hit or a condition ends it.
 */
import { describe, expect, it } from "vitest";

import { getBeast } from "@/data/beasts";
import type { BeastStatBlock } from "@/data/types";
import { buildScenario } from "@/lib/dev-scenarios";
import { formPool } from "@/lib/form-pool";
import { selfFormRule } from "@/lib/polymorph";
import { addCondition } from "@/lib/play/conditions";
import { takeDamage } from "@/lib/play/damage";
import { assumeBeastForm, dropBeastForm } from "@/lib/play/forms";
import { deriveCharacter } from "@/lib/views/derive-character";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { sessionActiveKeys } from "@/lib/world-standing-grants";
import type { CharacterDoc, SessionState } from "@/types/character";

const WILD_SHAPE = "druid-wild-shape";

function beast(id: string): BeastStatBlock {
  const found = getBeast(id);
  if (!found) throw new Error(`no beast ${id}`);
  return found;
}

function druid(level = 5, session: Partial<SessionState> = {}): CharacterDoc {
  const doc = buildScenario({
    name: "Druid",
    raceId: "human",
    classId: "druid",
    level,
    background: "acolyte",
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 8 },
  });
  return {
    ...doc,
    session: {
      ...doc.session,
      hp: { ...doc.session.hp, current: 38, temp: 0 },
      ...session,
    },
  };
}

const withSession = (doc: CharacterDoc, session: SessionState): CharacterDoc => ({
  ...doc,
  session,
});

describe("Wild Shape is a form", () => {
  it("keeps the druid's INT, WIS and CHA and its own build", () => {
    const doc = druid(5);
    const wolf = beast("wolf");
    const { doc: shaped } = assumeBeastForm(doc, wolf, WILD_SHAPE);
    expect(shaped.session.activeForm).toMatchObject({
      sourceId: WILD_SHAPE,
      beastId: "wolf",
    });
    expect(shaped.character.abilityScores).toEqual(doc.character.abilityScores);
    const scores = deriveCharacter(shaped).abilities;
    expect(scores.STR.score).toBe(wolf.abilityScores.STR);
    expect(scores.DEX.score).toBe(wolf.abilityScores.DEX);
    expect(scores.CON.score).toBe(wolf.abilityScores.CON);
    expect([scores.INT.score, scores.WIS.score, scores.CHA.score]).toEqual([10, 18, 8]);
    expect(deriveCharacter(shaped).ac).toBe(wolf.ac);
  });

  it("gives Temporary HP equal to the Druid level, not the beast's HP", () => {
    const { doc: shaped, tempHp } = assumeBeastForm(druid(5), beast("wolf"), WILD_SHAPE);
    expect(tempHp).toBe(5);
    expect(shaped.session.hp.temp).toBe(5);
    expect(shaped.session.hp.current).toBe(38);
  });

  it("Temporary HP don't stack: a larger pool already there stays", () => {
    const { tempHp } = assumeBeastForm(
      druid(5, { hp: { current: 38, temp: 9 } }),
      beast("wolf"),
      WILD_SHAPE
    );
    expect(tempHp).toBe(9);
  });

  it("using Wild Shape again takes a new form and its Temporary HP", () => {
    const first = assumeBeastForm(druid(5), beast("wolf"), WILD_SHAPE).doc;
    const spent = withSession(first, {
      ...first.session,
      hp: { ...first.session.hp, temp: 1 },
    });
    const {
      doc: second,
      tempHp,
      reshift,
    } = assumeBeastForm(spent, beast("panther"), WILD_SHAPE);
    expect(reshift).toBe(false);
    expect(second.session.activeForm?.beastId).toBe("panther");
    expect(tempHp).toBe(5);
  });

  it("leaving the form keeps the Temporary HP (nothing removes them)", () => {
    const { doc: shaped } = assumeBeastForm(druid(5), beast("wolf"), WILD_SHAPE);
    const back = dropBeastForm(shaped);
    expect(back?.session.activeForm).toBeUndefined();
    expect(back?.session.hp.temp).toBe(5);
  });

  it("lights what holds while in a Wild Shape form, and only while it lasts", () => {
    const { doc: shaped } = assumeBeastForm(druid(5), beast("wolf"), WILD_SHAPE);
    expect(sessionActiveKeys(shaped.session).has(WILD_SHAPE)).toBe(true);
    const back = dropBeastForm(shaped);
    expect(back && sessionActiveKeys(back.session).has(WILD_SHAPE)).toBe(false);
  });

  it("the breakdown names Wild Shape as the source", () => {
    const { doc: shaped } = assumeBeastForm(druid(5), beast("wolf"), WILD_SHAPE);
    const numbers = sheetNumbers(shaped);
    expect(JSON.stringify(numbers.ac.parts)).toContain(`"class-feature"`);
    expect(JSON.stringify(numbers.ac.parts)).toContain(WILD_SHAPE);
  });
});

describe("the engine ends a form", () => {
  it("Wild Shape outlasts its Temporary HP", () => {
    const { doc: shaped } = assumeBeastForm(druid(5), beast("wolf"), WILD_SHAPE);
    const hit = takeDamage(shaped, 7);
    expect(hit?.session.hp).toMatchObject({ temp: 0, current: 36 });
    expect(hit?.session.activeForm?.beastId).toBe("wolf");
  });

  it("Wild Shape ends at 0 HP (Unconscious is Incapacitated)", () => {
    const { doc: shaped } = assumeBeastForm(druid(5), beast("wolf"), WILD_SHAPE);
    const hit = takeDamage(shaped, 60);
    expect(hit?.session.hp.current).toBe(0);
    expect(hit?.session.activeForm).toBeUndefined();
  });

  it("Wild Shape ends when the druid is Incapacitated, by any condition that implies it", () => {
    const { doc: shaped } = assumeBeastForm(druid(5), beast("wolf"), WILD_SHAPE);
    expect(addCondition(shaped, "stunned")?.activeForm).toBeUndefined();
    expect(addCondition(shaped, "incapacitated")?.activeForm).toBeUndefined();
    expect(addCondition(shaped, "prone")?.activeForm?.beastId).toBe("wolf");
  });

  it("Polymorph ends when its Temporary HP run out; the rest of the hit reaches HP", () => {
    const wolf = beast("wolf");
    const caster = druid(9);
    const { doc: shaped } = assumeBeastForm(caster, wolf, "polymorph");
    const hit = takeDamage(shaped, wolf.hp + 5);
    expect(hit?.session.hp).toMatchObject({ temp: 0, current: 33 });
    expect(hit?.session.activeForm).toBeUndefined();
  });

  it("Polymorph doesn't end on Incapacitated by itself (its Concentration does)", () => {
    const { doc: shaped } = assumeBeastForm(druid(9), beast("wolf"), "polymorph");
    expect(addCondition(shaped, "stunned")?.activeForm?.beastId).toBe("wolf");
  });
});

describe("the Wild Shape picker", () => {
  const cr = (b: BeastStatBlock) => b.cr;
  const flies = (b: BeastStatBlock) => (b.speeds.fly ?? 0) > 0;

  it.each([
    [2, 0.25, false],
    [4, 0.5, false],
    [8, 1, true],
  ] as const)("level %i: CR up to %s, Fly Speed %s", (level, maxCr, fly) => {
    const pool = formPool(druid(level), WILD_SHAPE);
    expect(pool.length).toBeGreaterThan(0);
    expect(Math.max(...pool.map(cr))).toBeLessThanOrEqual(maxCr);
    expect(pool.some(flies)).toBe(fly);
  });

  it("the rule is the feature's own", () => {
    const rule = selfFormRule(WILD_SHAPE);
    expect(rule).toMatchObject({
      pool: "beasts",
      keepsMind: true,
      endsWithoutTempHp: false,
    });
    expect(rule.endsOn).toEqual(["incapacitated"]);
  });
});

describe("AC in a form", () => {
  it("an AC floor (Barkskin) still holds in a form", () => {
    const base = druid(5, { activeFeatures: ["spell-barkskin"] });
    const doc: CharacterDoc = {
      ...base,
      character: {
        ...base.character,
        spells: [...base.character.spells, { srdId: "barkskin", prepared: true }],
      },
    };
    expect(deriveCharacter(doc).ac).toBe(17);
    const { doc: shaped } = assumeBeastForm(doc, beast("wolf"), WILD_SHAPE);
    expect(beast("wolf").ac).toBeLessThan(17);
    expect(deriveCharacter(shaped).ac).toBe(17);
    const numbers = sheetNumbers(shaped);
    expect(numbers.ac.total).toBe(17);
  });
});
