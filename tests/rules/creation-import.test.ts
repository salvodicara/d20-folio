import { readFileSync, readdirSync, existsSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, writeBatch, type Firestore } from "firebase/firestore";
import { SessionController } from "../../src/lib/identity/session";
import { createImportRepository } from "../../src/lib/character-creation/import-repository";
import {
  analyzeImport,
  reviewImport,
} from "../../src/lib/character-creation/import-review";
let env: RulesTestEnvironment;
const original = JSON.stringify({
  schema: 3,
  build: {
    name: "Elia",
    classes: [{ classId: "wizard", level: 1 }],
    lore: { backstory: "Private story" },
  },
  state: {},
});
const review = reviewImport(analyzeImport(original), "unknown", []);
const client = (uid = "owner") => {
  const session = new SessionController();
  session.transition({ uid, campaignId: null, activeCharacterId: null });
  const store = env.authenticatedContext(uid).firestore() as unknown as Firestore;
  return { store, repo: createImportRepository(store, session) };
};
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-d20folio",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    for (const uid of ["owner", "other", "admin", "blocked"])
      await setDoc(doc(context.firestore(), "users/" + uid), {
        status: uid === "blocked" ? "blocked" : "active",
        role: uid === "admin" ? "admin" : "user",
      });
  });
});
afterAll(async () => env.cleanup());
describe("P10 reviewed import rules", () => {
  it("commits initial five-document output, retries exactly and updates only classification", async () => {
    const { store, repo } = client();
    const op = await repo.intent(original, review);
    const receipt = await repo.commit(op);
    expect(await repo.commit(op)).toEqual(receipt);
    const path = `folioAccounts/owner/characters/${op.character.id}`;
    expect((await getDoc(doc(store, path))).data()).toEqual(op.output);
    expect((await getDoc(doc(store, path + "/private/import"))).data()).toEqual({
      schema: 1,
      sourceSchema: 3,
      original,
    });
    const base = await repo.read(op.character);
    expect(base).toMatchObject({ declaredEdition: "unknown", revision: 0 });
    const change = await repo.reviewIntent(op.output, original, base, {
      ...review,
      declaredEdition: "2014",
    });
    await repo.commit(change);
    expect(await repo.read(op.character)).toMatchObject({
      declaredEdition: "2014",
      revision: 1,
    });
    expect((await getDoc(doc(store, path))).data()).toEqual(op.output);
    expect((await getDoc(doc(store, path + "/private/import"))).data()).toEqual({
      schema: 1,
      sourceSchema: 3,
      original,
    });
  });
  it.skipIf(!existsSync("content-pack/fixtures/team"))(
    "imports six exact original copies twice and recovers each unchanged",
    async () => {
      const { store, repo } = client();
      const files = readdirSync("content-pack/fixtures/team").filter((name) =>
        name.endsWith(".json")
      );
      expect(files).toHaveLength(6);
      for (const file of files) {
        const bytes = readFileSync("content-pack/fixtures/team/" + file, "utf8");
        const analysis = analyzeImport(bytes);
        const op = await repo.intent(bytes, reviewImport(analysis, "unknown", []));
        const first = await repo.commit(op);
        expect(await repo.commit(op)).toEqual(first);
        const copy = await repo.intent(bytes, reviewImport(analysis, "2014", []));
        expect(copy.character).toEqual(op.character);
        await expect(repo.commit(copy)).rejects.toThrow("stale-base");
        const path = `folioAccounts/owner/characters/${op.character.id}`;
        expect(
          (await getDoc(doc(store, path + "/private/import"))).data()?.original
        ).toBe(bytes);
        expect((await getDoc(doc(store, path))).data()).toEqual(op.output);
        expect((await repo.read(op.character))?.declaredEdition).toBe("unknown");
        expect(readFileSync("content-pack/fixtures/team/" + file, "utf8")).toBe(bytes);
      }
    }
  );
  it("compares the full review baseline and live parent authority", async () => {
    const { store, repo } = client();
    const op = await repo.intent(original, review);
    await repo.commit(op);
    const base = await repo.read(op.character);
    const first = await repo.reviewIntent(op.output, original, base, {
      ...review,
      declaredEdition: "2014",
    });
    const second = await repo.reviewIntent(op.output, original, base, {
      ...review,
      declaredEdition: "2024",
    });
    await repo.commit(first);
    await expect(repo.commit(second)).rejects.toThrow("stale-base");
    const next = await repo.reviewIntent(
      op.output,
      original,
      await repo.read(op.character),
      review
    );
    await env.withSecurityRulesDisabled((context) =>
      setDoc(
        doc(context.firestore(), `folioAccounts/owner/characters/${op.character.id}`),
        { ...op.output, revision: 1 }
      )
    );
    await expect(repo.commit(next)).rejects.toThrow("stale-authority");
    expect(
      (await getDoc(doc(store, `folioAccounts/owner/operations/${next.opId}`))).exists()
    ).toBe(false);
  });
  it("denies detached or forged classification, cross-owner and blocked writes", async () => {
    const { store, repo } = client();
    const op = await repo.intent(original, review);
    await repo.commit(op);
    const path = `folioAccounts/owner/characters/${op.character.id}/reconciliation/import`;
    const base = await repo.read(op.character);
    await assertFails(setDoc(doc(store, path), { ...base, declaredEdition: "2024" }));
    for (const uid of ["other", "admin", "blocked"])
      await assertFails(setDoc(doc(client(uid).store, path), { ...base, revision: 1 }));
    const bad = client("blocked");
    const blocked = await bad.repo.intent(original, review);
    await expect(bad.repo.commit(blocked)).rejects.toThrow();
  });
  it("does not let a valid receipt authorize a different reconciliation document", async () => {
    const { store, repo } = client();
    const operation = await repo.intent(original, review);
    const path = `folioAccounts/owner/characters/${operation.character.id}`;
    const next = {
      ...review,
      schema: 1,
      character: operation.character,
      sourceHash: operation.sourceHash,
      sourceSchema: 3,
      revision: 0,
      lastOperation: { uid: "owner", opId: operation.opId },
    };
    const batch = writeBatch(store);
    batch.set(doc(store, path), operation.output);
    batch.set(doc(store, path + "/private/import"), {
      schema: 1,
      sourceSchema: 3,
      original,
    });
    batch.set(doc(store, path + "/private/notes"), { text: "Private story" });
    batch.set(doc(store, path + "/reconciliation/import"), next);
    batch.set(doc(store, `folioAccounts/owner/operations/${operation.opId}`), {
      operation,
      revision: 0,
    });
    batch.set(
      doc(store, "folioAccounts/owner/characters/unrelated/reconciliation/import"),
      next
    );
    await assertFails(batch.commit());
  });
  it("denies a receipt and classification that omit their initial character/archive/notes", async () => {
    const { store, repo } = client();
    const operation = await repo.intent(original, review);
    const batch = writeBatch(store);
    batch.set(doc(store, `folioAccounts/owner/operations/${operation.opId}`), {
      operation,
      revision: 0,
    });
    batch.set(
      doc(
        store,
        `folioAccounts/owner/characters/${operation.character.id}/reconciliation/import`
      ),
      {
        ...review,
        schema: 1,
        character: operation.character,
        sourceHash: operation.sourceHash,
        sourceSchema: 3,
        revision: 0,
        lastOperation: { uid: "owner", opId: operation.opId },
      }
    );
    await assertFails(batch.commit());
  });
});
