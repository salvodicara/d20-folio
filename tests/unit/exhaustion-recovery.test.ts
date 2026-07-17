/**
 * `exhaustion-recovery` grant — extra Exhaustion removed on a rest.
 *  • Long-Rest channel (default): any exhaustion-recovery source reduces extra.
 *  • Short-Rest channel (`recovery: "short-rest"`): Ranger Tireless removes 1
 *    on a Short Rest (RAW removes Exhaustion only on a Long Rest, so this is a
 *    genuine extra channel).
 * Covers the evaluator (both channels stay distinct), the Monk + Ranger data,
 * the longRest store integration, and the pure short-rest consumer helpers.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { evaluateGrants } from "@/lib/grants";
import { classFeatureIndex } from "@/data/classes";
import {
  getShortRestExhaustionRecovery,
  applyShortRestExhaustion,
} from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

describe("exhaustion-recovery — evaluator + data", () => {
  it("sums the bonus; 0 by default", () => {
    expect(evaluateGrants([]).exhaustionRecoveryBonus).toBe(0);
    const agg = evaluateGrants([
      {
        id: "m",
        name: { en: "M", it: "M" },
        grants: [{ type: "exhaustion-recovery", amount: 1 }],
      },
    ]);
    expect(agg.exhaustionRecoveryBonus).toBe(1);
  });

  it("Monk Self-Restoration grants NO exhaustion recovery (2024 RAW)", () => {
    // 2024 Self-Restoration only ends Charmed/Frightened/Poisoned and ignores
    // food/drink Exhaustion — it has NO Long-Rest exhaustion-level reduction.
    expect(
      classFeatureIndex.get("monk-self-restoration")?.grants ?? []
    ).not.toContainEqual(expect.objectContaining({ type: "exhaustion-recovery" }));
  });

  it("an omitted `recovery` defaults to the long-rest channel", () => {
    const agg = evaluateGrants([
      {
        id: "m",
        name: { en: "M", it: "M" },
        grants: [{ type: "exhaustion-recovery", amount: 2 }],
      },
    ]);
    expect(agg.exhaustionRecoveryBonus).toBe(2);
    expect(agg.exhaustionRecoveryShortRest).toBe(0);
  });
});

describe("exhaustion-recovery — short-rest channel", () => {
  it("short-rest grants aggregate into a SEPARATE field; 0 by default", () => {
    expect(evaluateGrants([]).exhaustionRecoveryShortRest).toBe(0);
    const agg = evaluateGrants([
      {
        id: "t",
        name: { en: "T", it: "T" },
        grants: [{ type: "exhaustion-recovery", amount: 1, recovery: "short-rest" }],
      },
    ]);
    expect(agg.exhaustionRecoveryShortRest).toBe(1);
    // Must NOT bleed into the long-rest channel.
    expect(agg.exhaustionRecoveryBonus).toBe(0);
  });

  it("long-rest and short-rest channels never mix when both are present", () => {
    const agg = evaluateGrants([
      {
        id: "both",
        name: { en: "B", it: "B" },
        grants: [
          { type: "exhaustion-recovery", amount: 2, recovery: "long-rest" },
          { type: "exhaustion-recovery", amount: 1, recovery: "short-rest" },
        ],
      },
    ]);
    expect(agg.exhaustionRecoveryBonus).toBe(2);
    expect(agg.exhaustionRecoveryShortRest).toBe(1);
  });

  it("multiple short-rest sources sum", () => {
    const agg = evaluateGrants([
      {
        id: "a",
        name: { en: "A", it: "A" },
        grants: [{ type: "exhaustion-recovery", amount: 1, recovery: "short-rest" }],
      },
      {
        id: "b",
        name: { en: "B", it: "B" },
        grants: [{ type: "exhaustion-recovery", amount: 2, recovery: "short-rest" }],
      },
    ]);
    expect(agg.exhaustionRecoveryShortRest).toBe(3);
  });

  it("Ranger Tireless grants short-rest exhaustion recovery (+1)", () => {
    expect(classFeatureIndex.get("ranger-tireless")?.grants).toContainEqual({
      type: "exhaustion-recovery",
      amount: 1,
      recovery: "short-rest",
    });
  });
});

describe("short-rest exhaustion consumer — getShortRestExhaustionRecovery / applyShortRestExhaustion", () => {
  function charWith(features: { srdId: string }[], exhaustion: number): CharacterDoc {
    const c = structuredClone(MOCK_CHARACTER);
    c.character.features = features;
    c.session.exhaustion = exhaustion;
    return c;
  }

  it("reports 0 recovery and leaves Exhaustion unchanged without Tireless", () => {
    const c = charWith([], 3);
    expect(getShortRestExhaustionRecovery(c)).toBe(0);
    expect(applyShortRestExhaustion(c)).toBe(3);
  });

  it("a Tireless Ranger removes 1 Exhaustion level on a Short Rest", () => {
    const c = charWith([{ srdId: "ranger-tireless" }], 3);
    expect(getShortRestExhaustionRecovery(c)).toBe(1);
    expect(applyShortRestExhaustion(c)).toBe(2);
  });

  it("clamps at 0 — never goes negative", () => {
    const c = charWith([{ srdId: "ranger-tireless" }], 0);
    expect(applyShortRestExhaustion(c)).toBe(0);
  });

  it("a feature without exhaustion recovery (Monk Self-Restoration) does NOT recover on a Short Rest", () => {
    const c = charWith([{ srdId: "monk-self-restoration" }], 3);
    expect(getShortRestExhaustionRecovery(c)).toBe(0);
    expect(applyShortRestExhaustion(c)).toBe(3);
  });

  it("override-first: the helper is pure — a hand-edited Exhaustion level is honored as the input", () => {
    // The store/UI applies the returned level non-destructively; a player who
    // re-edits the stepper afterward simply supplies a new `session.exhaustion`.
    const c = charWith([{ srdId: "ranger-tireless" }], 5);
    const afterRest = applyShortRestExhaustion(c);
    expect(afterRest).toBe(4);
    // Re-running on the manually-corrected value recomputes from that input.
    c.session.exhaustion = afterRest;
    expect(applyShortRestExhaustion(c)).toBe(3);
  });
});

describe("longRest — exhaustion reduction honors the bonus", () => {
  beforeEach(() => useCharacterStore.getState().setCharacter(null));

  it("default removes 1 level", () => {
    const c = structuredClone(MOCK_CHARACTER);
    c.character.features = [];
    c.session.exhaustion = 3;
    useCharacterStore.getState().setCharacter(c);
    useCharacterStore.getState().longRest();
    expect(useCharacterStore.getState().character?.session.exhaustion).toBe(2);
  });

  it("a Self-Restoration Monk still removes only 1 level (no exhaustion bonus in 2024)", () => {
    const c = structuredClone(MOCK_CHARACTER);
    c.character.features = [{ srdId: "monk-self-restoration" }];
    c.session.exhaustion = 3;
    useCharacterStore.getState().setCharacter(c);
    useCharacterStore.getState().longRest();
    expect(useCharacterStore.getState().character?.session.exhaustion).toBe(2);
  });
});
