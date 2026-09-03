#!/usr/bin/env node
/**
 * migration-kit — the SHARED, migration-agnostic half of the one-off Firestore
 * migration protocol (ADR-0009): target assertion, CLI parsing, the tagged
 * backup codec, hashed reporting, discovery, and the guarded
 * dry-run/check/apply flow.
 *
 * Extracted verbatim from `scripts/migrate-item-resources.ts` (the first
 * migration written against this protocol) so a second migration cannot drift
 * from the reviewed safety rules: read-only by default, `--check` proves the
 * corpus migrated, and the ONLY write mode is
 * `--apply --backup /absolute/fresh/private/directory` — complete preflight,
 * recoverable backup, at most 500 update-time-guarded writes in ONE atomic
 * batch, then reread/hash, global and idempotency verification.
 *
 * REPORTING RULE: every line a migration prints carries counts, hashes and
 * issue CODES. Never a payload, never a raw document path — a uid or a
 * character id is an identifier, so paths leave this process only as
 * {@link pathHash} (and inside the operator's own private backup directory).
 */

/// <reference types="node" />

import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { env } from "node:process";
import {
  DocumentReference,
  GeoPoint,
  Timestamp,
  type DocumentReference as FirestoreDocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

export const TARGET_PROJECT_ID = "d20-folio";
export const MAX_CHANGED_DOCUMENTS = 500;

export type RawMap = Record<string, unknown>;

export function isRecord(value: unknown): value is RawMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sortedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortedJsonValue(child)])
  );
}

export function stableJson(value: unknown): string {
  return JSON.stringify(sortedJsonValue(value));
}

/** The ONLY form a document path may take in migration output. */
export function pathHash(path: string): string {
  return sha256(path).slice(0, 16);
}

// ── Tagged Firestore backup codec ───────────────────────────────────────────

export type TaggedFirestoreValue =
  | { tag: "null" }
  | { tag: "boolean"; value: boolean }
  | { tag: "string"; value: string }
  | { tag: "number"; value: string }
  | { tag: "timestamp"; seconds: number; nanoseconds: number }
  | { tag: "date"; value: string }
  | { tag: "geopoint"; latitude: number; longitude: number }
  | { tag: "bytes"; base64: string }
  | { tag: "reference"; path: string }
  | { tag: "array"; value: TaggedFirestoreValue[] }
  | { tag: "map"; value: Record<string, TaggedFirestoreValue> };

function encodedNumber(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Number.POSITIVE_INFINITY) return "Infinity";
  if (value === Number.NEGATIVE_INFINITY) return "-Infinity";
  if (Object.is(value, -0)) return "-0";
  return String(value);
}

function decodedNumber(value: string): number {
  if (value === "NaN") return Number.NaN;
  if (value === "Infinity") return Number.POSITIVE_INFINITY;
  if (value === "-Infinity") return Number.NEGATIVE_INFINITY;
  if (value === "-0") return -0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || String(parsed) !== value) {
    throw new TypeError(`Invalid tagged number: ${value}`);
  }
  return parsed;
}

export function encodeFirestoreValue(value: unknown): TaggedFirestoreValue {
  if (value === null) return { tag: "null" };
  if (typeof value === "boolean") return { tag: "boolean", value };
  if (typeof value === "string") return { tag: "string", value };
  if (typeof value === "number") return { tag: "number", value: encodedNumber(value) };
  if (value instanceof Timestamp) {
    return {
      tag: "timestamp",
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }
  if (value instanceof Date) return { tag: "date", value: value.toISOString() };
  if (value instanceof GeoPoint) {
    return {
      tag: "geopoint",
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { tag: "bytes", base64: Buffer.from(value).toString("base64") };
  }
  if (value instanceof DocumentReference) {
    return { tag: "reference", path: value.path };
  }
  if (Array.isArray(value)) {
    return { tag: "array", value: value.map(encodeFirestoreValue) };
  }
  if (isRecord(value)) {
    return {
      tag: "map",
      value: Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, encodeFirestoreValue(child)])
      ),
    };
  }
  throw new TypeError(`Unsupported Firestore backup value: ${typeof value}`);
}

export interface FirestoreDecodeAdapters {
  reference: (path: string) => unknown;
}

