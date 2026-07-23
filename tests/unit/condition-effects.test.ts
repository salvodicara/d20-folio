/**
 * Condition gates — CONDITION_GATES + resolveConditionEffects.
 * Pins the 2024 self-side mechanical effects and their union.
 */
import { describe, expect, it } from "vitest";
import {
  resolveConditionEffects,
  CONDITION_GATES,
  netRollState,
  hasConcentrationSaveAdvantage,
} from "@/lib/condition-effects";
import { litText } from "@/lib/loc-text";
import type { AdvantageClause } from "@/lib/grants";
import enConditions from "@/i18n/en/srd/conditions.json";
import itConditions from "@/i18n/it/srd/conditions.json";

describe("netRollState — RAW advantage/disadvantage cancellation", () => {
  it("advantage + disadvantage cancel to a straight roll", () => {
    expect(netRollState(true, true)).toBe("none");
  });
  it("only advantage → advantage; only disadvantage → disadvantage", () => {
    expect(netRollState(true, false)).toBe("advantage");
    expect(netRollState(false, true)).toBe("disadvantage");
  });
  it("neither → none", () => {
    expect(netRollState(false, false)).toBe("none");
  });
});

describe("hasConcentrationSaveAdvantage — RA-15", () => {
  const clause = (vs: string): AdvantageClause => ({
    sourceId: "x",
    rollType: "save",
    vs,
    description: litText({ en: "", it: "" }),
  });

  it("Advantage on the concentration CON save (War Caster / Eldritch Mind) → true", () => {
    expect(
      hasConcentrationSaveAdvantage({
        advantages: [clause("concentration-con-save")],
        disadvantages: [],
      })
    ).toBe(true);
  });

  it("an unrelated check advantage does not count → false", () => {
    expect(
      hasConcentrationSaveAdvantage({
        advantages: [clause("danger-sense")],
        disadvantages: [],
      })
    ).toBe(false);
  });

  it("a same-vs disadvantage nets the advantage back to a straight roll → false", () => {
    expect(
      hasConcentrationSaveAdvantage({
        advantages: [clause("concentration-con-save")],
        disadvantages: [clause("concentration-con-save")],
      })
    ).toBe(false);
  });

  it("no clauses → false", () => {
    expect(hasConcentrationSaveAdvantage({ advantages: [], disadvantages: [] })).toBe(
      false
    );
  });
});

describe("resolveConditionEffects — single conditions", () => {
  it("poisoned → disadvantage on attacks + ability checks", () => {
    const r = resolveConditionEffects(["poisoned"]);
    expect(r.disadvantages.map((d) => d.rollType).sort()).toEqual(["attack", "check"]);
    expect(r.disadvantages.every((d) => d.sourceId === "poisoned")).toBe(true);
    expect(r.speedZero).toBe(false);
  });

  it("grappled → speed 0 + disadvantage on attacks (M12: 2024 adds Attacks Affected)", () => {
    const r = resolveConditionEffects(["grappled"]);
    expect(r.speedZero).toBe(true);
    expect(r.disadvantages).toHaveLength(1);
    expect(r.disadvantages[0]?.rollType).toBe("attack");
    expect(r.disadvantages[0]?.sourceId).toBe("grappled");
    expect(r.blockedSlots.size).toBe(0);
  });

  it("incapacitated → blocks all economy slots + breaks concentration", () => {
    const r = resolveConditionEffects(["incapacitated"]);
    expect([...r.blockedSlots].sort()).toEqual(["action", "bonus", "reaction"]);
    expect(r.breaksConcentration).toBe(true);
  });

  it("stunned → incapacitated effects + auto-fail STR/DEX saves, but NOT speed 0 (2024 drops the 2014 speed-zero clause)", () => {
    const r = resolveConditionEffects(["stunned"]);
    expect(r.speedZero).toBe(false);
    expect([...r.autoFailSaves].sort()).toEqual(["DEX", "STR"]);
    expect(r.blockedSlots.has("action")).toBe(true);
    // The Incapacitated family blocks the reaction slot too — it comes from
    // INCAPACITATED_SLOTS, not a separate flag (regression guard for the removed
    // redundant `blocksReaction` field).
    expect(r.blockedSlots.has("reaction")).toBe(true);
  });

  it("invisible → self-side advantage on attacks", () => {
    const r = resolveConditionEffects(["invisible"]);
    expect(r.advantages).toHaveLength(1);
    expect(r.advantages[0]?.rollType).toBe("attack");
  });

  it("restrained → speed 0 + disadvantage on attacks and DEX saves", () => {
    const r = resolveConditionEffects(["restrained"]);
    expect(r.speedZero).toBe(true);
    expect(r.disadvantages.some((d) => d.rollType === "attack")).toBe(true);
    expect(r.disadvantages.some((d) => d.rollType === "save")).toBe(true);
  });
});

