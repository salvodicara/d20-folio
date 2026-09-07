import { readFileSync } from "node:fs";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  writeBatch,
  updateDoc,
  disableNetwork,
  enableNetwork,
  type Firestore,
} from "firebase/firestore";
import { SessionController } from "../../src/lib/identity/session";
import { createSharedRepository } from "../../src/lib/shared/repository";
let env: RulesTestEnvironment;
const target = { kind: "personal" as const, ownerUid: "owner", characterId: "one" };
function client() {
  const session = new SessionController();
  session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  return createSharedRepository(
    env.authenticatedContext("owner").firestore() as unknown as Firestore,
    session
  );
}
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
    await setDoc(doc(db, "users/owner"), { status: "active" });
    await setDoc(doc(db, "folioAccounts/owner/characters/one"), {
      schema: 1,
      ownerUid: "owner",
      id: "one",
      name: "One",
      speciesId: "elf",
      classId: "wizard",
      level: 1,
      revision: 0,
      currentAssignment: null,
      sheet: { build: {}, state: {} },
      portraitPath: null,
    });
    await setDoc(doc(db, "folioAccounts/owner/characters/one/private/notes"), {
      text: "initial",
    });
  });
});
describe("atomic shared operations with two actual clients", () => {
  it("duplicate intent applies once and reconciles the original receipt after later changes", async () => {
    const a = client(),
      b = client();
    const base = await a.readNotes(target);
    const op = a.noteIntent(base, "first");
    const [one, two] = await Promise.all([a.commit(op), b.commit(op)]);
    expect(one).toEqual(two);
    const next = await b.readNotes(target);
    expect(next.revision).toBe(1);
    await b.commit(b.noteIntent(next, "second"));
    expect(await a.reconcile(op)).toEqual(one);
    expect(await a.commit(op)).toEqual(one);
    expect((await a.readNotes(target)).text).toBe("second");
    expect((await a.readNotes(target)).revision).toBe(2);
  });
  it("competing original bases cannot silently overwrite one another", async () => {
    const a = client(),
      b = client();
    const base = await a.readNotes(target);
    const results = await Promise.allSettled([
      a.commit(a.noteIntent(base, "A")),
      b.commit(b.noteIntent(base, "B")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect((await a.readNotes(target)).revision).toBe(1);
  });
  it("same identity with different content is rejected", async () => {
    const a = client();
    const op = a.noteIntent(await a.readNotes(target), "first");
    await a.commit(op);
    await expect(a.commit({ ...op, text: "forged" })).rejects.toThrow("intent-mismatch");
  });
  it("stale character authority is rejected even when note text and version are unchanged", async () => {
    const a = client();
    const op = a.noteIntent(await a.readNotes(target), "draft");
    await env.withSecurityRulesDisabled((c) =>
      setDoc(
        doc(c.firestore(), "folioAccounts/owner/characters/one"),
        { revision: 2 },
        { merge: true }
      )
    );
    await expect(a.commit(op)).rejects.toThrow("stale-authority");
    expect((await a.readNotes(target)).text).toBe("initial");
  });
});

it("rejects a forged second receipt piggybacked on a genuine note commit", async () => {
  const a = client();
  const first = a.noteIntent(await a.readNotes(target), "real");
  const forged = { ...first, opId: "forged", text: "never applied" };
  const db = env.authenticatedContext("owner").firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, "folioAccounts/owner/characters/one/private/notes"), {
    text: first.text,
    revision: 1,
    lastOperation: { uid: "owner", opId: first.opId },
  });
  batch.set(doc(db, "folioAccounts/owner/operations/" + first.opId), {
    operation: first,
    revision: 1,
  });
  batch.set(doc(db, "folioAccounts/owner/operations/forged"), {
    operation: forged,
    revision: 1,
  });
  await assertFails(batch.commit());
});
function scopedClient(uid = "owner", campaignId: string | null = null) {
  const session = new SessionController();
  session.transition({ uid, campaignId, activeCharacterId: null });
  const store = env.authenticatedContext(uid).firestore() as unknown as Firestore;
  return { session, store, repo: createSharedRepository(store, session) };
}
async function seedCampaign() {
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "users/dm"), { status: "active" });
    await setDoc(doc(c.firestore(), "folioCampaigns/camp"), {
      schema: 1,
      id: "camp",
      name: "Synthetic campaign",
      dmUid: "dm",
      members: ["dm", "owner"],
      revision: 0,
      archived: false,
      joinOpen: true,
    });
  });
}
it("assignment epoch rejects an ABA draft after join, leave and rejoin", async () => {
  await seedCampaign();
  const a = scopedClient(),
    b = scopedClient();
  await a.repo.commit(
    await a.repo.assignmentIntent({ ownerUid: "owner", id: "one" }, "camp")
  );
  const old = a.repo.noteIntent(await a.repo.readNotes(target), "old assignment");
  await b.repo.commit(
    await b.repo.assignmentIntent({ ownerUid: "owner", id: "one" }, null)
  );
  await b.repo.commit(
    await b.repo.assignmentIntent({ ownerUid: "owner", id: "one" }, "camp")
  );
  await expect(a.repo.commit(old)).rejects.toThrow("stale-authority");
  expect((await a.repo.readNotes(target)).authority.assignment?.version).toBe(3);
});
it("a stale target campaign epoch cannot accept an assignment", async () => {
  await seedCampaign();
  const a = client();
  const op = await a.assignmentIntent({ ownerUid: "owner", id: "one" }, "camp");
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "folioCampaigns/camp"), { revision: 2 })
  );
  await expect(a.commit(op)).rejects.toThrow("stale-authority");
  expect((await a.readNotes(target)).authority.assignment).toBeNull();
});
it("two clients retry one assignment once and competing release intents cannot both apply", async () => {
  await seedCampaign();
  const a = scopedClient(),
    b = scopedClient();
  const ref = { ownerUid: "owner", id: "one" };
  const join = await a.repo.assignmentIntent(ref, "camp");
  const receipts = await Promise.all([a.repo.commit(join), b.repo.commit(join)]);
  expect(receipts[0]).toEqual(receipts[1]);
  expect((await a.repo.readNotes(target)).authority.characterRevision).toBe(1);
  const [leaveA, leaveB] = await Promise.all([
    a.repo.assignmentIntent(ref, null),
    b.repo.assignmentIntent(ref, null),
  ]);
  const results = await Promise.allSettled([
    a.repo.commit(leaveA),
    b.repo.commit(leaveB),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  const current = await a.repo.readNotes(target);
  expect(current.authority.characterRevision).toBe(2);
  expect(current.authority.assignment).toBeNull();
  expect(
    (await getDoc(doc(a.store, "folioCampaigns/camp/roster/owner~one"))).exists()
  ).toBe(false);
  expect(await a.repo.reconcile(join)).toEqual(receipts[0]);
});
it("DM revocation denies a pending note and its stale receipt cannot be forged", async () => {
  await seedCampaign();
  const a = scopedClient("dm", "camp");
  const op = a.repo.noteIntent(
    await a.repo.readNotes({ kind: "dm", campaignId: "camp" }),
    "secret"
  );
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "folioCampaigns/camp"), {
      dmUid: "owner",
      members: ["owner"],
      revision: 1,
    })
  );
  await expect(a.repo.commit(op)).rejects.toBeDefined();
  await assertFails(
    setDoc(doc(a.store, "folioAccounts/dm/operations/" + op.opId), {
      operation: op,
      revision: 1,
    })
  );
});
it("blocked-account authority wins over a valid saved intent", async () => {
  const a = client();
  const op = a.noteIntent(await a.readNotes(target), "blocked");
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), "users/owner"), { status: "blocked" })
  );
  await expect(a.commit(op)).rejects.toThrow("permission-denied");
});
it("offline sends do not commit and reconnection reuses the original identity", async () => {
  const a = scopedClient();
  const op = a.repo.noteIntent(await a.repo.readNotes(target), "offline draft");
  await disableNetwork(a.store);
  vi.stubGlobal("navigator", { onLine: false });
  try {
    await expect(a.repo.commit(op)).rejects.toThrow("offline");
  } finally {
    vi.unstubAllGlobals();
    await enableNetwork(a.store);
  }
  expect(await a.repo.reconcile(op)).toBeNull();
  const receipt = await a.repo.commit(op);
  expect(receipt.operation.opId).toBe(op.opId);
  expect((await a.repo.readNotes(target)).revision).toBe(1);
});
it("a receipt cannot be edited, deleted or created without its state transition", async () => {
  const a = scopedClient();
  const op = a.repo.noteIntent(await a.repo.readNotes(target), "once");
  const ref = doc(a.store, "folioAccounts/owner/operations/" + op.opId);
  await assertFails(setDoc(ref, { operation: op, revision: 1 }));
  await a.repo.commit(op);
  await assertFails(updateDoc(ref, { revision: 2 }));
  await assertFails(
    setDoc(doc(a.store, "folioAccounts/owner/characters/one/private/notes"), {
      text: "unversioned downgrade",
    })
  );
  expect((await getDoc(ref)).data()?.revision).toBe(1);
});
it("lost response after a real commit reconciles once; a late ack cannot alter the new scope", async () => {
  const { OperationController } = await import("../../src/lib/shared/controller");
  const a = scopedClient();
  const op = a.repo.noteIntent(
    await a.repo.readNotes(target),
    "committed before response"
  );
  let deliver!: () => void;
  const gate = new Promise<void>((r) => {
    deliver = r;
  });
  const controller = new OperationController(
    op,
    {
      commit: async (envelope, check) => {
        const receipt = await a.repo.commit(envelope, check);
        await gate;
        return receipt;
      },
      reconcile: (envelope) => a.repo.reconcile(envelope),
    },
    { timeoutMs: 20 }
  );
  void controller.submit();
  await vi.waitFor(async () =>
    expect((await client().readNotes(target)).revision).toBe(1)
  );
  await vi.waitFor(() => expect(controller.state.status).toBe("unknown"));
  await controller.retry();
  expect(controller.state.status).toBe("acknowledged");
  expect((await client().readNotes(target)).revision).toBe(1);
  controller.invalidate();
  a.session.transition({
    uid: "owner",
    campaignId: "different",
    activeCharacterId: null,
  });
  deliver();
  await Promise.resolve();
  await Promise.resolve();
  expect(controller.state.status).toBe("invalidated");
});
it("a context change during a real transaction invalidates its unsent writes", async () => {
  const a = scopedClient();
  const op = a.repo.noteIntent(await a.repo.readNotes(target), "unsent");
  let checks = 0;
  await expect(
    a.repo.commit(op, () => {
      if (++checks === 2)
        a.session.transition({
          uid: "owner",
          campaignId: "different",
          activeCharacterId: null,
        });
    })
  ).rejects.toThrow("stale-session");
  expect((await client().readNotes(target)).revision).toBe(0);
});
