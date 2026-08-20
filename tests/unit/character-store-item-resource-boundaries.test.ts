import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResourceSpec, SrdMagicItemData } from "@/data/types";
import {
  prepareItemResourceBoundary,
  prepareItemResourceBoundaryRevert,
  type ItemResourceBoundaryPreparation,
  type PreparedItemResourceBoundary,
} from "@/lib/item-resource-boundaries";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc, ItemResourceState } from "@/types/character";

type CatalogueItem = Pick<SrdMagicItemData, "id" | "resources">;

const charges = {
  kind: "counter",
  id: "charges",
  unit: "charges",
  capacity: { kind: "fixed", amount: 5 },
  initial: { kind: "full" },
  recoveries: [{ trigger: { kind: "dawn" }, amount: { kind: "full" } }],
} satisfies ResourceSpec;

const item = { id: "batch-wand", resources: [charges] } satisfies CatalogueItem;

function itemState(instanceId: string, current: number): ItemResourceState {
  return {
    itemId: item.id,
    instanceId,
    revision: 0,
    resources: { charges: { capacity: 5, current, disabled: false } },
    disposition: "magical",
    causalHead: null,
  };
}

function character(currentA = 1, currentB = 2): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.equipment = [
    { srdId: item.id, instanceId: "wand-a" },
    { srdId: item.id, instanceId: "wand-b" },
  ];
  doc.session.itemResources = {
    "wand-a": itemState("wand-a", currentA),
    "wand-b": itemState("wand-b", currentB),
  };
  return doc;
}

function prepared(result: ItemResourceBoundaryPreparation): PreparedItemResourceBoundary {
  expect(result.status).toBe("prepared");
  if (result.status !== "prepared") throw new Error("Expected prepared boundary");
  return result.prepared;
}

function dawnBoundary(doc: CharacterDoc): PreparedItemResourceBoundary {
  return prepared(
    prepareItemResourceBoundary({
      trigger: { kind: "dawn" },
      occurrenceId: "batch-dawn",
      equipment: doc.character.equipment,
      catalogue: [item],
      itemResources: doc.session.itemResources,
    })
  );
}

beforeEach(() => {
  useCharacterStore.setState({
    character: null,
    readonly: false,
    loading: false,
    error: null,
    parentPersistenceFlush: null,
  });
});

