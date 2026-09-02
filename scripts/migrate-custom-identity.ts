#!/usr/bin/env node
/**
 * P1 identity migration: every custom spell/weapon/equipment/feature on a character
 * parent, a character snapshot and a library index gains a stable `instanceId`
 * (design §5.5, ADR-0009). Live data predates the requirement, and the codecs now
 * reject an entry without one — this stamps the corpus BEFORE that deploy.
 *
 * Read-only by default; `--check` proves the corpus migrated; `--fixtures <dir>` plans
 * over portable exports with no Firebase at all; `--apply --backup <dir>` is the only
 * write mode (preflight → backup → one guarded batch → reread/global/idempotency).
 *
 * Ids are DETERMINISTIC, so dry-run, apply and a re-run agree byte-for-byte, and a
 * snapshot is scoped by its own id (a snapshot never reuses its parent's identities —
 * they are independent stored copies, not the same physical entry).
 *
 * Output: counts, hashes and issue CODES. Never a payload, never a raw path.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-custom-identity.ts
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-custom-identity.ts --check
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-custom-identity.ts \
 *     --fixtures /absolute/fixtures/directory
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-custom-identity.ts \
 *     --apply --backup /absolute/fresh/private/directory
 */

/// <reference types="node" />

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import {
  discoverDocuments,
  hashFirestoreDocument,
  isRecord,
  parseCliOptions,
  pathHash,
  readTargetConfiguration,
  runGuardedMigration,
  sha256,
  type GuardedDocumentPlan,
  type GuardedPlan,
  type GuardedWrite,
  type MigrationIssue,
  type MigrationSourceDocument,
  type RawMap,
} from "./lib/migration-kit.ts";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;
const SNAPSHOT = /^users\/([^/]+)\/characters\/([^/]+)\/snapshots\/([^/]+)$/;
const LIBRARY = /^users\/([^/]+)\/library\/index$/;
/** The anonymous share projection. `firestore.rules` (`isExactPublicCharacterSheet`)
 *  and the projection function both require `sheet.build` to be byte-identical to its
 *  parent's, so the sheet is stamped in the SAME batch, under the PARENT's scope. */
const PUBLIC_SHEET = /^users\/([^/]+)\/characters\/([^/]+)\/public\/sheet$/;
/** Mirrors `ITEM_INSTANCE_ID_RE` in src/lib/resources.ts. */
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const COLLECTIONS = ["spells", "weapons", "equipment"] as const;
/** A monster template lands in no sheet array and owns no per-item identity. */
const SHEET_KINDS = new Set(["spell", "feature", "equipment", "weapon"]);

/** Exact, stable identity for one custom entry. The scope is the document family
 *  (`snapshots/<sid>/…` for a snapshot) plus the entry's zero-based ordinal in its
 *  own collection, so the same corpus always yields the same ids. */
export function deterministicCustomInstanceId(
  uid: string,
  charId: string,
  collection: string,
  ordinal: number
): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new RangeError("Custom-identity ordinal must be non-negative");
  }
  return `cu-${sha256(
    `custom-identity-v1\0${uid}\0${charId}\0${collection}\0${ordinal}`
  ).slice(0, 32)}`;
}

interface Stamped {
  data: RawMap;
  stamped: Record<string, number>;
  issues: MigrationIssue[];
}

function validId(value: unknown): string | undefined {
  return typeof value === "string" && ID_RE.test(value) ? value : undefined;
}

function count(stamped: Record<string, number>, collection: string): void {
  stamped[collection] = (stamped[collection] ?? 0) + 1;
}

function stampList(
  list: unknown,
  scope: [uid: string, charId: string, collection: string],
  path: string,
  seen: Set<string>,
  stamped: Record<string, number>,
  issues: MigrationIssue[]
): unknown {
  if (list === undefined) return undefined;
  if (!Array.isArray(list)) {
    issues.push({
      path,
      code: "invalid-envelope",
      detail: `${scope[2]} is not an array`,
    });
    return list;
  }
  const items: readonly unknown[] = list;
  return items.map((entry, ordinal) => {
    if (!isRecord(entry) || entry.custom !== true) return entry;
    const existing = validId(entry.instanceId);
    if (existing !== undefined) {
      if (seen.has(existing)) {
        issues.push({
          path,
          code: "duplicate-instance-id",
          detail: `${scope[2]}[${ordinal}]`,
        });
      }
      seen.add(existing);
      return entry;
    }
    const instanceId = deterministicCustomInstanceId(
      scope[0],
      scope[1],
      scope[2],
      ordinal
    );
    if (seen.has(instanceId)) {
      issues.push({
        path,
        code: "duplicate-instance-id",
        detail: `${scope[2]}[${ordinal}]`,
      });
      return entry;
    }
    seen.add(instanceId);
    count(stamped, scope[2]);
    // An INVALID stored id is replaced, never kept beside the stamped one.
    const { instanceId: _replaced, ...rest } = entry;
    void _replaced;
    return { ...rest, instanceId };
  });
}

