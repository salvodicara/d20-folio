vi.mock("@/lib/firebase", () => ({}));
import { describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import { createInstanceRepository } from "../../src/lib/homebrew/instance-repository";
import { SessionController } from "../../src/lib/identity/session";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import {
  DEFAULT_INSTANCE_STATE,
  initialLoadoutPath,
  type InitialLoadout,
} from "../../src/lib/homebrew/instances";
import type { FolioCharacter } from "../../src/lib/identity/model";
const wire = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  hold: null as Promise<void> | null,
  writes: [] as string[],
  watchers: new Map<string, (snapshot: unknown) => void>(),
  errors: new Map<string, (error: Error) => void>(),
}));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  const snapshot = (path: string) => ({
    exists: () => wire.docs.has(path),
    data: () => structuredClone(wire.docs.get(path)),
    ref: { path },
    id: path.split("/").at(-1),
  });
  return {
    ...actual,
    doc: (_db: unknown, path: string) => ({ path }),
    collection: (_db: unknown, path: string) => ({ path }),
    getDocFromServer: (ref: { path: string }) => Promise.resolve(snapshot(ref.path)),
    getDocsFromServer: async (ref: { path: string }) => {
      const gate = wire.hold;
      if (gate) await gate;
      return {
        docs: [...wire.docs.keys()]
          .filter(
            (p) =>
              p.startsWith(ref.path + "/") && !p.slice(ref.path.length + 1).includes("/")
          )
          .map(snapshot),
      };
    },
    onSnapshot: (
      ref: { path: string },
      callback: (snapshot: unknown) => void,
      failed: (error: Error) => void
    ) => {
      wire.errors.set(ref.path, failed);
      wire.watchers.set(ref.path, callback);
      return () => wire.watchers.delete(ref.path);
    },
    runTransaction: (_db: unknown, run: (tx: unknown) => unknown) =>
      Promise.resolve(
        run({
          get: (ref: { path: string }) => Promise.resolve(snapshot(ref.path)),
          set: (ref: { path: string }, v: unknown) => {
            wire.writes.push(ref.path);
            wire.docs.set(ref.path, structuredClone(v));
          },
        })
      ),
  };
});
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
  sheet: { build: {}, state: {} },
  portraitPath: null,
};
function setup() {
  wire.docs.clear();
  wire.hold = null;
  wire.writes = [];
  wire.watchers.clear();
  wire.errors.clear();
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: "hero" });
  const snapshot = {
    kind: "catalogue" as const,
    schema: 1 as const,
    catalogue: "synthetic",
    release: "1",
    adapterVersion: 1,
    entryId: "gear",
    definition: { ...initializeDefinition("equipment"), name: "Gear" },
  };
  const item = {
    schema: 1 as const,
    character: { ownerUid: "owner", id: "hero" },
    id: "initial_a",
    revision: 1,
    snapshot,
    state: DEFAULT_INSTANCE_STATE,
    lastOperation: { uid: "owner", opId: "create" },
  };
  const group: InitialLoadout = {
    schema: 1,
    character: item.character,
    revision: 2,
    sources: {},
    instances: { initial_a: item, initial_b: { ...item, id: "initial_b" } },
    lastOperation: item.lastOperation,
  };
  wire.docs.set(initialLoadoutPath(character), group);
  wire.docs.set("users/owner", { status: "active" });
  wire.docs.set("folioAccounts/owner/characters/hero", character);
  const repository = createInstanceRepository({} as Firestore, session, () => true);
  return { repository, group, session };
}
describe("unified grouped instance repository", () => {
  it("lists initial copies, edits one state through a whole-group receipt CAS, and preserves siblings", async () => {
    const { repository, group } = setup();
    const items = await repository.list(character);
    expect(items).toHaveLength(2);
    const operation = repository.stateIntent(character, required(items[0]), {
      ...DEFAULT_INSTANCE_STATE,
      quantity: 4,
    });
    expect(operation.initialBase).toEqual(group);
    expect(operation.baseRevision).toBe(2);
    const receipt = await repository.commit(operation);
    expect(receipt.revision).toBe(3);
    const after = wire.docs.get(initialLoadoutPath(character)) as InitialLoadout;
    expect(after.instances.initial_b).toEqual(group.instances.initial_b);
    expect(after.instances.initial_a?.state.quantity).toBe(4);
    expect(wire.writes).not.toContain(
      "folioAccounts/owner/characters/hero/homebrew/initial_a"
    );
    expect(await repository.reconcile(operation)).toEqual(receipt);
  });
  it("rejects a concurrent sibling update rather than overwriting it", async () => {
    const { repository, group } = setup();
    const items = await repository.list(character);
    const operation = repository.stateIntent(character, required(items[0]), {
      ...DEFAULT_INSTANCE_STATE,
      quantity: 4,
    });
    wire.docs.set(initialLoadoutPath(character), { ...group, revision: 3 });
    await expect(repository.commit(operation)).rejects.toThrow("stale-base");
    expect(wire.writes).toEqual([]);
  });
  it("isolates unverified catalogue claims as recoverable issues", async () => {
    setup();
    const session = new SessionController();
    session.transition({ uid: "owner", campaignId: null, activeCharacterId: "hero" });
    const repository = createInstanceRepository({} as Firestore, session);
    let issues: unknown[] = [];
    repository.watchIssues((v) => {
      issues = v;
    });
    expect(await repository.list(character)).toEqual([]);
    expect(issues).toHaveLength(1);
  });
});

