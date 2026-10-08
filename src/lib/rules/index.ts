/**
 * The generic passive-rules grammar (docs/architecture/rules-model.html): every passive
 * effect of a catalogue entry is a small rule on a named target, instead of one bespoke
 * Grant kind per effect. Families of Grant kinds migrate here one at a time; each one
 * compiles to rules, and `foldRules` is the single place their stacking is decided.
 *
 * Stacking: rules on one target are grouped into buckets (`stack`, defaulting to the op);
 * each bucket folds by its op (`max` → highest, `add` → sum) and the buckets add up. So
 * darkvision is `max(base ranges) + sum(bonuses)`, exactly the D&D reading.
 */

import type { Grant } from "@/lib/grant-schema";

/** The sense kinds, in display order (the i18n coverage guard reads this list). */
export const SENSE_KINDS = [
  "darkvision",
  "blindsight",
  "tremorsense",
  "truesight",
  "see-invisible",
] as const;
export type SenseKind = (typeof SENSE_KINDS)[number];

/** What a rule modifies. Grows one family at a time. */
export type RuleTarget = `sense:${SenseKind}` | "trait:air-and-water-breathing";

export type Rule =
  | { op: "add" | "max"; target: RuleTarget; value: number; stack?: string }
  | { op: "flag"; target: RuleTarget };

/** Folded rule results as plain data (deep-comparable, serializable). */
export interface RuleValues {
  readonly numbers: Readonly<Partial<Record<RuleTarget, number>>>;
  readonly flags: readonly RuleTarget[];
}

export function ruleNumber(values: RuleValues, target: RuleTarget): number {
  return values.numbers[target] ?? 0;
}

export function ruleFlag(values: RuleValues, target: RuleTarget): boolean {
  return values.flags.includes(target);
}

/** Compile one leaf Grant to rules; `null` for a kind not migrated yet. */
export function compileGrant(grant: Grant): Rule[] | null {
  switch (grant.type) {
    case "darkvision":
      return [
        { op: "max", target: "sense:darkvision", value: grant.range, stack: "base" },
      ];
    case "darkvision-bonus":
      return [
        { op: "add", target: "sense:darkvision", value: grant.amount, stack: "bonus" },
      ];
    case "blindsight":
    case "tremorsense":
    case "truesight":
    case "see-invisible":
      return [{ op: "max", target: `sense:${grant.type}`, value: grant.range }];
    case "air-and-water-breathing":
      return [{ op: "flag", target: "trait:air-and-water-breathing" }];
    default:
      return null;
  }
}

export function foldRules(rules: readonly Rule[]): RuleValues {
  const buckets = new Map<RuleTarget, Map<string, number>>();
  const flags = new Set<RuleTarget>();
  for (const rule of rules) {
    if (rule.op === "flag") {
      flags.add(rule.target);
      continue;
    }
    const byStack = buckets.get(rule.target) ?? new Map<string, number>();
    const key = rule.stack ?? rule.op;
    const prior = byStack.get(key);
    byStack.set(
      key,
      prior === undefined
        ? rule.value
        : rule.op === "max"
          ? Math.max(prior, rule.value)
          : prior + rule.value
    );
    buckets.set(rule.target, byStack);
  }
  const numbers: Partial<Record<RuleTarget, number>> = {};
  for (const [target, byStack] of buckets) {
    let total = 0;
    for (const value of byStack.values()) total += value;
    numbers[target] = total;
  }
  return { numbers, flags: [...flags].sort() };
}
