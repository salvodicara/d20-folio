import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDevDocuments,
  readDevDocument,
  subscribeDevDocument,
  updateDevDocument,
  writeDevDocument,
} from "@/lib/dev-document-store";
import {
  mergeDevCharacterParent,
  projectDevCharacterParent,
} from "@/lib/dev-character-document";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("dev document store", () => {
  beforeEach(() => clearDevDocuments());

  it("survives a fresh read and preserves Dates", () => {
    const date = new Date("2026-08-03T01:00:00.000Z");
    writeDevDocument("characters", "u1/c1", { hp: 7, date });

    expect(readDevDocument<{ hp: number; date: Date }>("characters", "u1/c1")).toEqual({
      hp: 7,
      date,
    });
  });

  it("delivers an initial snapshot and same-tab optimistic writes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDevDocument("combat", "u1/c1", listener);
    expect(listener).toHaveBeenLastCalledWith(null);

    writeDevDocument("combat", "u1/c1", { hp: 9 });
    expect(listener).toHaveBeenLastCalledWith({ hp: 9 });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    writeDevDocument("combat", "u1/c1", { hp: 4 });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("suppresses byte-identical rewrites like Firestore's data-change-only snapshots", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDevDocument("combat", "u1/c1", listener);
    writeDevDocument("combat", "u1/c1", { hp: 9, log: ["swing"] });
    expect(listener).toHaveBeenCalledTimes(2);

    // A byte-identical rewrite raises NO snapshot — this is what keeps a
    // write→echo→hydrate→write cycle from becoming a synchronous render storm.
    writeDevDocument("combat", "u1/c1", { hp: 9, log: ["swing"] });
    expect(listener).toHaveBeenCalledTimes(2);

    // A real data change still notifies.
    writeDevDocument("combat", "u1/c1", { hp: 8, log: ["swing"] });
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenLastCalledWith({ hp: 8, log: ["swing"] });
    unsubscribe();
  });

  it("functional updates start from the latest document", () => {
    writeDevDocument("campaigns", "c1", { round: 2, name: "Keep" });
    updateDevDocument("campaigns", "c1", { round: 1, name: "Seed" }, (current) => ({
      ...current,
      round: current.round + 1,
    }));
    expect(readDevDocument("campaigns", "c1")).toEqual({ round: 3, name: "Keep" });
  });

  it("stores no mutable session facts on a dev parent, and rejects one that does", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.session.notes = "child-owned";
    doc.session.hp = { current: 3, temp: 4 };

    expect(projectDevCharacterParent(doc).session).toEqual({});
    expect(() =>
      mergeDevCharacterParent(structuredClone(MOCK_CHARACTER), {
        ...projectDevCharacterParent(structuredClone(MOCK_CHARACTER)),
        session: { notes: "stale" },
      })
    ).toThrow("parent-state-not-empty");
  });

  it("clears replica keys", () => {
    writeDevDocument("characters", "c1", { value: true });
    clearDevDocuments();

    expect(readDevDocument("characters", "c1")).toBeNull();
  });
});