describe("resolveConditionEffects — unions + edge cases", () => {
  it("unions multiple conditions (poisoned + restrained)", () => {
    const r = resolveConditionEffects(["poisoned", "restrained"]);
    // both contribute attack disadvantage (two clauses, distinct sources)
    const attackDis = r.disadvantages.filter((d) => d.rollType === "attack");
    expect(attackDis.map((d) => d.sourceId).sort()).toEqual(["poisoned", "restrained"]);
    expect(r.speedZero).toBe(true);
  });

  it("ignores conditions with no mechanical gate (charmed, deafened) and empty input", () => {
    expect(resolveConditionEffects([]).disadvantages).toHaveLength(0);
    const r = resolveConditionEffects(["charmed", "deafened"]);
    expect(r.disadvantages).toHaveLength(0);
    expect(r.blockedSlots.size).toBe(0);
  });

  it("CONDITION_GATES covers the paralysis family with auto-fail saves", () => {
    for (const id of ["paralyzed", "stunned", "unconscious", "petrified"] as const) {
      expect(CONDITION_GATES[id]?.autoFailSaves).toEqual(["STR", "DEX"]);
    }
    // Speed 0 distinguishes Paralyzed/Unconscious/Petrified from Stunned in
    // 2024 RAW — Stunned no longer zeroes Speed (M-bonus fix).
    for (const id of ["paralyzed", "unconscious", "petrified"] as const) {
      expect(CONDITION_GATES[id]?.speedZero).toBe(true);
    }
    expect(CONDITION_GATES.stunned?.speedZero).toBeUndefined();
  });
});

describe("srd/conditions.json reference text — 2024 wording (M12, M23, M24 + Stunned bonus)", () => {
  it("grappled (EN+IT) states the 2024 Attacks-Affected disadvantage", () => {
    expect(enConditions.grappled.description).toMatch(/Disadvantage on attack rolls/);
    expect(itConditions.grappled.description).toMatch(/Svantaggio sui tiri per colpire/);
  });

  it("incapacitated (EN+IT) carries the 3 additional 2024 bullets (was 2014-era: action-economy only)", () => {
    const enJoined = enConditions.incapacitated.effects.join(" ");
    expect(enJoined).toMatch(/Concentration breaks/);
    expect(enJoined).toMatch(/Can't speak/);
    expect(enJoined).toMatch(/Disadvantage on Initiative/);
    const itJoined = itConditions.incapacitated.effects.join(" ");
    expect(itJoined).toMatch(/Concentrazione si interrompe/);
    expect(itJoined).toMatch(/Non può parlare/);
    expect(itJoined).toMatch(/Svantaggio ai tiri di Iniziativa/);
  });

  it("invisible (EN+IT) uses the 2024 Surprise/Concealed/Attacks-Affected frame, not the 2014 heavily-obscured one", () => {
    const enJoined = [
      enConditions.invisible.description,
      ...enConditions.invisible.effects,
    ].join(" ");
    expect(enJoined).toMatch(/Advantage on .*Initiative/);
    expect(enJoined).toMatch(/Concealed/);
    expect(enJoined).not.toMatch(/heavily obscured/i);
    const itJoined = [
      itConditions.invisible.description,
      ...itConditions.invisible.effects,
    ].join(" ");
    expect(itJoined).toMatch(/Vantaggio al tiro di Iniziativa/);
    expect(itJoined).not.toMatch(/oscuramento pesante/);
  });

  it("stunned (EN+IT) drops the 2014 can't-move/speed wording", () => {
    const enJoined = [
      enConditions.stunned.description,
      ...enConditions.stunned.effects,
    ].join(" ");
    expect(enJoined).not.toMatch(/can't move/i);
    const itJoined = [
      itConditions.stunned.description,
      ...itConditions.stunned.effects,
    ].join(" ");
    expect(itJoined).not.toMatch(/non può muoversi/i);
  });
});
