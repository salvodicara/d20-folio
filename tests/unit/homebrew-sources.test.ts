import { describe, expect, it } from "vitest";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import * as sources from "../../src/lib/homebrew/sources";
import { parseOriginBuild } from "../../src/lib/homebrew/origin-build";
import type { LibraryVersion } from "../../src/lib/library/model";
const definition = { ...initializeDefinition("species"), name: "Synthetic species" };
const catalogue = {
  kind: "catalogue" as const,
  schema: 1 as const,
  catalogue: "srd",
  release: "5.2.1",
  adapterVersion: 1,
  entryId: "human",
  definition,
};
const library: LibraryVersion = {
  schema: 1,
  ownerUid: "owner",
  entryId: "human",
  version: 1,
  operationId: "publish",
  provenance: null,
  definition,
};
describe("explicit definition sources", () => {
  it("roundtrips authentic library bytes and catalogue without invented authority", () => {
    expect(JSON.stringify(sources.parseDefinitionSnapshot(library))).toBe(
      JSON.stringify(library)
    );
    expect(sources.parseDefinitionSnapshot(catalogue)).toEqual(catalogue);
    expect(catalogue).not.toHaveProperty("ownerUid");
    expect(catalogue).not.toHaveProperty("operationId");
    expect(sources.sourceIdentity(catalogue)).not.toBe(sources.sourceIdentity(library));
  });
  it("rejects mixed source discriminators and forged adapter output", () => {
    expect(() =>
      sources.parseDefinitionSnapshot({ ...catalogue, ownerUid: "owner" })
    ).toThrow();
    expect(() => sources.parseDefinitionSnapshot(catalogue, () => false)).toThrow();
    expect(
      sources.parseDefinitionSnapshot(
        catalogue,
        (v) => JSON.stringify(v) === JSON.stringify(catalogue)
      )
    ).toEqual(catalogue);
    expect(
      sources.canonicalSource({
        ...catalogue,
        definition: {
          ...definition,
          payload: {
            ...definition.payload,
            data: { ...definition.payload.data, source: "forged", mechanicId: "forged" },
          },
        },
      })
    ).toEqual(sources.canonicalSource(catalogue));
  });
  it("decodes catalogue origins with selected closure without changing the root", () => {
    const build = {
      schema: 1,
      character: { ownerUid: "owner", id: "hero" },
      revision: 1,
      selections: {
        origin: {
          id: "origin",
          ordinal: 0,
          snapshot: catalogue,
          answers: {},
          exceptions: [],
          resolvedChoices: {},
        },
      },
      lastOperation: { uid: "owner", opId: "create" },
    };
    expect(parseOriginBuild(build)).toEqual(build);
    expect(() => parseOriginBuild(build, () => false)).toThrow();
  });
});

it("verifies catalogue children inside an owned Library root independently of owner metadata", () => {
  const root = structuredClone(library);
  root.definition.payload.data.dependencies = { child: catalogue };
  expect(() => sources.parseDefinitionSnapshot(root, () => false)).toThrow();
});

it("preserves optional raw typed source mechanics and binds them through the verifier", () => {
  const snapshot = {
    ...catalogue,
    sourceData: { grants: [{ type: "future-combat", amount: 2 }] },
  };
  expect(sources.parseDefinitionSnapshot(snapshot)).toEqual(snapshot);
  expect(() =>
    sources.parseDefinitionSnapshot(
      { ...snapshot, sourceData: { grants: [] } },
      (value) => JSON.stringify(value) === JSON.stringify(snapshot)
    )
  ).toThrow();
  expect(() =>
    sources.parseDefinitionSnapshot({ ...snapshot, sourceData: () => 0 })
  ).toThrow();
});
