#!/usr/bin/env node
/**
 * One-off migration for physical magic-item identities and item-owned resources.
 *
 * Read-only by default. `--check` proves the whole corpus is migrated. The only
 * write mode is `--apply --backup /absolute/fresh/private/directory`: it performs
 * a complete preflight, writes a recoverable backup, then commits at most 500
 * update-time-guarded document updates in one atomic batch.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-item-resources.ts
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-item-resources.ts --check
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-item-resources.ts \
 *     --apply --backup /absolute/fresh/private/directory
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
import { argv as processArgv, env, exit } from "node:process";
import { pathToFileURL } from "node:url";
import {
  DocumentReference,
  GeoPoint,
  Timestamp,
  type DocumentReference as FirestoreDocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { contentPackEnabled } from "./content-pack-mode.ts";

export const TARGET_PROJECT_ID = "d20-folio";
export const MAX_CHANGED_DOCUMENTS = 500;
const ENVELOPE_SCHEMA = 3;

type RawMap = Record<string, unknown>;
export interface MigrationCatalogueItem extends RawMap {
  id: string;
  resources?: readonly RawMap[];
}

interface MigrationEquipmentRef extends RawMap {
  srdId: string;
  instanceId?: string;
  quantity?: number;
  charges?: unknown;
}

interface MigrationDoc {
  character: { equipment: RawMap[] };
  session: {
    trackers: Record<string, { used: number; rolls?: unknown }>;
    itemResources?: RawMap;
  };
}

type MigrationEngineResult =
  | {
      status: "migrated" | "unchanged";
      doc: MigrationDoc;
      stampedInstances: number;
      migratedOwners: number;
    }
  | { status: "ambiguous"; doc: MigrationDoc; ambiguities: unknown[] };

interface ItemResourceModule {
  isItemInstanceId: (value: unknown) => value is string;
  migrateLegacyItemResources: (
    doc: MigrationDoc,
    catalogue: readonly MigrationCatalogueItem[],
    idFactory: () => string
  ) => MigrationEngineResult;
  parseItemResources: (value: unknown) => { ok: true; value: RawMap } | { ok: false };
  resolveItemResources: (args: {
    equipment: readonly RawMap[];
    catalogue: readonly MigrationCatalogueItem[];
    itemResources?: unknown;
  }) => { resources: unknown[]; omissions: unknown[] };
}

function asItemResourceModule(value: unknown): ItemResourceModule {
  if (
    !isRecord(value) ||
    typeof value.isItemInstanceId !== "function" ||
    typeof value.migrateLegacyItemResources !== "function" ||
    typeof value.parseItemResources !== "function" ||
    typeof value.resolveItemResources !== "function"
  ) {
    throw new TypeError("Item-resource engine module is incomplete");
  }
  return value as unknown as ItemResourceModule;
}

// A non-literal direct URL keeps the Node-only scripts TS project isolated from
// the app graph; at runtime this still reuses the canonical pure engine module.
const itemResourceModuleUrl = new URL("../src/lib/item-resources.ts", import.meta.url)
  .href;
const {
  isItemInstanceId,
  migrateLegacyItemResources,
  parseItemResources,
  resolveItemResources,
} = asItemResourceModule(await import(itemResourceModuleUrl));

const COMBAT_SESSION_KEYS = [
  "hp",
  "conditions",
  "initiative",
  "deathSucc",
  "deathFail",
  "bardicInspirationDie",
  "inspiration",
] as const;

const MAIN_PATH = /^users\/([^/]+)\/characters\/([^/]+)$/;
const SNAPSHOT_PATH = /^users\/([^/]+)\/characters\/([^/]+)\/snapshots\/([^/]+)$/;

function isRecord(value: unknown): value is RawMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJsonValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortedJsonValue(child)])
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortedJsonValue(value));
}

/** Exact, stable identity for a generated physical copy. Ordinals are zero-based
 * per catalogue item in equipment order, including copies expanded from quantity. */
export function deterministicItemInstanceId(
  uid: string,
  charId: string,
  itemId: string,
  ordinal: number
): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new TypeError("Item-resource ordinal must be a non-negative safe integer");
  }
  return `mi-${sha256(`item-resource-v1\0${uid}\0${charId}\0${itemId}\0${ordinal}`).slice(
    0,
    32
  )}`;
}

