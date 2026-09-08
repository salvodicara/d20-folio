vi.mock("@/lib/firebase", () => ({}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase/firestore";
import { createCreationRepository } from "../../src/lib/character-creation/repository";
import { creationCandidate } from "../fixtures/creation-candidate";
import { SessionController } from "../../src/lib/identity/session";
import { receiptPath } from "../../src/lib/shared/model";
const wire = vi.hoisted(() => ({
  docs: new Map<string, unknown>(),
  reads: [] as string[],
  writes: [] as string[],
  attempts: [] as unknown[],
  afterRead: (path: string) => {
    void path;
  },
}));
vi.mock("firebase/firestore", () => {
  const snap = (path: string) => ({
    exists: () => wire.docs.has(path),
    data: () => structuredClone(wire.docs.get(path)),
  });
  return {
    doc: (_db: unknown, path: string) => ({ path }),
    getDocFromServer: (ref: { path: string }) => {
      wire.reads.push(ref.path);
      const result = snap(ref.path);
      wire.afterRead(ref.path);
      return Promise.resolve(result);
    },
    runTransaction: async (
      _db: unknown,
      run: (tx: unknown) => Promise<unknown>,
      options: unknown
    ) => {
      wire.attempts.push(options);
      const staged = new Map<string, unknown>();
      const result = await run({
        get: (ref: { path: string }) => {
          if (staged.size) throw new Error("read-after-write");
          wire.reads.push(ref.path);
          const result = snap(ref.path);
          wire.afterRead(ref.path);
          return Promise.resolve(result);
        },
        set: (ref: { path: string }, value: unknown) =>
          staged.set(ref.path, structuredClone(value)),
      });
      for (const [path, value] of staged) {
        wire.docs.set(path, value);
        wire.writes.push(path);
      }
      return result;
    },
  };
});
function client() {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  const validateCandidate = vi.fn();
  return {
    session,
    validateCandidate,
    repo: createCreationRepository({} as Firestore, session, {
      verifyCatalogue: () => true,
      validateCandidate,
    }),
  };
}
beforeEach(() => {
  wire.docs.clear();
  wire.docs.set("users/owner", { status: "active" });
  wire.reads = [];
  wire.writes = [];
  wire.attempts = [];
  wire.afterRead = () => {};
});
describe("atomic guided creation", () => {
  it("stamps all witnesses once, preserves draft ID/metadata and freezes output", () => {
    const { repo, validateCandidate } = client(),
      draft = creationCandidate(),
      op = repo.intent(draft);
    expect(op.character).toEqual({ ownerUid: "owner", id: "hero" });
    expect(op.output.character.sheet.build.creation).toEqual({
      schema: 1,
      kind: "guided",
      operationId: op.opId,
      abilityMethod: "standard-array",
    });
    for (const aggregate of [op.output.origins, op.output.classes, op.output.loadout])
      expect(aggregate.lastOperation).toEqual({ uid: "owner", opId: op.opId });
    expect(op.output.loadout.instances.initial_gear?.lastOperation.opId).toBe(op.opId);
    expect(draft.loadout.lastOperation.opId).toBe("draft");
    expect(Object.isFrozen(op.output.character.sheet.build)).toBe(true);
    expect(validateCandidate).toHaveBeenCalledWith(op.output);
  });
  it("writes exactly five documents once, reads receipt first, and restores reconcile-only", async () => {
    const { repo } = client(),
      op = repo.intent(creationCandidate()),
      receipt = await repo.commit(op);
    expect(wire.writes).toHaveLength(5);
    expect(wire.reads[0]).toBe(receiptPath(op));
    expect(wire.attempts).toEqual([{ maxAttempts: 1 }]);
    expect(await repo.commit(op)).toEqual(receipt);
    expect(wire.writes).toHaveLength(5);
    const restored = client().repo;
    await expect(restored.commit(op)).rejects.toThrow("stale-session");
    expect(await restored.reconcile(op)).toEqual(receipt);
  });
  it.each(["", "/origins/build", "/classes/build", "/loadout/initial"])(
    "rejects existing target %s without partial writes",
    async (suffix) => {
      const { repo } = client(),
        op = repo.intent(creationCandidate());
      wire.docs.set("folioAccounts/owner/characters/hero" + suffix, { old: true });
      await expect(repo.commit(op)).rejects.toThrow("stale-base");
      expect(wire.writes).toEqual([]);
    }
  );
  it("rejects a receipt mismatch rather than acknowledging it", async () => {
    const { repo } = client(),
      op = repo.intent(creationCandidate());
    wire.docs.set(receiptPath(op), {
      operation: {
        ...op,
        output: { ...op.output, character: { ...op.output.character, name: "Other" } },
      },
      revision: 0,
    });
    await expect(repo.commit(op)).rejects.toThrow("intent-mismatch");
    await expect(repo.reconcile(op)).rejects.toThrow("intent-mismatch");
    expect(wire.writes).toEqual([]);
  });
  it("fences ABA and queued authority changes at every await", async () => {
    const { repo, session } = client(),
      op = repo.intent(creationCandidate());
    wire.afterRead = () => {
      queueMicrotask(() => {
        session.transition({ uid: "other", campaignId: null, activeCharacterId: null });
        session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
      });
    };
    await expect(repo.commit(op)).rejects.toThrow("stale-session");
    expect(wire.writes).toEqual([]);
  });
  it("rejects changed output, blocked actors, missing marker, wrong item references and budgets", async () => {
    const { repo } = client(),
      op = repo.intent(creationCandidate());
    await expect(
      repo.commit({
        ...op,
        output: { ...op.output, character: { ...op.output.character, name: "Forged" } },
      })
    ).rejects.toThrow("intent-mismatch");
    wire.docs.set("users/owner", { status: "blocked" });
    await expect(repo.commit(op)).rejects.toThrow("permission-denied");
    const marker = creationCandidate();
    delete marker.character.sheet.build.creation;
    expect(() => repo.intent(marker)).toThrow();
    const item = creationCandidate();
    if (item.loadout.instances.initial_gear)
      item.loadout.instances.initial_gear.character.id = "other";
    expect(() => repo.intent(item)).toThrow();
    const huge = creationCandidate();
    huge.character.sheet.build.large = "é".repeat(400000);
    expect(() => repo.intent(huge)).toThrow("creation-operation-too-large");
  });
  it("requires semantic validation and catalogue verification before issuing a ticket", () => {
    const { session } = client(),
      validateCandidate = () => {
        throw new Error("incomplete-creation");
      };
    expect(() =>
      createCreationRepository({} as Firestore, session, {
        verifyCatalogue: () => true,
        validateCandidate,
      }).intent(creationCandidate())
    ).toThrow("incomplete-creation");
    expect(() =>
      createCreationRepository({} as Firestore, session, {
        verifyCatalogue: () => false,
        validateCandidate: () => {},
      }).intent(creationCandidate())
    ).toThrow();
  });
});

it("reads an owned Library version once even when root, selected answer and item repeat it", async () => {
  const { creationWithOwnedEquipment, ownedCreationEquipment } =
    await import("../fixtures/creation-candidate");
  const candidate = creationWithOwnedEquipment(),
    source = ownedCreationEquipment(),
    cls = candidate.classes.acquisitions.class;
  if (cls) cls.resolvedChoices = { "root/gear": [source] };
  const path = "folioAccounts/owner/library/owned-gear/versions/1";
  wire.docs.set(path, source);
  const { repo } = client();
  await repo.commit(repo.intent(candidate));
  expect(wire.reads.filter((read) => read === path)).toHaveLength(1);
});
it("rejects forged or revoked Library versions and foreign selected roots", async () => {
  const { creationWithOwnedEquipment, ownedCreationEquipment } =
    await import("../fixtures/creation-candidate");
  const { repo } = client(),
    candidate = creationWithOwnedEquipment(),
    op = repo.intent(candidate);
  await expect(repo.commit(op)).rejects.toThrow("incompatible-source");
  expect(wire.writes).toEqual([]);
  wire.docs.set("folioAccounts/owner/library/owned-gear/versions/1", {
    ...ownedCreationEquipment(),
    operationId: "different",
  });
  await expect(repo.commit(op)).rejects.toThrow("incompatible-source");
  const foreign = creationCandidate();
  if (foreign.classes.acquisitions.class)
    foreign.classes.acquisitions.class.resolvedChoices = {
      "root/gear": [ownedCreationEquipment("other")],
    };
  expect(() => repo.intent(foreign)).toThrow("permission-denied");
});
it("fences a queued check callback change before any transport writes", async () => {
  const { repo, session } = client(),
    op = repo.intent(creationCandidate());
  await expect(
    repo.commit(op, () => {
      queueMicrotask(() =>
        session.transition({ uid: "other", campaignId: null, activeCharacterId: null })
      );
    })
  ).rejects.toThrow("stale-session");
  expect(wire.writes).toEqual([]);
});

it("does not certify a matching raw receipt with malformed nested creation data", async () => {
  const { repo } = client(),
    operation = structuredClone(repo.intent(creationCandidate()));
  const item = operation.output.loadout.instances.initial_gear;
  if (!item) throw new Error("fixture");
  Object.assign(item.state, { quantity: "malformed" });
  wire.docs.set(receiptPath(operation), { operation, revision: 0 });
  await expect(client().repo.reconcile(operation)).rejects.toThrow();
});
