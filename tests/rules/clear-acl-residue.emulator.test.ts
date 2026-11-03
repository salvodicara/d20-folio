/// <reference types="node" />
/**
 * EMULATOR-BACKED apply of scripts/clear-acl-residue.ts through the migration kit:
 * the two dead fields go, everything else stays, a backup is written first, a second
 * apply changes nothing, and a character saved between discovery and commit makes the
 * whole batch refuse. Runs through `pnpm test:rules`.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  discoverDocuments,
  runGuardedMigration,
  type DiscoveredDocument,
} from "../../scripts/lib/migration-kit";
import {
  DISCOVERY,
  planAclResidue,
  reportForAclResidue,
  verifyAclResidueCorpus,
  writesForAclResidue,
} from "../../scripts/clear-acl-residue";

const PROJECT_ID = "demo-d20folio";
const WITH_BOTH = "users/acl-u1/characters/acl-c1";
const WITH_ONE = "users/acl-u2/characters/acl-c2";
const CLEAN = "users/acl-u3/characters/acl-c3";

let app: App;
let db: Firestore;
const temporaryParents: string[] = [];

async function clearFirestore(): Promise<void> {
  const response = await fetch(
    `http://${String(env.FIRESTORE_EMULATOR_HOST)}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error(`Emulator clear failed: ${response.status}`);
}

async function seed(): Promise<void> {
  const batch = db.batch();
  batch.set(db.doc(WITH_BOTH), {
    name: "A",
    build: { level: 3 },
    dmReaders: ["dm"],
    campaignReaders: ["p1"],
  });
  batch.set(db.doc(WITH_ONE), { name: "B", dmReaders: ["dm"] });
  batch.set(db.doc(CLEAN), { name: "C" });
  await batch.commit();
}

async function apply(
  discover: (database: Firestore) => Promise<DiscoveredDocument[]> = (database) =>
    discoverDocuments(database, DISCOVERY)
): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "d20-acl-residue-"));
  temporaryParents.push(parent);
  const backupDirectory = join(parent, "backup");
  await runGuardedMigration({
    migration: "acl-residue",
    label: "acl-residue-v1",
    discover,
    plan: planAclResidue,
    verify: verifyAclResidueCorpus,
    writesFor: writesForAclResidue,
    report: reportForAclResidue,
    options: { mode: "apply", backupDirectory },
    db,
  });
  return backupDirectory;
}

beforeAll(() => {
  if (!env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("This suite requires the Firestore emulator (pnpm test:rules)");
  }
  app = initializeApp({ projectId: PROJECT_ID }, "acl-residue-emulator");
  db = getFirestore(app);
});

afterAll(async () => {
  for (const parent of temporaryParents)
    await rm(parent, { recursive: true, force: true });
  await deleteApp(app);
});

beforeEach(async () => {
  await clearFirestore();
  await seed();
});

describe("clear-acl-residue apply (emulator)", () => {
  it("drops only the dead fields, backs up first, and a second apply changes nothing", async () => {
    const backupDirectory = await apply();
    expect((await db.doc(WITH_BOTH).get()).data()).toEqual({
      name: "A",
      build: { level: 3 },
    });
    expect((await db.doc(WITH_ONE).get()).data()).toEqual({ name: "B" });
    expect((await db.doc(CLEAN).get()).data()).toEqual({ name: "C" });
    const manifest = JSON.parse(
      await readFile(join(backupDirectory, "manifest.json"), "utf8")
    ) as { migration: string; documents: unknown[] };
    expect(manifest.migration).toBe("acl-residue");
    expect(manifest.documents).toHaveLength(2);

    await apply();
    const rediscovered = await discoverDocuments(db, DISCOVERY);
    expect(verifyAclResidueCorpus(rediscovered.map((d) => d.source))).toEqual([]);
  });

  it("refuses the whole batch when a character is saved after discovery", async () => {
    await expect(
      apply(async (database) => {
        const found = await discoverDocuments(database, DISCOVERY);
        await db.doc(WITH_ONE).update({ name: "B2" });
        return found;
      })
    ).rejects.toThrow(/Batch commit refused/);
    expect((await db.doc(WITH_BOTH).get()).data()?.dmReaders).toEqual(["dm"]);
  });
});
