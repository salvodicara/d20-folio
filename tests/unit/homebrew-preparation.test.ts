import { blankAdvancedRow } from "../../src/lib/homebrew/advanced";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import { describe, it, expect } from "vitest";
import { type LibraryVersion } from "../../src/lib/library/model";
import {
  defaultPreparedState,
  materializePreparedCopy,
  parsePreparedCopy,
  parsePreparedState,
  parsePreparationVersion,
  preparationPath,
} from "../../src/lib/homebrew/preparation";
import { parseInstanceVersion } from "../../src/lib/homebrew/instances";
import { SessionController } from "../../src/lib/identity/session";
import { createPreparationRepository } from "../../src/lib/homebrew/preparation-repository";
import type { Firestore } from "firebase/firestore";
const version: LibraryVersion = {
  schema: 1,
  ownerUid: "dm",
  entryId: "creature",
  version: 1,
  definition: {
    ...initializeDefinition("monster"),
    name: "Synthetic",
    payload: {
      schema: 1,
      data: {
        ...initializeDefinition("monster").payload.data,
        maxHp: 24,
        resources: [
          {
            ...blankAdvancedRow("resource"),
            id: "legendary",
            name: "Legendary",
            capacity: 3,
          },
        ],
      },
    },
  },
  provenance: null,
  operationId: "publish",
};
const campaign = {
  schema: 1 as const,
  id: "party",
  name: "Party",
  dmUid: "dm",
  members: ["dm"],
  revision: 1,
  archived: false,
  joinOpen: false,
};
function repository() {
  const session = new SessionController();
  session.transition({ uid: "dm", campaignId: "party", activeCharacterId: null });
  return { session, repo: createPreparationRepository({} as Firestore, session) };
}
describe("prepared copies", () => {
  it("separates preparation families from character-instance families", () => {
    expect(parsePreparationVersion(version)).toEqual(version);
    expect(() => parseInstanceVersion(version)).toThrow();
    expect(() =>
      parsePreparationVersion({ ...version, definition: initializeDefinition("weapon") })
    ).toThrow();
  });
  it("defaults creature HP/resources and disables rules", () => {
    expect(defaultPreparedState(version)).toEqual({
      kind: "monster",
      label: "Synthetic",
      currentHp: 24,
      tempHp: 0,
      conditions: [],
      resources: { legendary: 3 },
    });
    expect(
      defaultPreparedState({
        ...version,
        definition: initializeDefinition("campaign-rule"),
      })
    ).toEqual({ kind: "campaign-rule", enabled: false });
  });
  it("rejects incompatible state without stripping originals", () => {
    const state = { ...defaultPreparedState(version), future: true };
    const original = JSON.stringify(state);
    expect(() => parsePreparedState(state)).toThrow();
    expect(JSON.stringify(state)).toBe(original);
    expect(() =>
      parsePreparedState({
        kind: "monster",
        label: "x",
        currentHp: -1,
        tempHp: 0,
        conditions: [],
        resources: {},
      })
    ).toThrow();
  });
  it("checks family, destination and bounded paths", () => {
    const copy = materializePreparedCopy(
      "party",
      "encounter",
      "copy",
      version,
      defaultPreparedState(version),
      1,
      { uid: "dm", opId: "add" }
    );
    expect(parsePreparedCopy(copy)).toEqual(copy);
    expect(() => parsePreparedCopy({ ...copy, preparationId: null })).toThrow();
    expect(() =>
      parsePreparedCopy({ ...copy, state: { kind: "campaign-rule", enabled: false } })
    ).toThrow();
    expect(() => preparationPath("../party", "prep", "copy")).toThrow();
  });
  it("preserves unknown snapshot fields and independent state", () => {
    const v = structuredClone(version);
    v.definition.payload.data.future = { schema: 99, steps: ["unknown"] };
    const copy = materializePreparedCopy(
      "party",
      "prep",
      "copy",
      v,
      defaultPreparedState(v),
      1,
      { uid: "dm", opId: "add" }
    );
    expect(copy.snapshot).toEqual(v);
    expect(Object.isFrozen(copy.snapshot)).toBe(true);
  });
  it("captures immutable whole bases and preserves state across version capacity changes", () => {
    const { repo } = repository();
    const base = materializePreparedCopy(
      "party",
      "prep",
      "copy",
      version,
      { ...defaultPreparedState(version), currentHp: 99 } as ReturnType<
        typeof defaultPreparedState
      >,
      1,
      { uid: "dm", opId: "add" }
    );
    const next = { ...version, version: 2 };
    const op = repo.updateIntent(campaign, base, next);
    expect(op.base).toEqual(base);
    expect(op.state).toEqual(base.state);
    expect(op.authority.campaignRevision).toBe(1);
    expect(repo.removeIntent(campaign, base).opId).toBe("remove_add");
  });
  it("fences ABA and disallows foreign sources", async () => {
    const { repo, session } = repository();
    const op = repo.addIntent(campaign, version, "prep");
    session.transition({ uid: "other", campaignId: "party", activeCharacterId: null });
    session.transition({ uid: "dm", campaignId: "party", activeCharacterId: null });
    await expect(repo.commit(op)).rejects.toThrow("stale-session");
    expect(() =>
      repo.addIntent(campaign, { ...version, ownerUid: "other" }, "prep")
    ).toThrow("permission-denied");
  });
});
it("does not allow a live ticket to retarget its captured operation", async () => {
  const { repo } = repository();
  const op = repo.addIntent(campaign, version, "prep");
  await expect(repo.commit({ ...op, targetId: "other" })).rejects.toThrow(
    "intent-mismatch"
  );
});