// ── Catalogue lock ──────────────────────────────────────────────────────────

export type CatalogueMode = "srd-only" | "composed";

/** Pinned after the migration corpus was authored. A changed resource catalogue
 * changes migration meaning, so the one-off must be reviewed and re-pinned. */
export const EXPECTED_CATALOGUE_FINGERPRINTS: Readonly<Record<CatalogueMode, string>> = {
  "srd-only": "3e87784026a8135eb886699146a1fe382d2c6c05f659d345b02d9df6e72d972a",
  composed: "61eb403c86fa685707b8055745f6076838dcbe8485ad14e347d1cfd17fcd3a3e",
};

export function catalogueFingerprint(
  catalogue: readonly MigrationCatalogueItem[]
): string {
  const resourceItems = catalogue
    .filter((item) => item.resources?.length)
    .map((item) => ({ id: item.id, resources: item.resources }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return sha256(stableJson(resourceItems));
}

export function assertCatalogueFingerprint(
  catalogue: readonly MigrationCatalogueItem[],
  mode: CatalogueMode,
  expected: Readonly<Record<CatalogueMode, string>> = EXPECTED_CATALOGUE_FINGERPRINTS
): string {
  const ids = new Set<string>();
  for (const item of catalogue) {
    if (ids.has(item.id)) throw new Error(`Duplicate magic-item id: ${item.id}`);
    ids.add(item.id);
  }
  const actual = catalogueFingerprint(catalogue);
  if (actual !== expected[mode]) {
    throw new Error(
      `Catalogue fingerprint mismatch for ${mode}: expected ${expected[mode]}, got ${actual}`
    );
  }
  return actual;
}

function exportedArray(module: unknown, key: string): MigrationCatalogueItem[] {
  if (!isRecord(module) || !Array.isArray(module[key])) {
    throw new TypeError(`Magic-item module does not export ${key}[]`);
  }
  return module[key] as MigrationCatalogueItem[];
}

/** Load the three public parts directly and, only in composed mode, the private
 * data module directly. This tooling path never traverses a runtime pack barrel. */
export async function loadMigrationCatalogue(): Promise<{
  items: MigrationCatalogueItem[];
  mode: CatalogueMode;
  fingerprint: string;
}> {
  const publicModules = await Promise.all(
    ["part-1", "part-2", "part-3"].map(
      (part) =>
        import(new URL(`../src/data/magic-items/${part}.ts`, import.meta.url).href)
    )
  );
  const items = [
    ...exportedArray(publicModules[0], "MAGIC_ITEMS_PART_1"),
    ...exportedArray(publicModules[1], "MAGIC_ITEMS_PART_2"),
    ...exportedArray(publicModules[2], "MAGIC_ITEMS_PART_3"),
  ];
  const mode: CatalogueMode = contentPackEnabled() ? "composed" : "srd-only";
  if (mode === "composed") {
    const packModule: unknown = await import(
      new URL("../content-pack/data/magic-items.ts", import.meta.url).href
    );
    items.push(...exportedArray(packModule, "packMagicItems"));
  }
  return { items, mode, fingerprint: assertCatalogueFingerprint(items, mode) };
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

// ── Pure planner ────────────────────────────────────────────────────────────

export interface MigrationSourceDocument {
  path: string;
  data: RawMap;
}

export interface MigrationIssue {
  path: string;
  code:
    | "unexpected-path"
    | "duplicate-document"
    | "missing-main"
    | "invalid-envelope"
    | "combat-trio-on-main"
    | "invalid-raw-instance-id"
    | "migration-ambiguity"
    | "projection-failed"
    | "verification-failed";
  detail: string;
}

export interface MigrationDocumentPlan {
  path: string;
  before: RawMap;
  after: RawMap;
  beforeHash: string;
  afterHash: string;
  changed: boolean;
  stampedInstances: number;
  migratedOwners: number;
}

export interface ItemResourceMigrationPlan {
  catalogueFingerprint: string;
  documents: MigrationDocumentPlan[];
  issues: MigrationIssue[];
  changedDocuments: MigrationDocumentPlan[];
}

interface ParsedSource {
  source: MigrationSourceDocument;
  kind: "main" | "snapshot";
  uid: string;
  charId: string;
  build: RawMap;
  state: RawMap;
  doc: MigrationDoc;
}

function trackerState(value: unknown): { used: number; rolls?: unknown } {
  if (typeof value === "number") return { used: value };
  if (!isRecord(value)) return { used: Number.NaN };
  return {
    used: typeof value.used === "number" ? value.used : 0,
    ...(value.rolls !== undefined ? { rolls: value.rolls } : {}),
  };
}

/** The runtime migrator deliberately reads only `character.equipment` and the two
 * session resource maps. Adapt those exact envelope fields without normalizing any
 * unrelated build/state data through the full application codec. */
function migrationDoc(build: RawMap, state: RawMap): MigrationDoc {
  const equipment = Array.isArray(build.equipment)
    ? build.equipment.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        if (entry.custom === true && typeof entry.name === "string") return [entry];
        if (typeof entry.srdId !== "string") return [];
        const { custom: _invalidCustomMarker, ...srdRef } = entry;
        void _invalidCustomMarker;
        return [srdRef];
      })
    : [];
  const trackers = isRecord(state.trackers)
    ? Object.fromEntries(
        Object.entries(state.trackers).map(([id, value]) => [id, trackerState(value)])
      )
    : {};
  const parsedResources = parseItemResources(state.itemResources);
  if (!parsedResources.ok) throw new TypeError("invalid-item-resources");
  return {
    character: { equipment },
    session: {
      trackers,
      ...(Object.keys(parsedResources.value).length > 0
        ? { itemResources: parsedResources.value }
        : {}),
    },
  };
}

function pathIdentity(
  path: string
):
  | { kind: "main"; uid: string; charId: string }
  | { kind: "snapshot"; uid: string; charId: string }
  | undefined {
  const main = MAIN_PATH.exec(path);
  if (main?.[1] && main[2]) {
    return { kind: "main", uid: main[1], charId: main[2] };
  }
  const snapshot = SNAPSHOT_PATH.exec(path);
  if (snapshot?.[1] && snapshot[2] && snapshot[3]) {
    return {
      kind: "snapshot",
      uid: snapshot[1],
      charId: snapshot[2],
    };
  }
  return undefined;
}

function parseSourceDocument(
  source: MigrationSourceDocument
): { ok: true; value: ParsedSource } | { ok: false; issue: MigrationIssue } {
  const identity = pathIdentity(source.path);
  if (!identity) {
    return {
      ok: false,
      issue: {
        path: source.path,
        code: "unexpected-path",
        detail: "Only user character documents and their snapshots are in scope",
      },
    };
  }
  if (
    source.data.schema !== ENVELOPE_SCHEMA ||
    !isRecord(source.data.build) ||
    !isRecord(source.data.state)
  ) {
    return {
      ok: false,
      issue: {
        path: source.path,
        code: "invalid-envelope",
        detail: `Expected schema ${ENVELOPE_SCHEMA} with object build/state`,
      },
    };
  }
  const build = source.data.build;
  const state = source.data.state;
  if (identity.kind === "main" && COMBAT_SESSION_KEYS.some((key) => key in state)) {
    return {
      ok: false,
      issue: {
        path: source.path,
        code: "combat-trio-on-main",
        detail: "The Firestore parent state must omit the combat-owned keys",
      },
    };
  }
  let doc: MigrationDoc;
  try {
    doc = migrationDoc(build, state);
  } catch (error) {
    return {
      ok: false,
      issue: {
        path: source.path,
        code: "invalid-envelope",
        detail: error instanceof Error ? error.message : String(error),
      },
    };
  }
  return {
    ok: true,
    value: {
      source,
      kind: identity.kind,
      uid: identity.uid,
      charId: identity.charId,
      build,
      state,
      doc,
    },
  };
}

function physicalCopies(quantity: unknown): number {
  return Number.isSafeInteger(quantity) && (quantity as number) >= 1
    ? (quantity as number)
    : 1;
}

function isRawSrdRef(value: unknown): value is RawMap & { srdId: string } {
  return (
    isRecord(value) &&
    typeof value.srdId === "string" &&
    !(value.custom === true && typeof value.name === "string")
  );
}

function isMigrationSrdRef(value: RawMap): value is MigrationEquipmentRef {
  return !("custom" in value) && typeof value.srdId === "string";
}

function resourceCatalogueMap(
  catalogue: readonly MigrationCatalogueItem[]
): Map<string, MigrationCatalogueItem> {
  return new Map(
    catalogue
      .filter((item) => item.resources?.length)
      .map((item) => [item.id, item] as const)
  );
}

function rawIdentityIssues(
  parsed: ParsedSource,
  catalogue: ReadonlyMap<string, MigrationCatalogueItem>
): MigrationIssue[] {
  const equipment = Array.isArray(parsed.build.equipment) ? parsed.build.equipment : [];
  const issues: MigrationIssue[] = [];
  equipment.forEach((entry, index) => {
    if (!isRawSrdRef(entry) || !catalogue.has(entry.srdId)) return;
    if (entry.instanceId !== undefined && !isItemInstanceId(entry.instanceId)) {
      issues.push({
        path: parsed.source.path,
        code: "invalid-raw-instance-id",
        detail: `${entry.srdId} at equipment[${index}] has an invalid instanceId`,
      });
    }
  });
  return issues;
}

function generatedIdQueue(
  parsed: ParsedSource,
  catalogue: ReadonlyMap<string, MigrationCatalogueItem>,
  mainIds?: ReadonlyMap<string, readonly string[]>
): string[] {
  const ordinals = new Map<string, number>();
  const queue: string[] = [];
  for (const entry of parsed.doc.character.equipment) {
    if (!isMigrationSrdRef(entry) || !catalogue.has(entry.srdId)) continue;
    const copies = physicalCopies(entry.quantity);
    for (let copy = 0; copy < copies; copy += 1) {
      const ordinal = ordinals.get(entry.srdId) ?? 0;
      ordinals.set(entry.srdId, ordinal + 1);
      const existingId = copy === 0 ? entry.instanceId : undefined;
      if (existingId !== undefined) continue;
      queue.push(
        mainIds?.get(entry.srdId)?.[ordinal] ??
          deterministicItemInstanceId(parsed.uid, parsed.charId, entry.srdId, ordinal)
      );
    }
  }
  return queue;
}

function instanceIdsByItem(
  doc: MigrationDoc,
  catalogue: ReadonlyMap<string, MigrationCatalogueItem>
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const entry of doc.character.equipment) {
    if (!isMigrationSrdRef(entry) || !catalogue.has(entry.srdId) || !entry.instanceId) {
      continue;
    }
    const ids = result.get(entry.srdId) ?? [];
    ids.push(entry.instanceId);
    result.set(entry.srdId, ids);
  }
  return result;
}

