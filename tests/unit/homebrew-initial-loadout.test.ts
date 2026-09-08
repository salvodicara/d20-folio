import { describe, expect, it } from "vitest";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import { sourceIdentity, type DefinitionSnapshot } from "../../src/lib/homebrew/sources";
import { includeOriginDependency } from "../../src/lib/homebrew/origins";
import * as instances from "../../src/lib/homebrew/instances";
const character = { ownerUid: "recipient", id: "hero" };
const version = (family: "background" | "equipment", id: string) => ({
  schema: 1 as const,
  ownerUid: "recipient",
  entryId: id,
  version: 1,
  definition: { ...initializeDefinition(family), name: id },
  provenance: null,
  operationId: "publish",
});
function fixture() {
  const gear = version("equipment", "private-gear");
  const included = includeOriginDependency(
    version("background", "origin").definition,
    gear
  );
  const root = {
    ...version("background", "origin"),
    definition: included.definition,
    provenance: {
      source: { ownerUid: "sender", id: "original" },
      sourceVersion: 1,
      senderUid: "sender",
      offerId: "gift",
      grantId: "sender~gift",
    },
  };
  const sourceKey = sourceIdentity(root);
  const definition = required(
    (
      root.definition.payload.data.dependencies as unknown as Record<
        string,
        { definition: typeof gear.definition }
      >
    )[included.key]
  ).definition;
  const snapshot = {
    kind: "bundled" as const,
    schema: 1 as const,
    sourceKey,
    dependencyPath: included.key,
    definition,
  };
  const item = {
    schema: 1 as const,
    id: "initial_gear",
    character,
    revision: 1,
    snapshot,
    state: instances.DEFAULT_INSTANCE_STATE,
    lastOperation: { uid: "recipient", opId: "create" },
  };
  return {
    schema: 1 as const,
    character,
    revision: 1,
    sources: { [sourceKey]: root } as Record<string, DefinitionSnapshot>,
    instances: { initial_gear: item, initial_other: { ...item, id: "initial_other" } },
    lastOperation: { uid: "recipient", opId: "create" },
  };
}
describe("grouped initial loadout", () => {
  it("reads received private bundled definitions entirely from the frozen map", () => {
    const group = fixture();
    expect(instances.parseInitialLoadout(group)).toEqual(group);
    const next = instances.updateInitialLoadoutState(
      group,
      "initial_gear",
      { ...instances.DEFAULT_INSTANCE_STATE, quantity: 3 },
      { uid: "recipient", opId: "state" }
    );
    expect(next.sources).toEqual(group.sources);
    expect(next.instances.initial_other).toEqual(group.instances.initial_other);
    expect(next.instances.initial_gear?.snapshot).toEqual(
      group.instances.initial_gear.snapshot
    );
    expect(next.instances.initial_gear?.state.quantity).toBe(3);
    expect(next.revision).toBe(2);
  });
  it("rejects swapped definitions, missing source and overlapping individually addressed IDs", () => {
    const group = fixture();
    expect(() => instances.parseInitialLoadout({ ...group, sources: {} })).toThrow();
    group.instances.initial_gear.snapshot.definition.name = "forged";
    // Isolate the mutation from the source-map object to model wire tampering.
    const tampered = structuredClone(fixture());
    tampered.instances.initial_gear.snapshot.definition = {
      ...tampered.instances.initial_gear.snapshot.definition,
      name: "forged",
    };
    expect(() => instances.parseInitialLoadout(tampered)).toThrow();
    expect(() => instances.instancePath(character, "initial_gear")).toThrow();
  });
  it("requires an actual adapter verifier for catalogue reads", () => {
    const group = fixture();
    const snapshot = {
      kind: "catalogue" as const,
      schema: 1 as const,
      catalogue: "synthetic",
      release: "1",
      adapterVersion: 1,
      entryId: "gear",
      definition: version("equipment", "gear").definition,
    };
    const catalogueGroup = {
      ...group,
      instances: { initial_gear: { ...group.instances.initial_gear, snapshot } },
      sources: {},
    };
    expect(() => instances.parseInitialLoadout(catalogueGroup)).toThrow();
    expect(
      instances.parseInitialLoadout(catalogueGroup, () => true).instances.initial_gear
        ?.snapshot
    ).toEqual(snapshot);
  });
});

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test fixture");
  return value;
}
