import { beforeEach, describe, expect, it } from "vitest";
import type { ResourceSpec } from "@/data/types";
import type { CharacterDoc, ItemResourceState } from "@/types/character";
import {
  planResourceCommand,
  type ItemResourceOperation,
  type ResourceItemBinding,
  type ResourceItemSpec,
} from "@/lib/resources";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";

const charges = {
  kind: "counter",
  id: "charges",
  unit: "charges",
  capacity: { kind: "fixed", amount: 3 },
  initial: { kind: "full" },
  recoveries: [{ trigger: { kind: "dawn" }, amount: { kind: "full" } }],
} satisfies ResourceSpec;

const item: ResourceItemSpec = { itemId: "test-wand", resources: [charges] };
const binding = (instanceId: string): ResourceItemBinding => ({
  srdId: item.itemId,
  instanceId,
});

function operation(
  instanceId: string,
  occurrenceId: string,
  state?: ItemResourceState
): ItemResourceOperation {
  const result = planResourceCommand(item, binding(instanceId), state, {
    kind: "spend",
    occurrenceId,
    expectedRevision: state?.revision ?? 0,
    resourceId: charges.id,
    amount: 1,
    inputs: {},
  });
  if (result.status !== "planned") {
    throw new Error(`Expected a planned resource command, got ${result.status}`);
  }
  return result.operation;
}

function characterWithCopies(): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.equipment = [
    { srdId: item.itemId, quantity: 1, instanceId: "wand-a" },
    { srdId: item.itemId, quantity: 1, instanceId: "wand-b" },
  ];
  delete doc.session.itemResources;
  return doc;
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

describe("characterStore typed item-resource transaction", () => {
  it("applies one instance once, recognizes retry, and rejects a stale CAS", () => {
    useCharacterStore.getState().setCharacter(characterWithCopies());
    const first = operation("wand-a", "spend-a-1");
    let notifications = 0;
    const unsubscribe = useCharacterStore.subscribe(() => {
      notifications += 1;
    });

    const applied = useCharacterStore
      .getState()
      .applyItemResourceOperation(item, binding("wand-a"), first);
    expect(applied.status).toBe("applied");
    expect(
      useCharacterStore.getState().character?.session.itemResources?.["wand-a"]?.resources
        .charges?.current
    ).toBe(2);
    expect(
      useCharacterStore.getState().character?.session.itemResources?.["wand-b"]
    ).toBeUndefined();
    expect(notifications).toBe(1);

    const afterApply = useCharacterStore.getState().character;
    expect(
      useCharacterStore
        .getState()
        .applyItemResourceOperation(item, binding("wand-a"), first).status
    ).toBe("already-applied");
    expect(useCharacterStore.getState().character).toBe(afterApply);
    expect(notifications).toBe(1);

    const stale = operation("wand-a", "stale-from-empty");
    expect(
      useCharacterStore
        .getState()
        .applyItemResourceOperation(item, binding("wand-a"), stale).status
    ).toBe("conflict");
    expect(useCharacterStore.getState().character).toBe(afterApply);
    expect(notifications).toBe(1);
    unsubscribe();
  });

  it("rejects read-only and missing-character writes without mutating", () => {
    const doc = characterWithCopies();
    const first = operation("wand-a", "readonly-spend");
    useCharacterStore.getState().loadReadonly(doc);
    const before = useCharacterStore.getState().character;

    expect(
      useCharacterStore
        .getState()
        .applyItemResourceOperation(item, binding("wand-a"), first).status
    ).toBe("rejected");
    expect(useCharacterStore.getState().character).toBe(before);

    useCharacterStore.setState({ character: null, readonly: false });
    expect(
      useCharacterStore
        .getState()
        .applyItemResourceOperation(item, binding("wand-a"), first).status
    ).toBe("rejected");
  });

  it("rejects missing or duplicate physical ownership", () => {
    const doc = characterWithCopies();
    doc.character.equipment = [
      { srdId: item.itemId, quantity: 1, instanceId: "wand-a" },
      { srdId: item.itemId, quantity: 1, instanceId: "wand-a" },
    ];
    useCharacterStore.getState().setCharacter(doc);
    const first = operation("wand-a", "ambiguous-owner");
    expect(
      useCharacterStore
        .getState()
        .applyItemResourceOperation(item, binding("wand-a"), first).status
    ).toBe("rejected");

    useCharacterStore.getState().setCharacter(characterWithCopies());
    const orphan = operation("wand-c", "orphan-owner");
    expect(
      useCharacterStore
        .getState()
        .applyItemResourceOperation(item, binding("wand-c"), orphan).status
    ).toBe("rejected");
    expect(useCharacterStore.getState().character?.session.itemResources).toBeUndefined();
  });

  it("deletes exactly one physical copy and its state in one mutation", () => {
    const doc = characterWithCopies();
    const stateA = operation("wand-a", "seed-a").after;
    const stateB = operation("wand-b", "seed-b").after;
    doc.session.itemResources = { "wand-a": stateA, "wand-b": stateB };
    useCharacterStore.getState().setCharacter(doc);
    const observations: CharacterDoc[] = [];
    const unsubscribe = useCharacterStore.subscribe((state) => {
      if (state.character) observations.push(state.character);
    });

    expect(useCharacterStore.getState().removeItemResourceInstance("wand-a")).toBe(true);
    const current = useCharacterStore.getState().character;
    expect(current?.character.equipment).toEqual([
      { srdId: item.itemId, quantity: 1, instanceId: "wand-b" },
    ]);
    expect(current?.session.itemResources).toEqual({ "wand-b": stateB });
    expect(observations).toHaveLength(1);
    expect(observations[0]?.character.equipment).toHaveLength(1);
    expect(observations[0]?.session.itemResources).toEqual({ "wand-b": stateB });
    unsubscribe();
  });
});