export function decodeFirestoreValue(
  value: TaggedFirestoreValue,
  adapters?: FirestoreDecodeAdapters
): unknown {
  switch (value.tag) {
    case "null":
      return null;
    case "boolean":
    case "string":
      return value.value;
    case "number":
      return decodedNumber(value.value);
    case "timestamp":
      return new Timestamp(value.seconds, value.nanoseconds);
    case "date":
      return new Date(value.value);
    case "geopoint":
      return new GeoPoint(value.latitude, value.longitude);
    case "bytes":
      return Buffer.from(value.base64, "base64");
    case "reference":
      if (!adapters) throw new TypeError("A reference adapter is required");
      return adapters.reference(value.path);
    case "array":
      return value.value.map((child) => decodeFirestoreValue(child, adapters));
    case "map":
      return Object.fromEntries(
        Object.entries(value.value).map(([key, child]) => [
          key,
          decodeFirestoreValue(child, adapters),
        ])
      );
  }
}

export function hashFirestoreDocument(data: RawMap): string {
  return sha256(stableJson(encodeFirestoreValue(data)));
}

// ── Shared plan vocabulary ──────────────────────────────────────────────────

export interface MigrationSourceDocument {
  path: string;
  data: RawMap;
}

/** A refusal to migrate one document. `code` is a stable, publishable token;
 *  `detail` never carries a payload value. */
export interface MigrationIssue {
  path: string;
  code: string;
  detail: string;
}

/** The minimum every migration's per-document plan must expose so the guarded
 *  flow can back it up, write it, and verify it by hash. */
export interface GuardedDocumentPlan {
  path: string;
  before: RawMap;
  after: RawMap;
  beforeHash: string;
  afterHash: string;
  changed: boolean;
}

export interface GuardedPlan<
  TDocument extends GuardedDocumentPlan = GuardedDocumentPlan,
> {
  documents: readonly TDocument[];
  changedDocuments: readonly TDocument[];
  issues: readonly MigrationIssue[];
}

export function assertCleanPreflight(plan: GuardedPlan): void {
  if (plan.issues.length > 0) {
    throw new Error(
      `Preflight found ${plan.issues.length} issue(s):\n${plan.issues
        .map((issue) => `${pathHash(issue.path)} [${issue.code}] ${issue.detail}`)
        .join("\n")}`
    );
  }
  if (plan.changedDocuments.length > MAX_CHANGED_DOCUMENTS) {
    throw new Error(
      `Refusing ${plan.changedDocuments.length} changed docs; atomic limit is ${MAX_CHANGED_DOCUMENTS}`
    );
  }
}

// ── Recoverable backup writer ───────────────────────────────────────────────

export interface BackupManifestEntry {
  path: string;
  file: string;
  beforeHash: string;
  afterHash: string;
  updateTime: TaggedFirestoreValue;
}

export interface BackupManifest {
  format: "d20-folio-migration-backup-v1";
  projectId: typeof TARGET_PROJECT_ID;
  migration: string;
  label: string;
  documents: BackupManifestEntry[];
}

export interface BackupInputDocument {
  plan: GuardedDocumentPlan;
  updateTime: Timestamp;
}

async function writePrivateFile(path: string, value: unknown): Promise<void> {
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.chmod(0o600);
  } finally {
    await handle.close();
  }
}

export async function writeBackupDirectory(args: {
  directory: string;
  migration: string;
  label: string;
  documents: readonly BackupInputDocument[];
}): Promise<BackupManifest> {
  if (!isAbsolute(args.directory) || resolve(args.directory) !== args.directory) {
    throw new Error("Backup directory must be an absolute normalized path");
  }
  try {
    await lstat(args.directory);
    throw new Error("Backup directory must be fresh (it already exists)");
  } catch (error) {
    if (!(isRecord(error) && error.code === "ENOENT")) throw error;
  }
  const parent = dirname(args.directory);
  const resolvedParent = await realpath(parent);
  const parentStat = await stat(resolvedParent);
  if (!parentStat.isDirectory()) throw new Error("Backup parent is not a directory");
  await access(resolvedParent, fsConstants.W_OK);
  await mkdir(args.directory, { mode: 0o700 });
  await chmod(args.directory, 0o700);

  const entries: BackupManifestEntry[] = [];
  for (const [index, document] of [...args.documents]
    .sort((left, right) => left.plan.path.localeCompare(right.plan.path))
    .entries()) {
    const file = `${String(index + 1).padStart(4, "0")}-${pathHash(document.plan.path)}.json`;
    const entry: BackupManifestEntry = {
      path: document.plan.path,
      file,
      beforeHash: document.plan.beforeHash,
      afterHash: document.plan.afterHash,
      updateTime: encodeFirestoreValue(document.updateTime),
    };
    await writePrivateFile(join(args.directory, file), {
      format: "d20-folio-firestore-document-v1",
      projectId: TARGET_PROJECT_ID,
      ...entry,
      data: encodeFirestoreValue(document.plan.before),
    });
    entries.push(entry);
  }
  const manifest: BackupManifest = {
    format: "d20-folio-migration-backup-v1",
    projectId: TARGET_PROJECT_ID,
    migration: args.migration,
    label: args.label,
    documents: entries,
  };
  await writePrivateFile(join(args.directory, "manifest.json"), manifest);
  return manifest;
}

