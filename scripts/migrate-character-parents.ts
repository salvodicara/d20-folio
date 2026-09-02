#!/usr/bin/env node
/**
 * P1 legacy parent cutover: every live character parent becomes a v1 play-state
 * owner (design §5.3, ADR-0009).
 *
 * BEFORE, a character could be stored in either of two shapes:
 *   • UNMARKED (legacy) — the parent carries no `playStateVersion`, its non-combat
 *     play session lives in the parent `state`, and the `combat/state` child may be
 *     absent (a never-wounded character) or carry only the legacy combat core.
 *   • MARKED — the parent carries `playStateVersion: 1` and `state: {}`, and the
 *     child owns the whole play session under `playState: { version: 1, state }`.
 *
 * AFTER this migration every parent is MARKED, every character HAS a child carrying
 * a valid `playState`, and every parent carries an integer `revision` (0 when it had
 * none) so the P1 compare-and-set can advance it. That deletes the dual
 * representation the app currently has to read both ways (golden rule 10).
 *
 * What this migration deliberately does NOT touch:
 *   • the character `build` and `updatedAt` — so the anonymous share projection
 *     (`public/sheet`, which requires `sheet.build == character.build` and
 *     `sourceUpdatedAt == character.updatedAt`) stays byte-consistent and needs no
 *     write. A legacy SHARED parent that has no sheet yet simply stays without one;
 *     the owner's client creates it on the next autosave.
 *   • character snapshots (`snapshots/*`) — they are independent stored copies of a
 *     past envelope, not a live play owner.
 *
 * Read-only by default; `--check` proves the corpus migrated; `--fixtures <dir>` plans
 * over portable exports with no Firebase at all; `--apply --backup <dir>` is the only
 * write mode (preflight → backup → one guarded batch → reread/global/idempotency).
 *
 * Output: counts, hashes and issue CODES. Never a payload, never a raw path.
 *
 * SRD-ONLY BY NECESSITY. Unlike every earlier migration this one reuses the app's play
 * codec (golden rule 17), and that chain reaches `@/data/spells` → the `@pack` barrel →
 * `src/i18n/loaders.ts`, whose `import.meta.glob` exists only under Vite — so plain node
 * cannot evaluate the composed pack at all. Every run therefore sets
 * `VITE_CONTENT_PACK=0` (the documented opt-out in `scripts/content-pack-mode.ts`). That
 * is SAFE, not a compromise: the only SRD-dependent step in the chain is the stored
 * concentration ref, and the planner REFUSES (`unresolved-concentration`) any family
 * whose concentration would not survive canonicalization unchanged, so a plan is
 * identical in either composition.
 *
 * Run with:
 *   VITE_CONTENT_PACK=0 node --import ./scripts/alias-loader.mjs \
 *     scripts/migrate-character-parents.ts
 *   VITE_CONTENT_PACK=0 node --import ./scripts/alias-loader.mjs \
 *     scripts/migrate-character-parents.ts --check
 *   VITE_CONTENT_PACK=0 node --import ./scripts/alias-loader.mjs \
 *     scripts/migrate-character-parents.ts --fixtures /absolute/fixtures/directory
 *   VITE_CONTENT_PACK=0 node --import ./scripts/alias-loader.mjs \
 *     scripts/migrate-character-parents.ts --apply --backup /absolute/fresh/private/dir
 */

/// <reference types="node" />

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import { Timestamp } from "firebase-admin/firestore";
import { contentPackEnabled } from "./content-pack-mode.ts";
import {
  discoverDocuments,
  hashFirestoreDocument,
  isRecord,
  parseCliOptions,
  pathHash,
  readTargetConfiguration,
  runGuardedMigration,
  type GuardedDocumentPlan,
  type GuardedPlan,
  type GuardedWrite,
  type MigrationIssue,
  type MigrationSourceDocument,
  type RawMap,
} from "./lib/migration-kit.ts";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;
const CHILD = /^users\/([^/]+)\/characters\/([^/]+)\/combat\/state$/;
const ENVELOPE_SCHEMA = 3;

/** The exact parent fields this migration owns. */
const PARENT_FIELDS = ["playStateVersion", "state", "revision"] as const;
/** The exact child fields this migration owns on an UPDATE (a create writes the
 *  complete document). The trio and every peer-owned field stay as stored. */
