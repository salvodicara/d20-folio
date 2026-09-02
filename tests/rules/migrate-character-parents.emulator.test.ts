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
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import { effectiveMaxHp } from "@/lib/aggregate-character";
import { parseCombatState } from "@/lib/combat-state-codec";
import { MOCK_CHARACTER } from "@/lib/mock";
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

/** A REAL envelope: the migration hydrates through `parseCharacterEnvelope`, so a
 *  synthetic build would never reach the code paths this suite exists to prove. */
const MOCK_ENVELOPE = serializeCharacterEnvelope(MOCK_CHARACTER);

function legacyParent(state: Record<string, unknown>): Record<string, unknown> {
  return {
    schema: 3,
    build: structuredClone(MOCK_ENVELOPE.build),
    state,
    cache: { name: "Bo", ac: 15 },
    status: "active",
    shared: false,
    updatedAt: 17,
  };
}

/** The app's own effective max HP for a stored state — what the created child must
 *  start at (hp-flat grants active in that session included). */
function fullHpFor(state: Record<string, unknown>): number {
  const parsed = parseCharacterEnvelope(structuredClone(MOCK_ENVELOPE.build), state);
  if (!parsed.ok) throw new Error(`Expected a hydratable envelope: ${parsed.error}`);
  return effectiveMaxHp(parsed.character, parsed.session);
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
    // NON-CANONICAL peer collections, exactly the shapes a lenient legacy reader
    // tolerated and the strict v1 reader will not: a malformed ring row, junk that
    // conforms to nothing, a turn budget with no key, and a stale-DC save row.
    recentActions: [
      { id: "1", targetIds: ["t"], outcome: "hit", round: 2, save: false, riders: [] },
      { id: "2", outcome: "hit" },
    ],
    activeEffects: [{ garbage: true }],
    turnEconomy: { selected: {}, attacksUsed: 3 },
    pendingConcentrationSaves: [
      { id: "p1", spell: "bless", damage: 10, difficultyClass: 99 },
    ],
    appliedEncounterEffects: { epoch: 2, ids: ["e1", 7] },
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
    // The peer collections are canonicalized (or shed) so the migrated document
    // satisfies the STRICT v1 reader — a child the app could not parse is a
    // character the owner could not open.
    expect(woundedChild?.recentActions).toEqual([
      { id: "1", targetIds: ["t"], outcome: "hit", round: 2 },
    ]);
    expect(woundedChild?.activeEffects).toBeUndefined();
    expect(woundedChild?.turnEconomy).toBeUndefined();
    expect(woundedChild?.pendingConcentrationSaves).toBeUndefined();
    expect(woundedChild?.appliedEncounterEffects).toEqual({ epoch: 2, ids: ["e1"] });
    const rereadWounded = parseCombatState(woundedChild);
    expect(rereadWounded.ok).toBe(true);
    expect(rereadWounded.ok && rereadWounded.ownership).toBe("v1");

    const fresh = (await db.doc(FRESH).get()).data();
    expect(fresh?.playStateVersion).toBe(1);
    expect(fresh?.revision).toBe(0);
    const freshChild = (await db.doc(FRESH_CHILD).get()).data();
    expect(freshChild?.hp).toEqual({
      current: fullHpFor({ usedSlots: { "1": 2 } }),
      temp: 0,
    });
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
