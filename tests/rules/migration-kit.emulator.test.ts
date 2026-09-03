/// <reference types="node" />
/**
 * EMULATOR-BACKED test of the migration kit's APPLY path (`runGuardedMigration`)
 * driven by the custom-identity migration — the one branch a pure unit test cannot
 * reach, because its safety rests on Firestore itself: ONE atomic batch, a
 * `lastUpdateTime` precondition per document, and a reread/global/idempotency pass.
 *
 * EMULATOR-DEPENDENT — not part of the plain Vitest unit suite; it runs through
 *
 *     pnpm test:rules
 *       → firebase emulators:exec --only firestore,storage \
 *           'pnpm exec vitest run --config vitest.rules.config.ts'
 *
 * which exports `FIRESTORE_EMULATOR_HOST`, so the Admin SDK needs no credential.
 * `assertTargetProject` (the production guard) is deliberately NOT on this path: the
 * emulator project id is `demo-d20folio` and the test hands the kit its own `db`.
 *
 * Covered: (i) a clean apply over a parent + its public share projection + a library
 * index, (ii) a document modified between discovery and commit, (iii) a document
 * deleted between discovery and commit, (iv) a second apply. Assertions never print a
 * raw document path.
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
  deterministicCustomInstanceId,
  DISCOVERY,
  planCustomIdentity,
  reportFor,
  verifyCustomIdentityCorpus,
  writesForCustomIdentity,
} from "../../scripts/migrate-custom-identity";

const PROJECT_ID = "demo-d20folio";
const UID = "mk-user";
const CHAR_ID = "mk-char";
const PARENT_PATH = `users/${UID}/characters/${CHAR_ID}`;
const SHEET_PATH = `${PARENT_PATH}/public/sheet`;
const LIBRARY_PATH = `users/${UID}/library/index`;
const EXPECTED_ID = deterministicCustomInstanceId(UID, CHAR_ID, "equipment", 0);

let app: App;
let db: Firestore;
const temporaryParents: string[] = [];

function customBuild(): Record<string, unknown> {
  return { name: "Bo", equipment: [{ custom: true, name: "Boots" }] };
}

/** Wipe the whole emulator project — the kit discovers by COLLECTION GROUP, so a
 *  leftover document from another rules file would join this migration's corpus. */
