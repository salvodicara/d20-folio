/** Transient review and compiler projections for MechanicsProgram execution. */

import type {
  MechanicsAnswersSchemaShape,
  MechanicsIntentSchemaShape,
} from "@/lib/mechanics-program-schema";
import type { D20TestResult, D20TestReview } from "@/types/d20-test";
import type {
  DiceResolution,
  DiceRollRequirement,
  ResolvedDiceReplacementRule,
} from "@/types/dice-formula";
import type {
  MechanicsPredicate,
  MechanicsRole,
} from "@/types/mechanics-program-authoring";
import type { EntityRef } from "@/types/mechanics-reference";
import type { ProgramOccurrence } from "@/types/mechanic-occurrence";
import type { MechanicsProgramPhase } from "@/types/mechanics-program-authoring";
import type { MechanicsCausalState, MechanicsWorld } from "@/types/mechanics-world";
import type { ResourceRef, ResourceSelector, ResourceTerm } from "@/types/resource";

export type MechanicsRoles = Readonly<Record<MechanicsRole, EntityRef | null>>;
export type { MechanicsTriggerEvidence } from "@/types/mechanics-trigger";
export type MechanicsIntent = MechanicsIntentSchemaShape;
export type MechanicsAnswers = MechanicsAnswersSchemaShape;
export type MechanicsAnswer = MechanicsAnswers[number];

export type MechanicsRequirementActivation = "required" | "conditional" | "omitted";

interface MechanicsRequirementBase {
  readonly activation: MechanicsRequirementActivation;
  readonly activeWhen: MechanicsPredicate | null;
  readonly inputId: string;
  readonly phaseId: string;
}

export type MechanicsPaymentRequirement = {
  readonly amountPerUse: number;
  readonly selector: ResourceSelector;
  readonly sourceId: string;
};

/** Stable identity of one physical request inside any expanded input. */
export interface MechanicsRequestIdentity {
  readonly binding: EntityRef;
  readonly ordinal: number;
}

export interface MechanicsD20Requirement {
  readonly identity: MechanicsRequestIdentity;
  readonly payments: readonly MechanicsPaymentRequirement[];
  readonly review: Readonly<D20TestReview>;
}

export interface MechanicsDiceRequirement {
  readonly identity: MechanicsRequestIdentity;
  readonly payments: readonly MechanicsPaymentRequirement[];
  readonly replacementPolicy: readonly ResolvedDiceReplacementRule[];
  readonly roll: Readonly<DiceRollRequirement>;
}

export type MechanicsRequirement =
  | (MechanicsRequirementBase & {
      readonly eligibility: "any" | "creature" | "object";
      readonly kind: "entities";
      readonly maximum: number;
      readonly minimum: number;
      readonly multiplicity: "set" | "slots";
    })
  | (MechanicsRequirementBase & {
      readonly kind: "d20";
      readonly pendingEntityInputId: string | null;
      readonly requests: readonly MechanicsD20Requirement[];
    })
  | (MechanicsRequirementBase & {
      readonly kind: "dice";
      readonly pendingInputId: string | null;
      readonly requests: readonly MechanicsDiceRequirement[];
    })
  | (MechanicsRequirementBase & {
      readonly kind: "choice";
      readonly options: readonly string[];
    })
  | (MechanicsRequirementBase & {
      readonly kind: "integer";
      readonly maximum: number;
      readonly minimum: number;
    })
  | (MechanicsRequirementBase & { readonly kind: "boolean" })
  | (MechanicsRequirementBase & {
      readonly kind: "table";
      readonly rows: readonly string[];
    })
  | (MechanicsRequirementBase & {
      readonly amount: number;
      readonly kind: "resource";
      readonly term: ResourceTerm;
    })
  | (MechanicsRequirementBase & {
      readonly kind: "item";
      readonly owner: EntityRef;
    });

export type MechanicsRequirementsRejection =
  | "invalid-intent"
  | "invalid-world"
  | "missing-phase"
  | "invalid-root-occurrence"
  | "trigger-mismatch"
  | "missing-role"
  | "missing-entity"
  | "wrong-entity-kind"
  | "invalid-expression"
  | "invalid-requirement"
  | "dangling-reference";

export type MechanicsRequirementsResult =
  | {
      readonly status: "derived";
      readonly intent: Readonly<MechanicsIntent>;
      readonly requirements: readonly MechanicsRequirement[];
    }
  | {
      readonly status: "rejected";
      readonly reason: MechanicsRequirementsRejection;
      readonly referenceId: string | null;
    };

