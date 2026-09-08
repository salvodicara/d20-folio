import { describe, expect, it } from "vitest";
import { CreationDraftStorage } from "@/lib/character-creation/draft";
const parser = (value: unknown): { name: string } => {
  if (
    !value ||
    typeof value !== "object" ||
    !("name" in value) ||
    typeof value.name !== "string"
  )
    throw Error("invalid");
  return { name: value.name };
};
function setup() {
  const records = new Map<string, string>();
  const storage = {
    getItem: (k: string) => records.get(k) ?? null,
    setItem: (k: string, v: string) => {
      records.set(k, v);
    },
    removeItem: (k: string) => {
      records.delete(k);
    },
  };
  return {
    records,
    storage,
    store: new CreationDraftStorage(storage, "owner:draft", parser),
  };
}
describe("single retained creation draft", () => {
  it("verifies the whole draft before send and retires only the submitted revision", () => {
    const { store } = setup();
    store.save({ name: "Original" });
    store.submit("op", 1);
    expect(() => store.verify("op")).not.toThrow();
    store.save({ name: "Later edit" });
    expect(() => store.verify("op")).toThrow();
    store.retire("op");
    expect(store.load().value?.draft.name).toBe("Later edit");
  });
  it("preserves malformed original before replacement, and does not replace when archive fails", () => {
    const { records, storage, store } = setup();
    records.set("owner:draft", "{broken");
    expect(store.load().original).toBe("{broken");
    storage.setItem = () => {
      throw Error("full");
    };
    expect(() => store.recover({ name: "New" })).toThrow();
    expect(records.get("owner:draft")).toBe("{broken");
  });
  it("detects silently failed storage writes before submission", () => {
    const { storage, store } = setup();
    store.save({ name: "Original" });
    storage.setItem = () => {};
    expect(() => store.submit("op", 1)).toThrow("creation-draft-storage");
    expect(() => store.verify("op")).toThrow();
  });
  it("retains the exact submitted revision across reconstruction without storing a second envelope", () => {
    const { storage, store } = setup();
    store.save({ name: "Original" });
    store.submit("op", 1);
    const restored = new CreationDraftStorage(storage, "owner:draft", parser);
    expect(() => restored.verify("op")).not.toThrow();
    restored.retire("op");
    expect(restored.load().value).toBeNull();
  });
  it("does not overwrite a malformed draft without explicit recovery", () => {
    const { records, store } = setup();
    records.set("owner:draft", "{broken");
    expect(() => store.save({ name: "New" })).toThrow();
    expect(records.get("owner:draft")).toBe("{broken");
  });
});

it("never rebinds a delayed submission to a newer draft revision", () => {
  const { store } = setup();
  store.save({ name: "Original" });
  store.submit("op", 1);
  store.save({ name: "Newer" });
  expect(() => store.submit("op", 1)).toThrow();
  expect(() => store.submit("op", 2)).toThrow();
  store.retire("op");
  expect(store.load().value?.draft.name).toBe("Newer");
});
