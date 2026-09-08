import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, writeBatch, type Firestore } from "firebase/firestore";
import {
  createCreationRepository,
  type CreationOperation,
} from "../../src/lib/character-creation/repository";
import { createInstanceRepository } from "../../src/lib/homebrew/instance-repository";
import { creationCandidate } from "../fixtures/creation-candidate";
import { SessionController } from "../../src/lib/identity/session";
import { receiptPath } from "../../src/lib/shared/model";
let env: RulesTestEnvironment;
function client(uid = "owner") {
  const session = new SessionController();
  session.transition({ uid, campaignId: null, activeCharacterId: null });
  const store = env.authenticatedContext(uid).firestore() as unknown as Firestore;
  return {
    session,
    store,
    repo: createCreationRepository(store, session, {
      verifyCatalogue: () => true,
      validateCandidate: () => {},
    }),
  };
}
function raw(
  store: Firestore,
  operation: CreationOperation,
  skip = "",
  mutate?: (batch: ReturnType<typeof writeBatch>) => void
) {
  const batch = writeBatch(store),
    root =
      "folioAccounts/" +
      operation.character.ownerUid +
      "/characters/" +
      operation.character.id;
  const values: [
    [string, unknown],
    [string, unknown],
    [string, unknown],
    [string, unknown],
    [string, unknown],
  ] = [
    [root, operation.output.character],
    [root + "/origins/build", operation.output.origins],
    [root + "/classes/build", operation.output.classes],
    [root + "/loadout/initial", operation.output.loadout],
    [receiptPath(operation), { operation, revision: 0 }],
  ];
  for (const [path, value] of values)
    if (path !== skip) batch.set(doc(store, path), value as Record<string, unknown>);
  mutate?.(batch);
  return batch.commit();
}
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-d20folio",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    for (const uid of ["owner", "other", "admin", "blocked", "dm"])
      await setDoc(doc(context.firestore(), "users/" + uid), {
        status: uid === "blocked" ? "blocked" : "active",
        role: uid === "admin" ? "admin" : "user",
      });
  });
});
afterAll(async () => env.cleanup());
describe("guided creation authority rules", () => {
  it("commits all five outputs once and supports exact receipt reconciliation", async () => {
    const { repo, store } = client(),
      op = repo.intent(creationCandidate()),
      r = await repo.commit(op);
    expect(await repo.commit(op)).toEqual(r);
    expect(await client().repo.reconcile(op)).toEqual(r);
    for (const suffix of ["", "/origins/build", "/classes/build", "/loadout/initial"])
      expect(
        (
          await getDoc(doc(store, "folioAccounts/owner/characters/hero" + suffix))
        ).exists()
      ).toBe(true);
  });
  it.each(["", "/origins/build", "/classes/build", "/loadout/initial", "receipt"])(
    "denies incomplete transaction missing %s",
    async (suffix) => {
      const { store, repo } = client(),
        op = repo.intent(creationCandidate()),
        root = "folioAccounts/owner/characters/hero";
      await assertFails(
        raw(store, op, suffix === "receipt" ? receiptPath(op) : root + suffix)
      );
      expect((await getDoc(doc(store, root))).exists()).toBe(false);
    }
  );
  it("rejects orphan, sibling-target and foreign/admin/blocked guided writes", async () => {
    const { store, repo } = client(),
      op = repo.intent(creationCandidate());
    await assertFails(
      setDoc(doc(store, receiptPath(op)), { operation: op, revision: 0 })
    );
    await assertFails(
      setDoc(doc(store, "folioAccounts/owner/characters/hero"), op.output.character)
    );
    await assertFails(
      raw(store, op, "", (batch) =>
        batch.set(doc(store, "folioAccounts/owner/characters/sibling"), {
          ...op.output.character,
          id: "sibling",
        })
      )
    );
    for (const uid of ["other", "admin", "blocked"])
      await assertFails(raw(client(uid).store, op));
  });
  it.each(["", "/origins/build", "/classes/build", "/loadout/initial"])(
    "refuses overwriting preexisting %s",
    async (suffix) => {
      const { repo, store } = client(),
        op = repo.intent(creationCandidate());
      await env.withSecurityRulesDisabled(async (c) =>
        setDoc(doc(c.firestore(), "folioAccounts/owner/characters/hero" + suffix), {
          old: true,
        })
      );
      await assertFails(raw(store, op));
      await expect(repo.commit(op)).rejects.toThrow();
    }
  );
  it("quarantines malformed nested raw loadout after storage-authority checks", async () => {
    const { repo, store, session } = client();
    const op = structuredClone(repo.intent(creationCandidate()));
    if (op.output.loadout.instances.initial_gear)
      Object.assign(op.output.loadout.instances.initial_gear.state, {
        quantity: "forged",
      });
    await assertSucceeds(raw(store, op));
    const copies = createInstanceRepository(store, session, () => true);
    const issues: unknown[] = [];
    copies.watchIssues((value) => issues.push(...value));
    expect(await copies.list(op.character)).toEqual([]);
    expect(JSON.stringify(issues)).toContain("forged");
  });
});