export type ReviewedMechanicsPayment = {
  readonly amount: number;
  readonly resource: ResourceRef;
  readonly sourceId: string;
};

export type ResolvedMechanicsAnswer =
  | {
      readonly inputId: string;
      readonly kind: "entities";
      readonly targets: readonly EntityRef[];
    }
  | {
      readonly inputId: string;
      readonly kind: "d20";
      readonly requests: readonly {
        readonly identity: MechanicsRequestIdentity;
        readonly payments: readonly ReviewedMechanicsPayment[];
        readonly result: Readonly<D20TestResult>;
      }[];
    }
  | {
      readonly inputId: string;
      readonly kind: "dice";
      readonly requests: readonly {
        readonly identity: MechanicsRequestIdentity;
        readonly payments: readonly ReviewedMechanicsPayment[];
        readonly resolution: Readonly<DiceResolution>;
      }[];
    }
  | {
      readonly choiceId: string;
      readonly inputId: string;
      readonly kind: "choice";
    }
  | {
      readonly inputId: string;
      readonly kind: "integer";
      readonly value: number;
    }
  | {
      readonly inputId: string;
      readonly kind: "boolean";
      readonly value: boolean;
    }
  | {
      readonly authority: "table" | "environment";
      readonly inputId: string;
      readonly kind: "table";
      readonly rowId: string;
    }
  | {
      readonly amount: number;
      readonly inputId: string;
      readonly kind: "resource";
      readonly resource: ResourceRef;
    }
  | {
      readonly inputId: string;
      readonly instanceId: string;
      readonly instanceOrdinal: number;
      readonly kind: "item";
      readonly owner: Extract<EntityRef["material"], { readonly kind: "character-play" }>;
    };

/** Ephemeral proof. No conformer or persistence codec exists for this artifact. */
export interface ReviewedMechanicsIntent {
  readonly answers: Readonly<MechanicsAnswers>;
  readonly intent: Readonly<MechanicsIntent>;
  readonly requirements: readonly MechanicsRequirement[];
  readonly resolved: Readonly<Record<string, ResolvedMechanicsAnswer>>;
}

/** Trusted compiler view rebuilt from the reviewed intent and current projected world. */
export interface MechanicsProgramCompilationContext {
  readonly bindings: Readonly<Record<string, number>>;
  readonly execution: number;
  readonly intent: Readonly<MechanicsIntent>;
  readonly landedDamage: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly phase: Readonly<MechanicsProgramPhase>;
  readonly resolved: Readonly<Record<string, ResolvedMechanicsAnswer>>;
  readonly root: Readonly<ProgramOccurrence> | null;
  readonly world: Readonly<MechanicsWorld>;
}

export type MechanicsProgramCompilationPreparation =
  | {
      readonly context: Readonly<MechanicsProgramCompilationContext>;
      readonly state: Readonly<MechanicsCausalState>;
      readonly status: "ready";
    }
  | { readonly status: "replay" }
  | {
      readonly reason:
        | MechanicsReviewRejection
        | "invalid-reviewed-intent"
        | "invalid-state";
      readonly referenceId: string | null;
      readonly status: "rejected";
    };

export type MechanicsReviewRejection =
  | MechanicsRequirementsRejection
  | "invalid-answers"
  | "duplicate-answer"
  | "answer-order"
  | "missing-answer"
  | "unexpected-answer"
  | "answer-kind-mismatch"
  | "invalid-answer"
  | "ineligible-target"
  | "resource-unavailable"
  | "payment-mismatch"
  | "unresolved-predicate";

export type MechanicsReviewResult =
  | { readonly status: "reviewed"; readonly reviewed: ReviewedMechanicsIntent }
  | {
      readonly requirement: MechanicsRequirement | null;
      readonly status: "rejected";
      readonly reason: MechanicsReviewRejection;
      readonly referenceId: string | null;
    };

export type ManualInstruction =
  | {
      readonly instructionId: string;
      readonly kind: "relocation";
      readonly mode: "teleport" | "plane-transfer";
      readonly stepId: string;
      readonly targets: readonly MechanicsRequestIdentity[];
    }
  | {
      readonly authority: "table" | "environment";
      readonly instructionId: string;
      readonly kind: "table";
      readonly rowId: string;
      readonly stepId: string;
    };
