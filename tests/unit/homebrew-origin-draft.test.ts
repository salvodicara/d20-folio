import { describe, expect, it } from "vitest";
import {
  loadOriginDraft,
  persistOriginDraft,
  retireOriginDraft,
  activateParkedOriginDraft,
} from "@/features/library/origin-draft";
import { parseCharacter } from "@/lib/identity/model";
import { blankDefinition } from "@/lib/library/model";
const character = parseCharacter({
  schema: 1,
  ownerUid: "a",
  id: "hero",
  name: "Hero",
  speciesId: "human",
  classId: "fighter",
  level: 1,
  revision: 1,
  currentAssignment: null,
  sheet: { build: {}, state: {} },
  portraitPath: null,
});
const draft = {
  schema: 1 as const,
  character,
  base: null,
  targetId: "selected",
  selection: {
    id: "selected",
    ordinal: 0,
    snapshot: {
      schema: 1 as const,
      ownerUid: "a",
      entryId: "species",
      version: 1,
      definition: blankDefinition("species"),
      provenance: null,
      operationId: "publish",
    },
    answers: {},
    exceptions: [],
  },
  invalidated: false,
};
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
describe("origin draft recovery", () => {
  it("preserves exact malformed original before replacing a draft", () => {
    const s = storage();
    const original = '{"unknown":"雪", broken';
    s.setItem("key", original);
    expect(loadOriginDraft(s, "key", character).original).toBe(original);
    persistOriginDraft(s, "key", draft);
    expect(
      [...s.values.entries()]
        .filter(([key]) => key.startsWith("key:original:"))
        .map(([, value]) => value)
    ).toEqual([original]);
    expect(loadOriginDraft(s, "key", character).draft).toEqual(draft);
  });
  it("does not overwrite the original if archive readback fails", () => {
    const s = storage();
    s.setItem("key", "broken");
    const broken = {
      ...s,
      setItem: (key: string, value: string) => {
        if (!key.includes(":original:")) s.setItem(key, value);
      },
    };
    expect(() => persistOriginDraft(broken, "key", draft)).toThrow();
    expect(s.getItem("key")).toBe("broken");
  });
  it("retires only the sent draft, preserving a later new edit", () => {
    const s = storage();
    persistOriginDraft(s, "key", draft);
    const next = {
      ...draft,
      selection: { ...draft.selection, answers: { "root/choice": ["new"] } },
    };
    persistOriginDraft(s, "key", next);
    retireOriginDraft(s, "key", draft);
    expect(loadOriginDraft(s, "key", character).draft).toEqual(next);
    retireOriginDraft(s, "key", next);
    expect(s.getItem("key")).toBeNull();
  });
});

it("transfers a kept draft once and preserves it if activation cannot be stored", () => {
  const s = storage();
  s.setItem("kept", JSON.stringify(draft));
  const failing = {
    ...s,
    setItem: (key: string, value: string) => {
      if (key !== "active") s.setItem(key, value);
    },
  };
  expect(() => activateParkedOriginDraft(failing, "active", "kept", character)).toThrow();
  expect(s.getItem("kept")).toBe(JSON.stringify(draft));
  expect(activateParkedOriginDraft(s, "active", "kept", character)).toEqual(draft);
  expect(s.getItem("kept")).toBeNull();
  expect(loadOriginDraft(s, "active", character).draft).toEqual(draft);
});

it("retains old exception reasons without granting a newly changed requirement", async () => {
  const { replaceOriginSnapshot } = await import("@/features/library/origin-candidate");
  const { composeOriginBuild } = await import("@/lib/homebrew/origin-build");
  const { initializeDefinition } = await import("@/lib/homebrew/model");
  const definition = initializeDefinition("feat");
  definition.name = "Training";
  definition.payload.data.prerequisites = [{ kind: "level", minimum: 4 }];
  const first = {
    ...draft.selection,
    snapshot: { ...draft.selection.snapshot, definition },
    exceptions: [
      {
        path: "root/prerequisites/0",
        code: "prerequisite-level",
        reason: "Allowed at level one by the table",
        authorUid: "a",
      },
    ],
  };
  const next = structuredClone(first.snapshot);
  next.version = 2;
  next.definition.payload.data.prerequisites = [{ kind: "level", minimum: 20 }];
  const updated = replaceOriginSnapshot(first, next);
  expect(updated.exceptions[0]?.reason).toBe(first.exceptions[0]?.reason);
  expect(updated.exceptions[0]?.path).toMatch(/^inactive-history\//);
  const build = {
    schema: 1 as const,
    character: { ownerUid: "a", id: "hero" },
    revision: 1,
    selections: { [updated.id]: updated },
    lastOperation: { uid: "a", opId: "test" },
  };
  expect(
    composeOriginBuild(character, build).diagnostics.some(
      (d) => d.code === "prerequisite-level"
    )
  ).toBe(true);
  expect(replaceOriginSnapshot(updated, { ...next, version: 3 }).exceptions).toEqual(
    updated.exceptions
  );
});