async function clearFirestore(): Promise<void> {
  const host = env.FIRESTORE_EMULATOR_HOST;
  const response = await fetch(
    `http://${String(host)}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error(`Emulator clear failed: ${response.status}`);
}

async function seed(): Promise<void> {
  const batch = db.batch();
  batch.set(db.doc(PARENT_PATH), {
    schema: 3,
    shared: true,
    playStateVersion: 1,
    state: {},
    build: customBuild(),
    cache: { name: "Bo" },
    status: "active",
  });
  // The anonymous share projection: `build` must stay byte-identical to its parent's.
  batch.set(db.doc(SHEET_PATH), {
    publicSchema: 1,
    schema: 3,
    build: customBuild(),
    cache: { name: "Bo" },
    status: "active",
    hasPortrait: false,
    portraitCrop: null,
    sourceUpdatedAt: 0,
  });
  batch.set(db.doc(LIBRARY_PATH), {
    entries: [
      {
        id: "boots-1",
        savedAt: 1,
        kind: "equipment",
        item: { custom: true, name: "Boots" },
      },
    ],
  });
  await batch.commit();
}

async function freshBackupDirectory(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "d20-migration-kit-emulator-"));
  temporaryParents.push(parent);
  return join(parent, "backup");
}

async function applyMigration(
  discover: (database: Firestore) => Promise<DiscoveredDocument[]> = (database) =>
    discoverDocuments(database, DISCOVERY)
): Promise<string> {
  const backupDirectory = await freshBackupDirectory();
  await runGuardedMigration({
    migration: "custom-identity",
    label: "custom-identity-v1",
    discover,
    plan: planCustomIdentity,
    verify: verifyCustomIdentityCorpus,
    writesFor: writesForCustomIdentity,
    report: reportFor,
    options: { mode: "apply", backupDirectory },
    db,
  });
  return backupDirectory;
}

/** Discover normally, then let `mutate` change the corpus behind the plan's back —
 *  exactly the race the `lastUpdateTime` precondition exists to lose. */
function discoverThen(
  mutate: () => Promise<unknown>
): (database: Firestore) => Promise<DiscoveredDocument[]> {
  return async (database) => {
    const discovered = await discoverDocuments(database, DISCOVERY);
    await mutate();
    return discovered;
  };
}

async function equipmentIdAt(path: string): Promise<unknown> {
  const snapshot = await db.doc(path).get();
  const build = snapshot.data()?.build as
    | { equipment?: { instanceId?: unknown }[] }
    | undefined;
  return build?.equipment?.[0]?.instanceId;
}

beforeAll(() => {
  if (!env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("This suite requires the Firestore emulator (pnpm test:rules)");
  }
  app = initializeApp({ projectId: PROJECT_ID }, "migration-kit-emulator");
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

describe("runGuardedMigration apply path (emulator)", () => {
  it("applies parent, public projection and library in one batch, then verifies and is idempotent", async () => {
    const backupDirectory = await applyMigration();

    expect(await equipmentIdAt(PARENT_PATH)).toBe(EXPECTED_ID);
    const parent = (await db.doc(PARENT_PATH).get()).data();
    const sheet = (await db.doc(SHEET_PATH).get()).data();
    // The rules invariant: the projection's build stays byte-identical.
    expect(sheet?.build).toEqual(parent?.build);
    expect(sheet?.publicSchema).toBe(1);
    const library = (await db.doc(LIBRARY_PATH).get()).data();
    const entries = library?.entries as { id: string; item: { instanceId: string } }[];
    expect(entries[0]?.id).toBe("boots-1");
    expect(entries[0]?.item.instanceId).toBe("boots-1");

    const manifest = JSON.parse(
      await readFile(join(backupDirectory, "manifest.json"), "utf8")
    ) as { format: string; migration: string; label: string; documents: unknown[] };
    expect(manifest.format).toBe("d20-folio-migration-backup-v1");
    expect(manifest.migration).toBe("custom-identity");
    expect(manifest.documents).toHaveLength(3);

    // (iv) a second apply: nothing left to change, and the run still verifies.
    await applyMigration();
    expect(await equipmentIdAt(PARENT_PATH)).toBe(EXPECTED_ID);
    const rediscovered = await discoverDocuments(db, DISCOVERY);
    const replan = planCustomIdentity(rediscovered.map((document) => document.source));
    expect(replan.changedDocuments).toEqual([]);
    expect(verifyCustomIdentityCorpus(rediscovered.map((d) => d.source))).toEqual([]);
  });

  it("refuses the whole batch when a document changed after discovery, writing nothing", async () => {
    await expect(
      applyMigration(discoverThen(() => db.doc(PARENT_PATH).update({ touchedAt: 1 })))
    ).rejects.toThrow(/Batch commit refused/);

    expect(await equipmentIdAt(PARENT_PATH)).toBeUndefined();
    expect(await equipmentIdAt(SHEET_PATH)).toBeUndefined();
    const library = (await db.doc(LIBRARY_PATH).get()).data();
    const entries = library?.entries as { item: { instanceId?: string } }[];
    expect(entries[0]?.item.instanceId).toBeUndefined();
  });

  it("refuses the whole batch when a document was deleted after discovery, writing nothing", async () => {
    await expect(
      applyMigration(discoverThen(() => db.doc(LIBRARY_PATH).delete()))
    ).rejects.toThrow(/Batch commit refused/);

    expect(await equipmentIdAt(PARENT_PATH)).toBeUndefined();
    expect(await equipmentIdAt(SHEET_PATH)).toBeUndefined();
    expect((await db.doc(LIBRARY_PATH).get()).exists).toBe(false);
  });

  it("backs up before it writes, so a rejected apply still leaves a recoverable copy", async () => {
    await expect(
      applyMigration(discoverThen(() => db.doc(PARENT_PATH).update({ touchedAt: 2 })))
    ).rejects.toThrow(/Batch commit refused/);
    // The rejected run's backup lives under the newest temp parent it created.
    const parent = temporaryParents[temporaryParents.length - 1] ?? "";
    const manifest = JSON.parse(
      await readFile(join(parent, "backup", "manifest.json"), "utf8")
    ) as { documents: { beforeHash: string }[] };
    expect(manifest.documents).toHaveLength(3);
  });
});
