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

  it("functional updates start from the latest document", () => {
    writeDevDocument("campaigns", "c1", { round: 2, name: "Keep" });
    updateDevDocument("campaigns", "c1", { round: 1, name: "Seed" }, (current) => ({
      ...current,
      round: current.round + 1,
    }));
    expect(readDevDocument("campaigns", "c1")).toEqual({ round: 3, name: "Keep" });
  });

  it("keeps combat fields out of the parent and preserves the live trio on merge", () => {
    const seed = structuredClone(MOCK_CHARACTER);
    seed.session.hp = { current: 7, temp: 3 };
    seed.session.conditions = ["frightened"];
    seed.session.notes = "persist me";
    const parent = projectDevCharacterParent(seed);

    expect(parent.session).not.toHaveProperty("hp");
    expect(parent.session).not.toHaveProperty("conditions");
    const live = structuredClone(MOCK_CHARACTER);
    live.session.hp = { current: 19, temp: 0 };
    live.session.conditions = ["prone"];
    const merged = mergeDevCharacterParent(live, parent);
    expect(merged.session.hp).toEqual({ current: 19, temp: 0 });
    expect(merged.session.conditions).toEqual(["prone"]);
    expect(merged.session.notes).toBe("persist me");
  });

  it("stores no mutable session facts on a marked dev parent", () => {
    const marked = {
      ...structuredClone(MOCK_CHARACTER),
      playStateVersion: 1 as const,
    };
    marked.session.notes = "child-owned";
    marked.session.hp = { current: 3, temp: 4 };

    const parent = projectDevCharacterParent(marked);
    expect(parent.playStateVersion).toBe(1);
    expect(parent.session).toEqual({});
  });

  it("rejects a corrupt dev ownership marker", () => {
    expect(() =>
      mergeDevCharacterParent(structuredClone(MOCK_CHARACTER), {
        ...projectDevCharacterParent(structuredClone(MOCK_CHARACTER)),
        playStateVersion: 2,
      } as never)
    ).toThrow("ownership marker");
    expect(() =>
      mergeDevCharacterParent(structuredClone(MOCK_CHARACTER), {
        ...projectDevCharacterParent(structuredClone(MOCK_CHARACTER)),
        playStateVersion: 1,
        session: { notes: "stale" },
      })
    ).toThrow("mutable session state");
  });

  it("clears replica keys", () => {
    writeDevDocument("characters", "c1", { value: true });
    clearDevDocuments();

    expect(readDevDocument("characters", "c1")).toBeNull();
  });
});
