import { describe, it, expect } from "vitest";
import {
  LIBRARY_FAMILIES,
  decodeLibraryDefinition,
  encodeLibraryDefinition,
  updateLibraryInstance,
  type LibraryDefinition,
} from "../../src/lib/library/model";
const definition: LibraryDefinition = {
  schema: 1,
  family: "weapon",
  name: "Blade",
  description: "",
  tags: [],
  payload: { schema: 1, data: { damage: "1d6" } },
};
describe("common library codec", () => {
  it("roundtrips all eleven families without interpreting authoring payload", () => {
    expect(LIBRARY_FAMILIES).toHaveLength(11);
    for (const family of LIBRARY_FAMILIES) {
      const value = { ...definition, family };
      expect(decodeLibraryDefinition(encodeLibraryDefinition(value))).toEqual({
        ok: true,
        value,
      });
    }
  });
  it("retains exact incompatible bytes including unsupported attachments and unknown fields", () => {
    for (const patch of [
      { schema: 9 },
      { attachments: [] },
      { payload: { schema: 2, data: {} } },
      { extra: true },
      { family: "campaignRule" },
    ]) {
      const original = JSON.stringify({ ...definition, ...patch }, null, 2);
      expect(decodeLibraryDefinition(original)).toMatchObject({ ok: false, original });
    }
  });
  it("accepts incomplete drafts and rejects non JSON values", () => {
    expect(decodeLibraryDefinition(JSON.stringify({ ...definition, name: "" })).ok).toBe(
      true
    );
    expect(() =>
      encodeLibraryDefinition({
        ...definition,
        payload: { schema: 1, data: { bad: NaN } },
      })
    ).toThrow();
  });
  it("preserves instance state and requires an explicit pinned update", () => {
    const instance = {
      id: "instance",
      definition: { ownerUid: "alice", id: "blade", version: 1 },
      quantity: 3,
      remainingCharges: 2,
      prepared: true,
    };
    const next = updateLibraryInstance(instance, {
      ownerUid: "alice",
      id: "blade",
      version: 2,
    });
    expect(next).toEqual({
      ...instance,
      definition: { ...instance.definition, version: 2 },
    });
    expect(instance.definition.version).toBe(1);
    expect(() =>
      updateLibraryInstance({ ...instance, quantity: -1 }, next.definition)
    ).toThrow();
  });
});