/** Stamp one character envelope (a parent, or a snapshot under its own prefix).
 *  Every field this migration does not own is preserved by identity. */
export function stampEnvelope(
  uid: string,
  charId: string,
  prefix: string,
  data: RawMap,
  path: string
): Stamped {
  const issues: MigrationIssue[] = [];
  const stamped: Record<string, number> = {};
  if (!isRecord(data.build)) {
    issues.push({ path, code: "invalid-envelope", detail: "build is not a map" });
    return { data, stamped, issues };
  }
  const seen = new Set<string>();
  const build: RawMap = { ...data.build };
  for (const collection of COLLECTIONS) {
    const next = stampList(
      build[collection],
      [uid, charId, `${prefix}${collection}`],
      path,
      seen,
      stamped,
      issues
    );
    if (next !== undefined) build[collection] = next;
  }
  if (build.customs !== undefined) {
    if (!isRecord(build.customs)) {
      issues.push({ path, code: "invalid-envelope", detail: "customs is not a map" });
    } else if (build.customs.features !== undefined) {
      build.customs = {
        ...build.customs,
        features: stampList(
          build.customs.features,
          [uid, charId, `${prefix}customs.features`],
          path,
          seen,
          stamped,
          issues
        ),
      };
    }
  }
  return { data: { ...data, build }, stamped, issues };
}

/** Stamp the homebrew library index. A sheet-kind entry's item takes the entry's own
 *  id when that id is already a valid identity (both are individually stable, so the
 *  cheapest alignment keeps the one users' saved entries already carry), otherwise a
 *  deterministic id; `entry.id` then FOLLOWS the item, leaving one identity per entry. */
export function stampLibrary(uid: string, data: RawMap, path: string): Stamped {
  const issues: MigrationIssue[] = [];
  const stamped: Record<string, number> = {};
  if (data.entries === undefined) return { data, stamped, issues };
  if (!Array.isArray(data.entries)) {
    issues.push({ path, code: "invalid-envelope", detail: "entries is not an array" });
    return { data, stamped, issues };
  }
  const stored: readonly unknown[] = data.entries;
  // ONE id space for the whole document, across kinds: `entry.id` is the library's
  // primary key, so a sheet entry that adopted an id a monster template already holds
  // would collide on read. Ids of the entries this pass never rewrites (monsters,
  // unknown kinds) are therefore reserved BEFORE any stamping.
  const seen = new Set<string>();
  for (const entry of stored) {
    if (
      !isRecord(entry) ||
      (typeof entry.kind === "string" && SHEET_KINDS.has(entry.kind))
    ) {
      continue;
    }
    const reserved = validId(entry.id);
    if (reserved !== undefined) seen.add(reserved);
  }
  const entries = stored.map((entry, ordinal) => {
    if (!isRecord(entry) || typeof entry.kind !== "string" || !isRecord(entry.item)) {
      issues.push({
        path,
        code: "invalid-envelope",
        detail: `entries[${ordinal}] is not a library entry`,
      });
      return entry;
    }
    if (!SHEET_KINDS.has(entry.kind)) return entry;
    const item = entry.item;
    const instanceId =
      validId(item.instanceId) ??
      validId(entry.id) ??
      deterministicCustomInstanceId(uid, "library", entry.kind, ordinal);
    if (seen.has(instanceId)) {
      issues.push({
        path,
        code: "duplicate-instance-id",
        detail: `entries[${ordinal}]`,
      });
      return entry;
    }
    seen.add(instanceId);
    if (item.instanceId === instanceId && entry.id === instanceId) return entry;
    count(stamped, `library.${entry.kind}`);
    return { ...entry, id: instanceId, item: { ...item, instanceId } };
  });
  return { data: { ...data, entries }, stamped, issues };
}

