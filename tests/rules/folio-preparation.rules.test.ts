import { initializeDefinition } from "../../src/lib/homebrew/model";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { SessionController } from "../../src/lib/identity/session";
import { type LibraryVersion } from "../../src/lib/library/model";
import { createPreparationRepository } from "../../src/lib/homebrew/preparation-repository";
import {
  materializePreparedCopy,
  preparationPath,
  type PreparationOperation,
  type PreparationIssue,
} from "../../src/lib/homebrew/preparation";
import { receiptPath } from "../../src/lib/shared/model";
function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing-test-record");
  return value;
}
let env: RulesTestEnvironment;
const campaign = {
  schema: 1 as const,
  id: "party",
  name: "Party",
  dmUid: "dm",
  members: ["dm", "member"],
  revision: 1,
  archived: false,
  joinOpen: false,
};
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
      data: { ...initializeDefinition("monster").payload.data, maxHp: 24, resources: [] },
    },
  },
  provenance: null,
  operationId: "publish",
};
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-d20folio",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const uid of ["dm", "member", "admin", "blocked", "other"]) {
      await setDoc(doc(db, "users/" + uid), {
        status: uid === "blocked" ? "blocked" : "active",
        role: uid === "admin" ? "admin" : "user",
      });
      await setDoc(doc(db, `folioAccounts/${uid}/library/creature/versions/1`), {
        ...version,
        ownerUid: uid,
      });
    }
    await setDoc(doc(db, "folioCampaigns/party"), campaign);
    await setDoc(doc(db, "folioAccounts/dm/library/creature/versions/2"), {
      ...version,
      version: 2,
    });
    await setDoc(doc(db, "folioAccounts/dm/library/rule/versions/1"), {
      ...version,
      entryId: "rule",
      definition: { ...initializeDefinition("campaign-rule"), name: "Rule" },
    });
  });
});
function client(uid = "dm") {
  const db = env.authenticatedContext(uid).firestore() as unknown as Firestore;
  const session = new SessionController();
  session.transition({ uid, campaignId: "party", activeCharacterId: null });
  return { db, session, repo: createPreparationRepository(db, session) };
}
function target(op: PreparationOperation) {
  return preparationPath(op.campaignId, op.preparationId, op.targetId);
}
async function raw(db: Firestore, op: PreparationOperation, extra = false) {
  const b = writeBatch(db);
  b.set(doc(db, receiptPath(op)), { operation: op, revision: op.baseRevision + 1 });
  const n = materializePreparedCopy(
    op.campaignId,
    op.preparationId,
    op.targetId,
    op.snapshot,
    op.state,
    op.baseRevision + 1,
    { uid: op.uid, opId: op.opId }
  );
  if (op.kind === "preparation-remove") b.delete(doc(db, target(op)));
  else b.set(doc(db, target(op)), n);
  if (extra)
    b.set(doc(db, preparationPath(op.campaignId, op.preparationId, "sibling")), {
      ...n,
      id: "sibling",
    });
  return b.commit();
}
it("DM copy retry, state/version isolation, receipt recovery and addressed removal", async () => {
  const { repo, db } = client();
  const op = repo.addIntent(campaign, version, "prep");
  const r = await repo.commit(op);
  expect(await repo.commit(op)).toEqual(r);
  let copy = required((await repo.list("party", "prep"))[0]);
  const other = repo.addIntent(campaign, version, "prep");
  await repo.commit(other);
  await repo.commit(
    repo.stateIntent(campaign, copy, {
      kind: "monster",
      label: "Wounded",
      currentHp: 99,
      tempHp: 3,
      conditions: ["poisoned"],
      resources: { legendary: 7 },
    })
  );
  copy = required((await repo.list("party", "prep")).find((x) => x.id === copy.id));
  await repo.commit(repo.updateIntent(campaign, copy, { ...version, version: 2 }));
  copy = required((await repo.list("party", "prep")).find((x) => x.id === copy.id));
  expect(copy.state).toMatchObject({ currentHp: 99, resources: { legendary: 7 } });
  expect(await repo.reconcile(op)).toEqual(r);
  await repo.commit(repo.removeIntent(campaign, copy));
  expect((await repo.list("party", "prep")).map((x) => x.id)).toEqual([other.targetId]);
  expect(
    (await getDoc(doc(db, "folioAccounts/dm/library/creature/versions/1"))).exists()
  ).toBe(true);
});
it("members read rules but not preparations, and cannot mutate; admin uses own source", async () => {
  const dm = client();
  const rule = {
    ...version,
    entryId: "rule",
    definition: { ...initializeDefinition("campaign-rule"), name: "Rule" },
  };
  await dm.repo.commit(dm.repo.addIntent(campaign, rule, null));
  const member = client("member");
  expect(required((await member.repo.list("party", null))[0]).state).toEqual({
    kind: "campaign-rule",
    enabled: false,
  });
  await assertFails(member.repo.list("party", "prep"));
  await assertFails(
    raw(member.db, {
      ...dm.repo.addIntent(campaign, version, "prep"),
      uid: "member",
      scope: { uid: "member", campaignId: "party", activeCharacterId: null },
    })
  );
  const admin = client("admin");
  await admin.repo.commit(
    admin.repo.addIntent(campaign, { ...version, ownerUid: "admin" }, "prep")
  );
});
it("rejects forged source, detached receipt, sibling piggyback and stale campaign/base", async () => {
  const { repo, db } = client();
  const op = repo.addIntent(campaign, version, "prep");
  await assertFails(
    raw(db, {
      ...op,
      snapshot: { ...version, definition: { ...version.definition, name: "Forged" } },
    })
  );
  await assertFails(setDoc(doc(db, receiptPath(op)), { operation: op, revision: 1 }));
  await assertFails(raw(db, op, true));
  await repo.commit(op);
  const copy = required((await repo.list("party", "prep"))[0]);
  const stale = repo.stateIntent(campaign, copy, copy.state);
  await repo.commit(repo.stateIntent(campaign, copy, copy.state));
  await assertFails(raw(db, stale));
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "folioCampaigns/party"), { revision: 2 })
  );
  await assertFails(raw(db, repo.addIntent(campaign, version, "prep")));
});
it("archive, revoked membership, blocked and anonymous clients lose writes and private receipt reads", async () => {
  const { repo, db } = client();
  const op = repo.addIntent(campaign, version, "prep");
  await repo.commit(op);
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "folioCampaigns/party"), {
      members: ["member"],
      revision: 2,
    })
  );
  await assertFails(getDoc(doc(db, receiptPath(op))));
  await assertFails(repo.list("party", "prep"));
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "folioCampaigns/party"), { ...campaign, archived: true })
  );
  const admin = client("admin");
  await assertFails(
    raw(admin.db, {
      ...op,
      uid: "admin",
      scope: { uid: "admin", campaignId: "party", activeCharacterId: null },
    })
  );
  const blocked = client("blocked");
  await assertFails(
    raw(blocked.db, {
      ...op,
      uid: "blocked",
      scope: { uid: "blocked", campaignId: "party", activeCharacterId: null },
    })
  );
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), target(op))));
});
it("malformed originals stay available as exact recovery issues", async () => {
  const { repo } = client();
  await env.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), "folioCampaigns/party/preparations/prep/monsters/bad"), {
      schema: 99,
      future: [1, { x: true }],
    })
  );
  expect(await repo.list("party", "prep")).toEqual([]);
  let issues: PreparationIssue[] = [];
  const stop = repo.watchIssues((x) => {
    issues = x;
  });
  expect(issues).toHaveLength(1);
  expect(required(issues[0]).error).toBe("incompatible-preparation");
  expect(required(issues[0]).original).toContain("future");
  stop();
});
it("full bounded state remains valid; invalid numeric and condition values cannot bypass client codecs", async () => {
  const { repo, db } = client();
  await repo.commit(repo.addIntent(campaign, version, "prep"));
  const copy = required((await repo.list("party", "prep"))[0]);
  const state = {
    kind: "monster" as const,
    label: "Full",
    currentHp: 0,
    tempHp: 0,
    conditions: Array.from({ length: 64 }, () => "poisoned"),
    resources: Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`r${i}`, i])),
  };
  await repo.commit(repo.stateIntent(campaign, copy, state));
  const full = required((await repo.list("party", "prep"))[0]);
  await repo.commit(repo.updateIntent(campaign, full, { ...version, version: 2 }));
  const base = required((await repo.list("party", "prep"))[0]);
  const op = repo.stateIntent(campaign, base, base.state);
  for (const changed of [
    { ...state, currentHp: -1 },
    { ...state, resources: { bad: -1 } },
    { ...state, resources: { ...state.resources, r31: -1 } },
    { ...state, conditions: [1] },
  ]) {
    const forged = { ...op, state: changed } as unknown as PreparationOperation;
    const batch = writeBatch(db);
    batch.set(doc(db, target(op)), {
      ...base,
      revision: base.revision + 1,
      state: changed,
      lastOperation: { uid: op.uid, opId: op.opId },
    });
    batch.set(doc(db, receiptPath(op)), {
      operation: forged,
      revision: op.baseRevision + 1,
    });
    await assertFails(batch.commit());
  }
});
it("explicit rule toggle and admin state edits retain original owner snapshot", async () => {
  const dm = client();
  const v = {
    ...version,
    entryId: "rule",
    definition: { ...initializeDefinition("campaign-rule"), name: "Rule" },
  };
  await dm.repo.commit(dm.repo.addIntent(campaign, v, null));
  let copy = required((await dm.repo.list("party", null))[0]);
  const admin = client("admin");
  await admin.repo.commit(
    admin.repo.stateIntent(campaign, copy, { kind: "campaign-rule", enabled: true })
  );
  copy = required((await dm.repo.list("party", null))[0]);
  expect(copy.state).toEqual({ kind: "campaign-rule", enabled: true });
  expect(copy.snapshot.ownerUid).toBe("dm");
  await admin.repo.commit(admin.repo.removeIntent(campaign, copy));
  expect(await dm.repo.list("party", null)).toEqual([]);
});
it("a restored envelope reconciles without gaining a write ticket; offline attempts never replay", async () => {
  const first = client();
  const op = first.repo.addIntent(campaign, version, "prep");
  const r = await first.repo.commit(op);
  const restored = client();
  expect(
    await restored.repo.reconcile(JSON.parse(JSON.stringify(op)) as PreparationOperation)
  ).toEqual(r);
  await expect(restored.repo.commit(op)).rejects.toThrow("stale-session");
  const pending = first.repo.addIntent(campaign, version, "prep");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: false },
    configurable: true,
  });
  try {
    await expect(first.repo.commit(pending)).rejects.toThrow("offline");
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
  expect(await first.repo.reconcile(pending)).toBeNull();
  expect(await first.repo.list("party", "prep")).toHaveLength(1);
});
