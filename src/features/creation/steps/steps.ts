/**
 * Creation-wizard step constants — the guided step order + their i18n label keys,
 * shared by the orchestrator and the step rail / review components. Pure ids; no
 * SRD/locale reads.
 */

import { ALL_ABILITY_CODES } from "@/data/types";
import type { AbilityCode } from "@/data/types";

/** Re-export of the canonical ability-code list (golden rule 6 — one source). */
export const ABILITY_CODES: readonly AbilityCode[] = ALL_ABILITY_CODES;

/** Point-buy cost table: score → points spent. */
export const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};
export const POINT_BUY_BUDGET = 27;

/**
 * Point-buy cost of a score — the ONE seam every budget tally routes through.
 * Any score outside the 8–15 table is UNSPENDABLE (`Infinity`), so a value left
 * out of range by a Manual→Point-Buy round-trip can never read as a free 0-cost
 * purchase: the tally becomes infinite, `pointsRemaining` never lands on 0, and
 * the point-buy gate stays blocked. (Bare `POINT_BUY_COST[score] ?? 0` treated
 * an illegal 30 as a spent-nothing buy, letting the budget be defeated.)
 */
export function pointBuyCost(score: number): number {
  return POINT_BUY_COST[score] ?? Infinity;
}

export type Mode = "quick" | "guided";

export type GuidedStep =
  | "class"
  | "race"
  | "background"
  | "languages"
  | "skills"
  | "spells"
  | "equipment"
  | "bg-asi"
  | "abilities"
  | "review";

export const GUIDED_STEPS: GuidedStep[] = [
  "class",
  "race",
  "background",
  "languages",
  "skills",
  "spells",
  "equipment",
  "bg-asi",
  "abilities",
  "review",
];

export const GUIDED_STEP_KEYS: Record<GuidedStep, string> = {
  class: "create.stepClass",
  race: "create.stepRace",
  background: "create.stepBackground",
  languages: "create.stepLanguages",
  skills: "create.stepSkills",
  spells: "create.stepSpells",
  equipment: "create.stepEquipment",
  "bg-asi": "create.stepBgAsi",
  abilities: "create.stepAbilities",
  review: "create.stepReview",
};
