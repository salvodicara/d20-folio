/**
 * The passive sheet-number Grant kinds (ADR-0010, M1, #1431): each one compiles to
 * plain rules, read through `foldRules` like every other migrated family.
 *
 * - `unarmed-strike-damage-type-option` → a flag per type, `unarmed:damage-type:<type>`.
 */
import type { DamageType } from "@/types/damage";
import type { Grant } from "@/lib/grant-schema";
import type { Rule } from "./index";

export type SheetNumberTarget =
  /** An Unarmed Strike may deal this damage type instead of its normal one. */
  `unarmed:damage-type:${DamageType}`;

export const SHEET_NUMBER_KINDS = ["unarmed-strike-damage-type-option"] as const;
type SheetNumberGrant = Extract<Grant, { type: (typeof SHEET_NUMBER_KINDS)[number] }>;

export function compileSheetNumberGrant(grant: SheetNumberGrant): Rule[] {
  // One kind today; the family grows into a switch on `grant.type`.
  return [{ op: "flag", target: `unarmed:damage-type:${grant.toType}` }];
}
