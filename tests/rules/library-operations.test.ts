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
  getDocs,
  collection,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { SessionController } from "../../src/lib/identity/session";
import { createLibraryRepository } from "../../src/lib/library/repository";
import { blankDefinition, type LibraryEntry } from "../../src/lib/library/model";
let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-d20folio",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    for (const uid of ["owner", "recipient", "member", "dm", "admin", "blocked"])
      await setDoc(doc(c.firestore(), "users/" + uid), {
        status: uid === "blocked" ? "blocked" : "active",
        role: uid === "admin" ? "admin" : "user",
      });
  });
});
function client(uid = "owner") {
  const session = new SessionController();
  session.transition({ uid, campaignId: null, activeCharacterId: null });
  const db = env.authenticatedContext(uid).firestore() as unknown as Firestore;
  return { db, session, repo: createLibraryRepository(db, session) };
}
async function stable() {
  const a = client();
  await a.repo.load("one");
  await a.repo.commit(
    a.repo.saveIntent(null, { ...blankDefinition("weapon"), name: "Blade" }, "one")
  );
  const entry = required(await a.repo.load("one"));
  await a.repo.commit(required(await a.repo.publishIntent(entry, entry.draft)));
  return a;
}
it("autosaves incomplete drafts only; explicit stable publication is immutable and unchanged is a no-op", async () => {
  const a = client();
  await a.repo.load("one");
  await a.repo.commit(a.repo.saveIntent(null, blankDefinition("spell"), "one"));
  expect((await a.repo.load("one"))?.stableVersion).toBe(0);
  await expect(
    a.repo.publishIntent(required(await a.repo.load("one")), blankDefinition("spell"))
  ).rejects.toThrow();
  await env.clearFirestore();
  await env.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), "users/owner"), { status: "active" })
  );
  const b = await stable();
  const e = required(await b.repo.load("one"));
  expect(e.stableVersion).toBe(1);
  expect(await b.repo.publishIntent(e, e.draft)).toBeNull();
  await assertFails(
    updateDoc(doc(b.db, "folioAccounts/owner/library/one/versions/1"), {
      definition: blankDefinition("spell"),
    })
  );
});
it("competing saves preserve original CAS and exact receipts reconcile after later writes", async () => {
  const a = await stable(),
    b = client();
  const base = required(await a.repo.load("one"));
  const op = a.repo.saveIntent(base, { ...base.draft, name: "A" });
  const results = await Promise.allSettled([
    a.repo.commit(op),
    b.repo.commit(b.repo.saveIntent(base, { ...base.draft, name: "B" })),
  ]);
  expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  const winner =
    results[0].status === "fulfilled" ? op : b.repo.saveIntent(base, base.draft);
  if (results[0].status === "fulfilled") {
    expect(await a.repo.reconcile(winner)).toEqual(results[0].value);
    await expect(
      a.repo.commit({ ...op, definition: { ...base.draft, name: "forged" } })
    ).rejects.toThrow("intent-mismatch");
  }
});
it("addressed acceptance creates one independent pinned copy; revocation preserves it and denies source reads", async () => {
  const a = await stable(),
    b = client("recipient");
  const version = await a.repo.readVersion({ ownerUid: "owner", id: "one" }, 1);
  const op = a.repo.offerIntent(version, "recipient");
  await a.repo.commit(op);
  const offer = required((await b.repo.listOffers())[0]);
  const accept = await b.repo.acceptIntent(offer);
  await b.repo.commit(accept);
  expect(await b.repo.list()).toHaveLength(1);
  await b.repo.commit(accept);
  expect(await b.repo.list()).toHaveLength(1);
  await a.repo.commit(a.repo.revokeIntent(offer));
  expect(required((await b.repo.list())[0]).draft.name).toBe("Blade");
  await assertFails(getDoc(doc(b.db, "folioAccounts/owner/library/one")));
  await assertFails(getDoc(doc(b.db, "folioLibraryOffers/" + offer.id)));
});
it("revocation first and administrator impersonation cannot accept", async () => {
  const a = await stable();
  await a.repo.commit(
    a.repo.offerIntent(
      await a.repo.readVersion({ ownerUid: "owner", id: "one" }, 1),
      "recipient"
    )
  );
  const offer = required((await a.repo.listSentOffers())[0]);
  const b = client("recipient"),
    op = await b.repo.acceptIntent(offer);
  await expect(client("admin").repo.acceptIntent(offer)).rejects.toThrow(
    "permission-denied"
  );
  await a.repo.commit(a.repo.revokeIntent(offer));
  await expect(b.repo.commit(op)).rejects.toThrow();
  expect(await b.repo.list()).toHaveLength(0);
});
it("owner/admin read, peer/DM/member/anonymous and wildcard denial; forged receipts deny", async () => {
  const a = await stable();
  for (const uid of ["member", "dm", "recipient", "blocked"]) {
    const db = client(uid).db;
    await assertFails(getDoc(doc(db, "folioAccounts/owner/library/one")));
    await assertFails(getDocs(collection(db, "folioAccounts/owner/library")));
  }
  expect(
    (await getDoc(doc(client("admin").db, "folioAccounts/owner/library/one"))).exists()
  ).toBe(true);
  await assertFails(
    getDoc(
      doc(env.unauthenticatedContext().firestore(), "folioAccounts/owner/library/one")
    )
  );
  await assertFails(getDoc(doc(a.db, "folioAccounts/owner/library/one/unknown/secret")));
  const base = (await a.repo.load("one")) as LibraryEntry;
  const op = a.repo.saveIntent(base, { ...base.draft, name: "forged" });
  await assertFails(
    setDoc(doc(a.db, "folioAccounts/owner/operations/" + op.opId), {
      operation: op,
      revision: op.baseRevision + 1,
    })
  );
});
it("different acceptance intents cannot materialize twice and a new offer updates only an explicitly chosen copy", async () => {
  const a = await stable(),
    b = client("recipient");
  const source = await a.repo.readVersion({ ownerUid: "owner", id: "one" }, 1);
  await a.repo.commit(a.repo.offerIntent(source, "recipient"));
  const offer = required((await b.repo.listOffers())[0]);
  const results = await Promise.allSettled([
    b.repo.commit(await b.repo.acceptIntent(offer)),
    client("recipient").repo.commit(await b.repo.acceptIntent(offer)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const copy = required((await b.repo.list())[0]);
  expect(await a.repo.readGrant(offer)).toMatchObject({
    entryId: copy.id,
    sourceVersion: 1,
  });
  await a.repo.commit(a.repo.offerIntent(source, "recipient"));
  const second = required((await b.repo.listOffers()).find((o) => o.id !== offer.id));
  await b.repo.commit(await b.repo.acceptIntent(second));
  const other = required((await b.repo.list()).find((e) => e.id !== copy.id));
  const base = required(await a.repo.load("one"));
  await a.repo.commit(a.repo.saveIntent(base, { ...base.draft, name: "Improved" }));
  const draft = required(await a.repo.load("one"));
  await a.repo.commit(required(await a.repo.publishIntent(draft, draft.draft)));
  expect((await b.repo.load(copy.id))?.draft.name).toBe("Blade");
  await a.repo.commit(a.repo.offerIntent(await a.repo.readVersion(base, 2), "recipient"));
  const update = required((await b.repo.listOffers()).find((o) => o.sourceVersion === 2));
  await b.repo.commit(await b.repo.acceptIntent(update, copy));
  expect((await b.repo.load(copy.id))?.draft.name).toBe("Improved");
  expect(await b.repo.load(other.id)).toEqual(other);
  expect((await b.repo.readVersion(copy, 1)).definition.name).toBe("Blade");
});
it("racing revocation and acceptance either closes delivery or preserves the committed copy", async () => {
  const a = await stable(),
    b = client("recipient");
  await a.repo.commit(
    a.repo.offerIntent(
      await a.repo.readVersion({ ownerUid: "owner", id: "one" }, 1),
      "recipient"
    )
  );
  const offer = required((await b.repo.listOffers())[0]);
  const accept = await b.repo.acceptIntent(offer);
  const result = await Promise.allSettled([
    b.repo.commit(accept),
    a.repo.commit(a.repo.revokeIntent(offer)),
  ]);
  expect(result[1].status).toBe("fulfilled");
  expect(await b.repo.list()).toHaveLength(result[0].status === "fulfilled" ? 1 : 0);
});
it("same-envelope concurrent delivery and response-loss reconciliation apply exactly once", async () => {
  const a = await stable();
  const base = required(await a.repo.load("one"));
  const op = a.repo.saveIntent(base, { ...base.draft, name: "Once" });
  const [x, y] = await Promise.all([a.repo.commit(op), client().repo.commit(op)]);
  expect(x).toEqual(y);
  expect(await a.repo.reconcile(structuredClone(op))).toEqual(x);
  expect((await a.repo.load("one"))?.revision).toBe(base.revision + 1);
});
it("scope ABA invalidates unsent work and unknown library paths never gain addressed reads", async () => {
  const a = await stable();
  const base = required(await a.repo.load("one"));
  const op = a.repo.saveIntent(base, { ...base.draft, name: "Unsaved" });
  a.session.transition({ uid: "recipient", campaignId: null, activeCharacterId: null });
  a.session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  await expect(a.repo.commit(op)).rejects.toThrow("stale-session");
  await env.withSecurityRulesDisabled((c) =>
    setDoc(doc(c.firestore(), "unknown/root/offers/secret"), {
      schema: 2,
      senderUid: "owner",
      recipientUid: "recipient",
      revoked: false,
    })
  );
  await assertFails(getDocs(collection(client("recipient").db, "unknown/root/offers")));
});
it("a receipt cannot forge a version on another entry alongside a legitimate draft transition", async () => {
  const a = await stable();
  await a.repo.load("two");
  await a.repo.commit(
    a.repo.saveIntent(null, { ...blankDefinition("spell"), name: "Other" }, "two")
  );
  const two = required(await a.repo.load("two"));
  await a.repo.commit(required(await a.repo.publishIntent(two, two.draft)));
  const base = required(await a.repo.load("one"));
  await a.repo.commit(a.repo.saveIntent(base, { ...base.draft, name: "next" }));
  const next = required(await a.repo.load("one"));
  const op = required(await a.repo.publishIntent(next, next.draft));
  const { writeBatch } = await import("firebase/firestore");
  const batch = writeBatch(a.db);
  batch.set(doc(a.db, "folioAccounts/owner/library/two/versions/2"), {
    schema: 1,
    ownerUid: "owner",
    entryId: "two",
    version: 2,
    definition: next.draft,
    provenance: null,
    operationId: op.opId,
  });
  batch.set(doc(a.db, "folioAccounts/owner/operations/" + op.opId), {
    operation: op,
    revision: op.baseRevision + 1,
  });
  await assertFails(batch.commit());
});

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test fixture");
  return value;
}
it("unknown library asset paths cannot inherit historical offer attachment access", async () => {
  const { ref, uploadBytes, getBytes, listAll } = await import("firebase/storage");
  const path = "folioAccounts/owner/library/one/attachments/art.png";
  await env.withSecurityRulesDisabled(async (c) => {
    await uploadBytes(ref(c.storage(), path), new Uint8Array([1]), {
      contentType: "image/png",
    });
  });
  for (const uid of ["owner", "recipient", "dm", "member", "admin", "blocked"]) {
    const store = env.authenticatedContext(uid).storage();
    await assertFails(getBytes(ref(store, path)));
    await assertFails(listAll(ref(store, "folioAccounts/owner/library/one/attachments")));
    await assertFails(
      uploadBytes(ref(store, path), new Uint8Array([2]), { contentType: "image/png" })
    );
  }
});
it("repository survives StrictMode session replay while old intents stay fenced", async () => {
  const a = client();
  a.session.revoke();
  a.session.transition({ uid: "owner", campaignId: null, activeCharacterId: null });
  await a.repo.load("replayed");
  const op = a.repo.saveIntent(
    null,
    { ...blankDefinition("feat"), name: "Replay" },
    "replayed"
  );
  await a.repo.commit(op);
  expect((await a.repo.load("replayed"))?.draft.name).toBe("Replay");
});
it("lost response stays unknown until exact receipt recovery; invalidation suppresses the late acknowledgement", async () => {
  const { OperationController } = await import("../../src/lib/shared/controller");
  const { vi } = await import("vitest");
  const a = await stable();
  const base = required(await a.repo.load("one"));
  const op = a.repo.saveIntent(base, { ...base.draft, name: "Response lost" });
  let deliver = () => {};
  const gate = new Promise<void>((resolve) => {
    deliver = resolve;
  });
  const controller = new OperationController(
    op,
    {
      commit: async (envelope, check) => {
        const result = await a.repo.commit(envelope, check);
        await gate;
        return result;
      },
      reconcile: (envelope) => a.repo.reconcile(envelope),
    },
    { timeoutMs: 20 }
  );
  void controller.submit();
  await vi.waitFor(async () =>
    expect((await client().repo.load("one"))?.draft.name).toBe("Response lost")
  );
  await vi.waitFor(() => expect(controller.state.status).toBe("unknown"));
  await controller.retry();
  expect(controller.state.status).toBe("acknowledged");
  expect((await a.repo.load("one"))?.revision).toBe(base.revision + 1);
  controller.invalidate();
  deliver();
  await Promise.resolve();
  expect(controller.state.status).toBe("invalidated");
});
it("offline intent is retained without a write and an explicit retry uses its original identity", async () => {
  const { vi } = await import("vitest");
  const a = await stable();
  const base = required(await a.repo.load("one"));
  const op = a.repo.saveIntent(base, { ...base.draft, name: "Offline" });
  vi.stubGlobal("navigator", { onLine: false });
  try {
    await expect(a.repo.commit(op)).rejects.toThrow("offline");
  } finally {
    vi.unstubAllGlobals();
  }
  expect(await a.repo.reconcile(op)).toBeNull();
  const result = await a.repo.commit(op);
  expect(result.operation.opId).toBe(op.opId);
});