it("keeps received private gear self-contained after original grant loss and origin replacement", async () => {
  const { includeOriginDependency } = await import("../../src/lib/homebrew/origins");
  const { sourceIdentity } = await import("../../src/lib/homebrew/sources");
  const { repository, group } = setup();
  const gear = {
    schema: 1 as const,
    ownerUid: "sender",
    entryId: "secret-gear",
    version: 1,
    definition: { ...initializeDefinition("equipment"), name: "Private gear" },
    provenance: null,
    operationId: "publish",
  };
  const included = includeOriginDependency(
    { ...initializeDefinition("background"), name: "Received origin" },
    gear
  );
  const root = {
    schema: 1 as const,
    ownerUid: "owner",
    entryId: "received-origin",
    version: 1,
    definition: included.definition,
    provenance: {
      source: { ownerUid: "sender", id: "origin" },
      sourceVersion: 1,
      senderUid: "sender",
      offerId: "offer",
      grantId: "sender~offer",
    },
    operationId: "receive",
  };
  const sourceKey = sourceIdentity(root);
  const bundled = {
    kind: "bundled" as const,
    schema: 1 as const,
    sourceKey,
    dependencyPath: included.key,
    definition: required(
      (
        included.definition.payload.data.dependencies as unknown as Record<
          string,
          { definition: typeof gear.definition }
        >
      )[included.key]
    ).definition,
  };
  const initial = {
    ...group,
    sources: { [sourceKey]: root },
    instances: {
      initial_a: { ...required(group.instances.initial_a), snapshot: bundled },
    },
  };
  wire.docs.set(initialLoadoutPath(character), initial);
  const before = required((await repository.list(character))[0]);
  wire.docs.set("folioAccounts/owner/characters/hero/origins/build", { replaced: true });
  expect((await repository.list(character))[0]).toEqual(before);
  const operation = repository.stateIntent(character, before, {
    ...before.state,
    equipped: true,
  });
  await repository.commit(operation);
  const after = wire.docs.get(initialLoadoutPath(character)) as InitialLoadout;
  expect(after.sources).toEqual(initial.sources);
  expect(after.instances.initial_a?.snapshot).toEqual(before.snapshot);
  expect(after.instances.initial_a?.state.equipped).toBe(true);
  expect(
    [...wire.docs.keys()].some(
      (path) => path.includes("/library/") || path.includes("/offers/")
    )
  ).toBe(false);
});

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test fixture");
  return value;
}

it("composes both instance watches before emitting and releases both subscriptions", () => {
  const { repository, group } = setup();
  const changes: unknown[] = [];
  const stop = repository.watch(
    character,
    (value) => changes.push(value),
    (error) => {
      throw error;
    }
  );
  required(wire.watchers.get(initialLoadoutPath(character)))({
    exists: () => true,
    data: () => group,
  });
  expect(changes).toEqual([]);
  required(wire.watchers.get("folioAccounts/owner/characters/hero/homebrew"))({
    docs: [],
  });
  expect(changes).toEqual([Object.values(group.instances)]);
  stop();
  expect(wire.watchers.size).toBe(0);
});

it("updates a direct owned Library source inside the group with exact version validation and unchanged state", async () => {
  const { repository, group } = setup();
  const snapshot = {
    schema: 1 as const,
    ownerUid: "owner",
    entryId: "owned-gear",
    version: 1,
    definition: { ...initializeDefinition("equipment"), name: "Owned gear" },
    provenance: null,
    operationId: "publish",
  };
  const item = { ...required(group.instances.initial_a), snapshot };
  wire.docs.set(initialLoadoutPath(character), {
    ...group,
    instances: { ...group.instances, initial_a: item },
  });
  const next = {
    ...snapshot,
    version: 2,
    definition: { ...snapshot.definition, name: "Updated gear" },
    operationId: "publish-again",
  };
  wire.docs.set("folioAccounts/owner/library/owned-gear/versions/2", next);
  const loaded = required(
    (await repository.list(character)).find((value) => value.id === "initial_a")
  );
  const operation = repository.updateIntent(character, loaded, next);
  await repository.commit(operation);
  const after = wire.docs.get(initialLoadoutPath(character)) as InitialLoadout;
  expect(after.instances.initial_a?.snapshot).toEqual(next);
  expect(after.instances.initial_a?.state).toEqual(item.state);
  expect(after.instances.initial_b).toEqual(group.instances.initial_b);
  expect(after.sources).toEqual(group.sources);
});

it("withdraws the cached frozen group after permission denial and ignores the other listener's late snapshot", () => {
  const { repository, group } = setup(),
    next = vi.fn(),
    failed = vi.fn();
  repository.watch(character, next, failed);
  const groupedPath = initialLoadoutPath(character),
    individualPath = "folioAccounts/owner/characters/hero/homebrew";
  wire.watchers.get(groupedPath)?.({ exists: () => true, data: () => group });
  wire.watchers.get(individualPath)?.({ docs: [] });
  expect(repository.loadedInitial?.(character)).toEqual(group);
  expect(next).toHaveBeenCalledOnce();
  wire.errors.get(groupedPath)?.(new Error("permission-denied"));
  expect(repository.loadedInitial?.(character)).toBeNull();
  wire.watchers.get(individualPath)?.({ docs: [] });
  wire.watchers.get(groupedPath)?.({ exists: () => true, data: () => group });
  expect(repository.loadedInitial?.(character)).toBeNull();
  expect(next).toHaveBeenCalledOnce();
});

it("does not let an old A read clear the new A cache after A to B to A", async () => {
  const { repository, group, session } = setup();
  let release = () => {};
  wire.hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const old = repository.list(character).catch((error: unknown) => error);
  session.transition({ uid: "other", campaignId: null, activeCharacterId: null });
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: "hero" });
  wire.hold = null;
  await repository.list(character);
  expect(repository.loadedInitial?.(character)).toEqual(group);
  release();
  expect(await old).toBeInstanceOf(Error);
  expect(repository.loadedInitial?.(character)).toEqual(group);
});
