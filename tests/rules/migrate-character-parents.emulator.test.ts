/// <reference types="node" />
/**
 * EMULATOR-BACKED test of the P1 legacy parent cutover
 * (`scripts/migrate-character-parents.ts`) through the kit's guarded apply path.
 *
 * The branches only Firestore itself can prove: a parent UPDATE and a child CREATE in
 * the SAME atomic batch, the `lastUpdateTime` precondition on the update leg, the
 * reread/hash verification of a document that carries a real `Timestamp`, and the
 * global + idempotency passes over the migrated corpus.
 *
 * EMULATOR-DEPENDENT — runs through `pnpm test:rules`, which exports
 * `FIRESTORE_EMULATOR_HOST`, so the Admin SDK needs no credential.
 * Assertions never print a raw document path.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "node:process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { discoverDocuments, runGuardedMigration } from "../../scripts/lib/migration-kit";
import {
  DISCOVERY,
  planParentCutoverSources,
  reportForParentCutover,
  verifyParentCutoverCorpus,
  writesForParentCutover,
} from "../../scripts/migrate-character-parents";

const PROJECT_ID = "demo-d20folio";
const UID = "cut-user";
const WOUNDED = `users/${UID}/characters/cut-wounded`;
const WOUNDED_CHILD = `${WOUNDED}/combat/state`;
const FRESH = `users/${UID}/characters/cut-fresh`;
const FRESH_CHILD = `${FRESH}/combat/state`;

let app: App;
let db: Firestore;
const temporaryParents: string[] = [];

function legacyParent(state: Record<string, unknown>): Record<string, unknown> {
  return {
    schema: 3,
    build: { name: "Bo", classes: [{ classId: "monk", level: 3 }] },
    state,
    cache: { name: "Bo", hpMax: 24, ac: 15 },
    status: "active",
    shared: false,
    updatedAt: 17,
  };
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
  // (i) a legacy parent WITH a legacy child: the play session moves, the trio stays.
  batch.set(db.doc(WOUNDED), legacyParent({ trackers: { "monk-focus": 1 }, notes: "n" }));
  batch.set(db.doc(WOUNDED_CHILD), {
    hp: { current: 9, temp: 0 },
    conditions: ["prone"],
    initiativeRoll: 12,
    deathSaves: { successes: 0, failures: 1 },
    round: 3,
    recentActions: [],
  });
  // (ii) a legacy parent with NO child: the child is created at full HP.
  batch.set(db.doc(FRESH), legacyParent({ usedSlots: { "1": 2 } }));
  await batch.commit();
}

async function applyMigration(): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), "d20-parent-cutover-emulator-"));
  temporaryParents.push(parent);
  const updatedAt = Timestamp.now();
  await runGuardedMigration({
    migration: "character-parents",
    label: "parent-cutover-v1",
    discover: (database) => discoverDocuments(database, DISCOVERY),
    plan: (sources) => planParentCutoverSources(sources, updatedAt),
    verify: verifyParentCutoverCorpus,
    writesFor: writesForParentCutover,
    report: reportForParentCutover,
    options: { mode: "apply", backupDirectory: join(parent, "backup") },
    db,
  });
}

beforeAll(() => {
  if (!env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("This suite requires the Firestore emulator (pnpm test:rules)");
  }
  app = initializeApp({ projectId: PROJECT_ID }, "parent-cutover-emulator");
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

describe("legacy parent cutover apply path (emulator)", () => {
  it("marks both parents, updates the existing child, creates the missing one, and re-plans clean", async () => {
    await applyMigration();

    const wounded = (await db.doc(WOUNDED).get()).data();
    expect(wounded?.playStateVersion).toBe(1);
    expect(wounded?.state).toEqual({});
    expect(wounded?.revision).toBe(0);
    // The parent's own `updatedAt` is untouched: the public share projection
    // compares `sourceUpdatedAt` against exactly that field.
    expect(wounded?.updatedAt).toBe(17);

    const woundedChild = (await db.doc(WOUNDED_CHILD).get()).data();
    expect(woundedChild?.playState).toEqual({
      version: 1,
      state: { trackers: { "monk-focus": 1 }, notes: "n" },
    });
    // The stored trio survives the update byte for byte.
    expect(woundedChild?.hp).toEqual({ current: 9, temp: 0 });
    expect(woundedChild?.conditions).toEqual(["prone"]);
    expect(woundedChild?.deathSaves).toEqual({ successes: 0, failures: 1 });
    expect(woundedChild?.round).toBe(3);
    expect(woundedChild?.updatedAt).toBeInstanceOf(Timestamp);

    const fresh = (await db.doc(FRESH).get()).data();
    expect(fresh?.playStateVersion).toBe(1);
    expect(fresh?.revision).toBe(0);
    const freshChild = (await db.doc(FRESH_CHILD).get()).data();
    expect(freshChild?.hp).toEqual({ current: 24, temp: 0 });
    expect(freshChild?.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(freshChild?.round).toBe(1);
    expect(freshChild?.playState).toEqual({
      version: 1,
      state: { usedSlots: { "1": 2 } },
    });

    // A re-plan of the live corpus is a no-op, and a second apply still verifies.
    const sources = (await discoverDocuments(db, DISCOVERY)).map((d) => d.source);
    expect(planParentCutoverSources(sources).changedDocuments).toEqual([]);
    expect(verifyParentCutoverCorpus(sources)).toEqual([]);
    await applyMigration();
    expect((await db.doc(FRESH).get()).data()?.revision).toBe(0);
  });
});
