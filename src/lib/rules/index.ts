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
 *
 * Ability terms: an `add` rule's value may be an ability modifier (`{ ability, min? }`,
 * "+INT modifier, minimum 1") that the fold cannot resolve, because it has no scores.
 * Terms never enter `numbers`: each one is kept on its target in grant order
 * (`ruleTerms`), and the reader adds `max(modifier, min)` per term (the bare modifier
 * when `min` is absent) on top of the numeric part.
 *
 * Baselines: a `max`/`min` target whose rule starts from a fixed value (3 attunement
 * slots, a critical hit on a 20) folds only the granted values; the reader applies the
 * baseline, e.g. `Math.min(20, ruleValue(values, "crit:attack") ?? 20)`.
 */

import type { AbilityCode } from "@/data/types";
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
  | `defense:condition-immune-from:${string}`
  | "ac:bonus"
  | "hp:per-level"
  | "attunement:slots"
  | "crit:attack"
  | "crit:death-save"
  | "attack:extra"
  /** Extra Exhaustion levels removed by that rest, beyond the default. */
  | `exhaustion:recovery:${"long-rest" | "short-rest"}`
  /** A score the ability is raised to ("no effect if already higher"). */
  | `ability:floor:${AbilityCode}`
  /** A magic item's additive bonus, and the resulting-score ceiling it allows. */
  | `ability:item-bonus:${AbilityCode}`
  | `ability:item-cap:${AbilityCode}`
  /** A bonus to every saving throw, to one ability's saves, or to concentration saves. */
  | "save:all"
  | `save:${AbilityCode}`
  | "save:concentration"
  | "initiative:bonus"
  /** A spell save DC / spell attack bonus for one class's spells, or `all`. */
  | `spell:save-dc:${string}`
  | `spell:attack:${string}`;

/** A fact a conditional rule depends on; the reader decides whether it holds. */
export type RuleFact = "no-heavy-armor" | "round-1";

/** An ability modifier added to a target, floored at `min` when given. */
export interface AbilityTerm {
  ability: AbilityCode;
  min?: number;
}

export type Rule =
  | {
      op: "add";
      target: RuleTarget;
      value: number | AbilityTerm;
      stack?: string;
      when?: RuleFact;
    }
  | {
      op: "max" | "min";
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
  readonly terms: Readonly<Record<string, readonly AbilityTerm[]>>;
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

/** The target's unresolved ability terms, in grant order (empty when none). */
export function ruleTerms(
  values: RuleValues,
  target: RuleTarget
): readonly AbilityTerm[] {
  return values.terms[target] ?? [];
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

/** The ids holding a number under a family prefix, in first-rule order:
 *  `spell:attack:` → class scopes. Conditional (`?fact`) keys are left out. */
export function ruleNumberIds(values: RuleValues, prefix: `${string}:`): string[] {
  return Object.keys(values.numbers).flatMap((key) =>
    key.startsWith(prefix) && !key.includes("?") ? [key.slice(prefix.length)] : []
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
    case "ac-bonus":
      return [
        {
          op: "add",
          target: "ac:bonus",
          value: grant.ability
            ? { ability: grant.ability, min: grant.min ?? 0 }
            : (grant.amount ?? 0),
        },
      ];
    case "hp-per-level":
      return [{ op: "add", target: "hp:per-level", value: grant.amount }];
    case "attunement-slots":
      return [{ op: "max", target: "attunement:slots", value: grant.amount }];
    case "crit-range":
      return [{ op: "min", target: "crit:attack", value: grant.threshold }];
    case "death-save-crit-range":
      return [{ op: "min", target: "crit:death-save", value: grant.threshold }];
    case "extra-attack":
      // Extra Attack never stacks (multiclass); Devouring Blade upgrades Thirsting Blade.
      return [{ op: "max", target: "attack:extra", value: grant.count }];
    case "exhaustion-recovery":
      return [
        {
          op: "add",
          target: `exhaustion:recovery:${grant.recovery ?? "long-rest"}`,
          value: grant.amount,
        },
      ];
    case "ability-score-set":
      return [
        { op: "max", target: `ability:floor:${grant.ability}`, value: grant.value },
      ];
    case "ability-score": {
      // A magic item's bonus: the evaluator feeds only item sources here, because
      // every other ASI is already baked into the stored scores. `cap` is the
      // resulting-score ceiling ("to a maximum of 20"); the tightest one wins.
      const rules: Rule[] = [
        { op: "add", target: `ability:item-bonus:${grant.ability}`, value: grant.amount },
      ];
      if (grant.cap != null)
        rules.push({
          op: "min",
          target: `ability:item-cap:${grant.ability}`,
          value: grant.cap,
        });
      return rules;
    }
    case "save-bonus":
      // `suppressedByConditions` is gating: the evaluator drops the grant first.
      return [
        {
          op: "add",
          target: grant.appliesToSave ? `save:${grant.appliesToSave}` : "save:all",
          value: grant.ability
            ? { ability: grant.ability, min: grant.min ?? 0 }
            : (grant.amount ?? 0),
        },
      ];
    case "concentration-save-bonus":
      return [
        {
          op: "add",
          target: "save:concentration",
          value: grant.ability
            ? { ability: grant.ability, min: grant.min ?? 0 }
            : (grant.amount ?? 0),
        },
      ];
    case "initiative-bonus":
      // The bare modifier, with no floor.
      return [
        {
          op: "add",
          target: "initiative:bonus",
          value: grant.ability ? { ability: grant.ability } : (grant.amount ?? 0),
        },
      ];
    case "spell-save-dc-bonus":
      return [{ op: "add", target: `spell:save-dc:${grant.scope}`, value: grant.amount }];
    case "spell-attack-bonus":
      return [{ op: "add", target: `spell:attack:${grant.scope}`, value: grant.amount }];
    default:
      return null;
  }
}

export function foldRules(rules: readonly Rule[]): RuleValues {
  const buckets = new Map<string, Map<string, number>>();
  const terms: Record<string, AbilityTerm[]> = {};
  const flags = new Set<RuleTarget>();
  for (const rule of rules) {
    if (rule.op === "flag") {
      flags.add(rule.target);
      continue;
    }
    const key = keyOf(rule.target, rule.when);
    if (typeof rule.value !== "number") {
      (terms[key] ??= []).push(rule.value);
      continue;
    }
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
  return { numbers, terms, flags: [...flags] };
}