// ── Guarded CLI ─────────────────────────────────────────────────────────────

export type CliOptions =
  | { mode: "dry-run" }
  | { mode: "check" }
  | { mode: "apply"; backupDirectory: string }
  | { mode: "fixtures"; directory: string };

/** The modes that talk to Firestore — `--fixtures` plans over local portable
 *  exports instead and never opens a connection. */
export type ConnectedCliOptions = Exclude<CliOptions, { mode: "fixtures" }>;

export function parseCliOptions(args: readonly string[]): CliOptions {
  let mode: CliOptions["mode"] = "dry-run";
  let explicitMode = false;
  let backupDirectory: string | undefined;
  let fixturesDirectory: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      if (explicitMode) throw new Error("Choose exactly one migration mode");
      explicitMode = true;
    } else if (arg === "--check") {
      if (explicitMode) throw new Error("Choose exactly one migration mode");
      explicitMode = true;
      mode = "check";
    } else if (arg === "--apply") {
      if (explicitMode) throw new Error("Choose exactly one migration mode");
      explicitMode = true;
      mode = "apply";
    } else if (arg === "--fixtures") {
      if (explicitMode) throw new Error("Choose exactly one migration mode");
      explicitMode = true;
      mode = "fixtures";
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--fixtures needs a path");
      fixturesDirectory = value;
      index += 1;
    } else if (arg === "--backup") {
      if (backupDirectory) throw new Error("Choose exactly one --backup directory");
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--backup needs a path");
      backupDirectory = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${String(arg)}`);
    }
  }
  if (mode === "apply") {
    if (!backupDirectory) throw new Error("--apply requires --backup");
    if (!isAbsolute(backupDirectory)) {
      throw new Error("--backup must name an absolute directory");
    }
    return { mode, backupDirectory: resolve(backupDirectory) };
  }
  if (backupDirectory) throw new Error("--backup is valid only with --apply");
  if (mode === "fixtures") {
    if (!fixturesDirectory) throw new Error("--fixtures needs a path");
    if (!isAbsolute(fixturesDirectory)) {
      throw new Error("--fixtures must name an absolute directory");
    }
    return { mode, directory: resolve(fixturesDirectory) };
  }
  return { mode };
}

export interface TargetConfiguration {
  emulatorHost?: string;
  credentialProjectId?: string;
  configuredProjectIds: readonly string[];
}

export function assertTargetProject(configuration: TargetConfiguration): {
  projectId: typeof TARGET_PROJECT_ID;
  emulator: boolean;
} {
  const emulator = configuration.emulatorHost !== undefined;
  if (emulator && configuration.emulatorHost?.trim() === "") {
    throw new Error("FIRESTORE_EMULATOR_HOST must not be blank");
  }
  const asserted = [
    ...configuration.configuredProjectIds,
    ...(configuration.credentialProjectId ? [configuration.credentialProjectId] : []),
  ];
  if (!emulator && !configuration.credentialProjectId) {
    throw new Error(
      "Production reads require an explicit service-account credential file"
    );
  }
  if (asserted.some((projectId) => projectId !== TARGET_PROJECT_ID)) {
    throw new Error(
      `Refusing project configuration: expected exactly ${TARGET_PROJECT_ID}`
    );
  }
  if (emulator && !asserted.includes(TARGET_PROJECT_ID)) {
    throw new Error(
      `Emulator mode requires an explicit ${TARGET_PROJECT_ID} project configuration`
    );
  }
  return { projectId: TARGET_PROJECT_ID, emulator };
}

export async function readTargetConfiguration(): Promise<{
  projectId: typeof TARGET_PROJECT_ID;
  emulator: boolean;
}> {
  const emulatorHost = env.FIRESTORE_EMULATOR_HOST;
  let credentialProjectId: string | undefined;
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credential = JSON.parse(
      await readFile(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
    ) as unknown;
    if (!isRecord(credential) || typeof credential.project_id !== "string") {
      throw new Error("Credential file has no project_id");
    }
    credentialProjectId = credential.project_id;
  }
  const configuredProjectIds = [env.GCLOUD_PROJECT, env.GOOGLE_CLOUD_PROJECT].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  if (env.FIREBASE_CONFIG?.trim().startsWith("{")) {
    const firebaseConfig = JSON.parse(env.FIREBASE_CONFIG) as unknown;
    if (isRecord(firebaseConfig) && typeof firebaseConfig.projectId === "string") {
      configuredProjectIds.push(firebaseConfig.projectId);
    }
  }
  return assertTargetProject({
    ...(emulatorHost !== undefined ? { emulatorHost } : {}),
    ...(credentialProjectId ? { credentialProjectId } : {}),
    configuredProjectIds,
  });
}

// ── Discovery ───────────────────────────────────────────────────────────────

export interface DiscoveredDocument {
  source: MigrationSourceDocument;
  ref: FirestoreDocumentReference;
  updateTime: Timestamp;
}

/** One collection-group query plus the exact path shape it may contribute. The
 *  group name cannot be inferred from the pattern without parsing a regular
 *  expression, so a matcher names both. */
export interface DiscoveryMatcher {
  collectionGroup: string;
  pattern: RegExp;
}

function discovered(snapshot: QueryDocumentSnapshot): DiscoveredDocument {
  return {
    source: { path: snapshot.ref.path, data: snapshot.data() },
    ref: snapshot.ref,
    updateTime: snapshot.updateTime,
  };
}

export async function discoverDocuments(
  db: Firestore,
  matchers: readonly DiscoveryMatcher[]
): Promise<DiscoveredDocument[]> {
  const results = await Promise.all(
    matchers.map((matcher) => db.collectionGroup(matcher.collectionGroup).get())
  );
  const byPath = new Map<string, DiscoveredDocument>();
  matchers.forEach((matcher, index) => {
    for (const snapshot of results[index]?.docs ?? []) {
      if (!matcher.pattern.test(snapshot.ref.path)) continue;
      byPath.set(snapshot.ref.path, discovered(snapshot));
    }
  });
  return [...byPath.values()].sort((left, right) =>
    left.source.path.localeCompare(right.source.path)
  );
}

// ── The guarded dry-run / check / apply flow ────────────────────────────────

export interface GuardedWrite {
  kind: "update" | "create";
  data: RawMap;
}

export interface GuardedMigrationArgs<TPlan extends GuardedPlan> {
  migration: string;
  label: string;
  discover: (db: Firestore) => Promise<DiscoveredDocument[]>;
  plan: (sources: readonly MigrationSourceDocument[]) => TPlan;
  verify: (sources: readonly MigrationSourceDocument[]) => MigrationIssue[];
  /** The exact fields this migration owns, per changed document — never the
   *  whole envelope, so an unrelated concurrent field write survives. */
  writesFor: (document: GuardedDocumentPlan) => GuardedWrite;
  report: (plan: TPlan) => unknown;
  options: ConnectedCliOptions;
  db: Firestore;
}

/**
 * Plan → report → (apply only) preflight → backup → ONE guarded batch → reread
 * and per-document hash verification → global verification → idempotency.
 * Every failure throws before the next stage, so a run either completes the
 * whole protocol or leaves an explicit, recoverable failure behind.
 */
export async function runGuardedMigration<TPlan extends GuardedPlan>(
  args: GuardedMigrationArgs<TPlan>
): Promise<void> {
  const discoveredDocs = await args.discover(args.db);
  const sources = discoveredDocs.map((document) => document.source);
  const plan = args.plan(sources);
  console.log(JSON.stringify(args.report(plan), null, 2));

  if (args.options.mode === "dry-run") return;

  if (args.options.mode === "check") {
    const corpusIssues = [...plan.issues, ...args.verify(sources)];
    if (corpusIssues.length > 0 || plan.changedDocuments.length > 0) {
      // The CODES are what tells the operator whether this is a corpus still waiting
      // for its apply or a document that must be hand-fixed first — the full report is
      // above, but the failure line must be readable on its own.
      const codes = [...new Set(corpusIssues.map((issue) => issue.code))];
      throw new Error(
        `Check failed: ${corpusIssues.length} verification issue(s)${
          codes.length > 0 ? ` [${codes.join(", ")}]` : ""
        }, ${plan.changedDocuments.length} pending change(s)`
      );
    }
    // Planning the LIVE corpus and finding zero changes IS the idempotency
    // property; there is no second plan to run, so the line says exactly that.
    console.log("Check passed: corpus verified, zero pending changes");
    return;
  }

  assertCleanPreflight(plan);
  const projectedIssues = args.verify(
    plan.documents.map((document) => ({ path: document.path, data: document.after }))
  );
  if (projectedIssues.length > 0) {
    throw new Error(
      `Apply preflight found ${projectedIssues.length} projected corpus verification issue(s)`
    );
  }

  const discoveredByPath = new Map(
    discoveredDocs.map((document) => [document.source.path, document] as const)
  );
  await writeBackupDirectory({
    directory: args.options.backupDirectory,
    migration: args.migration,
    label: args.label,
    documents: plan.changedDocuments.flatMap((document) => {
      const found = discoveredByPath.get(document.path);
      return found ? [{ plan: document, updateTime: found.updateTime }] : [];
    }),
  });
  console.log(`Backup complete: ${args.options.backupDirectory}`);

  if (plan.changedDocuments.length > 0) {
    const batch = args.db.batch();
    for (const document of plan.changedDocuments) {
      const write = args.writesFor(document);
      const found = discoveredByPath.get(document.path);
      if (write.kind === "create") {
        if (found)
          throw new Error(`Refusing to create an existing ${pathHash(document.path)}`);
        batch.create(args.db.doc(document.path), write.data);
      } else {
        if (!found) throw new Error(`Preflight lost ${pathHash(document.path)}`);
        batch.update(found.ref, write.data, { lastUpdateTime: found.updateTime });
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      // A precondition rejection names the offending document path; report the
      // failure by CODE only (the original stays attached as `cause`, which the CLI
      // never prints — it logs `error.message` alone).
      const raw = isRecord(error) ? error.code : undefined;
      const code =
        typeof raw === "string" || typeof raw === "number" ? String(raw) : "unknown";
      throw new Error(
        `Batch commit refused for ${plan.changedDocuments.length} document(s) [code ${code}]; nothing was written`,
        { cause: error }
      );
    }
  }

  for (const document of plan.changedDocuments) {
    const ref = discoveredByPath.get(document.path)?.ref ?? args.db.doc(document.path);
    const snapshot = await ref.get();
    const data = snapshot.data();
    if (!data) throw new Error(`Verification read lost ${pathHash(document.path)}`);
    const actualHash = hashFirestoreDocument(data);
    // Per document this proves the stored bytes are EXACTLY what was planned;
    // `verify` is a CORPUS predicate (it may compare a document against another,
    // such as a public projection against its parent) and runs globally below.
    if (actualHash !== document.afterHash) {
      throw new Error(
        `Reread/hash verification failed for ${pathHash(document.path)}: expected ${document.afterHash}, got ${actualHash}`
      );
    }
  }
  console.log("Reread/hash verification passed");

  const postSources = (await args.discover(args.db)).map((document) => document.source);
  const globalIssues = args.verify(postSources);
  if (globalIssues.length > 0) {
    throw new Error(
      `Global check failed: ${globalIssues.length} issue(s) [${[
        ...new Set(globalIssues.map((issue) => issue.code)),
      ].join(", ")}]`
    );
  }
  console.log("Global check passed");
  const idempotency = args.plan(postSources);
  assertCleanPreflight(idempotency);
  if (idempotency.changedDocuments.length > 0) {
    throw new Error(
      `Idempotency check found ${idempotency.changedDocuments.length} pending change(s)`
    );
  }
  console.log("Idempotency check passed");
}

/**
 * The refusal message when a run's module composition cannot be trusted, else
 * `undefined`. Scripts that hydrate through the SRD-aware codec would see a pack-only
 * id as unknown when `@pack` resolved to the typed-empty stub (absent `content-pack`
 * symlink, `VITE_CONTENT_PACK=0`, a renamed loader warm-up target). BOTH signals are
 * required: the documented switch saying the pack SHOULD compose, and a positive runtime
 * count saying it DID.
 */
export function packCompositionRefusal(
  enabled: boolean,
  packSpellCount: number
): string | undefined {
  return enabled && packSpellCount > 0
    ? undefined
    : "Refusing: content pack not composed — the plan would rewrite pack-only references";
}
