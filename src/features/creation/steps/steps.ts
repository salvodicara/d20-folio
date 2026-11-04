/**
 * Creation-wizard step constants — the guided step order + their i18n label keys,
 * shared by the orchestrator and the step rail / review components. Pure ids; no
 * SRD/locale reads.
 */

import { ALL_ABILITY_CODES } from "@/data/types";
import type { AbilityCode } from "@/data/types";
import { CREATION_STEPS, type CreationStep } from "@/lib/creation/steps";

/** Re-export of the canonical ability-code list (golden rule 6 — one source). */
export const ABILITY_CODES: readonly AbilityCode[] = ALL_ABILITY_CODES;

// The point-buy table lives in the core (one encoding, read by the draft's gates
// and the point-buy picker alike).
export { POINT_BUY_COST, POINT_BUY_BUDGET, pointBuyCost } from "@/lib/creation/point-buy";

/**
 * The two creation paths. `quick` opens ALREADY COMPLETE — the one-page sheet
 * arrives prefilled with the current class's ready-made build
 * (`data/quickbuild.ts`), every control still editable; `guided` walks the same
 * decisions one page at a time. They share one state, so switching path never
 * loses work.
 */
export type Mode = "quick" | "guided";

/** A step of the guided journey — the core's creation steps. */
export type GuidedStep = CreationStep;

export const GUIDED_STEPS: readonly GuidedStep[] = CREATION_STEPS;

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
