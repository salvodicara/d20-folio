/**
 * The roll-time Grant kinds compile to Rules (ADR-0010, M1, #1432). A roll clause
 * is a Rule on a roll target (`roll:save:advantage`): it is not folded into a
 * number, it is kept per source in grant order, because every reader names the
 * source that gives the Advantage. The aggregate's clause rows are built from the
 * compiled rules only.
 */
import { describe, expect, it } from "vitest";

import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { compileGrant, foldRules } from "@/lib/rules";

const source = (id: string, grants: GrantSource["grants"]): GrantSource => ({
  id,
  name: { en: id, it: id },
  grants,
});

const NOTE = { en: "Only in sunlight", it: "Solo alla luce del sole" };

describe("roll rules: advantage and disadvantage compile to roll clauses", () => {
  it("a save or check advantage is a clause on its roll target", () => {
    expect(
      compileGrant({ type: "advantage-on", rollType: "save", vs: "poisoned" })
    ).toEqual([{ op: "clause", target: "roll:save:advantage", vs: "poisoned" }]);
    expect(
      compileGrant({
        type: "advantage-on",
        rollType: "check",
        vs: "str",
        consume: "next",
        description: NOTE,
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:check:advantage",
        vs: "str",
        consume: "next",
        description: NOTE,
      },
    ]);
  });

  it("an attack clause keeps a narrowed scope and drops `all`", () => {
    expect(
      compileGrant({
        type: "advantage-on",
        rollType: "attack",
        scope: "marked",
        vs: "hunters-mark-target",
        round1: true,
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:attack:advantage",
        vs: "hunters-mark-target",
        scope: "marked",
        round1: true,
      },
    ]);
    expect(
      compileGrant({ type: "disadvantage-on", rollType: "attack", scope: "all", vs: "x" })
    ).toEqual([{ op: "clause", target: "roll:attack:disadvantage", vs: "x" }]);
  });

  it("a disadvantage keeps its consume policy", () => {
    expect(
      compileGrant({
        type: "disadvantage-on",
        rollType: "check",
        vs: "perception",
        consume: "each",
      })
    ).toEqual([
      {
        op: "clause",
        target: "roll:check:disadvantage",
        vs: "perception",
        consume: "each",
      },
    ]);
  });

  it("attacks against the character are clauses on the incoming-attack target", () => {
    expect(compileGrant({ type: "incoming-attack-advantage" })).toEqual([
      { op: "clause", target: "roll:incoming-attack:advantage" },
    ]);
    expect(
      compileGrant({ type: "incoming-attack-disadvantage", description: NOTE })
    ).toEqual([
      { op: "clause", target: "roll:incoming-attack:disadvantage", description: NOTE },
    ]);
  });

  it("the fold leaves clauses out of the numbers and the flags", () => {
    const values = foldRules([
      { op: "clause", target: "roll:save:advantage", vs: "str" },
      { op: "flag", target: "block:healing" },
    ]);
    expect(values).toEqual({ numbers: {}, terms: {}, flags: ["block:healing"] });
  });
});

describe("roll rules: the evaluator's clause rows come from the compiled rules", () => {
  const sources = [
    source("dwarf", [
      { type: "advantage-on", rollType: "save", vs: "poisoned" },
      {
        type: "advantage-on",
        rollType: "save",
        vs: "charmed",
        suppressedByConditions: ["incapacitated"],
      },
    ]),
    source("rage", [
      {
        type: "while-active",
        activeKey: "barbarian-rage",
        grants: [
          { type: "advantage-on", rollType: "check", vs: "str" },
          { type: "incoming-attack-advantage" },
        ],
      },
    ]),
    source("blur", [
      { type: "incoming-attack-disadvantage" },
      {
        type: "disadvantage-on",
        rollType: "attack",
        scope: "strength",
        vs: "strength-attacks",
        consume: "each",
      },
    ]),
  ];

  it("names each clause's source, its active state and its narrowing", () => {
    const out = evaluateGrants(sources, new Set(["barbarian-rage"]));
    const text: unknown = expect.anything();
    expect(out.advantages).toEqual([
      { sourceId: "dwarf", rollType: "save", vs: "poisoned", description: text },
      { sourceId: "dwarf", rollType: "save", vs: "charmed", description: text },
      {
        sourceId: "rage",
        rollType: "check",
        vs: "str",
        description: text,
        whileActiveKey: "barbarian-rage",
      },
    ]);
    expect(out.disadvantages).toEqual([
      {
        sourceId: "blur",
        rollType: "attack",
        vs: "strength-attacks",
        description: text,
        consume: "each",
        scope: "strength",
      },
    ]);
    expect(out.incomingAttackAdvantages).toEqual([
      { sourceId: "rage", description: text, whileActiveKey: "barbarian-rage" },
    ]);
    expect(out.incomingAttackDisadvantages).toEqual([
      { sourceId: "blur", description: text },
    ]);
  });

  it("drops a clause its condition suppresses, and a clause whose state is off", () => {
    const out = evaluateGrants(sources, new Set(), new Map(), {
      conditions: new Set(["incapacitated"]),
    });
    expect(out.advantages.map((row) => row.vs)).toEqual(["poisoned"]);
    expect(out.incomingAttackAdvantages).toEqual([]);
  });

  it("keeps every clause among the compiled rules, with its source", () => {
    const out = evaluateGrants(sources, new Set(["barbarian-rage"]));
    const clauses = out.ruleOrigins.filter(({ rule }) => rule.op === "clause");
    expect(clauses.map(({ rule }) => rule.target)).toEqual([
      "roll:save:advantage",
      "roll:save:advantage",
      "roll:check:advantage",
      "roll:incoming-attack:advantage",
      "roll:incoming-attack:disadvantage",
      "roll:attack:disadvantage",
    ]);
  });
});