function projectEquipment(
  raw: unknown,
  migrated: MigrationDoc,
  catalogue: ReadonlyMap<string, MigrationCatalogueItem>
): unknown[] {
  if (!Array.isArray(raw)) return [];
  const migratedRefs = migrated.character.equipment.filter(
    (entry): entry is MigrationEquipmentRef =>
      isMigrationSrdRef(entry) && catalogue.has(entry.srdId)
  );
  let cursor = 0;
  const projected: unknown[] = [];
  for (const entry of raw) {
    if (!isRawSrdRef(entry) || !catalogue.has(entry.srdId)) {
      projected.push(entry);
      continue;
    }
    for (let copy = 0; copy < physicalCopies(entry.quantity); copy += 1) {
      const migratedRef = migratedRefs[cursor];
      cursor += 1;
      if (!migratedRef || migratedRef.srdId !== entry.srdId) {
        throw new Error("Raw/parsed resource equipment order diverged");
      }
      const next: RawMap = {
        ...entry,
        instanceId: migratedRef.instanceId,
        quantity: 1,
      };
      if (migratedRef.charges === undefined) delete next.charges;
      projected.push(next);
    }
  }
  if (cursor !== migratedRefs.length) {
    throw new Error("Raw/parsed resource equipment count diverged");
  }
  return projected;
}

