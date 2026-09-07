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

// Intent creation is pure; a real SDK handle exercises the repository boundary without network IO.
import { initializeApp, deleteApp } from "firebase/app";
import { getFirestore, disableNetwork } from "firebase/firestore";
import { afterAll } from "vitest";
import { SessionController } from "../../src/lib/identity/session";
import type { FolioCharacter } from "../../src/lib/identity/model";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import { createInstanceRepository } from "../../src/lib/homebrew/instance-repository";
const app = initializeApp(
  { projectId: "demo-d20folio" },
  "homebrew-instance-boundary-unit"
);
afterAll(() => deleteApp(app));
const hero: FolioCharacter = {
  schema: 1,
  ownerUid: "owner",
  id: "hero",
  name: "Hero",
  speciesId: "synthetic",
  classId: "synthetic",
  level: 1,
  revision: 1,
  currentAssignment: null,
  sheet: { build: {}, state: {} },
  portraitPath: null,
};
function repository() {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: "hero" });
  return createInstanceRepository(getFirestore(app), session);
}
const configured = (): LibraryVersion => ({
  ...version,
  definition: { ...initializeDefinition("weapon"), name: "Synthetic blade" },
});
describe("repository authoring conformance boundary", () => {
  it("rejects unconfigured additions and invalid typed version updates before making an operation", () => {
    const repo = repository();
    expect(() => repo.addIntent(hero, version)).toThrow("invalid-operation");
    const good = configured(),
      base = materializeInstance(hero, "copy", good, state, 1, {
        uid: "owner",
        opId: "add",
      });
    const invalid = {
      ...good,
      version: 2,
      definition: {
        ...good.definition,
        payload: {
          schema: 1 as const,
          data: { ...good.definition.payload.data, damageFormula: "not-a-formula" },
        },
      },
    };
    expect(() => repo.updateIntent(hero, base, invalid)).toThrow("invalid-operation");
  });
  it("allows unsupported declarations to remain represented and old instance state to be edited", () => {
    const repo = repository(),
      unknown = configured();
    unknown.definition.payload.data.authoringVersion = 2;
    expect(repo.addIntent(hero, unknown).snapshot).toEqual(unknown);
    const old = materializeInstance(hero, "old", version, state, 1, {
      uid: "owner",
      opId: "old-add",
    });
    expect(
      repo.stateIntent(hero, old, { ...state, remainingCharges: 2 }).state
        .remainingCharges
    ).toBe(2);
  });
  it("rechecks conformance at commit instead of trusting the earlier intent", async () => {
    await disableNetwork(getFirestore(app));
    const repo = repository(),
      op = repo.addIntent(hero, configured());
    await expect(repo.commit({ ...op, snapshot: version })).rejects.toThrow(
      "invalid-operation"
    );
  });
});
