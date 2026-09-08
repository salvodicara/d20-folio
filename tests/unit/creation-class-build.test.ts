import { describe, expect, it } from "vitest";
import { initializeDefinition } from "@/lib/homebrew/model";
import { parseClassBuild } from "@/lib/homebrew/class-build";
const definition = { ...initializeDefinition("class"), name: "Synthetic class" };
const acquisition = {
  id: "first",
  ordinal: 0,
  classLevel: 1,
  snapshot: {
    schema: 1,
    ownerUid: "owner",
    entryId: "class",
    version: 1,
    definition,
    provenance: null,
    operationId: "publish",
  },
  answers: {},
  exceptions: [],
  resolvedChoices: {},
};
const build = {
  schema: 1,
  character: { ownerUid: "owner", id: "hero" },
  revision: 1,
  acquisitions: { first: acquisition },
  lastOperation: { uid: "owner", opId: "create" },
};
describe("initial class build authority", () => {
  it("retains the exact class acquisition at its own address and rejects origin substitution", () => {
    expect(parseClassBuild(build)).toEqual(build);
    expect(Object.isFrozen(parseClassBuild(build).acquisitions.first)).toBe(true);
    expect(() =>
      parseClassBuild({
        ...build,
        acquisitions: {
          first: {
            ...acquisition,
            snapshot: {
              ...acquisition.snapshot,
              definition: { ...initializeDefinition("species"), name: "Species" },
            },
          },
        },
      })
    ).toThrow("incompatible-class-build");
  });
  it("does not accept a second acquisition or later class levels as initial creation", () => {
    expect(() => parseClassBuild({ ...build, acquisitions: {} })).toThrow();
    expect(() =>
      parseClassBuild({
        ...build,
        acquisitions: { first: { ...acquisition, classLevel: 2 } },
      })
    ).toThrow();
    expect(() =>
      parseClassBuild({
        ...build,
        acquisitions: {
          first: acquisition,
          second: { ...acquisition, id: "second", ordinal: 1 },
        },
      })
    ).toThrow();
  });
  it("validates answer paths, attributed exceptions and catalogue claims", () => {
    expect(() =>
      parseClassBuild({
        ...build,
        acquisitions: { first: { ...acquisition, answers: { unsafe: ["pick"] } } },
      })
    ).toThrow();
    const catalogue = {
      kind: "catalogue",
      schema: 1,
      catalogue: "synthetic",
      release: "1",
      adapterVersion: 1,
      entryId: "class",
      definition,
    };
    expect(() =>
      parseClassBuild(
        { ...build, acquisitions: { first: { ...acquisition, snapshot: catalogue } } },
        () => false
      )
    ).toThrow();
  });
});