describe("grouped initial instance authority", () => {
  it("edits one item with full-group CAS and immutable sources", async () => {
    const { store, repo, session } = client(),
      op = repo.intent(creationCandidate());
    await repo.commit(op);
    const copies = createInstanceRepository(store, session, () => true),
      items = await copies.list(op.character),
      item = items[0];
    if (!item) throw new Error("fixture");
    const change = copies.stateIntent(op.output.character, item, {
      ...item.state,
      quantity: 4,
    });
    const r = await copies.commit(change);
    expect(r.revision).toBe(2);
    const next = (
      await getDoc(doc(store, "folioAccounts/owner/characters/hero/loadout/initial"))
    ).data();
    expect(next?.sources).toEqual(op.output.loadout.sources);
    expect(next).toMatchObject({
      instances: { initial_gear: { state: { quantity: 4 } } },
    });
    expect(await copies.commit(change)).toEqual(r);
  });
  it("denies initial IDs at individual paths and source/sibling mutation in grouped state writes", async () => {
    const { store, repo, session } = client(),
      op = repo.intent(creationCandidate());
    await repo.commit(op);
    const copies = createInstanceRepository(store, session, () => true),
      item = (await copies.list(op.character))[0];
    if (!item) throw new Error("fixture");
    const change = copies.stateIntent(op.output.character, item, {
        ...item.state,
        quantity: 4,
      }),
      next = {
        ...op.output.loadout,
        revision: 2,
        lastOperation: { uid: "owner", opId: change.opId },
        instances: {
          ...op.output.loadout.instances,
          initial_gear: {
            ...item,
            revision: 2,
            state: change.state,
            lastOperation: { uid: "owner", opId: change.opId },
          },
        },
      };
    const attempt = async (
      value: unknown,
      target = "folioAccounts/owner/characters/hero/loadout/initial"
    ) => {
      const batch = writeBatch(store);
      batch.set(doc(store, target), value as Record<string, unknown>);
      batch.set(doc(store, receiptPath(change)), { operation: change, revision: 2 });
      return batch.commit();
    };
    await assertFails(
      attempt(
        next.instances.initial_gear,
        "folioAccounts/owner/characters/hero/homebrew/initial_gear"
      )
    );
    await assertFails(attempt({ ...next, sources: {} }));
    await assertFails(
      attempt({
        ...next,
        instances: { ...next.instances, initial_sibling: next.instances.initial_gear },
      })
    );
  });
  it("authorizes current sheet readers and fences revoked membership", async () => {
    const { repo, store } = client(),
      op = repo.intent(creationCandidate());
    await repo.commit(op);
    await assertFails(
      getDoc(
        doc(client("other").store, "folioAccounts/owner/characters/hero/loadout/initial")
      )
    );
    await assertSucceeds(
      getDoc(
        doc(client("admin").store, "folioAccounts/owner/characters/hero/classes/build")
      )
    );
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "folioAccounts/owner/characters/hero"), {
        ...op.output.character,
        currentAssignment: {
          campaignId: "campaign",
          assignmentId: "assignment",
          version: 1,
        },
        revision: 1,
      });
      await setDoc(doc(context.firestore(), "folioCampaigns/campaign"), {
        schema: 1,
        name: "Campaign",
        dmUid: "dm",
        members: ["owner", "dm"],
        revision: 1,
        archived: false,
        joinOpen: false,
      });
      await setDoc(
        doc(context.firestore(), "folioCampaigns/campaign/roster/owner~hero"),
        { ownerUid: "owner", characterId: "hero", assignmentId: "assignment", version: 1 }
      );
    });
    await assertSucceeds(
      getDoc(doc(client("dm").store, "folioAccounts/owner/characters/hero/classes/build"))
    );
    await assertSucceeds(
      getDoc(
        doc(client("dm").store, "folioAccounts/owner/characters/hero/loadout/initial")
      )
    );
    await env.withSecurityRulesDisabled(async (context) =>
      setDoc(doc(context.firestore(), "folioCampaigns/campaign"), {
        schema: 1,
        name: "Campaign",
        dmUid: "dm",
        members: ["owner"],
        revision: 2,
        archived: false,
        joinOpen: false,
      })
    );
    await assertFails(
      getDoc(
        doc(client("dm").store, "folioAccounts/owner/characters/hero/loadout/initial")
      )
    );
    expect(
      (
        await getDoc(doc(store, "folioAccounts/owner/characters/hero/loadout/initial"))
      ).exists()
    ).toBe(true);
  });
});