const CHILD_FIELDS = ["playState", "updatedAt"] as const;

// ── The engine seam ─────────────────────────────────────────────────────────
//
// A non-literal direct URL keeps the Node-only scripts TS project isolated from the
// app graph (the pattern `migrate-item-resources.ts` established); at runtime this
// still reuses the canonical pure codec instead of replicating it (golden rule 17).

/** The compact play-state envelope the `combat/state` child owns. */
interface PersistedPlayStateV1 {
  version: 1;
  state: RawMap;
}

type PlayStateParseResult =
  | { ok: true; value: PersistedPlayStateV1 }
  | { ok: false; reason: string };

/** The canonical combat-state shape, as `sessionToCombatState` emits it. Structural,
 *  so the script never type-imports the app graph. */
interface PlannedCombatState {
  hp: { current: number; temp: number };
  conditions: string[];
  initiativeRoll: number | null;
  deathSaves: { successes: number; failures: number };
  bardicInspirationDie?: string;
  heroicInspiration?: boolean;
  round: number;
  recentActions: unknown[];
  activeEffects?: unknown[];
  appliedEncounterEffects?: unknown;
  turnEconomy?: unknown;
  pendingConcentrationSaves?: unknown[];
  playState?: PersistedPlayStateV1;
}

/** The in-memory session is OPAQUE here: the script only pipes it between the
 *  codec's own functions, so it never needs the app's `SessionState` type. */
type OpaqueSession = { readonly __session: unique symbol };

interface SessionCodecModule {
  stateToSession: (state: RawMap) => OpaqueSession;
  sessionToPlayStateV1: (session: OpaqueSession) => PersistedPlayStateV1;
  parsePersistedPlayStateV1: (value: unknown) => PlayStateParseResult;
}

interface SanitizeSessionModule {
  sanitizeSession: (session: OpaqueSession) => OpaqueSession;
}

interface CombatStateModule {
  applyCombatToSession: (
    session: OpaqueSession,
    combat: PlannedCombatState | null,
    effectiveMax: number,
    // Task 8 drops this argument (and this script's call site with it) once the
    // unmarked-legacy representation is gone.
    ownership: "legacy" | 1
  ) => { ok: true; session: OpaqueSession } | { ok: false; reason: string };
  sessionToCombatState: (session: OpaqueSession) => PlannedCombatState;
}

// Refuse the composed pack with an ACTIONABLE line instead of the cryptic
// `import.meta.glob is not a function` the SRD barrel throws ten frames deep. A
// bundler-backed run (the Vitest lanes) resolves `@pack` itself and is exempt.
if (!process.env.VITEST && contentPackEnabled()) {
  throw new Error(
    "migrate-character-parents must run SRD-only: prefix the command with VITE_CONTENT_PACK=0 " +
      "(a plain node process cannot evaluate the composed content pack; see this file's header)"
  );
}

/** Prove a dynamically imported engine module really exports the callables this
 *  script asserts it does, before any of them is trusted with live data. */
function assertModuleShape(
  value: unknown,
  names: readonly string[],
  what: string
): RawMap {
  if (!isRecord(value) || names.some((name) => typeof value[name] !== "function")) {
    throw new TypeError(`${what} module is incomplete`);
  }
  return value;
}

const { stateToSession, sessionToPlayStateV1, parsePersistedPlayStateV1 } =
  assertModuleShape(
    await import(new URL("../src/lib/session-state-codec.ts", import.meta.url).href),
    ["stateToSession", "sessionToPlayStateV1", "parsePersistedPlayStateV1"],
    "Session codec"
  ) as unknown as SessionCodecModule;

const { sanitizeSession } = assertModuleShape(
  await import(new URL("../src/lib/sanitize-session.ts", import.meta.url).href),
  ["sanitizeSession"],
  "Session sanitizer"
) as unknown as SanitizeSessionModule;

const { applyCombatToSession, sessionToCombatState } = assertModuleShape(
  await import(new URL("../src/lib/combat-state.ts", import.meta.url).href),
  ["applyCombatToSession", "sessionToCombatState"],
  "Combat state"
) as unknown as CombatStateModule;

