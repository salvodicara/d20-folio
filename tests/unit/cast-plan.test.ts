/**
 * What a tap on a spell leads to, decided before anything is paid: cast straight
 * away (the only way to pay, a cantrip, a ritual), ask the player (a choice of
 * levels or Metamagic), say there is nothing left to pay with, or nothing (not a
 * configurable spell). Characterizes the decision TurnEconomyProvider made inline.
 */
import { describe, expect, it } from "vitest";

import { TURN_EXECUTION } from "@/lib/play/cast-execution";
import { castPlan } from "@/lib/play/cast-plan";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

const spell = (spellId: string, level: number, over: Partial<ResolvedAction> = {}) =>
  ({
    id: `spell:${spellId}`,
    type: "action",
    source: "spell",
    spellId,
    spellLevel: level,
    slotLevel: level,
    costsSlot: level > 0,
    summary: {},
    ...over,
  }) as unknown as ResolvedAction;

const wizard = (slots: { level: number; total: number }[], used = {}) =>
  makeCharacterDoc(
    {
      classId: "wizard",
      level: 5,
      spellSlots: slots,
      spells: [
        { srdId: "magic-missile", prepared: true },
        { srdId: "fire-bolt", prepared: true },
        { srdId: "detect-magic", prepared: true },
      ],
    },
    { spellSlots: used }
  );

const sorcerer = () =>
  makeCharacterDoc(
    {
      classes: [
        {
          classId: "sorcerer",
          level: 5,
          metamagicChoices: ["quickened-spell", "extended-spell"],
        },
      ],
      features: [{ srdId: "sorcerer-font-of-magic" }, { srdId: "sorcerer-metamagic" }],
      spells: [{ srdId: "fire-bolt", prepared: true }],
      spellSlots: [{ level: 1, total: 4 }],
    },
    { spellSlots: {} }
  );

const ritual = { ...TURN_EXECUTION, ritual: true };

describe("castPlan", () => {
  it("one level to pay with and no Metamagic: cast straight away at it", () => {
    const plan = castPlan(wizard([{ level: 1, total: 2 }]), spell("magic-missile", 1));
    expect(plan).toMatchObject({ kind: "commit", option: { level: 1, remaining: 2 } });
  });

  it("several levels: the player picks, from the base level up", () => {
    const plan = castPlan(
      wizard([
        { level: 1, total: 2 },
        { level: 2, total: 1 },
      ]),
      spell("magic-missile", 1)
    );
    expect(plan.kind).toBe("pick");
    if (plan.kind !== "pick") return;
    expect(plan.baseLevel).toBe(1);
    expect(plan.options.map((o) => o.level)).toEqual([1, 2]);
    expect(plan.metamagic).toEqual([]);
  });

  it("every slot spent: nothing left to pay with", () => {
    const plan = castPlan(
      wizard([{ level: 1, total: 2 }], { "1": { used: 2 } }),
      spell("magic-missile", 1)
    );
    expect(plan).toEqual({ kind: "no-slots" });
  });

  it("a ritual is cast at its base level with no slot, even with every slot spent", () => {
    const plan = castPlan(
      wizard([{ level: 1, total: 2 }], { "1": { used: 2 } }),
      spell("detect-magic", 1),
      ritual
    );
    expect(plan).toEqual({ kind: "commit", option: { kind: "ritual", level: 1 } });
  });

  it("a cantrip is cast straight away; with Metamagic known, the player is asked", () => {
    expect(castPlan(wizard([]), spell("fire-bolt", 0))).toEqual({
      kind: "commit",
      option: { kind: "cantrip", level: 0 },
    });
    const plan = castPlan(sorcerer(), spell("fire-bolt", 0));
    expect(plan.kind).toBe("pick");
    if (plan.kind !== "pick") return;
    expect(plan.options).toEqual([]);
    expect(plan.metamagic.map((m) => m.id)).toContain("quickened-spell");
  });

  it("not a configurable spell: a feature, or a recurring use", () => {
    const doc = wizard([{ level: 1, total: 2 }]);
    expect(castPlan(doc, spell("magic-missile", 1, { source: "feature" }))).toEqual({
      kind: "none",
    });
    expect(
      castPlan(
        doc,
        spell("magic-missile", 1, {
          summary: { recurringUse: {} } as ResolvedAction["summary"],
        })
      )
    ).toEqual({ kind: "none" });
  });
});
