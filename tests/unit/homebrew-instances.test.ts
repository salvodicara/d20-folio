import { describe, expect, it } from "vitest";
import { blankDefinition, type LibraryVersion } from "../../src/lib/library/model";
import {
  parseInstance,
  parseInstanceState,
  materializeInstance,
} from "../../src/lib/homebrew/instances";
const version: LibraryVersion = {
  schema: 1,
  ownerUid: "owner",
  entryId: "blade",
  version: 1,
  definition: { ...blankDefinition("weapon"), name: "Blade" },
  provenance: null,
  operationId: "publish",
};
const state = {
  quantity: 2,
  remainingCharges: 7,
  prepared: true,
  equipped: true,
  attuned: false,
};
describe("character homebrew instances", () => {
  it("materializes immutable full version and separates state", () => {
    const v = structuredClone(version);
    const instance = materializeInstance(
      { ownerUid: "owner", id: "hero" },
      "copy",
      v,
      state,
      1,
      { uid: "owner", opId: "add" }
    );
    v.definition.name = "changed";
    expect(instance.snapshot.definition.name).toBe("Blade");
    expect(instance.state).toEqual(state);
    expect(Object.isFrozen(instance.snapshot.definition)).toBe(true);
    expect(parseInstance(instance)).toEqual(instance);
  });
  it("version update preserves even over-capacity spent state", () => {
    const i = materializeInstance(
      { ownerUid: "owner", id: "hero" },
      "copy",
      { ...version, version: 2 },
      state,
      2,
      { uid: "owner", opId: "update" }
    );
    expect(i.state.remainingCharges).toBe(7);
  });
  it.each([-1, 1.5, NaN, Infinity])("rejects invalid quantity %s", (quantity) =>
    expect(() => parseInstanceState({ ...state, quantity })).toThrow()
  );
  it("rejects extra fields, foreign source and unsupported family", () => {
    expect(() => parseInstanceState({ ...state, unknown: true })).toThrow();
    expect(() =>
      materializeInstance({ ownerUid: "other", id: "hero" }, "copy", version, state, 1, {
        uid: "other",
        opId: "add",
      })
    ).toThrow();
    expect(() =>
      materializeInstance(
        { ownerUid: "owner", id: "hero" },
        "copy",
        { ...version, definition: { ...version.definition, family: "monster" } },
        state,
        1,
        { uid: "owner", opId: "add" }
      )
    ).toThrow();
  });
});
it("rejects non-string identity fields without coercion", () => {
  const i = materializeInstance(
    { ownerUid: "owner", id: "hero" },
    "copy",
    version,
    state,
    1,
    { uid: "owner", opId: "add" }
  );
  expect(() => parseInstance({ ...i, id: null })).toThrow();
  expect(() =>
    parseInstance({ ...i, lastOperation: { uid: "owner", opId: 123 } })
  ).toThrow();
  expect(() =>
    parseInstance({ ...i, character: { ownerUid: "owner", id: 123 } })
  ).toThrow();
});