// ── The strict child parse (a local, temporary copy) ────────────────────────

/**
 * The structural half of `parseCombatState` (`src/lib/combat-state-io.ts`), which a
 * script cannot import because that module pulls `@/lib/firebase`. Re-authored here
 * over the LEGACY combat core only — the fields `applyCombatToSession` reads — plus a
 * pass-through of the peer-owned collections, which this migration never rewrites.
 *
 * TASK 8 DELETES THIS: it moves the Firebase-free parse into
 * `src/lib/combat-state-codec.ts`, and this script then imports `parseCombatState`
 * from there like every other reader.
 */
function parseLegacyCombatCore(data: unknown): PlannedCombatState | undefined {
  if (!isRecord(data) || !isRecord(data.hp) || !isRecord(data.deathSaves))
    return undefined;
  const hp = data.hp;
  const deathSaves = data.deathSaves;
  const finite = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);
  if (
    !finite(hp.current) ||
    !finite(hp.temp) ||
    !Array.isArray(data.conditions) ||
    !data.conditions.every((condition) => typeof condition === "string") ||
    !(data.initiativeRoll === null || finite(data.initiativeRoll)) ||
    !finite(deathSaves.successes) ||
    !finite(deathSaves.failures) ||
    (data.round !== undefined && !finite(data.round)) ||
    (data.recentActions !== undefined && !Array.isArray(data.recentActions)) ||
    (data.bardicInspirationDie !== undefined &&
      typeof data.bardicInspirationDie !== "string") ||
    (data.heroicInspiration !== undefined && typeof data.heroicInspiration !== "boolean")
  ) {
    return undefined;
  }
  return {
    hp: { current: hp.current, temp: hp.temp },
    conditions: data.conditions,
    initiativeRoll: data.initiativeRoll,
    deathSaves: { successes: deathSaves.successes, failures: deathSaves.failures },
    ...(typeof data.bardicInspirationDie === "string"
      ? { bardicInspirationDie: data.bardicInspirationDie }
      : {}),
    ...(typeof data.heroicInspiration === "boolean"
      ? { heroicInspiration: data.heroicInspiration }
      : {}),
    round: finite(data.round) ? data.round : 1,
    recentActions: Array.isArray(data.recentActions) ? data.recentActions : [],
  };
}

/**
 * `combatStateWriteData` (`src/lib/combat-state-io.ts`) minus its client-SDK
 * `serverTimestamp()` sentinel, which firebase-admin cannot write and — more to the
 * point — which the kit's reread/hash verification could never match. The migration
 * therefore stamps ONE concrete `Timestamp`, captured once per run, so the planned
 * bytes are exactly the stored bytes.
 */
function combatStateCreateData(state: PlannedCombatState, updatedAt: Timestamp): RawMap {
  const playState =
    state.playState === undefined ? null : parsePersistedPlayStateV1(state.playState);
  if (playState && !playState.ok) {
    throw new TypeError(`Invalid combat play state: ${playState.reason}`);
  }
  return {
    hp: { current: state.hp.current, temp: state.hp.temp },
    conditions: state.conditions,
    bardicInspirationDie: state.bardicInspirationDie ?? "",
    ...(state.heroicInspiration !== undefined
      ? { heroicInspiration: state.heroicInspiration }
      : {}),
    initiativeRoll: state.initiativeRoll,
    deathSaves: {
      successes: state.deathSaves.successes,
      failures: state.deathSaves.failures,
    },
    round: state.round,
    recentActions: state.recentActions,
    ...(state.activeEffects?.length ? { activeEffects: state.activeEffects } : {}),
    ...(state.appliedEncounterEffects
      ? { appliedEncounterEffects: state.appliedEncounterEffects }
      : {}),
    ...(state.turnEconomy ? { turnEconomy: state.turnEconomy } : {}),
    ...(state.pendingConcentrationSaves?.length
      ? { pendingConcentrationSaves: state.pendingConcentrationSaves }
      : {}),
    ...(playState?.ok ? { playState: playState.value } : {}),
    updatedAt,
  };
}

// ── The plan vocabulary ─────────────────────────────────────────────────────