describe("characterStore item-resource boundary CAS", () => {
  it("commits all physical copies with one store replacement and one flush", async () => {
    const doc = character();
    const boundary = dawnBoundary(doc);
    const flush = vi.fn();
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().setParentPersistenceFlush(flush);
    let notifications = 0;
    const unsubscribe = useCharacterStore.subscribe(() => {
      notifications += 1;
    });

    expect(
      useCharacterStore.getState().applyItemResourceOperations(boundary.entries).status
    ).toBe("applied");
    const live = useCharacterStore.getState().character;
    expect(live?.session.itemResources?.["wand-a"]?.resources.charges?.current).toBe(5);
    expect(live?.session.itemResources?.["wand-b"]?.resources.charges?.current).toBe(5);
    expect(notifications).toBe(1);
    await Promise.resolve();
    expect(flush).toHaveBeenCalledTimes(1);

    expect(
      useCharacterStore.getState().applyItemResourceOperations(boundary.entries).status
    ).toBe("already-applied");
    expect(useCharacterStore.getState().character).toBe(live);
    expect(notifications).toBe(1);
    expect(flush).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("rejects one stale member without partially writing an earlier member", () => {
    const observed = character(1, 1);
    const boundary = dawnBoundary(observed);
    const live = character(1, 2);
    const flush = vi.fn();
    useCharacterStore.getState().setCharacter(live);
    useCharacterStore.getState().setParentPersistenceFlush(flush);
    const before = useCharacterStore.getState().character;
    let notifications = 0;
    const unsubscribe = useCharacterStore.subscribe(() => {
      notifications += 1;
    });

    expect(
      useCharacterStore.getState().applyItemResourceOperations(boundary.entries).status
    ).toBe("conflict");
    expect(useCharacterStore.getState().character).toBe(before);
    expect(
      useCharacterStore.getState().character?.session.itemResources?.["wand-a"]?.resources
        .charges?.current
    ).toBe(1);
    expect(notifications).toBe(0);
    expect(flush).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("resumes an already-applied physical-copy prefix in one commit", async () => {
    const observed = character();
    const boundary = dawnBoundary(observed);
    const first = boundary.entries[0];
    if (!first) throw new Error("Expected first boundary entry");
    const partial = character();
    partial.session.itemResources = {
      ...partial.session.itemResources,
      [first.binding.instanceId]: first.operation.after,
    };
    const flush = vi.fn();
    useCharacterStore.getState().setCharacter(partial);
    useCharacterStore.getState().setParentPersistenceFlush(flush);
    let notifications = 0;
    const unsubscribe = useCharacterStore.subscribe(() => {
      notifications += 1;
    });

    expect(
      useCharacterStore.getState().applyItemResourceOperations(boundary.entries).status
    ).toBe("applied");
    expect(
      useCharacterStore.getState().character?.session.itemResources?.["wand-a"]
    ).toEqual(first.operation.after);
    expect(
      useCharacterStore.getState().character?.session.itemResources?.["wand-b"]?.resources
        .charges?.current
    ).toBe(5);
    expect(notifications).toBe(1);
    await Promise.resolve();
    expect(flush).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("rejects duplicate ownership and read-only mode without mutation", () => {
    const doc = character();
    const boundary = dawnBoundary(doc);
    doc.character.equipment = [
      { srdId: item.id, instanceId: "wand-a" },
      { srdId: item.id, instanceId: "wand-a" },
      { srdId: item.id, instanceId: "wand-b" },
    ];
    const flush = vi.fn();
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().setParentPersistenceFlush(flush);
    const beforeDuplicate = useCharacterStore.getState().character;

    expect(
      useCharacterStore.getState().applyItemResourceOperations(boundary.entries).status
    ).toBe("rejected");
    expect(useCharacterStore.getState().character).toBe(beforeDuplicate);
    expect(flush).not.toHaveBeenCalled();

    const readonlyDoc = character();
    const readonlyBoundary = dawnBoundary(readonlyDoc);
    useCharacterStore.getState().loadReadonly(readonlyDoc);
    const beforeReadonly = useCharacterStore.getState().character;
    expect(
      useCharacterStore.getState().applyItemResourceOperations(readonlyBoundary.entries)
        .status
    ).toBe("rejected");
    expect(useCharacterStore.getState().character).toBe(beforeReadonly);
    expect(flush).not.toHaveBeenCalled();
  });

  it("commits a reverse-order causal batch atomically", async () => {
    const doc = character();
    const boundary = dawnBoundary(doc);
    const flush = vi.fn();
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().setParentPersistenceFlush(flush);
    expect(
      useCharacterStore.getState().applyItemResourceOperations(boundary.entries).status
    ).toBe("applied");
    await Promise.resolve();

    const afterForward = useCharacterStore.getState().character;
    const reversal = prepareItemResourceBoundaryRevert({
      original: boundary,
      occurrenceId: "batch-dawn-revert",
      itemResources: afterForward?.session.itemResources,
    });
    expect(reversal.status).toBe("prepared");
    if (reversal.status !== "prepared") throw new Error("Expected prepared reversal");
    expect(reversal.prepared.entries.map(({ binding }) => binding.instanceId)).toEqual([
      "wand-b",
      "wand-a",
    ]);

    flush.mockClear();
    let notifications = 0;
    const unsubscribe = useCharacterStore.subscribe(() => {
      notifications += 1;
    });
    expect(
      useCharacterStore.getState().applyItemResourceOperations(reversal.prepared.entries)
        .status
    ).toBe("applied");

    const reverted = useCharacterStore.getState().character?.session.itemResources;
    expect(reverted?.["wand-a"]).toMatchObject({
      revision: 2,
      causalHead: null,
      resources: { charges: { current: 1 } },
    });
    expect(reverted?.["wand-b"]).toMatchObject({
      revision: 2,
      causalHead: null,
      resources: { charges: { current: 2 } },
    });
    expect(notifications).toBe(1);
    await Promise.resolve();
    expect(flush).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