it("allows explicit owned Library version updates on the grouped path and rejects stale authority", async () => {
  const { creationWithOwnedEquipment, ownedCreationEquipment } =
    await import("../fixtures/creation-candidate");
  const source = ownedCreationEquipment(),
    next = {
      ...source,
      version: 2,
      operationId: "publish-next",
      definition: { ...source.definition, name: "Updated gear" },
    };
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "folioAccounts/owner/library/owned-gear/versions/1"),
      source
    );
    await setDoc(
      doc(context.firestore(), "folioAccounts/owner/library/owned-gear/versions/2"),
      next
    );
  });
  const { store, repo, session } = client(),
    op = repo.intent(creationWithOwnedEquipment());
  await repo.commit(op);
  const copies = createInstanceRepository(store, session, () => true),
    item = (await copies.list(op.character))[0];
  if (!item) throw new Error("fixture");
  const update = copies.updateIntent(op.output.character, item, next);
  await copies.commit(update);
  const changed = (await copies.list(op.character))[0];
  expect(changed?.snapshot).toEqual(next);
  if (!changed) throw new Error("fixture");
  const state = copies.stateIntent(op.output.character, changed, {
    ...changed.state,
    equipped: true,
  });
  await env.withSecurityRulesDisabled(async (context) =>
    setDoc(doc(context.firestore(), "folioAccounts/owner/characters/hero"), {
      ...op.output.character,
      revision: 1,
    })
  );
  await expect(copies.commit(state)).rejects.toThrow("stale-base");
  const group = state.initialBase;
  if (!group) throw new Error("fixture");
  const batch = writeBatch(store),
    last = { uid: state.uid, opId: state.opId };
  batch.set(doc(store, "folioAccounts/owner/characters/hero/loadout/initial"), {
    ...group,
    revision: group.revision + 1,
    lastOperation: last,
    instances: {
      ...group.instances,
      [state.targetId]: {
        ...changed,
        revision: changed.revision + 1,
        lastOperation: last,
        state: state.state,
      },
    },
  });
  batch.set(doc(store, receiptPath(state)), {
    operation: state,
    revision: state.baseRevision + 1,
  });
  await assertFails(batch.commit());
});

it("keeps bundled received sources after revocation and rejects any bundled source switch", async () => {
  const { ownedCreationEquipment } = await import("../fixtures/creation-candidate");
  const { includeOriginDependency } = await import("../../src/lib/homebrew/origins");
  const { initializeDefinition } = await import("../../src/lib/homebrew/model");
  const { sourceIdentity } = await import("../../src/lib/homebrew/sources");
  const foreign = ownedCreationEquipment("sender"),
    included = includeOriginDependency(
      { ...initializeDefinition("feat"), name: "Received feat" },
      foreign
    );
  const root = {
    schema: 1 as const,
    ownerUid: "owner",
    entryId: "received",
    version: 1,
    operationId: "receive",
    provenance: {
      source: { ownerUid: "sender", id: "source" },
      sourceVersion: 1,
      senderUid: "sender",
      offerId: "offer",
      grantId: "sender~offer",
    },
    definition: included.definition,
  };
  const sourceKey = sourceIdentity(root),
    candidate = creationCandidate();
  candidate.origins.selections = {
    received: { id: "received", ordinal: 0, snapshot: root, answers: {}, exceptions: [] },
  };
  candidate.loadout.sources = { [sourceKey]: root };
  const item = candidate.loadout.instances.initial_gear;
  if (!item) throw new Error("fixture");
  const { object } = await import("../../src/lib/identity/model");
  const { parseDefinition } = await import("../../src/lib/library/model");
  const child = object(object(root.definition.payload.data.dependencies)[included.key]);
  item.snapshot = {
    kind: "bundled",
    schema: 1,
    sourceKey,
    dependencyPath: included.key,
    definition: parseDefinition(child.definition),
  };
  await env.withSecurityRulesDisabled(async (context) =>
    setDoc(
      doc(context.firestore(), "folioAccounts/owner/library/received/versions/1"),
      root
    )
  );
  const { repo, store, session } = client(),
    op = repo.intent(candidate);
  await repo.commit(op);
  await env.withSecurityRulesDisabled(async (context) => {
    const { deleteDoc } = await import("firebase/firestore");
    await deleteDoc(
      doc(context.firestore(), "folioAccounts/owner/library/received/versions/1")
    );
    await setDoc(
      doc(context.firestore(), "folioAccounts/owner/characters/hero/origins/build"),
      { replaced: true }
    );
  });
  const copies = createInstanceRepository(store, session, () => true),
    received = (await copies.list(op.character))[0];
  if (!received) throw new Error("fixture");
  const state = copies.stateIntent(op.output.character, received, {
    ...received.state,
    equipped: true,
  });
  await copies.commit(state);
  expect((await copies.list(op.character))[0]?.snapshot).toEqual(item.snapshot);
  expect(() =>
    copies.updateIntent(op.output.character, received, ownedCreationEquipment())
  ).toThrow("invalid-operation");
});

it.each([null, "legacy", { kind: "legacy" }])(
  "preserves non-guided parent creation with legacy marker %j",
  async (marker) => {
    const { store } = client(),
      candidate = creationCandidate();
    candidate.character.sheet.build.creation = marker;
    await assertSucceeds(
      setDoc(doc(store, "folioAccounts/owner/characters/hero"), candidate.character)
    );
  }
);