/** One character: its parent document plus the optional `combat/state` child. */
export interface CharacterFamily {
  uid: string;
  charId: string;
  parent: MigrationSourceDocument;
  child?: MigrationSourceDocument;
}

export interface ParentCutoverDocumentPlan extends GuardedDocumentPlan {
  role: "parent" | "child";
}

export interface ParentCutoverWrite {
  kind: GuardedWrite["kind"];
  path: string;
  data: RawMap;
}

export interface ParentCutoverCounts {
  parents: number;
  legacy: number;
  marked: number;
  childrenCreated: number;
  childrenUpdated: number;
  revisionStamped: number;
}

export interface ParentCutoverPlan extends GuardedPlan<ParentCutoverDocumentPlan> {
  documents: ParentCutoverDocumentPlan[];
  changedDocuments: ParentCutoverDocumentPlan[];
  issues: MigrationIssue[];
  counts: ParentCutoverCounts;
  /** The families exactly as planned (a quarantined one included). */
  families: CharacterFamily[];
  /** The same families with this plan's writes applied — the corpus a re-plan must
   *  find fully migrated. */
  projectedFamilies: CharacterFamily[];
  /** The field-scoped writes, derived from {@link writesForParentCutover}. */
  writes: ParentCutoverWrite[];
}

function documentPlan(
  path: string,
  role: "parent" | "child",
  before: RawMap,
  after: RawMap
): ParentCutoverDocumentPlan {
  const beforeHash = hashFirestoreDocument(before);
  const afterHash = hashFirestoreDocument(after);
  return {
    path,
    role,
    before,
    after,
    beforeHash,
    afterHash,
    changed: beforeHash !== afterHash,
  };
}

function sameFirestoreField(left: unknown, right: unknown): boolean {
  return (
    hashFirestoreDocument({ value: left }) === hashFirestoreDocument({ value: right })
  );
}

/**
 * The exact fields this migration owns, per changed document — never the whole
 * envelope, so an unrelated concurrent field write survives. Derived from the
 * planned before/after pair alone: a child planned from NO stored document (an empty
 * `before`) is the one CREATE this migration can emit, every other write is a
 * field-scoped update.
 */
