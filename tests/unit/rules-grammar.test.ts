import { describe, expect, it } from "vitest";

import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { compileGrant, foldRules, ruleFlag, ruleNumber } from "@/lib/rules";

const source = (id: string, grants: GrantSource["grants"]): GrantSource => ({
  id,
  name: { en: id, it: id },
  grants,
});

describe("generic rules grammar — senses", () => {
  it("folds each stack by its op and adds the stacks up", () => {
    const values = foldRules([
      { op: "max", target: "sense:darkvision", value: 60, stack: "base" },
      { op: "max", target: "sense:darkvision", value: 120, stack: "base" },
      { op: "add", target: "sense:darkvision", value: 60, stack: "bonus" },
      { op: "add", target: "sense:darkvision", value: 30, stack: "bonus" },
      { op: "flag", target: "trait:air-and-water-breathing" },
    ]);
    expect(ruleNumber(values, "sense:darkvision")).toBe(210);
    expect(ruleNumber(values, "sense:truesight")).toBe(0);
    expect(ruleFlag(values, "trait:air-and-water-breathing")).toBe(true);
  });

  it("gives a species' darkvision plus a bonus through the real evaluator", () => {
    const out = evaluateGrants([
      source("dwarf", [{ type: "darkvision", range: 60 }]),
      source("umbral-sight", [{ type: "darkvision-bonus", amount: 60 }]),
      source("devils-sight", [{ type: "darkvision", range: 120 }]),
    ]);
    expect(out.darkvisionFt).toBe(180);
    expect(ruleNumber(out.values, "sense:darkvision")).toBe(180);
  });

  it("applies a sense only while its state is active", () => {
    const sources = [
      source("form", [
        {
          type: "while-active",
          activeKey: "wild-shape",
          grants: [{ type: "blindsight", range: 30 }],
        },
      ]),
    ];
    expect(evaluateGrants(sources).blindsightFt).toBe(0);
    expect(evaluateGrants(sources, new Set(["wild-shape"])).blindsightFt).toBe(30);
  });

  it("leaves kinds that have not migrated yet to the bespoke evaluator", () => {
    expect(compileGrant({ type: "speed", amount: 10 })).toBeNull();
  });
});
