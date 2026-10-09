/**
 * The generic passive-rules grammar (docs/architecture/rules-model.html): every passive
 * effect of a catalogue entry is a small rule on a named target, instead of one bespoke
 * Grant kind per effect. Families of Grant kinds migrate here one at a time; each one
 * compiles to rules, and `foldRules` is the single place their stacking is decided.
 *
 * Stacking: rules on one target are grouped into buckets (`stack`, defaulting to the op);
 * each bucket folds by its op (`max` → highest, `min` → lowest, `add` → sum) and the
 * buckets add up. So darkvision is `max(base ranges) + sum(bonuses)`, the D&D reading.
 *
 * Conditions: a rule may hold only `when` a fact is true ("no-heavy-armor", "round-1").
 * The fold keeps conditional contributions apart; the reader passes the facts it knows
 * (`ruleNumber(values, target, facts)`), because only the reader has that context.
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

export type MoveMode = "fly" | "swim" | "climb";

/** What a rule modifies. Grows one family at a time. */
export type RuleTarget =
  | `sense:${SenseKind}`
  | "trait:air-and-water-breathing"
  | "speed:walk"
  | `speed:${MoveMode}`
  /** A speed equal to (1) or twice (2) the walking speed; outranks a fixed number. */
  | `speed:${MoveMode}:walking`
  | "speed:multiplier"
  | "speed:floor"
  | "speed:cap"
  | `prof:save:${string}`
  | `prof:skill:${string}`
  | `prof:expertise:${string}`
  | `prof:language:${string}`
  | `prof:tool:${string}`
  | `prof:weapon:${string}`
  | `prof:armor:${string}`
  | "trait:half-proficiency-all-skills"
  | `defense:resist:${string}`
  | "defense:resist-all"
  | `defense:immune:${string}`
  | `defense:vulnerable:${string}`
  | `defense:resist-source:${string}`
  | `defense:condition-immune:${string}`
  /** Immune to a condition only when that source causes it (`<condition>@<source>`). */
  | `defense:condition-immune-from:${string}`;

/** A fact a conditional rule depends on; the reader decides whether it holds. */
export type RuleFact = "no-heavy-armor" | "round-1";

export type Rule =
  | {
      op: "add" | "max" | "min";
      target: RuleTarget;
      value: number;
      stack?: string;
      when?: RuleFact;
    }
  | { op: "flag"; target: RuleTarget };

/** Folded rule results as plain data (deep-comparable, serializable). Keys are the
 *  target, or `target?fact` for a contribution that holds only when the fact does. */
export interface RuleValues {
  readonly numbers: Readonly<Record<string, number>>;
  readonly flags: readonly RuleTarget[];
}

const keyOf = (target: RuleTarget, when?: RuleFact): string =>
  when ? `${target}?${when}` : target;

/** The target's value: its unconditional rules plus those whose fact holds. */
export function ruleNumber(
  values: RuleValues,
  target: RuleTarget,
  facts: readonly RuleFact[] = []
): number {
  let total = values.numbers[target] ?? 0;
  for (const fact of facts) total += values.numbers[keyOf(target, fact)] ?? 0;
  return total;
}

/** The target's value, or `null` when no rule touches it unconditionally. */
export function ruleValue(values: RuleValues, target: RuleTarget): number | null {
  return values.numbers[target] ?? null;
}

/** The contribution that holds only when `fact` does (0 when none). */
export function ruleConditional(
  values: RuleValues,
  target: RuleTarget,
  fact: RuleFact
): number {
  return values.numbers[keyOf(target, fact)] ?? 0;
}

export function ruleFlag(values: RuleValues, target: RuleTarget): boolean {
  return values.flags.includes(target);
}

/** The ids flagged under a family prefix, in grant order: `prof:skill:` → skill ids. */
export function ruleFlagIds(values: RuleValues, prefix: `${string}:`): string[] {
  return values.flags.flatMap((flag) =>
    flag.startsWith(prefix) ? [flag.slice(prefix.length)] : []
  );
}