export function writesForParentCutover(document: GuardedDocumentPlan): GuardedWrite {
  if (!PARENT.test(document.path) && Object.keys(document.before).length === 0) {
    return { kind: "create", data: document.after };
  }
  const owned: readonly string[] = PARENT.test(document.path)
    ? PARENT_FIELDS
    : CHILD_FIELDS;
  const data: RawMap = {};
  for (const field of owned) {
    if (!Object.hasOwn(document.after, field)) continue;
    if (
      Object.hasOwn(document.before, field) &&
      sameFirestoreField(document.before[field], document.after[field])
    ) {
      continue;
    }
    data[field] = document.after[field];
  }
  return { kind: "update", data };
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

interface FamilyPlan {
  documents: ParentCutoverDocumentPlan[];
  issues: MigrationIssue[];
  legacy: boolean;
  childCreated: boolean;
  childUpdated: boolean;
  revisionStamped: boolean;
}

function quarantine(path: string, code: string, detail: string): FamilyPlan {
  return {
    documents: [],
    issues: [{ path, code, detail }],
    legacy: false,
    childCreated: false,
    childUpdated: false,
    revisionStamped: false,
  };
}

/** Plan ONE family. A family with any issue is planned as no change at all. */
function planFamily(family: CharacterFamily, updatedAt: Timestamp): FamilyPlan {
  const path = family.parent.path;
  const parent = family.parent.data;
  if (
    parent.schema !== ENVELOPE_SCHEMA ||
    !isRecord(parent.build) ||
    !isRecord(parent.state) ||
    !isRecord(parent.cache)
  ) {
    return quarantine(path, "invalid-envelope", "Not a schema-3 character parent");
  }
  const marked = Object.hasOwn(parent, "playStateVersion");
  if (marked && parent.playStateVersion !== 1) {
    return quarantine(path, "invalid-envelope", "Unsupported playStateVersion");
  }

  const child = family.child;
  const combat = child ? parseLegacyCombatCore(child.data) : undefined;
  if (child && !combat) {
    return quarantine(child.path, "invalid-child", "The combat/state core is malformed");
  }

  const revisionStamped = !isNonNegativeInteger(parent.revision);
  const documents: ParentCutoverDocumentPlan[] = [];

  if (marked) {
    if (!child) {
      return quarantine(
        path,
        "marked-parent-missing-child",
        "A v1 parent has no combat/state child to own its play session"
      );
    }
    const playState = parsePersistedPlayStateV1(child.data.playState);
    if (!playState.ok) {
      return quarantine(
        child.path,
        "invalid-play-state",
        `Child playState ${playState.reason}`
      );
    }
    const after: RawMap = revisionStamped ? { ...parent, revision: 0 } : { ...parent };
    documents.push(documentPlan(path, "parent", parent, after));
    documents.push(documentPlan(child.path, "child", child.data, child.data));
    return {
      documents,
      issues: [],
      legacy: false,
      childCreated: false,
      childUpdated: false,
      revisionStamped,
    };
  }

  const hpMax = parent.cache.hpMax;
  if (typeof hpMax !== "number" || !Number.isFinite(hpMax) || hpMax < 1) {
    return quarantine(
      path,
      "missing-cache-hpmax",
      "The cached maximum HP is absent or not a positive number"
    );
  }

  let hydrated: { ok: true; session: OpaqueSession } | { ok: false; reason: string };
  try {
    const session = sanitizeSession(stateToSession(parent.state));
    hydrated = applyCombatToSession(session, combat ?? null, hpMax, "legacy");
  } catch {
    // `stateToSession` is TOTAL: a structurally malformed member raises rather than
    // trimming it. For this migration that is simply an unmigratable envelope.
    return quarantine(path, "invalid-envelope", "The stored play session is malformed");
  }
  if (!hydrated.ok) {
    return quarantine(
      child?.path ?? path,
      "invalid-child",
      `Hydration refused the combat/state child: ${hydrated.reason}`
    );
  }

  const playState = sessionToPlayStateV1(hydrated.session);
  // COMPOSITION GUARD. The whole codec chain is SRD-free except one boundary:
  // `normalizeStoredConcentration` marks a concentration ref the loaded spell index
  // does not know as `custom:<value>`. That is a safe IN-MEMORY read-time net, but
  // PERSISTING it would silently rewrite a player's held spell — and this script runs
  // SRD-only under plain node (the `@pack` barrel reaches `src/i18n/loaders.ts`, whose
  // `import.meta.glob` only exists under Vite). So a family whose stored concentration
  // does not survive canonicalization UNCHANGED is refused, never rewritten: the plan
  // is then provably identical in either composition.
  const storedConcentration = parent.state.concentration;
  if (
    typeof storedConcentration === "string" &&
    storedConcentration !== "" &&
    playState.state.concentration !== storedConcentration
  ) {
    return quarantine(
      path,
      "unresolved-concentration",
      "The stored concentration ref does not survive canonicalization in this composition"
    );
  }

  const parentAfter: RawMap = {
    ...parent,
    playStateVersion: 1,
    state: {},
    ...(revisionStamped ? { revision: 0 } : {}),
  };
  documents.push(documentPlan(path, "parent", parent, parentAfter));

  if (child) {
    documents.push(
      documentPlan(child.path, "child", child.data, {
        ...child.data,
        playState,
        updatedAt,
      })
    );
    return {
      documents,
      issues: [],
      legacy: true,
      childCreated: false,
      childUpdated: true,
      revisionStamped,
    };
  }

  const created = combatStateCreateData(
    sessionToCombatState(hydrated.session),
    updatedAt
  );
  documents.push(documentPlan(`${path}/combat/state`, "child", {}, created));
  return {
    documents,
    issues: [],
    legacy: true,
    childCreated: true,
    childUpdated: false,
    revisionStamped,
  };
}

/**
 * Build the complete, deterministic plan over already-grouped families. Pure: no
 * writes, credentials, or Firebase connection. `updatedAt` is the ONE stamp the run
 * writes onto every child it touches; it is a parameter so the plan stays a function
 * of its input (the CLI captures a single `Timestamp` for the whole run).
 */
export function planParentCutover(
  families: readonly CharacterFamily[],
  updatedAt: Timestamp = Timestamp.now()
): ParentCutoverPlan {
  const ordered = [...families].sort((left, right) =>
    left.parent.path.localeCompare(right.parent.path)
  );
  const documents: ParentCutoverDocumentPlan[] = [];
  const issues: MigrationIssue[] = [];
  const projectedFamilies: CharacterFamily[] = [];
  const counts: ParentCutoverCounts = {
    parents: 0,
    legacy: 0,
    marked: 0,
    childrenCreated: 0,
    childrenUpdated: 0,
    revisionStamped: 0,
  };
  for (const family of ordered) {
    const planned = planFamily(family, updatedAt);
    if (planned.issues.length > 0) {
      issues.push(...planned.issues);
      projectedFamilies.push(family);
      continue;
    }
    counts.parents += 1;
    if (planned.legacy) counts.legacy += 1;
    else counts.marked += 1;
    if (planned.childCreated) counts.childrenCreated += 1;
    if (planned.childUpdated) counts.childrenUpdated += 1;
    if (planned.revisionStamped) counts.revisionStamped += 1;
    documents.push(...planned.documents);
    const parentAfter = planned.documents.find((document) => document.role === "parent");
    const childAfter = planned.documents.find((document) => document.role === "child");
    projectedFamilies.push({
      uid: family.uid,
      charId: family.charId,
      parent: {
        path: family.parent.path,
        data: parentAfter?.after ?? family.parent.data,
      },
      ...(childAfter ? { child: { path: childAfter.path, data: childAfter.after } } : {}),
    });
  }
  const changedDocuments = documents.filter((document) => document.changed);
  return {
    documents,
    changedDocuments,
    issues,
    counts,
    families: ordered,
    projectedFamilies,
    writes: changedDocuments.map((document) => ({
      ...writesForParentCutover(document),
      path: document.path,
    })),
  };
}

/**
 * Group a discovered corpus into families, then plan it. Discovery yields the parents
 * and the children as two independent collection-group reads; they are joined by
 * parent path here, so the planner never issues an N-read-per-parent fetch.
 */
export function planParentCutoverSources(
  sources: readonly MigrationSourceDocument[],
  updatedAt: Timestamp = Timestamp.now()
): ParentCutoverPlan {
  const parents = new Map<string, MigrationSourceDocument>();
  const children = new Map<string, MigrationSourceDocument>();
  const identity = new Map<string, { uid: string; charId: string }>();
  const rejected = new Set<string>();
  const issues: MigrationIssue[] = [];
  const seen = new Set<string>();
  for (const source of [...sources].sort((left, right) =>
    left.path.localeCompare(right.path)
  )) {
    const parent = PARENT.exec(source.path);
    const child = CHILD.exec(source.path);
    if (!parent?.[1] && !child?.[1]) {
      issues.push({
        path: source.path,
        code: "unexpected-path",
        detail: "Only character parents and their combat/state children are in scope",
      });
      continue;
    }
    const parentPath = parent
      ? source.path
      : source.path.slice(0, -"/combat/state".length);
    if (seen.has(source.path)) {
      issues.push({
        path: source.path,
        code: "duplicate-document",
        detail: "The discovery set contains this path more than once",
      });
      // A repeated document makes the WHOLE family unsafe to plan: the planner
      // cannot know which copy is the live one.
      rejected.add(parentPath);
      continue;
    }
    seen.add(source.path);
    const match = parent ?? child;
    if (match?.[1] && match[2])
      identity.set(parentPath, { uid: match[1], charId: match[2] });
    if (parent) parents.set(parentPath, source);
    else children.set(parentPath, source);
  }
  const families: CharacterFamily[] = [];
  for (const [parentPath, source] of parents) {
    if (rejected.has(parentPath)) continue;
    const who = identity.get(parentPath);
    const child = children.get(parentPath);
    families.push({
      uid: who?.uid ?? "",
      charId: who?.charId ?? "",
      parent: source,
      ...(child ? { child } : {}),
    });
  }
  for (const [parentPath, child] of children) {
    if (parents.has(parentPath) || rejected.has(parentPath)) continue;
    issues.push({
      path: child.path,
      code: "orphan-child",
      detail: "A combat/state child was discovered without its character parent",
    });
  }
  const plan = planParentCutover(families, updatedAt);
  return { ...plan, issues: [...issues, ...plan.issues] };
}

/** A fixed stamp for verification-only planning: a verified corpus has nothing left
 *  to write, so the value can never reach a document. */
const VERIFICATION_STAMP = new Timestamp(0, 0);

/**
 * The corpus is migrated exactly when planning it again raises no issue and needs no
 * change — i.e. every parent is v1 with an empty `state` and an integer `revision`,
 * and every character has a `combat/state` child carrying a valid `playState`.
 */
export function verifyParentCutoverCorpus(
  sources: readonly MigrationSourceDocument[]
): MigrationIssue[] {
  const plan = planParentCutoverSources(sources, VERIFICATION_STAMP);
  return [
    ...plan.issues,
    ...plan.changedDocuments.map((document) => ({
      path: document.path,
      code: "verification-failed",
      detail: `The ${document.role} document still has a pending cutover write`,
    })),
  ];
}

/** The one report every mode prints: counts, hashes and issue codes only. */
export function reportForParentCutover(plan: ParentCutoverPlan): {
  format: "d20-folio-parent-cutover-report-v1";
  counts: ParentCutoverCounts;
  writes: { path: string; kind: string; before: string; after: string }[];
  issues: { path: string; code: string }[];
} {
  return {
    format: "d20-folio-parent-cutover-report-v1",
    counts: plan.counts,
    writes: plan.changedDocuments.map((document) => ({
      path: pathHash(document.path),
      kind: writesForParentCutover(document).kind,
      before: document.beforeHash,
      after: document.afterHash,
    })),
    issues: plan.issues.map((issue) => ({
      path: pathHash(issue.path),
      code: issue.code,
    })),
  };
}

export const DISCOVERY = [
  { collectionGroup: "characters", pattern: PARENT },
  { collectionGroup: "combat", pattern: CHILD },
];

/**
 * Plan over portable character exports (`{schema, build, state}`) on disk. A portable
 * export carries NO `cache`, so fixtures mode synthesizes the one field the legacy
 * leg needs — `cache.hpMax` — from the exported current HP (falling back to 1). That
 * keeps the script ENGINE-FREE (no SRD aggregate, no `effectiveMaxHp`): the fixtures
 * run proves the grouping, codec and write-shaping machinery over real envelopes, and
 * makes no claim about a character's true maximum HP.
 */
async function planFixtures(
  directory: string,
  updatedAt: Timestamp
): Promise<ParentCutoverPlan> {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const families: CharacterFamily[] = [];
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
    if (!isRecord(parsed))
      throw new TypeError(`Fixture ${pathHash(name)} is not an object`);
    const state = isRecord(parsed.state) ? parsed.state : {};
    const storedHp = isRecord(state.hp) ? state.hp.current : undefined;
    const hpMax =
      typeof storedHp === "number" && Number.isFinite(storedHp) && storedHp >= 1
        ? storedHp
        : 1;
    const charId = name.slice(0, -".json".length);
    families.push({
      uid: "fixtures",
      charId,
      parent: {
        path: `users/fixtures/characters/${charId}`,
        data: {
          ...parsed,
          cache: { ...(isRecord(parsed.cache) ? parsed.cache : {}), hpMax },
        },
      },
    });
  }
  return planParentCutover(families, updatedAt);
}

async function run(): Promise<void> {
  const options = parseCliOptions(processArgv.slice(2));
  // ONE stamp for the whole run: the plan is hashed and then written verbatim, so a
  // per-document `Timestamp.now()` would make the reread verification unprovable.
  const updatedAt = Timestamp.now();
  if (options.mode === "fixtures") {
    const plan = await planFixtures(options.directory, updatedAt);
    console.log(JSON.stringify(reportForParentCutover(plan), null, 2));
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
    migration: "character-parents",
    label: "parent-cutover-v1",
    discover: (database) => discoverDocuments(database, DISCOVERY),
    plan: (sources) => planParentCutoverSources(sources, updatedAt),
    verify: verifyParentCutoverCorpus,
    writesFor: writesForParentCutover,
    report: reportForParentCutover,
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
