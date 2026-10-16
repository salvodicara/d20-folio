/**
 * `ruleParts` names who contributed to a rule-folded number (re-foundation phase 2:
 * every number explained). For every dev scenario and EVERY numeric target its
 * aggregate folds, the per-source parts must sum to the folded value, and the
 * aggregate's `ruleOrigins` must be exactly the rules `values` was folded from.
 * Any future breakdown built on `ruleParts` inherits that guarantee.
 */

import { describe, expect, it } from "vitest";

import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { DEV_SCENARIOS, buildDevScenario } from "@/lib/dev-scenarios";
import {
  foldRules,
  ruleConditional,
  ruleParts,
  ruleValue,
  type RuleFact,
  type RuleTarget,
} from "@/lib/rules";

describe("ruleParts", () => {
  it("sums to every folded number of every dev scenario", () => {
    let checked = 0;
    for (const id of Object.keys(DEV_SCENARIOS)) {
      const doc = buildDevScenario(id);
      if (!doc) continue;
      const agg = aggregateCharacterGrants(doc.character, doc.session);
      expect(foldRules(agg.ruleOrigins.map((origin) => origin.rule))).toEqual(agg.values);
      for (const key of Object.keys(agg.values.numbers)) {
        const [target, fact] = key.split("?") as [RuleTarget, RuleFact | undefined];
        const expected = fact
          ? ruleConditional(agg.values, target, fact)
          : (ruleValue(agg.values, target) ?? 0);
        const parts = ruleParts(agg.ruleOrigins, target, fact ? [fact] : []);
        const sum = parts.reduce((total, part) => total + part.value, 0);
        const unconditional = fact ? (ruleValue(agg.values, target) ?? 0) : 0;
        expect(sum - unconditional, `${id} ${key}`).toBe(expected);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
