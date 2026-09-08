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
import type { LibraryVersion } from "../../src/lib/library/model";
import { initializeDefinition } from "../../src/lib/homebrew/model";
import { createInstanceRepository } from "../../src/lib/homebrew/instance-repository";
import {
  materializeInstance,
  DEFAULT_INSTANCE_STATE,
  instancePath,
  type InstanceOperation,
} from "../../src/lib/homebrew/instances";
import { receiptPath } from "../../src/lib/shared/model";
import type { FolioCharacter } from "../../src/lib/identity/model";
let env: RulesTestEnvironment;
const character: FolioCharacter = {
  schema: 1,
  ownerUid: "owner",
  id: "hero",
  name: "Hero",
  speciesId: "synthetic",
  classId: "synthetic",
  level: 1,
  revision: 1,
  currentAssignment: { campaignId: "party", assignmentId: "assignment", version: 1 },
  sheet: { build: {}, state: {} },
  portraitPath: null,
};
const version: LibraryVersion = {
  schema: 1,
  ownerUid: "owner",
  entryId: "blade",
  version: 1,
  definition: { ...initializeDefinition("weapon"), name: "Blade" },
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
    for (const uid of ["owner", "member", "dm", "admin", "blocked", "other"])
      await setDoc(doc(db, "users/" + uid), {
        status: uid === "blocked" ? "blocked" : "active",
        role: uid === "admin" ? "admin" : "user",
      });
    await setDoc(doc(db, "folioAccounts/owner/characters/hero"), character);
    await setDoc(doc(db, "folioAccounts/owner/characters/second"), {
      ...character,
      id: "second",
    });
    await setDoc(doc(db, "folioAccounts/owner/library/blade/versions/1"), version);
    await setDoc(doc(db, "folioAccounts/owner/library/blade/versions/2"), {
      ...version,
      version: 2,
      definition: { ...version.definition, name: "Blade 2" },
    });
    await setDoc(doc(db, "folioCampaigns/party"), {
      schema: 1,
      id: "party",
      name: "Party",
      dmUid: "dm",
      members: ["owner", "dm", "member"],
      revision: 1,
      archived: false,
      joinOpen: false,
    });
    await setDoc(doc(db, "folioCampaigns/party/roster/owner~hero"), {
      ownerUid: "owner",
      characterId: "hero",
      assignmentId: "assignment",
      version: 1,
    });
  });
});
function client(uid = "owner") {
  const session = new SessionController();
  session.transition({ uid, campaignId: "party", activeCharacterId: "hero" });
  const db = env.authenticatedContext(uid).firestore() as unknown as Firestore;
  return { db, session, repo: createInstanceRepository(db, session) };
}
function raw(
  db: Firestore,
  op: InstanceOperation,
  extra?: (b: ReturnType<typeof writeBatch>) => void
) {
  const b = writeBatch(db);
  b.set(doc(db, instancePath(op.character, op.targetId)), {
    schema: 1,
    character: op.character,
    id: op.targetId,
    snapshot: op.snapshot,
    state: op.state,
    revision: op.baseRevision + 1,
    lastOperation: { uid: op.uid, opId: op.opId },
  });
  b.set(doc(db, receiptPath(op)), { operation: op, revision: op.baseRevision + 1 });
  extra?.(b);
  return b.commit();
}
it("pins a version once, reconciles exact receipts, preserves state through explicit update", async () => {
  const a = client();
  const op = a.repo.addIntent(
    character,
    version,
    { ...DEFAULT_INSTANCE_STATE, quantity: 2, remainingCharges: 7, attuned: true },
    "copy"
  );
  const r = await a.repo.commit(op);
  expect(await a.repo.commit(op)).toEqual(r);
  expect(await a.repo.reconcile(op)).toEqual(r);
  const base = required((await a.repo.list(character))[0]);
  await a.repo.commit(
    a.repo.updateIntent(character, base, {
      ...version,
      version: 2,
      definition: { ...version.definition, name: "Blade 2" },
    })
  );
  expect(required((await a.repo.list(character))[0]).state).toEqual(base.state);
  expect(await a.repo.reconcile(op)).toEqual(r);
  await expect(
    a.repo.commit({ ...op, state: { ...op.state, quantity: 99 } })
  ).rejects.toThrow("intent-mismatch");
});
it("current DM/member read snapshot, never private source or writes; revocation removes reads", async () => {
  const a = client();
  await a.repo.commit(a.repo.addIntent(character, version, undefined, "copy"));
  for (const uid of ["member", "dm"]) {
    const peer = client(uid);
    expect(required((await peer.repo.list(character))[0]).snapshot).toEqual(version);
    await assertFails(
      getDoc(doc(peer.db, "folioAccounts/owner/library/blade/versions/1"))
    );
    await assertFails(
      updateDoc(doc(peer.db, instancePath(character, "copy")), { "state.quantity": 7 })
    );
  }
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "folioCampaigns/party"), { members: ["owner", "dm"] })
  );
  await expect(client("member").repo.list(character)).rejects.toThrow();
});
it("foreign owner/admin/blocked cannot grant recipient instances", async () => {
  const a = client();
  const op = a.repo.addIntent(character, version, undefined, "copy");
  for (const uid of ["admin", "blocked", "other", "dm"]) {
    await assertFails(raw(client(uid).db, { ...op, uid, scope: { ...op.scope, uid } }));
  }
});
it("rejects stale instance and character revision/assignment; A-B-A fences intent", async () => {
  const a = client();
  const op = a.repo.addIntent(character, version, undefined, "copy");
  await a.repo.commit(op);
  const base = required((await a.repo.list(character))[0]);
  const stale = a.repo.stateIntent(character, base, { ...base.state, quantity: 3 });
  await a.repo.commit(
    a.repo.stateIntent(character, base, { ...base.state, quantity: 2 })
  );
  await expect(a.repo.commit(stale)).rejects.toThrow("stale-base");
  const add = a.repo.addIntent(character, version, undefined, "copy2");
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "folioAccounts/owner/characters/hero"), {
      revision: 2,
      currentAssignment: null,
    })
  );
  await expect(a.repo.commit(add)).rejects.toThrow("stale-base");
  await assertFails(raw(a.db, add));
  const scope = a.session.scope();
  a.session.transition({ ...scope, activeCharacterId: "second" });
  a.session.transition(scope);
  await expect(a.repo.commit(add)).rejects.toThrow("stale-session");
});
it("rejects forged snapshot, source, detached receipt, state smuggling and piggyback", async () => {
  const a = client();
  const op = a.repo.addIntent(character, version, undefined, "copy");
  await assertFails(
    raw(a.db, {
      ...op,
      snapshot: { ...version, definition: { ...version.definition, name: "Forged" } },
    })
  );
  await assertFails(raw(a.db, { ...op, snapshot: { ...version, version: 9 } }));
  await assertFails(setDoc(doc(a.db, receiptPath(op)), { operation: op, revision: 1 }));
  await assertFails(
    raw(a.db, op, (b) =>
      b.set(
        doc(a.db, instancePath(character, "other")),
        materializeInstance(character, "other", version, DEFAULT_INSTANCE_STATE, 1, {
          uid: op.uid,
          opId: op.opId,
        })
      )
    )
  );
  await a.repo.commit(op);
  const base = required((await a.repo.list(character))[0]);
  await assertFails(
    raw(a.db, {
      ...a.repo.updateIntent(character, base, {
        ...version,
        version: 2,
        definition: { ...version.definition, name: "Blade 2" },
      }),
      state: { ...base.state, quantity: 100 },
    })
  );
  await assertFails(
    raw(a.db, {
      ...a.repo.stateIntent(character, base, { ...base.state, quantity: 2 }),
      snapshot: { ...version, definition: { ...version.definition, name: "Injected" } },
    })
  );
});
it("isolates malformed instances with exact original recovery", async () => {
  const a = client();
  await a.repo.commit(a.repo.addIntent(character, version, undefined, "copy"));
  await env.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), instancePath(character, "bad")), {
      schema: 9,
      future: { x: 1 },
    })
  );
  let issues: unknown[] = [];
  const stop = a.repo.watchIssues((v) => {
    issues = v;
  });
  expect(await a.repo.list(character)).toHaveLength(1);
  expect(issues).toEqual([
    expect.objectContaining({
      path: instancePath(character, "bad"),
      error: "incompatible-instance",
    }),
  ]);
  stop();
});
it("concurrent clients keep one exact base; a duplicate intent does not duplicate materialization", async () => {
  const a = client(),
    b = client();
  const op = a.repo.addIntent(character, version, undefined, "copy");
  const results = await Promise.all([a.repo.commit(op), a.repo.commit(op)]);
  expect(results[0]).toEqual(results[1]);
  expect(await a.repo.list(character)).toHaveLength(1);
  const base = required((await a.repo.list(character))[0]);
  const updates = await Promise.allSettled([
    a.repo.commit(a.repo.stateIntent(character, base, { ...base.state, quantity: 2 })),
    b.repo.commit(b.repo.stateIntent(character, base, { ...base.state, quantity: 3 })),
  ]);
  expect(updates.filter((r) => r.status === "fulfilled")).toHaveLength(1);
});
it("blocks disabled owner after intent and clears watch delivery at scope transition", async () => {
  const a = client();
  const op = a.repo.addIntent(character, version, undefined, "copy");
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "users/owner"), { status: "blocked" })
  );
  await expect(a.repo.commit(op)).rejects.toThrow("permission-denied");
  await assertFails(raw(a.db, op));
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "users/owner"), { status: "active" })
  );
  const watched: unknown[] = [];
  const stop = a.repo.watch(
    character,
    (rows) => watched.push(rows),
    () => {}
  );
  await new Promise<void>((resolve) => {
    const off = a.repo.watch(
      character,
      () => {
        off();
        resolve();
      },
      () => {
        off();
        resolve();
      }
    );
  });
  a.session.transition({ uid: "other", campaignId: null, activeCharacterId: null });
  const count = watched.length;
  await env.withSecurityRulesDisabled((c) =>
    setDoc(
      doc(c.firestore(), instancePath(character, "late")),
      materializeInstance(character, "late", version, DEFAULT_INSTANCE_STATE, 1, {
        uid: "owner",
        opId: "seed",
      })
    )
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(watched).toHaveLength(count);
  stop();
});
it("uses current reciprocal roster and archived campaign for read authority", async () => {
  const a = client();
  await a.repo.commit(a.repo.addIntent(character, version, undefined, "copy"));
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "folioCampaigns/party/roster/owner~hero"), {
      assignmentId: "stale",
    })
  );
  await expect(client("dm").repo.list(character)).rejects.toThrow();
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "folioCampaigns/party/roster/owner~hero"), {
      assignmentId: "assignment",
    })
  );
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "folioCampaigns/party"), { archived: true })
  );
  await expect(client("dm").repo.list(character)).rejects.toThrow();
  expect(await a.repo.list(character)).toHaveLength(1);
});
it("denies receipt reuse to change sibling characters and invalid state shapes", async () => {
  const a = client();
  const op = a.repo.addIntent(character, version, undefined, "copy");
  await assertFails(
    raw(a.db, op, (b) =>
      b.set(
        doc(a.db, instancePath({ ...character, id: "second" }, "copy")),
        materializeInstance(
          { ...character, id: "second" },
          "copy",
          version,
          DEFAULT_INSTANCE_STATE,
          1,
          { uid: "owner", opId: op.opId }
        )
      )
    )
  );
  await assertFails(raw(a.db, { ...op, state: { ...op.state, quantity: -1 } }));
  await assertFails(
    raw(a.db, {
      ...op,
      state: { ...op.state, equipped: "yes" } as unknown as typeof op.state,
    })
  );
  await assertFails(
    raw(a.db, { ...op, authority: { ...op.authority, assignment: null } })
  );
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("missing-fixture");
  return value;
}
it("reload reconciles a persisted exact receipt without authorizing replay", async () => {
  const a = client();
  const op = a.repo.addIntent(character, version, undefined, "copy");
  const result = await a.repo.commit(op);
  const reloaded = client();
  const persisted = JSON.parse(JSON.stringify(op)) as InstanceOperation;
  expect(await reloaded.repo.reconcile(persisted)).toEqual(result);
  await expect(reloaded.repo.commit(persisted)).rejects.toThrow("stale-session");
  await expect(
    reloaded.repo.reconcile({ ...persisted, state: { ...persisted.state, quantity: 88 } })
  ).rejects.toThrow("intent-mismatch");
  const missing = a.repo.addIntent(character, version, undefined, "absent");
  expect(await reloaded.repo.reconcile(missing)).toBeNull();
  await expect(reloaded.repo.commit(missing)).rejects.toThrow("stale-session");
});

it("rejects unconfigured additions and invalid typed updates at the repository boundary", async () => {
  const a = client();
  const unconfigured: LibraryVersion = {
    ...version,
    definition: { ...version.definition, payload: { schema: 1, data: {} } },
  };
  expect(() => a.repo.addIntent(character, unconfigured)).toThrow("invalid-operation");
  await a.repo.commit(a.repo.addIntent(character, version, undefined, "copy"));
  const base = required((await a.repo.list(character))[0]);
  const invalid: LibraryVersion = {
    ...version,
    version: 2,
    definition: {
      ...version.definition,
      payload: {
        schema: 1,
        data: { ...version.definition.payload.data, damageFormula: "not-a-formula" },
      },
    },
  };
  expect(() => a.repo.updateIntent(character, base, invalid)).toThrow(
    "invalid-operation"
  );
  expect(await a.repo.list(character)).toEqual([base]);
});
it("commits unsupported definitions and personal-state edits of old invalid copies", async () => {
  const a = client();
  const unknown: LibraryVersion = {
    ...version,
    version: 3,
    definition: {
      ...version.definition,
      payload: {
        schema: 1,
        data: { authoringVersion: 2, futureProgram: { rules: ["manual"] } },
      },
    },
  };
  const old = materializeInstance(
    character,
    "old",
    {
      ...version,
      definition: { ...version.definition, payload: { schema: 1, data: {} } },
    },
    DEFAULT_INSTANCE_STATE,
    1,
    { uid: "owner", opId: "old-add" }
  );
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(
      doc(c.firestore(), "folioAccounts/owner/library/blade/versions/3"),
      unknown
    );
    await setDoc(doc(c.firestore(), instancePath(character, "old")), old);
  });
  await a.repo.commit(a.repo.addIntent(character, unknown, undefined, "future"));
  await a.repo.commit(
    a.repo.stateIntent(character, old, { ...DEFAULT_INSTANCE_STATE, remainingCharges: 2 })
  );
  const saved = await a.repo.list(character);
  expect(saved.find((i) => i.id === "future")?.snapshot).toEqual(unknown);
  expect(saved.find((i) => i.id === "old")?.state.remainingCharges).toBe(2);
  expect(saved.find((i) => i.id === "old")?.snapshot).toEqual(old.snapshot);
});
it("rechecks conformance at commit before writing a previously prepared intent", async () => {
  const a = client(),
    op = a.repo.addIntent(character, version, undefined, "bad");
  const unconfigured: LibraryVersion = {
    ...version,
    version: 3,
    definition: { ...version.definition, payload: { schema: 1, data: {} } },
  };
  await env.withSecurityRulesDisabled((c) =>
    setDoc(
      doc(c.firestore(), "folioAccounts/owner/library/blade/versions/3"),
      unconfigured
    )
  );
  await expect(a.repo.commit({ ...op, snapshot: unconfigured })).rejects.toThrow(
    "intent-mismatch"
  );
  expect(await a.repo.list(character)).toEqual([]);
  expect((await getDoc(doc(a.db, receiptPath(op)))).exists()).toBe(false);
});