export interface CustomIdentityDocumentPlan extends GuardedDocumentPlan {
  stamped: Record<string, number>;
}

export interface CustomIdentityPlan extends GuardedPlan<CustomIdentityDocumentPlan> {
  documents: CustomIdentityDocumentPlan[];
  changedDocuments: CustomIdentityDocumentPlan[];
  issues: MigrationIssue[];
  counts: {
    parents: number;
    snapshots: number;
    sheets: number;
    libraries: number;
    stampedByCollection: Record<string, number>;
  };
}

/** Build the complete, deterministic plan. Pure: no writes, credentials, or Firebase
 *  connection. A document with ANY issue is planned as no change at all. */
export function planCustomIdentity(
  sources: readonly MigrationSourceDocument[]
): CustomIdentityPlan {
  const issues: MigrationIssue[] = [];
  const documents: CustomIdentityDocumentPlan[] = [];
  const counts = {
    parents: 0,
    snapshots: 0,
    sheets: 0,
    libraries: 0,
    stampedByCollection: {} as Record<string, number>,
  };
  const seenPaths = new Set<string>();
  for (const source of [...sources].sort((left, right) =>
    left.path.localeCompare(right.path)
  )) {
    if (seenPaths.has(source.path)) {
      issues.push({
        path: source.path,
        code: "duplicate-document",
        detail: "The discovery set contains this path more than once",
      });
      continue;
    }
    seenPaths.add(source.path);
    const snapshot = SNAPSHOT.exec(source.path);
    const parent = PARENT.exec(source.path);
    const sheet = PUBLIC_SHEET.exec(source.path);
    const library = LIBRARY.exec(source.path);
    let result: Stamped;
    let kind: "parents" | "snapshots" | "sheets" | "libraries";
    if (sheet?.[1] && sheet[2]) {
      // The PARENT's scope, so parent and projection receive identical ids and the
      // byte-equality the rules demand survives the migration.
      kind = "sheets";
      result = stampEnvelope(sheet[1], sheet[2], "", source.data, source.path);
    } else if (snapshot?.[1] && snapshot[2] && snapshot[3]) {
      kind = "snapshots";
      result = stampEnvelope(
        snapshot[1],
        snapshot[2],
        `snapshots/${snapshot[3]}/`,
        source.data,
        source.path
      );
    } else if (parent?.[1] && parent[2]) {
      kind = "parents";
      result = stampEnvelope(parent[1], parent[2], "", source.data, source.path);
    } else if (library?.[1]) {
      kind = "libraries";
      result = stampLibrary(library[1], source.data, source.path);
    } else {
      issues.push({
        path: source.path,
        code: "unexpected-path",
        detail:
          "Only character parents, their snapshots, public sheets and library indexes are in scope",
      });
      continue;
    }
    if (result.issues.length > 0) {
      issues.push(...result.issues);
      continue;
    }
    counts[kind] += 1;
    const beforeHash = hashFirestoreDocument(source.data);
    const afterHash = hashFirestoreDocument(result.data);
    documents.push({
      path: source.path,
      before: source.data,
      after: result.data,
      beforeHash,
      afterHash,
      changed: beforeHash !== afterHash,
      stamped: result.stamped,
    });
    for (const [collection, stamps] of Object.entries(result.stamped)) {
      counts.stampedByCollection[collection] =
        (counts.stampedByCollection[collection] ?? 0) + stamps;
    }
  }
  return {
    documents,
    changedDocuments: documents.filter((document) => document.changed),
    issues,
    counts,
  };
}

/**
 * The corpus is migrated exactly when planning it again needs no change, raises no
 * issue, and every public projection still mirrors its parent's build byte for byte
 * (`isExactPublicCharacterSheet` in `firestore.rules` — a divergent sheet would make
 * the parent's next ordinary save, and every anonymous read, fail).
 */