function projectTrackers(raw: RawMap, before: MigrationDoc, after: MigrationDoc): RawMap {
  const next = { ...raw };
  const removed = new Set(
    Object.keys(before.session.trackers).filter(
      (trackerId) => after.session.trackers[trackerId] === undefined
    )
  );
  if (removed.size === 0) return next;
  const rawTrackers = isRecord(raw.trackers)
    ? Object.fromEntries(
        Object.entries(raw.trackers).filter(([trackerId]) => !removed.has(trackerId))
      )
    : undefined;
  if (rawTrackers && Object.keys(rawTrackers).length > 0) next.trackers = rawTrackers;
  else if (rawTrackers) delete next.trackers;
  return next;
}

function projectMigratedDocument(
  parsed: ParsedSource,
  migrated: MigrationDoc,
  catalogue: ReadonlyMap<string, MigrationCatalogueItem>
): RawMap {
  const nextBuild: RawMap = {
    ...parsed.build,
    equipment: projectEquipment(parsed.build.equipment, migrated, catalogue),
  };
  let nextState = projectTrackers(parsed.state, parsed.doc, migrated);
  if (
    migrated.session.itemResources &&
    Object.keys(migrated.session.itemResources).length > 0
  ) {
    nextState = { ...nextState, itemResources: migrated.session.itemResources };
  }
  const after: RawMap = {
    ...parsed.source.data,
    build: nextBuild,
    state: nextState,
  };
  // The roster cache has no item identity/resource-owner field; stamping ids,
  // splitting quantity, and moving charges cannot change its canonical projection.
  // Preserve it byte-for-byte instead of pulling the UI/runtime grant graph into
  // this one-off Node process merely to recompute the same value.
  return after;
}

