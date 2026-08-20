/**
 * Canonical command envelope for one physical magic-item resource.
 *
 * `resources.ts` owns rule evaluation and state transitions. This module owns the
 * runtime address + entered facts that let every consumer (combat, the Spells
 * tab, recovery boundaries, and future inventory controls) prepare that same
 * transition without inventing its own tracker identity or payment protocol.
 * Preparing is pure and never mutates. The character store remains the one CAS
 * commit boundary.
 */

import type { ResourceRecoveryTrigger } from "@/data/types";
import type { ItemResourceState } from "@/types/character";
import {
  makeItemResourceIdentity,
  planResourceCommand,
  planResourceRevert,
  type ItemResourceIdentity,
  type ItemResourceOperation,
  type ResourceCommand,
  type ResourceInputRequest,
  type ResourceItemBinding,
  type ResourceItemSpec,
  type ResourcePlanResult,
  type ResourceReceipt,
  type ResourceRejection,
  type ResourceRevertPlanResult,
} from "./resources";

type SpendInputs = Extract<ResourceCommand, { kind: "spend" }>["inputs"];
type GainInputs = Extract<ResourceCommand, { kind: "gain" }>["inputs"];
type RecoverInputs = Extract<ResourceCommand, { kind: "recover" }>["inputs"];

export type ItemResourceCommandRecipe =
  | {
      kind: "spend";
      identity: ItemResourceIdentity;
      amount: number;
      inputs: SpendInputs;
    }
  | {
      kind: "gain";
      identity: ItemResourceIdentity;
      amount: number;
      inputs: GainInputs;
    }
  | {
      kind: "recover";
      identity: ItemResourceIdentity;
      trigger: ResourceRecoveryTrigger;
      inputs: RecoverInputs;
    };

export interface PreparedItemResourceCommand {
  item: ResourceItemSpec;
  binding: Required<ResourceItemBinding>;
  recipe: ItemResourceCommandRecipe;
  operation: ItemResourceOperation;
  receipt: ResourceReceipt;
}

export type ItemResourceCommandRejection = ResourceRejection | "identity-mismatch";

export type ItemResourceCommandPreparation =
  | { status: "prepared"; prepared: PreparedItemResourceCommand }
  | {
      status: "pending-input";
      recipe: ItemResourceCommandRecipe;
      requests: ResourceInputRequest[];
    }
  | { status: "already-applied" }
  | { status: "rejected"; reason: ItemResourceCommandRejection };

/** Create the only legal spend recipe: an exact physical-item address. */
export function itemResourceSpend(
  identity: ItemResourceIdentity,
  amount: number
): ItemResourceCommandRecipe {
  return { kind: "spend", identity, amount, inputs: {} };
}

/** Create the only legal gain recipe: an exact physical-item address. */
export function itemResourceGain(
  identity: ItemResourceIdentity,
  amount: number
): ItemResourceCommandRecipe {
  return { kind: "gain", identity, amount, inputs: {} };
}

/** Create the only legal recovery recipe: an exact physical-item address. */
export function itemResourceRecovery(
  identity: ItemResourceIdentity,
  trigger: ResourceRecoveryTrigger
): ItemResourceCommandRecipe {
  return { kind: "recover", identity, trigger, inputs: {} };
}

function hasCanonicalIdentity(identity: ItemResourceIdentity): boolean {
  try {
    const canonical = makeItemResourceIdentity(
      identity.itemId,
      identity.instanceId,
      identity.resourceId
    );
    return identity.key === canonical.key;
  } catch {
    return false;
  }
}

function commandFor(
  recipe: ItemResourceCommandRecipe,
  occurrenceId: string,
  expectedRevision: number
): ResourceCommand {
  switch (recipe.kind) {
    case "spend":
      return {
        kind: "spend",
        occurrenceId,
        expectedRevision,
        resourceId: recipe.identity.resourceId,
        amount: recipe.amount,
        inputs: structuredClone(recipe.inputs),
      };
    case "gain":
      return {
        kind: "gain",
        occurrenceId,
        expectedRevision,
        resourceId: recipe.identity.resourceId,
        amount: recipe.amount,
        inputs: structuredClone(recipe.inputs),
      };
    case "recover":
      return {
        kind: "recover",
        occurrenceId,
        expectedRevision,
        resourceId: recipe.identity.resourceId,
        trigger: structuredClone(recipe.trigger),
        inputs: structuredClone(recipe.inputs),
      };
  }
}

/**
 * Prepare a command against one observed revision. Pending table inputs are
 * returned before an operation exists, so cancelling can never partially spend.
 */
export function prepareItemResourceCommand(args: {
  item: ResourceItemSpec;
  state?: ItemResourceState;
  recipe: ItemResourceCommandRecipe;
  occurrenceId: string;
}): ItemResourceCommandPreparation {
  const { item, state, recipe, occurrenceId } = args;
  if (!hasCanonicalIdentity(recipe.identity) || item.itemId !== recipe.identity.itemId) {
    return { status: "rejected", reason: "identity-mismatch" };
  }
  const binding: Required<ResourceItemBinding> = {
    srdId: recipe.identity.itemId,
    instanceId: recipe.identity.instanceId,
  };
  const result: ResourcePlanResult = planResourceCommand(
    item,
    binding,
    state,
    commandFor(recipe, occurrenceId, state?.revision ?? 0)
  );
  if (result.status === "pending-input") {
    return {
      status: "pending-input",
      recipe: structuredClone(recipe),
      requests: result.requests,
    };
  }
  if (result.status === "already-applied") return { status: "already-applied" };
  if (result.status === "rejected") return result;
  return {
    status: "prepared",
    prepared: {
      item,
      binding,
      recipe: structuredClone(recipe),
      operation: result.operation,
      receipt: result.receipt,
    },
  };
}

/**
 * Fold answers for exactly the planner's current requests into a recipe. A later
 * prepare call remains the authority for range and semantic validation.
 */
export function answerItemResourceInputs(
  recipe: ItemResourceCommandRecipe,
  requests: readonly ResourceInputRequest[],
  answers: ReadonlyMap<ResourceInputRequest["kind"], number>
): ItemResourceCommandRecipe {
  const next = structuredClone(recipe);
  for (const request of requests) {
    const value = answers.get(request.kind);
    if (value === undefined) continue;
    switch (request.kind) {
      case "capacity-roll":
        next.inputs.capacityRoll = value;
        break;
      case "initial-roll":
        next.inputs.initialRoll = value;
        break;
      case "recovery-roll":
        if (next.kind === "recover") next.inputs.recoveryRoll = value;
        break;
      case "depletion-d20":
        if (next.kind === "spend") next.inputs.depletionD20 = value;
        break;
    }
  }
  return next;
}

/** Plan the causal LIFO inverse of a committed command against live state. */
export function prepareItemResourceRevert(args: {
  prepared: PreparedItemResourceCommand;
  state: ItemResourceState;
  occurrenceId: string;
}): ResourceRevertPlanResult {
  const { prepared, state, occurrenceId } = args;
  return planResourceRevert(prepared.item, prepared.binding, state, prepared.operation, {
    occurrenceId,
    expectedRevision: state.revision,
  });
}
