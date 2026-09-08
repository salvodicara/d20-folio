import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import { SessionController } from "../../src/lib/identity/session";
import type { FolioCharacter } from "../../src/lib/identity/model";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import type { OriginBuild } from "../../src/lib/homebrew/origin-build";
import * as persistence from "../../src/lib/homebrew/origin-build-repository";
const character: FolioCharacter = {
  schema: 1,
  ownerUid: "owner",
  id: "hero",
  name: "Hero",
  speciesId: "human",
  classId: "fighter",
  level: 1,
  revision: 1,
  currentAssignment: null,
  sheet: {
    build: { abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } },
    state: {},
  },
  portraitPath: null,
};
const selection = {
  id: "root",
  ordinal: 0,
  snapshot: {
    schema: 1 as const,
    ownerUid: "owner",
    entryId: "origin",
    version: 1,
    definition: { ...initializeDefinition("species"), name: "Synthetic species" },
    provenance: null,
    operationId: "publish",
  },
  answers: {},
  exceptions: [],
};
function client() {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: "hero" });
  return {
    session,
    repo: persistence.createOriginBuildRepository({} as Firestore, session),
  };
}
describe("origin build intents", () => {
  it("captures one immutable mutation and exact authority", () => {
    const { repo } = client();
    const op = repo.saveIntent(character, null, "root", selection);
    expect(op.kind).toBe("origin-build");
    expect(op.selections).toEqual({ root: selection });
    expect(op.base).toBeNull();
    expect(op.authority).toEqual({
      characterRevision: 1,
      assignment: null,
      campaignRevision: null,
    });
    expect(Object.isFrozen(op.selections.root?.snapshot)).toBe(true);
  });
  it("rejects cross-character writes, mismatched target and nonappend ordinals", () => {
    const { repo } = client();
    expect(() =>
      repo.saveIntent({ ...character, ownerUid: "other" }, null, "root", selection)
    ).toThrow();
    expect(() => repo.saveIntent(character, null, "other", selection)).toThrow();
    expect(() =>
      repo.saveIntent(character, null, "root", { ...selection, ordinal: 7 })
    ).toThrow();
  });
  it("invalidates the original ticket across A to B to A", async () => {
    const { repo, session } = client();
    const op = repo.saveIntent(character, null, "root", selection);
    session.transition({ uid: "owner", campaignId: null, activeCharacterId: "other" });
    session.transition({ uid: "owner", campaignId: null, activeCharacterId: "hero" });
    await expect(repo.commit(op)).rejects.toThrow("stale-session");
  });
  it("counts UTF8 bytes and complete JSON nodes before sending", () => {
    expect(() =>
      persistence.assertOriginBuildBudget({ text: "é".repeat(90001) })
    ).toThrow("origin-build-too-large");
    expect(() =>
      persistence.assertOriginBuildBudget({ rows: Array(4097).fill(0) })
    ).toThrow("origin-build-too-large");
    expect(() =>
      persistence.assertOriginBuildBudget({ text: "x".repeat(1000) })
    ).not.toThrow();
  });
});

it("preserves sibling roots and replacement ordinals without renumbering removals", () => {
  const { repo } = client();
  const other = {
    ...selection,
    id: "other",
    ordinal: 5,
    snapshot: {
      ...selection.snapshot,
      entryId: "another",
      definition: { ...initializeDefinition("feat"), name: "Another" },
    },
  };
  const base: OriginBuild = {
    schema: 1,
    character: { ownerUid: "owner", id: "hero" },
    revision: 3,
    selections: { root: selection, other },
    lastOperation: { uid: "owner", opId: "old" },
  };
  const op = repo.saveIntent(character, base, "root", null);
  expect(op.selections).toEqual({ other });
  expect(op.base).toEqual(base);
  expect(base.selections.root).toEqual(selection);
  expect(op.predecessorId).toBe("other");
  expect(() =>
    repo.saveIntent(character, base, "root", { ...selection, ordinal: 6 })
  ).toThrow();
});
it("refuses malformed base and forged copies of a valid intent", async () => {
  const { repo } = client();
  expect(() =>
    repo.saveIntent(
      character,
      { schema: 99 } as unknown as OriginBuild,
      "root",
      selection
    )
  ).toThrow();
  const op = repo.saveIntent(character, null, "root", selection);
  await expect(repo.commit({ ...op, selections: {} })).rejects.toThrow("intent-mismatch");
});
it("retains inactive answers in the confirmed intent", () => {
  const { repo } = client();
  const d = initializeDefinition("species");
  d.name = "Choice species";
  d.payload.data.choices = [
    {
      id: "parent",
      name: "Parent",
      count: 1,
      parent: null,
      options: [
        { id: "a", name: "A", benefits: [] },
        { id: "b", name: "B", benefits: [] },
      ],
    },
    {
      id: "child",
      name: "Child",
      count: 1,
      parent: { choiceId: "parent", optionId: "a" },
      options: [{ id: "x", name: "X", benefits: [] }],
    },
  ];
  const s = {
    ...selection,
    snapshot: { ...selection.snapshot, definition: d },
    answers: { "root/parent": ["b"], "root/child": ["x"] },
  };
  const op = repo.saveIntent(character, null, "root", s);
  expect(op.selections.root?.answers).toEqual(s.answers);
});
it("rejects invalid nested answers while preserving caller originals", () => {
  const { repo } = client();
  const s = { ...selection, answers: { "root/choice": Array(33).fill("option") } };
  const original = JSON.stringify(s);
  expect(() => repo.saveIntent(character, null, "root", s)).toThrow();
  expect(JSON.stringify(s)).toBe(original);
});
it("counts multibyte repeated before/next operation content", () => {
  const content = { text: "界".repeat(70000) };
  expect(() => persistence.assertOriginBuildBudget(content)).toThrow();
  expect(() =>
    persistence.assertOriginBuildBudget(
      { base: content, selections: content, selection: content },
      600000
    )
  ).toThrow();
});
it("constructs a complete 32-root operation within the shared node budget", () => {
  const { repo } = client();
  const minimal = {
    ...selection.snapshot,
    definition: {
      ...selection.snapshot.definition,
      family: "feat" as const,
      payload: initializeDefinition("feat").payload,
    },
  };
  const roots = Object.fromEntries(
    Array.from({ length: 31 }, (_, ordinal) => [
      "root" + String(ordinal),
      {
        ...selection,
        id: "root" + String(ordinal),
        ordinal,
        snapshot: { ...minimal, entryId: "feat" + String(ordinal) },
      },
    ])
  );
  const base: OriginBuild = {
    schema: 1,
    character: { ownerUid: "owner", id: "hero" },
    revision: 31,
    selections: roots,
    lastOperation: { uid: "owner", opId: "previous" },
  };
  const op = repo.saveIntent(character, base, "last", {
    ...selection,
    id: "last",
    ordinal: 31,
    snapshot: { ...minimal, entryId: "last" },
  });
  expect(Object.keys(op.selections)).toHaveLength(32);
  expect(op.predecessorId).toBe("root30");
  expect(() => persistence.assertOriginBuildBudget(op, 600000)).not.toThrow();
});

it("retains the explicit intent offline without sending it", async () => {
  const { repo } = client();
  const op = repo.saveIntent(character, null, "root", selection);
  vi.stubGlobal("navigator", { onLine: false });
  try {
    await expect(repo.commit(op)).rejects.toThrow("offline");
    expect(op.base).toBeNull();
    expect(op.selections.root).toEqual(selection);
  } finally {
    vi.unstubAllGlobals();
  }
});