export function verifyCustomIdentityCorpus(
  sources: readonly MigrationSourceDocument[]
): MigrationIssue[] {
  const plan = planCustomIdentity(sources);
  const issues: MigrationIssue[] = [
    ...plan.issues,
    ...plan.changedDocuments.map((document) => ({
      path: document.path,
      code: "verification-failed",
      detail: `${Object.values(document.stamped).reduce(
        (total, stamps) => total + stamps,
        0
      )} custom entry identity write(s) still pending`,
    })),
  ];
  const parentBuilds = new Map<string, string>();
  for (const document of plan.documents) {
    if (PARENT.test(document.path)) {
      parentBuilds.set(
        document.path,
        hashFirestoreDocument({ build: document.after.build })
      );
    }
  }
  for (const document of plan.documents) {
    if (!PUBLIC_SHEET.test(document.path)) continue;
    const parentBuild = parentBuilds.get(document.path.slice(0, -"/public/sheet".length));
    if (parentBuild === undefined) {
      issues.push({
        path: document.path,
        code: "missing-parent",
        detail: "A public sheet was discovered without a planned parent character",
      });
    } else if (parentBuild !== hashFirestoreDocument({ build: document.after.build })) {
      issues.push({
        path: document.path,
        code: "projection-mismatch",
        detail: "The public sheet build no longer equals its parent's build",
      });
    }
  }
  return issues;
}

/** The one report every mode prints: counts, hashes and issue codes only. */
export function reportFor(plan: CustomIdentityPlan) {
  return {
    format: "d20-folio-custom-identity-report-v1",
    counts: plan.counts,
    changed: plan.changedDocuments.map((document) => ({
      path: pathHash(document.path),
      before: document.beforeHash,
      after: document.afterHash,
      stamped: document.stamped,
    })),
    issues: plan.issues.map((issue) => ({
      path: pathHash(issue.path),
      code: issue.code,
    })),
  };
}

/** The exact field this migration owns, per family — never the whole envelope, so a
 *  concurrent unrelated field write on the same document is never clobbered. A public
 *  sheet takes the same `{ build }` write as its parent, in the SAME atomic batch. */
export function writesForCustomIdentity(document: GuardedDocumentPlan): GuardedWrite {
  return LIBRARY.test(document.path)
    ? { kind: "update", data: { entries: document.after.entries } }
    : { kind: "update", data: { build: document.after.build } };
}

export const DISCOVERY = [
  { collectionGroup: "characters", pattern: PARENT },
  { collectionGroup: "snapshots", pattern: SNAPSHOT },
  { collectionGroup: "public", pattern: PUBLIC_SHEET },
  { collectionGroup: "library", pattern: LIBRARY },
];

/** Plan over portable character exports (`{schema, build, state, meta?}`) on disk.
 *  The uid is the literal `fixtures` and the charId is the file stem, so the ids are
 *  reproducible without ever naming a file in the output. */
async function planFixtures(directory: string): Promise<CustomIdentityPlan> {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const sources: MigrationSourceDocument[] = [];
  for (const name of names) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(join(directory, name), "utf8"));
    } catch (error) {
      // A read/parse failure echoes the FILE NAME; report the fixture by hash.
      throw new Error(
        `Fixture ${pathHash(name)} could not be read: ${
          isRecord(error) && typeof error.code === "string" ? error.code : "parse error"
        }`,
        { cause: error }
      );
    }
    if (!isRecord(parsed)) {
      throw new TypeError(`Fixture ${pathHash(name)} is not an object`);
    }
    sources.push({
      path: `users/fixtures/characters/${name.slice(0, -".json".length)}`,
      data: parsed,
    });
  }
  return planCustomIdentity(sources);
}

async function run(): Promise<void> {
  const options = parseCliOptions(processArgv.slice(2));
  if (options.mode === "fixtures") {
    const plan = await planFixtures(options.directory);
    console.log(JSON.stringify(reportFor(plan), null, 2));
    if (plan.issues.length > 0) process.exitCode = 1;
    return;
  }
  const target = await readTargetConfiguration();
  const [{ initializeApp, applicationDefault }, { getFirestore }] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/firestore"),
  ]);
  const app = initializeApp({
    projectId: target.projectId,
    ...(target.emulator ? {} : { credential: applicationDefault() }),
  });
  console.log(
    `Target: ${target.projectId} (${target.emulator ? "explicit emulator" : "production read"})`
  );
  await runGuardedMigration({
    migration: "custom-identity",
    label: "custom-identity-v1",
    discover: (database) => discoverDocuments(database, DISCOVERY),
    plan: planCustomIdentity,
    verify: verifyCustomIdentityCorpus,
    writesFor: writesForCustomIdentity,
    report: reportFor,
    options,
    db: getFirestore(app),
  });
}

if (processArgv[1] && import.meta.url === pathToFileURL(resolve(processArgv[1])).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