function verifyRawDocument(
  source: MigrationSourceDocument,
  catalogueItems: readonly MigrationCatalogueItem[]
): MigrationIssue[] {
  const parsedResult = parseSourceDocument(source);
  if (!parsedResult.ok) return [parsedResult.issue];
  const parsed = parsedResult.value;
  const catalogue = resourceCatalogueMap(catalogueItems);
  const issues = rawIdentityIssues(parsed, catalogue);
  const refs = parsed.doc.character.equipment.filter(
    (entry): entry is MigrationEquipmentRef =>
      isMigrationSrdRef(entry) && catalogue.has(entry.srdId)
  );
  const rawEquipment = Array.isArray(parsed.build.equipment)
    ? parsed.build.equipment
    : [];
  if (
    rawEquipment.some(
      (entry) => isRawSrdRef(entry) && catalogue.has(entry.srdId) && "charges" in entry
    )
  ) {
    issues.push({
      path: source.path,
      code: "verification-failed",
      detail: "A resource-bearing equipment ref still owns legacy charges",
    });
  }
  for (const ref of refs) {
    if (!ref.instanceId || (ref.quantity !== undefined && ref.quantity !== 1)) {
      issues.push({
        path: source.path,
        code: "verification-failed",
        detail: `${ref.srdId} lacks one normalized physical-copy identity`,
      });
    }
  }
  const rawTrackers = isRecord(parsed.state.trackers) ? parsed.state.trackers : {};
  const resourceIds = new Set(refs.map((ref) => ref.srdId));
  for (const itemId of resourceIds) {
    if (Object.hasOwn(rawTrackers, itemId)) {
      issues.push({
        path: source.path,
        code: "verification-failed",
        detail: `${itemId} still owns a legacy session tracker`,
      });
    }
  }
  const itemResources = parsed.doc.session.itemResources ?? {};
  const refByInstance = new Map(
    refs.flatMap((ref) => (ref.instanceId ? [[ref.instanceId, ref] as const] : []))
  );
  for (const [instanceId, state] of Object.entries(itemResources)) {
    const ref = refByInstance.get(instanceId);
    if (!ref || !isRecord(state) || ref.srdId !== state.itemId) {
      issues.push({
        path: source.path,
        code: "verification-failed",
        detail: `${instanceId} is an orphaned or mismatched itemResources owner`,
      });
    }
  }
  const resolved = resolveItemResources({
    equipment: parsed.doc.character.equipment,
    catalogue: catalogueItems,
    itemResources: parsed.state.itemResources,
  });
  const expectedCount = refs.reduce(
    (count, ref) => count + (catalogue.get(ref.srdId)?.resources?.length ?? 0),
    0
  );
  if (resolved.omissions.length > 0 || resolved.resources.length !== expectedCount) {
    issues.push({
      path: source.path,
      code: "verification-failed",
      detail: `Resource resolution returned ${resolved.omissions.length} omissions and ${resolved.resources.length}/${expectedCount} resources`,
    });
  }
  return issues;
}