const WALKING_MULTIPLE = { "equal-to-walking": 1, "twice-walking": 2 } as const;

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
    case "speed": {
      const when: RuleFact | undefined = grant.round1 ? "round-1" : grant.condition;
      return [
        {
          op: "add",
          target: "speed:walk",
          value: grant.amount,
          ...(when ? { when } : {}),
        },
      ];
    }
    case "fly-speed":
    case "swim-speed":
    case "climb-speed": {
      const mode = grant.type.slice(0, -"-speed".length) as MoveMode;
      return typeof grant.amount === "number"
        ? [{ op: "max", target: `speed:${mode}`, value: grant.amount }]
        : [
            {
              op: "max",
              target: `speed:${mode}:walking`,
              value: WALKING_MULTIPLE[grant.amount],
            },
          ];
    }
    case "speed-multiplier":
      return [{ op: "max", target: "speed:multiplier", value: grant.factor }];
    case "speed-floor":
      return [{ op: "max", target: "speed:floor", value: grant.minFt }];
    case "speed-cap":
      return [{ op: "min", target: "speed:cap", value: grant.maxFt }];
    case "save-proficiency":
      return [{ op: "flag", target: `prof:save:${grant.ability}` }];
    case "skill-proficiency":
      return [{ op: "flag", target: `prof:skill:${grant.skill}` }];
    case "expertise":
      return [{ op: "flag", target: `prof:expertise:${grant.skill}` }];
    case "language":
      return [{ op: "flag", target: `prof:language:${grant.language}` }];
    case "tool-proficiency":
      return [{ op: "flag", target: `prof:tool:${grant.tool}` }];
    case "weapon-proficiency":
      return [{ op: "flag", target: `prof:weapon:${grant.proficiency}` }];
    case "armor-proficiency":
      return [{ op: "flag", target: `prof:armor:${grant.proficiency}` }];
    case "half-proficiency-all-skills":
      return [{ op: "flag", target: "trait:half-proficiency-all-skills" }];
    case "damage-resistance":
      return [{ op: "flag", target: `defense:resist:${grant.damageType}` }];
    case "all-damage-resistance":
      return [{ op: "flag", target: "defense:resist-all" }];
    case "damage-immunity":
      return [{ op: "flag", target: `defense:immune:${grant.damageType}` }];
    case "damage-vulnerability":
      return [{ op: "flag", target: `defense:vulnerable:${grant.damageType}` }];
    case "damage-resistance-source":
      return [{ op: "flag", target: `defense:resist-source:${grant.source}` }];
    case "condition-immunity":
      return [
        grant.sourceId
          ? {
              op: "flag",
              target: `defense:condition-immune-from:${grant.condition}@${grant.sourceId}`,
            }
          : { op: "flag", target: `defense:condition-immune:${grant.condition}` },
      ];
    default:
      return null;
  }
}

export function foldRules(rules: readonly Rule[]): RuleValues {
  const buckets = new Map<string, Map<string, number>>();
  const flags = new Set<RuleTarget>();
  for (const rule of rules) {
    if (rule.op === "flag") {
      flags.add(rule.target);
      continue;
    }
    const key = keyOf(rule.target, rule.when);
    const byStack = buckets.get(key) ?? new Map<string, number>();
    const stack = rule.stack ?? rule.op;
    const prior = byStack.get(stack);
    byStack.set(
      stack,
      prior === undefined
        ? rule.value
        : rule.op === "max"
          ? Math.max(prior, rule.value)
          : rule.op === "min"
            ? Math.min(prior, rule.value)
            : prior + rule.value
    );
    buckets.set(key, byStack);
  }
  const numbers: Record<string, number> = {};
  for (const [key, byStack] of buckets) {
    let total = 0;
    for (const value of byStack.values()) total += value;
    numbers[key] = total;
  }
  // Flags keep grant order (first occurrence), so projections stay stable.
  return { numbers, flags: [...flags] };
}
