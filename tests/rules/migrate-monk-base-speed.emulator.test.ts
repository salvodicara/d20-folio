/// <reference types="node" />
/**
 * EMULATOR-BACKED apply of scripts/migrate-monk-base-speed.ts through the migration kit:
 * a Monk whose base counted Unarmored Movement goes back to the species base and only
 * that field changes, a backup is written first, a second apply changes nothing, and a
 * character saved between discovery and commit makes the whole batch refuse. Runs through `pnpm test:rules`.
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
  planMonkBaseSpeed,
  reportForMonkBaseSpeed,
  verifyMonkBaseSpeedCorpus,
  writesForMonkBaseSpeed,
} from "../../scripts/migrate-monk-base-speed";

const PROJECT_ID = "demo-d20folio";
const COUNTED = "users/monk-u1/characters/monk-c1";
const BASE = "users/monk-u2/characters/monk-c2";
const FIGHTER = "users/monk-u3/characters/monk-c3";
const build = (classId: string, speed: string) => ({
  name: "N",
  race: "human",
  classes: [{ classId, level: 3 }],
  speed,
});

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
  batch.set(db.doc(COUNTED), { schema: 3, build: build("monk", "40"), note: "kept" });
  batch.set(db.doc(BASE), { schema: 3, build: build("monk", "30") });
  batch.set(db.doc(FIGHTER), { schema: 3, build: build("fighter", "40") });
  await batch.commit();
}

async function apply(
  discover: (database: Firestore) => Promise<DiscoveredDocument[]> = (database) =>
    discoverDocuments(database, DISCOVERY)
): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "d20-monk-base-speed-"));
  temporaryParents.push(parent);
  const backupDirectory = join(parent, "backup");
  await runGuardedMigration({
    migration: "monk-base-speed",
    label: "monk-base-speed-v1",
    discover,
    plan: planMonkBaseSpeed,
    verify: verifyMonkBaseSpeedCorpus,
    writesFor: writesForMonkBaseSpeed,
    report: reportForMonkBaseSpeed,
    options: { mode: "apply", backupDirectory },
    db,
  });
  return backupDirectory;
}

beforeAll(() => {
  if (!env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("This suite requires the Firestore emulator (pnpm test:rules)");
  }
  app = initializeApp({ projectId: PROJECT_ID }, "monk-base-speed-emulator");
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

describe("migrate-monk-base-speed apply (emulator)", () => {
  it("resets only the counted base, backs up first, and a second apply changes nothing", async () => {
    const backupDirectory = await apply();
    expect((await db.doc(COUNTED).get()).data()).toEqual({
      schema: 3,
      build: build("monk", "30"),
      note: "kept",
    });
    expect((await db.doc(BASE).get()).data()?.build).toEqual(build("monk", "30"));
    expect((await db.doc(FIGHTER).get()).data()?.build).toEqual(build("fighter", "40"));
    const manifest = JSON.parse(
      await readFile(join(backupDirectory, "manifest.json"), "utf8")
    ) as { migration: string; documents: unknown[] };
    expect(manifest.migration).toBe("monk-base-speed");
    expect(manifest.documents).toHaveLength(1);

    await apply();
    const rediscovered = await discoverDocuments(db, DISCOVERY);
    expect(verifyMonkBaseSpeedCorpus(rediscovered.map((d) => d.source))).toEqual([]);
  });

  it("refuses the whole batch when a character is saved after discovery", async () => {
    await expect(
      apply(async (database) => {
        const found = await discoverDocuments(database, DISCOVERY);
        await db.doc(COUNTED).update({ note: "edited" });
        return found;
      })
    ).rejects.toThrow(/Batch commit refused/);
    expect((await db.doc(COUNTED).get()).data()?.build).toEqual(build("monk", "40"));
  });
});