function planParsedDocument(
  parsed: ParsedSource,
  catalogueItems: readonly MigrationCatalogueItem[],
  catalogue: ReadonlyMap<string, MigrationCatalogueItem>,
  mainIds?: ReadonlyMap<string, readonly string[]>
):
  | { ok: true; plan: MigrationDocumentPlan; migrated: MigrationDoc }
  | { ok: false; issues: MigrationIssue[] } {
  const rawIssues = rawIdentityIssues(parsed, catalogue);
  if (rawIssues.length > 0) return { ok: false, issues: rawIssues };
  const ids = generatedIdQueue(parsed, catalogue, mainIds);
  let cursor = 0;
  const result = migrateLegacyItemResources(
    parsed.doc,
    catalogueItems,
    () => ids[cursor++] ?? "invalid-generated-id"
  );
  if (result.status === "ambiguous") {
    return {
      ok: false,
      issues: [
        {
          path: parsed.source.path,
          code: "migration-ambiguity",
          detail: stableJson(result.ambiguities),
        },
      ],
    };
  }
  let after = parsed.source.data;
  if (result.status === "migrated") {
    try {
      after = projectMigratedDocument(parsed, result.doc, catalogue);
    } catch (error) {
      return {
        ok: false,
        issues: [
          {
            path: parsed.source.path,
            code: "projection-failed",
            detail: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }
  const verification = verifyRawDocument(
    { path: parsed.source.path, data: after },
    catalogueItems
  );
  if (verification.length > 0) return { ok: false, issues: verification };
  const beforeHash = hashFirestoreDocument(parsed.source.data);
  const afterHash = hashFirestoreDocument(after);
  return {
    ok: true,
    migrated: result.doc,
    plan: {
      path: parsed.source.path,
      before: parsed.source.data,
      after,
      beforeHash,
      afterHash,
      changed: beforeHash !== afterHash,
      stampedInstances: result.stampedInstances,
      migratedOwners: result.migratedOwners,
    },
  };
}

/** Build a complete, deterministic plan. No writes, credentials, or Firebase
 * connection are needed. Every issue is collected before the caller can apply. */
export function planItemResourceMigration(
  sources: readonly MigrationSourceDocument[],
  catalogueItems: readonly MigrationCatalogueItem[]
): ItemResourceMigrationPlan {
  const issues: MigrationIssue[] = [];
  const parsedByFamily = new Map<
    string,
    { main?: ParsedSource; snapshots: ParsedSource[] }
  >();
  const seenPaths = new Set<string>();
  for (const source of sources) {
    if (seenPaths.has(source.path)) {
      issues.push({
        path: source.path,
        code: "duplicate-document",
        detail: "The discovery set contains this path more than once",
      });
      continue;
    }
    seenPaths.add(source.path);
    const parsed = parseSourceDocument(source);
    if (!parsed.ok) {
      issues.push(parsed.issue);
      continue;
    }
    const key = `${parsed.value.uid}\0${parsed.value.charId}`;
    const family = parsedByFamily.get(key) ?? { snapshots: [] };
    if (parsed.value.kind === "main") {
      if (family.main) {
        issues.push({
          path: source.path,
          code: "duplicate-document",
          detail: "Character family contains more than one main document",
        });
      } else {
        family.main = parsed.value;
      }
    } else {
      family.snapshots.push(parsed.value);
    }
    parsedByFamily.set(key, family);
  }
  const catalogue = resourceCatalogueMap(catalogueItems);
  const documents: MigrationDocumentPlan[] = [];
  for (const [, family] of [...parsedByFamily].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (!family.main) {
      for (const snapshot of family.snapshots) {
        issues.push({
          path: snapshot.source.path,
          code: "missing-main",
          detail: "Snapshot was discovered without its parent character document",
        });
      }
      continue;
    }
    const mainResult = planParsedDocument(family.main, catalogueItems, catalogue);
    let mainIds: ReadonlyMap<string, readonly string[]> | undefined;
    if (mainResult.ok) {
      documents.push(mainResult.plan);
      mainIds = instanceIdsByItem(mainResult.migrated, catalogue);
    } else {
      issues.push(...mainResult.issues);
    }
    for (const snapshot of family.snapshots.sort((left, right) =>
      left.source.path.localeCompare(right.source.path)
    )) {
      const snapshotResult = planParsedDocument(
        snapshot,
        catalogueItems,
        catalogue,
        mainIds
      );
      if (snapshotResult.ok) documents.push(snapshotResult.plan);
      else issues.push(...snapshotResult.issues);
    }
  }
  documents.sort((left, right) => left.path.localeCompare(right.path));
  return {
    catalogueFingerprint: catalogueFingerprint(catalogueItems),
    documents,
    issues,
    changedDocuments: documents.filter((document) => document.changed),
  };
}

export function verifyItemResourceCorpus(
  sources: readonly MigrationSourceDocument[],
  catalogueItems: readonly MigrationCatalogueItem[]
): MigrationIssue[] {
  return sources.flatMap((source) => verifyRawDocument(source, catalogueItems));
}

export function verifyPlannedDocument(
  plan: MigrationDocumentPlan,
  actual: RawMap,
  catalogueItems: readonly MigrationCatalogueItem[]
): MigrationIssue[] {
  const issues = verifyRawDocument({ path: plan.path, data: actual }, catalogueItems);
  const actualHash = hashFirestoreDocument(actual);
  if (actualHash !== plan.afterHash) {
    issues.push({
      path: plan.path,
      code: "verification-failed",
      detail: `Expected after hash ${plan.afterHash}, got ${actualHash}`,
    });
  }
  return issues;
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
  format: "d20-folio-item-resource-backup-v1";
  projectId: typeof TARGET_PROJECT_ID;
  catalogueFingerprint: string;
  documents: BackupManifestEntry[];
}

export interface BackupInputDocument {
  plan: MigrationDocumentPlan;
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
  catalogueFingerprint: string;
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
    const file = `${String(index + 1).padStart(4, "0")}-${sha256(
      document.plan.path
    ).slice(0, 16)}.json`;
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
    format: "d20-folio-item-resource-backup-v1",
    projectId: TARGET_PROJECT_ID,
    catalogueFingerprint: args.catalogueFingerprint,
    documents: entries,
  };
  await writePrivateFile(join(args.directory, "manifest.json"), manifest);
  return manifest;
}

// ── Guarded Firebase CLI ────────────────────────────────────────────────────

export type CliOptions =
  | { mode: "dry-run" }
  | { mode: "check" }
  | { mode: "apply"; backupDirectory: string };

export function parseCliOptions(args: readonly string[]): CliOptions {
  let mode: CliOptions["mode"] = "dry-run";
  let explicitMode = false;
  let backupDirectory: string | undefined;
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

interface DiscoveredDocument {
  source: MigrationSourceDocument;
  ref: FirestoreDocumentReference;
  updateTime: Timestamp;
}

function discovered(snapshot: QueryDocumentSnapshot): DiscoveredDocument {
  return {
    source: { path: snapshot.ref.path, data: snapshot.data() },
    ref: snapshot.ref,
    updateTime: snapshot.updateTime,
  };
}

async function discoverDocuments(db: Firestore): Promise<DiscoveredDocument[]> {
  const [characters, allSnapshots] = await Promise.all([
    db.collectionGroup("characters").get(),
    db.collectionGroup("snapshots").get(),
  ]);
  const mains = characters.docs.filter((snapshot) => MAIN_PATH.test(snapshot.ref.path));
  const snapshots = allSnapshots.docs.filter((snapshot) =>
    SNAPSHOT_PATH.test(snapshot.ref.path)
  );
  return [...mains.map(discovered), ...snapshots.map(discovered)].sort((left, right) =>
    left.source.path.localeCompare(right.source.path)
  );
}

function planSummary(plan: ItemResourceMigrationPlan): string {
  const stamped = plan.changedDocuments.reduce(
    (total, document) => total + document.stampedInstances,
    0
  );
  const owners = plan.changedDocuments.reduce(
    (total, document) => total + document.migratedOwners,
    0
  );
  return `${plan.documents.length} docs; ${plan.changedDocuments.length} changed; ${stamped} identities; ${owners} legacy owners`;
}

export function assertCleanPreflight(plan: ItemResourceMigrationPlan): void {
  if (plan.issues.length > 0) {
    throw new Error(
      `Preflight found ${plan.issues.length} issue(s):\n${plan.issues
        .map((issue) => `${issue.path} [${issue.code}] ${issue.detail}`)
        .join("\n")}`
    );
  }
  if (plan.changedDocuments.length > MAX_CHANGED_DOCUMENTS) {
    throw new Error(
      `Refusing ${plan.changedDocuments.length} changed docs; atomic limit is ${MAX_CHANGED_DOCUMENTS}`
    );
  }
}

async function readTargetConfiguration(): Promise<{
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

async function run(): Promise<void> {
  const options = parseCliOptions(processArgv.slice(2));
  const target = await readTargetConfiguration();
  const [{ initializeApp, applicationDefault }, { getFirestore }] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/firestore"),
  ]);
  const app = initializeApp({
    projectId: target.projectId,
    ...(target.emulator ? {} : { credential: applicationDefault() }),
  });
  const db = getFirestore(app);
  console.log(
    `Target: ${target.projectId} (${target.emulator ? "explicit emulator" : "production read"})`
  );
  const catalogue = await loadMigrationCatalogue();
  console.log(`Catalogue: ${catalogue.mode} ${catalogue.fingerprint}`);
  const discoveredDocs = await discoverDocuments(db);
  const sources = discoveredDocs.map((document) => document.source);
  const plan = planItemResourceMigration(sources, catalogue.items);
  assertCleanPreflight(plan);
  console.log(`${options.mode}: ${planSummary(plan)}`);

  if (options.mode === "dry-run") {
    for (const document of plan.changedDocuments) {
      console.log(
        `would update ${document.path} ${document.beforeHash} -> ${document.afterHash}`
      );
    }
    return;
  }

  const corpusIssues = verifyItemResourceCorpus(sources, catalogue.items);
  if (options.mode === "check") {
    if (corpusIssues.length > 0 || plan.changedDocuments.length > 0) {
      throw new Error(
        `Check failed: ${corpusIssues.length} verification issue(s), ${plan.changedDocuments.length} pending change(s)`
      );
    }
    console.log("Global check and idempotency check passed");
    return;
  }

  const projectedIssues = verifyItemResourceCorpus(
    plan.documents.map((document) => ({
      path: document.path,
      data: document.after,
    })),
    catalogue.items
  );
  if (projectedIssues.length > 0) {
    throw new Error(
      `Apply preflight found ${projectedIssues.length} projected corpus verification issue(s)`
    );
  }

  const discoveredByPath = new Map(
    discoveredDocs.map((document) => [document.source.path, document] as const)
  );
  const backupInputs = plan.changedDocuments.map((document) => {
    const found = discoveredByPath.get(document.path);
    if (!found) throw new Error(`Preflight lost ${document.path}`);
    return { plan: document, updateTime: found.updateTime };
  });
  await writeBackupDirectory({
    directory: options.backupDirectory,
    catalogueFingerprint: catalogue.fingerprint,
    documents: backupInputs,
  });
  console.log(`Backup complete: ${options.backupDirectory}`);

  if (plan.changedDocuments.length > 0) {
    const batch = db.batch();
    for (const document of plan.changedDocuments) {
      const found = discoveredByPath.get(document.path);
      if (!found) throw new Error(`Preflight lost ${document.path}`);
      const update: RawMap = {
        build: document.after.build,
        state: document.after.state,
      };
      batch.update(found.ref, update, { lastUpdateTime: found.updateTime });
    }
    await batch.commit();
  }

  for (const document of plan.changedDocuments) {
    const found = discoveredByPath.get(document.path);
    if (!found) throw new Error(`Verification lost ${document.path}`);
    const snapshot = await found.ref.get();
    const data = snapshot.data();
    if (!data) throw new Error(`Verification read lost ${document.path}`);
    const verification = verifyPlannedDocument(document, data, catalogue.items);
    if (verification.length > 0) {
      throw new Error(
        `Reread/hash verification failed for ${document.path}: ${stableJson(verification)}`
      );
    }
  }
  console.log("Reread/hash verification passed");

  const postDocs = await discoverDocuments(db);
  const postSources = postDocs.map((document) => document.source);
  const globalIssues = verifyItemResourceCorpus(postSources, catalogue.items);
  if (globalIssues.length > 0) {
    throw new Error(`Global check failed: ${stableJson(globalIssues)}`);
  }
  console.log("Global check passed");
  const idempotency = planItemResourceMigration(postSources, catalogue.items);
  assertCleanPreflight(idempotency);
  if (idempotency.changedDocuments.length > 0) {
    throw new Error(
      `Idempotency check found ${idempotency.changedDocuments.length} pending change(s)`
    );
  }
  console.log("Idempotency check passed");
}

if (processArgv[1] && import.meta.url === pathToFileURL(resolve(processArgv[1])).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    exit(1);
  });
}
