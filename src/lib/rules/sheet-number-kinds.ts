/**
 * The passive sheet-number Grant kinds (ADR-0010, M1, #1431): each one compiles to
 * plain rules, read through `foldRules` like every other migrated family.
 *
 * - `ability-check-bonus` → `add` on `check:<skill | ABILITY-checks | all-checks>`. A
 *   flat entry's own floor is a constant, so it folds in here (`max(value, min)`); an
 *   ability-modifier entry is an ability term with that floor.
 * - `skill-ability-option` → a flag per skill, `skill:ability-option:<skill>@<ABILITY>`.
 * - `unarmed-strike-damage-type-option` → a flag per type, `unarmed:damage-type:<type>`.
 */
import type { DamageType } from "@/types/damage";
import type { Grant } from "@/lib/grant-schema";
import type { Rule } from "./index";

export type SheetNumberTarget =
  /** A bonus to ability checks: one skill, one ability's checks, or all of them. */
  | `check:${string}`
  /** The skill may use this ability instead of its own (`<skill>@<ABILITY>`). */
  | `skill:ability-option:${string}`
  /** An Unarmed Strike may deal this damage type instead of its normal one. */
  | `unarmed:damage-type:${DamageType}`;

type SheetNumberGrant = Extract<
  Grant,
  {
    type:
      | "ability-check-bonus"
      | "skill-ability-option"
      | "unarmed-strike-damage-type-option";
  }
>;

export function compileSheetNumberGrant(grant: SheetNumberGrant): Rule[] {
  switch (grant.type) {
    case "ability-check-bonus": {
      const target = `check:${grant.appliesTo}` as const;
      const min = grant.min ?? 0;
      const value = grant.value ?? "modifier";
      if (typeof value === "number")
        return [{ op: "add", target, value: Math.max(value, min) }];
      return grant.ability
        ? [{ op: "add", target, value: { ability: grant.ability, min } }]
        : [];
    }
    case "skill-ability-option":
      // Read defensively: the compiler-coverage guard compiles a bare `{ type }` stub.
      return ((grant.skills as readonly string[] | undefined) ?? []).map((skill) => ({
        op: "flag",
        target: `skill:ability-option:${skill}@${grant.ability}`,
      }));
    case "unarmed-strike-damage-type-option":
      return [{ op: "flag", target: `unarmed:damage-type:${grant.toType}` }];
  }
}
