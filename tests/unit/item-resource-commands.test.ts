import { describe, expect, it } from "vitest";
import type { ResourceSpec } from "@/data/types";
import {
  answerItemResourceInputs,
  itemResourceRecovery,
  itemResourceSpend,
  prepareItemResourceCommand,
  prepareItemResourceRevert,
} from "@/lib/item-resource-commands";
import {
  applyResourceOperation,
  makeItemResourceIdentity,
  type ResourceItemSpec,
} from "@/lib/resources";

const volatile: ResourceSpec = {
  kind: "counter",
  id: "charges",
  unit: "charges",
  capacity: { kind: "entered-roll", roll: { dice: 1, sides: 4 } },
  initial: { kind: "entered-roll", roll: { dice: 1, sides: 4 } },
  recoveries: [
    {
      trigger: { kind: "dawn" },
      amount: { kind: "entered-roll", roll: { dice: 1, sides: 4 } },
    },
  ],
  onEmpty: {
    kind: "entered-d20",
    bands: [
      {
        min: 1,
        max: 1,
        outcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
      },
      { min: 2, max: 20, outcomes: [] },
    ],
  },
};

const item: ResourceItemSpec = { itemId: "test-wand", resources: [volatile] };
const identity = makeItemResourceIdentity("test-wand", "copy-a", "charges");

describe("item resource command envelope", () => {
  it("fails closed when a caller forges the canonical physical-resource key", () => {
    const recipe = itemResourceSpend(
      {
        ...identity,
        key: makeItemResourceIdentity("test-wand", "copy-b", "charges").key,
      },
      1
    );
    expect(
      prepareItemResourceCommand({ item, recipe, occurrenceId: "use-forged" })
    ).toEqual({ status: "rejected", reason: "identity-mismatch" });
  });

  it("collects initialization and depletion facts before creating an operation", () => {
    let recipe = itemResourceSpend(identity, 1);
    const initialization = prepareItemResourceCommand({
      item,
      recipe,
      occurrenceId: "use-1",
    });
    expect(initialization.status).toBe("pending-input");
    if (initialization.status !== "pending-input") throw new Error("expected input");
    expect(initialization.requests.map(({ kind }) => kind)).toEqual([
      "capacity-roll",
      "initial-roll",
    ]);

    recipe = answerItemResourceInputs(
      recipe,
      initialization.requests,
      new Map([
        ["capacity-roll", 1],
        ["initial-roll", 1],
      ])
    );
    const depletion = prepareItemResourceCommand({
      item,
      recipe,
      occurrenceId: "use-1",
    });
    expect(depletion.status).toBe("pending-input");
    if (depletion.status !== "pending-input") throw new Error("expected input");
    expect(depletion.requests).toEqual([
      { kind: "depletion-d20", resourceId: "charges", min: 1, max: 20 },
    ]);

    recipe = answerItemResourceInputs(
      recipe,
      depletion.requests,
      new Map([["depletion-d20", 1]])
    );
    const final = prepareItemResourceCommand({ item, recipe, occurrenceId: "use-1" });
    expect(final.status).toBe("prepared");
    if (final.status !== "prepared") throw new Error("expected operation");
    expect(final.prepared.receipt).toMatchObject({
      before: 1,
      after: 0,
      depletionOutcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
    });
    expect(final.prepared.operation.after.disposition).toBe("destroyed");
  });

  it("replays entered facts with a fresh occurrence and creates a causal revert", () => {
    const recipe = {
      ...itemResourceSpend(identity, 1),
      inputs: { capacityRoll: 2, initialRoll: 2 },
    };
    const first = prepareItemResourceCommand({ item, recipe, occurrenceId: "use-1" });
    expect(first.status).toBe("prepared");
    if (first.status !== "prepared") throw new Error("expected operation");
    const applied = applyResourceOperation(
      item,
      first.prepared.binding,
      undefined,
      first.prepared.operation
    );
    expect(applied.status).toBe("applied");
    if (applied.status !== "applied") throw new Error("expected applied state");

    const undo = prepareItemResourceRevert({
      prepared: first.prepared,
      state: applied.state,
      occurrenceId: "undo-1",
    });
    expect(undo.status).toBe("planned");
    if (undo.status !== "planned") throw new Error("expected revert");
    const reverted = applyResourceOperation(
      item,
      first.prepared.binding,
      applied.state,
      undo.operation
    );
    expect(reverted.status).toBe("applied");
    if (reverted.status !== "applied") throw new Error("expected reverted state");

    const replay = prepareItemResourceCommand({
      item,
      state: reverted.state,
      recipe,
      occurrenceId: "use-2",
    });
    expect(replay.status).toBe("prepared");
    if (replay.status !== "prepared") throw new Error("expected replay");
    expect(replay.prepared.receipt).toMatchObject({
      occurrenceId: "use-2",
      before: 2,
      after: 1,
    });
  });

  it("uses the same entered-input protocol for exact recovery boundaries", () => {
    const initialized = prepareItemResourceCommand({
      item,
      recipe: {
        ...itemResourceSpend(identity, 1),
        inputs: { capacityRoll: 4, initialRoll: 4 },
      },
      occurrenceId: "use-before-dawn",
    });
    if (initialized.status !== "prepared") throw new Error("expected operation");
    const spent = applyResourceOperation(
      item,
      initialized.prepared.binding,
      undefined,
      initialized.prepared.operation
    );
    if (spent.status !== "applied") throw new Error("expected applied state");

    let recipe = itemResourceRecovery(identity, { kind: "dawn" });
    const pending = prepareItemResourceCommand({
      item,
      state: spent.state,
      recipe,
      occurrenceId: "dawn-1",
    });
    expect(pending.status).toBe("pending-input");
    if (pending.status !== "pending-input") throw new Error("expected recovery input");
    recipe = answerItemResourceInputs(
      recipe,
      pending.requests,
      new Map([["recovery-roll", 3]])
    );
    const recovered = prepareItemResourceCommand({
      item,
      state: spent.state,
      recipe,
      occurrenceId: "dawn-1",
    });
    expect(recovered.status).toBe("prepared");
    if (recovered.status !== "prepared") throw new Error("expected recovery");
    expect(recovered.prepared.receipt).toMatchObject({ before: 3, after: 4 });
  });
});
