import { describe, expect, it } from "vitest";

import type {
  ResourceRecoveryAmount,
  ResourceSpec,
  SrdMagicItemData,
} from "@/data/types";
import {
  prepareItemResourceBoundary,
  prepareItemResourceBoundaryReplay,
  prepareItemResourceBoundaryRevert,
  simulateItemResourceOperations,
  type ItemResourceBoundaryPreparation,
  type ItemResourceRecoveryBoundary,
  type PreparedItemResourceBoundary,
} from "@/lib/item-resource-boundaries";
import { makeItemResourceIdentity } from "@/lib/resources";
import type { ItemResourceState, SrdEquipmentRef } from "@/types/character";

type CatalogueItem = Pick<SrdMagicItemData, "id" | "resources">;

function counter(
  id: string,
  trigger: ItemResourceRecoveryBoundary,
  amount: ResourceRecoveryAmount = { kind: "full" },
  capacity = 5
): ResourceSpec {
  return {
    kind: "counter",
    id,
    unit: "charges",
    capacity: { kind: "fixed", amount: capacity },
    initial: { kind: "full" },
    recoveries: [{ trigger, amount }],
  };
}

function state(
  itemId: string,
  instanceId: string,
  resources: ItemResourceState["resources"]
): ItemResourceState {
  return {
    itemId,
    instanceId,
    revision: 0,
    resources,
    disposition: "magical",
    causalHead: null,
  };
}

function prepared(result: ItemResourceBoundaryPreparation): PreparedItemResourceBoundary {
  expect(result.status).toBe("prepared");
  if (result.status !== "prepared") {
    throw new Error(`Expected a prepared boundary, got ${result.status}`);
  }
  return result.prepared;
}

function equipment(itemId: string, ...instanceIds: string[]): SrdEquipmentRef[] {
  return instanceIds.map((instanceId) => ({ srdId: itemId, instanceId }));
}

