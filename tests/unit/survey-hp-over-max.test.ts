/**
 * The HP-over-max survey counts characters whose stored current HP is above the max
 * their stored build allows (a refused level-up's leftover), counts only.
 */
import { describe, expect, it } from "vitest";
import { surveyHpOverMax, type HpReader } from "../../scripts/survey-hp-over-max";

const doc = (path: string, data: Record<string, unknown>) => ({ path, data });

const reader: HpReader = {
  maxHp: (_id, parent) =>
    parent.broken
      ? Promise.reject(new Error("invalid-envelope here"))
      : Promise.resolve(12),
  storedCurrent: (child) =>
    typeof (child as { hp?: { current?: unknown } }).hp?.current === "number"
      ? (child as { hp: { current: number } }).hp.current
      : null,
};

describe("surveyHpOverMax", () => {
  it("counts over-max characters, shared ones apart, and never names one", async () => {
    const survey = await surveyHpOverMax(
      [
        doc("users/u1/characters/a", { shared: true }),
        doc("users/u1/characters/a/combat/state", { hp: { current: 20 } }),
        doc("users/u1/characters/b", {}),
        doc("users/u1/characters/b/combat/state", { hp: { current: 12 } }),
        doc("users/u2/characters/c", {}),
        doc("users/u2/characters/c/combat/state", { hp: { current: 15 } }),
        doc("users/u2/characters/d", {}),
        doc("users/u2/characters/e", { broken: true }),
        doc("users/u2/characters/e/combat/state", { hp: { current: 3 } }),
      ],
      reader
    );
    expect(survey).toEqual({
      format: "d20-folio-hp-over-max-survey-v1",
      characters: 5,
      shared: 1,
      overMax: 2,
      overMaxShared: 1,
      largestExcess: 8,
      unreadable: { "no-combat-state": 1, "invalid-envelope": 1 },
    });
    expect(JSON.stringify(survey)).not.toMatch(/u1|u2|"a"|"b"/);
  });
});

describe("the app's own reading", () => {
  it("reads a character stored the way the app stores it", async () => {
    const { appReader } = await import("../../scripts/survey-hp-over-max");
    const { makeCharacterDoc } = await import("./_helpers");
    const { serializeCharacterEnvelope } = await import("@/lib/character-codec");
    const { buildCharacterCache } = await import("@/lib/character-cache-build");
    const { sessionToCombatState } = await import("@/lib/combat-state");
    const { combatStateWriteData } = await import("@/lib/combat-state-io");
    const { effectiveMaxHp } = await import("@/lib/aggregate-character");
    const hero = makeCharacterDoc();
    const parent = {
      ...serializeCharacterEnvelope(hero),
      state: {},
      cache: buildCharacterCache(hero.character, hero.session),
      revision: 0,
      shared: false,
      status: "active",
    };
    const child = combatStateWriteData(sessionToCombatState(hero.session));
    const read = appReader();
    expect(await read.maxHp("c1", parent, child)).toBe(
      effectiveMaxHp(hero.character, hero.session)
    );
    expect(read.storedCurrent(child)).toBe(hero.session.hp.current);
  });
});