describe("item resource recovery boundaries", () => {
  it("plans multiple resources on one copy against sequential working state", () => {
    const item = {
      id: "twin-focus",
      resources: [
        counter("first", { kind: "short-rest" }, { kind: "fixed", amount: 1 }),
        counter("second", { kind: "short-rest" }, { kind: "fixed", amount: 2 }),
      ],
    } satisfies CatalogueItem;
    const initial = state(item.id, "focus-a", {
      first: { capacity: 5, current: 1, disabled: false },
      second: { capacity: 5, current: 0, disabled: false },
    });

    const boundary = prepared(
      prepareItemResourceBoundary({
        trigger: { kind: "short-rest" },
        occurrenceId: "rest-1",
        equipment: equipment(item.id, "focus-a"),
        catalogue: [item],
        itemResources: { "focus-a": initial },
      })
    );

    expect(boundary.entries.map(({ receipt }) => receipt.resourceId)).toEqual([
      "first",
      "second",
    ]);
    expect(boundary.entries[0]?.operation).toMatchObject({
      before: { revision: 0 },
      after: { revision: 1 },
    });
    expect(boundary.entries[1]?.operation).toMatchObject({
      before: {
        revision: 1,
        resources: { first: { current: 2 }, second: { current: 0 } },
      },
      after: {
        revision: 2,
        resources: { first: { current: 2 }, second: { current: 2 } },
      },
    });
    expect(boundary.entries[1]?.operation.before).toEqual(
      boundary.entries[0]?.operation.after
    );
  });

  it("preserves physical equipment order across two identical copies", () => {
    const item = {
      id: "ordered-wand",
      resources: [counter("charges", { kind: "dawn" })],
    } satisfies CatalogueItem;
    const resources = {
      "wand-a": state(item.id, "wand-a", {
        charges: { capacity: 5, current: 1, disabled: false },
      }),
      "wand-b": state(item.id, "wand-b", {
        charges: { capacity: 5, current: 2, disabled: false },
      }),
    };

    const boundary = prepared(
      prepareItemResourceBoundary({
        trigger: { kind: "dawn" },
        occurrenceId: "dawn-1",
        equipment: equipment(item.id, "wand-b", "wand-a"),
        catalogue: [item],
        itemResources: resources,
      })
    );

    expect(boundary.entries.map(({ binding }) => binding.instanceId)).toEqual([
      "wand-b",
      "wand-a",
    ]);
    expect(boundary.entries.map(({ receipt }) => receipt.resourceKey)).toEqual([
      "item:wand-b:charges",
      "item:wand-a:charges",
    ]);
  });

  it("keeps short rest, long rest, dawn, and dusk exact and non-aliased", () => {
    const triggers = ["short-rest", "long-rest", "dawn", "dusk"] as const;
    const item = {
      id: "four-boundaries",
      resources: triggers.map((kind) => counter(kind, { kind }, { kind: "full" })),
    } satisfies CatalogueItem;
    const itemState = state(
      item.id,
      "focus-a",
      Object.fromEntries(
        triggers.map((kind) => [kind, { capacity: 5, current: 0, disabled: false }])
      )
    );

    for (const kind of triggers) {
      const boundary = prepared(
        prepareItemResourceBoundary({
          trigger: { kind },
          occurrenceId: `boundary-${kind}`,
          equipment: equipment(item.id, "focus-a"),
          catalogue: [item],
          itemResources: { "focus-a": itemState },
        })
      );
      expect(boundary.entries.map(({ receipt }) => receipt.resourceId)).toEqual([kind]);
    }
    expect(
      prepareItemResourceBoundary({
        trigger: { kind: "short-or-long-rest" } as never,
        occurrenceId: "legacy-alias",
        equipment: equipment(item.id, "focus-a"),
        catalogue: [item],
        itemResources: { "focus-a": itemState },
      })
    ).toEqual({ status: "rejected", reason: "invalid-boundary" });
  });

  it("addresses every initialization and recovery roll to one exact identity", () => {
    const rolled = {
      kind: "counter",
      id: "charges",
      unit: "charges",
      capacity: { kind: "entered-roll", roll: { dice: 1, sides: 4, modifier: 2 } },
      initial: { kind: "entered-roll", roll: { dice: 1, sides: 2 } },
      recoveries: [
        {
          trigger: { kind: "dawn" },
          amount: { kind: "entered-roll", roll: { dice: 1, sides: 4 } },
        },
      ],
    } satisfies ResourceSpec;
    const item = { id: "rolled-wand", resources: [rolled] } satisfies CatalogueItem;
    const identity = makeItemResourceIdentity(item.id, "wand-a", rolled.id);
    const base = {
      trigger: { kind: "dawn" } as const,
      occurrenceId: "rolled-dawn",
      equipment: equipment(item.id, "wand-a"),
      catalogue: [item],
    };

    const initialization = prepareItemResourceBoundary(base);
    expect(initialization).toMatchObject({
      status: "pending-input",
      requests: [
        { kind: "capacity-roll", identity },
        { kind: "initial-roll", identity },
      ],
    });

    const initialized = prepareItemResourceBoundary({
      ...base,
      facts: [
        { identity, kind: "capacity-roll", value: 4 },
        { identity, kind: "initial-roll", value: 1 },
      ],
    });
    expect(initialized).toMatchObject({
      status: "pending-input",
      requests: [{ kind: "recovery-roll", identity }],
    });

    const boundary = prepared(
      prepareItemResourceBoundary({
        ...base,
        facts: [
          { identity, kind: "capacity-roll", value: 4 },
          { identity, kind: "initial-roll", value: 1 },
          { identity, kind: "recovery-roll", value: 2 },
        ],
      })
    );
    expect(boundary.entries).toHaveLength(1);
    expect(boundary.entries[0]?.receipt).toMatchObject({ before: 1, after: 3 });

    expect(
      prepareItemResourceBoundary({
        ...base,
        facts: [
          { identity, kind: "capacity-roll", value: 4 },
          { identity, kind: "capacity-roll", value: 4 },
        ],
      })
    ).toEqual({ status: "rejected", reason: "invalid-facts" });
    expect(
      prepareItemResourceBoundary({
        ...base,
        facts: [
          {
            identity: makeItemResourceIdentity("other-wand", "wand-a", rolled.id),
            kind: "capacity-roll",
            value: 4,
          },
        ],
      })
    ).toEqual({ status: "rejected", reason: "invalid-facts" });
  });

  it("skips catalogue-full and post-initialization true no-ops", () => {
    const fixed = {
      id: "full-wand",
      resources: [counter("charges", { kind: "dawn" })],
    } satisfies CatalogueItem;
    expect(
      prepared(
        prepareItemResourceBoundary({
          trigger: { kind: "dawn" },
          occurrenceId: "fixed-full",
          equipment: equipment(fixed.id, "fixed-a"),
          catalogue: [fixed],
        })
      ).entries
    ).toEqual([]);

    const rolled = {
      id: "rolled-full-wand",
      resources: [
        {
          kind: "counter",
          id: "charges",
          unit: "charges",
          capacity: { kind: "entered-roll", roll: { dice: 1, sides: 4 } },
          initial: { kind: "full" },
          recoveries: [{ trigger: { kind: "dawn" }, amount: { kind: "full" } }],
        },
      ],
    } satisfies CatalogueItem;
    expect(
      prepared(
        prepareItemResourceBoundary({
          trigger: { kind: "dawn" },
          occurrenceId: "rolled-full",
          equipment: equipment(rolled.id, "rolled-a"),
          catalogue: [rolled],
        })
      ).entries
    ).toEqual([]);
  });

  it("rejects missing, invalid, duplicate, and malformed matching identities", () => {
    const item = {
      id: "strict-wand",
      resources: [counter("charges", { kind: "dawn" })],
    } satisfies CatalogueItem;
    const cases = [
      { equipment: [{ srdId: item.id }] },
      { equipment: [{ srdId: item.id, instanceId: "UPPER" }] },
      { equipment: equipment(item.id, "same", "same") },
      {
        equipment: equipment(item.id, "wand-a"),
        itemResources: {
          "wand-a": state(item.id, "wand-a", {
            charges: { capacity: 99, current: 0, disabled: false },
          }),
        },
      },
    ] as const;

    for (const candidate of cases) {
      const result = prepareItemResourceBoundary({
        trigger: { kind: "dawn" },
        occurrenceId: "strict-dawn",
        catalogue: [item],
        ...candidate,
      });
      expect(result).toMatchObject({ status: "rejected", reason: "invalid-inventory" });
    }
    expect(
      prepareItemResourceBoundary({
        trigger: { kind: "dawn" },
        occurrenceId: "duplicate-catalogue",
        equipment: equipment(item.id, "wand-a"),
        catalogue: [item, item],
      })
    ).toEqual({ status: "rejected", reason: "invalid-catalogue" });
  });

  it("plans and simulates one atomic causal reverse in LIFO order", () => {
    const item = {
      id: "reversible-focus",
      resources: [
        counter("first", { kind: "short-rest" }, { kind: "fixed", amount: 1 }),
        counter("second", { kind: "short-rest" }, { kind: "fixed", amount: 2 }),
      ],
    } satisfies CatalogueItem;
    const initial = state(item.id, "focus-a", {
      first: { capacity: 5, current: 1, disabled: false },
      second: { capacity: 5, current: 0, disabled: false },
    });
    const boundary = prepared(
      prepareItemResourceBoundary({
        trigger: { kind: "short-rest" },
        occurrenceId: "rest-forward",
        equipment: equipment(item.id, "focus-a"),
        catalogue: [item],
        itemResources: { "focus-a": initial },
      })
    );
    const forward = simulateItemResourceOperations(
      { "focus-a": initial },
      boundary.entries
    );
    expect(forward.status).toBe("applied");
    if (forward.status !== "applied") throw new Error("Expected forward apply");

    expect(
      prepareItemResourceBoundaryRevert({
        original: boundary,
        occurrenceId: boundary.occurrenceId,
        itemResources: forward.itemResources,
      })
    ).toEqual({ status: "rejected", reason: "invalid-occurrence" });

    const reversal = prepareItemResourceBoundaryRevert({
      original: boundary,
      occurrenceId: "rest-reverse",
      itemResources: forward.itemResources,
    });
    expect(reversal.status).toBe("prepared");
    if (reversal.status !== "prepared") throw new Error("Expected revert plan");
    expect(
      reversal.prepared.entries.map(({ original }) => original.receipt.resourceId)
    ).toEqual(["second", "first"]);

    const reverted = simulateItemResourceOperations(
      forward.itemResources,
      reversal.prepared.entries
    );
    expect(reverted.status).toBe("applied");
    if (reverted.status !== "applied") throw new Error("Expected revert apply");
    expect(reverted.itemResources["focus-a"]).toMatchObject({
      revision: 4,
      causalHead: null,
      resources: {
        first: { capacity: 5, current: 1, disabled: false },
        second: { capacity: 5, current: 0, disabled: false },
      },
    });
  });

  it("replays only original entries with preserved facts and fresh causal ids", () => {
    const rolled = {
      kind: "counter",
      id: "rolled",
      unit: "charges",
      capacity: { kind: "entered-roll", roll: { dice: 1, sides: 4, modifier: 2 } },
      initial: { kind: "entered-roll", roll: { dice: 1, sides: 2 } },
      recoveries: [
        {
          trigger: { kind: "dawn" },
          amount: { kind: "entered-roll", roll: { dice: 1, sides: 4 } },
        },
      ],
    } satisfies ResourceSpec;
    const item = {
      id: "replay-focus",
      resources: [
        rolled,
        counter("fixed", { kind: "dawn" }, { kind: "fixed", amount: 2 }),
      ],
    } satisfies CatalogueItem;
    const initial = state(item.id, "focus-a", {
      rolled: { capacity: 4, current: 1, disabled: false },
      fixed: { capacity: 5, current: 0, disabled: false },
    });
    const identity = makeItemResourceIdentity(item.id, "focus-a", rolled.id);
    const original = prepared(
      prepareItemResourceBoundary({
        trigger: { kind: "dawn" },
        occurrenceId: "replay-original",
        equipment: equipment(item.id, "focus-a"),
        catalogue: [item],
        itemResources: { "focus-a": initial },
        facts: [{ identity, kind: "recovery-roll", value: 2 }],
      })
    );
    const forward = simulateItemResourceOperations(
      { "focus-a": initial },
      original.entries
    );
    expect(forward.status).toBe("applied");
    if (forward.status !== "applied") throw new Error("Expected forward apply");
    const reversal = prepareItemResourceBoundaryRevert({
      original,
      occurrenceId: "replay-reversal",
      itemResources: forward.itemResources,
    });
    expect(reversal.status).toBe("prepared");
    if (reversal.status !== "prepared") throw new Error("Expected reversal plan");
    const reverted = simulateItemResourceOperations(
      forward.itemResources,
      reversal.prepared.entries
    );
    expect(reverted.status).toBe("applied");
    if (reverted.status !== "applied") throw new Error("Expected revert apply");

    const newlyEligible = state(item.id, "focus-b", {
      rolled: { capacity: 4, current: 0, disabled: false },
      fixed: { capacity: 5, current: 0, disabled: false },
    });
    const replay = prepareItemResourceBoundaryReplay({
      original,
      occurrenceId: "replay-fresh",
      itemResources: { ...reverted.itemResources, "focus-b": newlyEligible },
    });
    expect(replay.status).toBe("prepared");
    if (replay.status !== "prepared") throw new Error("Expected replay plan");
    expect(
      replay.prepared.entries.map(({ binding, receipt }) => [
        binding.instanceId,
        receipt.resourceId,
        receipt.occurrenceId,
      ])
    ).toEqual([
      ["focus-a", "rolled", "replay-fresh:1"],
      ["focus-a", "fixed", "replay-fresh:2"],
    ]);
    expect(replay.prepared.entries[0]?.recipe).toMatchObject({
      kind: "recover",
      inputs: { recoveryRoll: 2 },
    });
    expect(replay.prepared.entries[0]?.operation.after.revision).toBe(5);
    expect(replay.prepared.entries[1]?.operation.after.revision).toBe(6);

    const replayed = simulateItemResourceOperations(
      { ...reverted.itemResources, "focus-b": newlyEligible },
      replay.prepared.entries
    );
    expect(replayed.status).toBe("applied");
    if (replayed.status !== "applied") throw new Error("Expected replay apply");
    expect(replayed.itemResources["focus-a"]?.resources).toMatchObject({
      rolled: { current: 3 },
      fixed: { current: 2 },
    });
    expect(replayed.itemResources["focus-b"]).toEqual(newlyEligible);

    const missingInitialization = prepareItemResourceBoundaryReplay({
      original,
      occurrenceId: "replay-pending",
      itemResources: {
        "focus-a": state(item.id, "focus-a", {
          fixed: { capacity: 5, current: 0, disabled: false },
        }),
      },
    });
    expect(missingInitialization).toMatchObject({
      status: "pending-input",
      requests: [
        { kind: "capacity-roll", identity },
        { kind: "initial-roll", identity },
      ],
    });
  });
});
