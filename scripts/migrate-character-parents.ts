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
 * THE PLAN REPRODUCES WHAT THE CLIENT'S OWN CUTOVER WOULD WRITE. A legacy family is
 * hydrated through the EXACT app path — `parseCharacterEnvelope` (which applies the
 * tracker-id remap, the race-trait id conformance and the log concentration
 * normalization), then `effectiveMaxHp` over the hydrated character+session, then
 * `applyCombatToSession` — and the projected child is finally PROVEN to satisfy the
 * strict v1 `parseCombatState` the app reads it back with. Nothing is written that
 * the app could not then load.
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
 * COMPOSITION. The hydration is SRD-AWARE, so the run first PROVES that the private
 * content pack actually composed (`packCompositionRefusal`) and refuses otherwise —
 * an SRD-only process would see a pack-only spell id as unknown and rewrite a held
 * concentration to `custom:<id>`. A per-family drift guard sits behind that
 * assertion: a stored concentration ref that does not survive canonicalization
 * unchanged refuses its family (`unresolved-concentration`) rather than being
 * rewritten, so no plan can depend on which catalogue happened to load.
 *
 * DETERMINISM. `normalizeLogEntry` mints `crypto.randomUUID()` for a stored log row
 * that carries no id, which would make two dry-runs disagree and would leave the id
 * to chance. The planner therefore stamps such a row with a DETERMINISTIC id derived
 * from the family path and the row's ordinal BEFORE the codec sees it (counted as
 * `logIdsStamped`), so the whole plan is a pure function of the corpus.
 *
 * Read-only by default; `--check` proves the corpus migrated; `--fixtures <dir>` plans
 * over portable exports with no Firebase at all; `--apply --backup <dir>` is the only
 * write mode (preflight → backup → one guarded batch → reread/global/idempotency).
 *
 * Output: counts, hashes and issue CODES. Never a payload, never a raw path.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-character-parents.ts
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-character-parents.ts --check
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-character-parents.ts \
 *     --fixtures /absolute/fixtures/directory
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-character-parents.ts \
 *     --apply --backup /absolute/fresh/private/directory
 */

/// <reference types="node" />

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { contentPackEnabled } from "./content-pack-mode.ts";
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
const CHILD = /^users\/([^/]+)\/characters\/([^/]+)\/combat\/state$/;

/** The exact parent fields this migration owns. */
const PARENT_FIELDS = ["playStateVersion", "state", "revision"] as const;
/**
 * The exact child fields this migration owns. `playState`/`updatedAt` are the
 * cutover itself; the five peer collections are owned only in the sense that the
 * projected child must PARSE STRICTLY — a stored non-canonical form is rewritten to
 * (or deleted down to) exactly what the client's own next save would persist.
 */
const CHILD_FIELDS = [
  "playState",
  "updatedAt",
  "recentActions",
  "activeEffects",
  "turnEconomy",
  "appliedEncounterEffects",
  "pendingConcentrationSaves",
] as const;
/** The subset of {@link CHILD_FIELDS} that is canonicalized rather than authored. */
const PEER_FIELDS = [
  "recentActions",
  "activeEffects",
  "turnEconomy",
  "appliedEncounterEffects",
  "pendingConcentrationSaves",
] as const;

// ── The engine seam ─────────────────────────────────────────────────────────
//
// A non-literal direct URL keeps the Node-only scripts TS project isolated from the
// app graph (the pattern `migrate-item-resources.ts` established); at runtime this
// reuses the canonical engine modules instead of replicating them (golden rule 17).
// `scripts/alias-loader.mjs` makes the COMPOSED graph (SRD + private pack) loadable
// under plain node, so the ids and catalogues this migration resolves are exactly
// the app's.

/** The compact play-state envelope the `combat/state` child owns. */
interface PersistedPlayStateV1 {
  version: 1;
  state: RawMap;
}

/** The canonical combat-state shape, as `parseCombatState` returns it. Structural,
 *  so the script never type-imports the app graph. */
interface ParsedCombatState {
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

/** The in-memory character/session pair is OPAQUE here: the script only pipes it
 *  between the engine's own functions, so it never needs the app's types. */
type OpaqueCharacter = { readonly __character: unique symbol };
type OpaqueSession = { readonly __session: unique symbol };

interface CharacterCodecModule {
  parseCharacterEnvelope: (
    build: RawMap,
    state: RawMap
  ) =>
    | { ok: true; character: OpaqueCharacter; session: OpaqueSession }
    | { ok: false; error: string };
}

interface AggregateModule {
  effectiveMaxHp: (character: OpaqueCharacter, session: OpaqueSession) => number;
}

interface SessionCodecModule {
  sessionToPlayStateV1: (session: OpaqueSession) => PersistedPlayStateV1;
  parsePersistedPlayStateV1: (
    value: unknown
  ) => { ok: true; value: PersistedPlayStateV1 } | { ok: false; reason: string };
}

interface CombatStateCodecModule {
  parseCombatState: (
    data: unknown
  ) =>
    | { ok: true; ownership: "legacy" | "v1"; state: ParsedCombatState }
    | { ok: false; reason: string };
}

interface CombatStateModule {
  applyCombatToSession: (
    session: OpaqueSession,
    combat: ParsedCombatState | null,
    effectiveMax: number,
    // Task 8 drops this argument (and this script's call site with it) once the
    // unmarked-legacy representation is gone.
    ownership: "legacy" | 1
  ) => { ok: true; session: OpaqueSession } | { ok: false; reason: string };
  sessionToCombatState: (session: OpaqueSession) => ParsedCombatState;
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

async function engineModule(specifier: string, names: readonly string[], what: string) {
  return assertModuleShape(
    await import(new URL(`../src/lib/${specifier}`, import.meta.url).href),
    names,
    what
  );
}

const { parseCharacterEnvelope } = (await engineModule(
  "character-codec.ts",
  ["parseCharacterEnvelope"],
  "Character codec"
)) as unknown as CharacterCodecModule;

const { effectiveMaxHp } = (await engineModule(
  "aggregate-character.ts",
  ["effectiveMaxHp"],
  "Character aggregate"
)) as unknown as AggregateModule;

const { sessionToPlayStateV1, parsePersistedPlayStateV1 } = (await engineModule(
  "session-state-codec.ts",
  ["sessionToPlayStateV1", "parsePersistedPlayStateV1"],
  "Session codec"
)) as unknown as SessionCodecModule;

const { parseCombatState } = (await engineModule(
  "combat-state-codec.ts",
  ["parseCombatState"],
  "Combat state codec"
)) as unknown as CombatStateCodecModule;

const { applyCombatToSession, sessionToCombatState } = (await engineModule(
  "combat-state.ts",
  ["applyCombatToSession", "sessionToCombatState"],
  "Combat state"
)) as unknown as CombatStateModule;

// ── The canonical child write ───────────────────────────────────────────────

/**
 * `combatStateWriteData` (`src/lib/combat-state-io.ts`) minus its client-SDK
 * `serverTimestamp()` sentinel, which firebase-admin cannot write and — more to the
 * point — which the kit's reread/hash verification could never match. The migration
 * therefore stamps ONE concrete `Timestamp`, captured once per run, so the planned
 * bytes are exactly the stored bytes.
 *
 * Field-for-field identical to the app's writer otherwise, so a document this
 * migration creates is byte-shaped like one the client would have written.
 */
function combatStateWriteData(state: ParsedCombatState, updatedAt: Timestamp): RawMap {
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
  /** Stored log rows given a deterministic id so the plan stays reproducible. */
  logIdsStamped: number;
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
 * envelope, so an unrelated concurrent field write survives. Derived from the planned
 * before/after pair alone: a child planned from NO stored document (an empty `before`)
 * is the one CREATE this migration can emit; otherwise every owned field that differs
 * is written, and an owned field the projection drops is deleted with the admin
 * sentinel (so the stored document really does end up equal to the planned `after`,
 * which the kit then verifies by reread and hash).
 */
export function writesForParentCutover(document: GuardedDocumentPlan): GuardedWrite {
  const isParent = PARENT.test(document.path);
  if (!isParent && Object.keys(document.before).length === 0) {
    return { kind: "create", data: document.after };
  }
  const owned: readonly string[] = isParent ? PARENT_FIELDS : CHILD_FIELDS;
  const data: RawMap = {};
  for (const field of owned) {
    const inBefore = Object.hasOwn(document.before, field);
    const inAfter = Object.hasOwn(document.after, field);
    if (!inAfter) {
      if (inBefore) data[field] = FieldValue.delete();
      continue;
    }
    if (inBefore && sameFirestoreField(document.before[field], document.after[field])) {
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
  logIdsStamped: number;
}

function quarantine(path: string, code: string, detail: string): FamilyPlan {
  return {
    documents: [],
    issues: [{ path, code, detail }],
    legacy: false,
    childCreated: false,
    childUpdated: false,
    revisionStamped: false,
    logIdsStamped: 0,
  };
}

/**
 * Give every stored log row that lacks a usable id a DETERMINISTIC one, derived from
 * the family path and the row's ordinal. Without this `normalizeLogEntry` would mint a
 * random UUID for that row and the plan would differ between two runs — and the id the
 * user's history ends up carrying forever would be whichever run happened to write.
 * Returns the state to hand the codec plus how many rows were stamped.
 */
function stampLogIds(state: RawMap, path: string): { state: RawMap; stamped: number } {
  if (!Array.isArray(state.log)) return { state, stamped: 0 };
  const rows: readonly unknown[] = state.log;
  let stamped = 0;
  const log = rows.map((row, ordinal): unknown => {
    if (!isRecord(row) || (typeof row.id === "string" && row.id !== "")) return row;
    stamped += 1;
    return {
      ...row,
      id: `lg-${sha256(`log-id-v1\0${path}\0${ordinal}`).slice(0, 32)}`,
    };
  });
  return stamped === 0 ? { state, stamped: 0 } : { state: { ...state, log }, stamped };
}

/** The app's own read gate (`parseStoredCharacter`): a missing `build`/`state` is an
 *  empty map, and `parseCharacterEnvelope` owns every structural verdict beyond that. */
function envelopeMap(value: unknown): RawMap {
  return isRecord(value) ? value : {};
}

/** Plan ONE family. A family with any issue is planned as no change at all. */
function planFamily(family: CharacterFamily, updatedAt: Timestamp): FamilyPlan {
  const path = family.parent.path;
  const parent = family.parent.data;
  const marked = Object.hasOwn(parent, "playStateVersion");
  if (marked && parent.playStateVersion !== 1) {
    return quarantine(path, "invalid-envelope", "Unsupported playStateVersion");
  }

  const child = family.child;
  const storedChild = child ? parseCombatState(child.data) : undefined;
  if (child && storedChild && !storedChild.ok) {
    return quarantine(child.path, "invalid-child", `combat/state ${storedChild.reason}`);
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
      logIdsStamped: 0,
    };
  }

  // ── The legacy leg: exactly the client's own hydration path ────────────────
  const stamped = stampLogIds(envelopeMap(parent.state), path);
  const parsed = parseCharacterEnvelope(envelopeMap(parent.build), stamped.state);
  if (!parsed.ok) {
    // `CodecFailureError.message` is `<code>:<path>`, and that path can name a STORED
    // MAP KEY (a tracker id, an item instanceId). Only the stable code leaves this
    // process; the document is identified by its hash, like every other issue.
    return quarantine(
      path,
      "invalid-envelope",
      `Character codec refusal: ${parsed.error.split(":")[0] ?? "unknown"}`
    );
  }
  const hpMax = effectiveMaxHp(parsed.character, parsed.session);
  if (!Number.isFinite(hpMax) || hpMax < 1) {
    return quarantine(
      path,
      "invalid-envelope",
      "The hydrated character has no usable maximum HP"
    );
  }
  const combat = storedChild?.ok ? storedChild.state : null;
  const hydrated = applyCombatToSession(parsed.session, combat, hpMax, "legacy");
  if (!hydrated.ok) {
    return quarantine(
      child?.path ?? path,
      "invalid-child",
      `Hydration refused the combat/state child: ${hydrated.reason}`
    );
  }
  const playState = sessionToPlayStateV1(hydrated.session);

  // DRIFT GUARD (belt and braces behind the composition assertion in `run()`). The
  // codec chain is SRD-free except one boundary: `normalizeConcentrationRef` marks a
  // ref the loaded spell index does not know as `custom:<value>`. That is a correct
  // in-memory read-time net, but PERSISTING it would silently rewrite the spell a
  // player is holding. A family whose stored ref does not survive canonicalization
  // unchanged is refused, never rewritten — so a plan can never depend on which
  // catalogue happened to be composed.
  const storedConcentration = stamped.state.concentration;
  if (
    typeof storedConcentration === "string" &&
    storedConcentration !== "" &&
    playState.state.concentration !== storedConcentration
  ) {
    return quarantine(
      path,
      "unresolved-concentration",
      "The stored concentration ref does not survive canonicalization"
    );
  }

  const parentAfter: RawMap = {
    ...parent,
    playStateVersion: 1,
    state: {},
    ...(revisionStamped ? { revision: 0 } : {}),
  };
  documents.push(documentPlan(path, "parent", parent, parentAfter));

  let childAfter: RawMap;
  if (child && storedChild?.ok) {
    // The peer collections the app re-persists in canonical form on its next save:
    // rewrite a stored value the strict reader would reject, and drop one whose
    // canonical form is empty (exactly what the client's overwrite would shed).
    const canonical = combatStateWriteData(storedChild.state, updatedAt);
    const peers: RawMap = {};
    for (const field of PEER_FIELDS) {
      if (!Object.hasOwn(child.data, field)) continue;
      if (!Object.hasOwn(canonical, field)) continue;
      peers[field] = canonical[field];
    }
    const dropped = PEER_FIELDS.filter(
      (field) => Object.hasOwn(child.data, field) && !Object.hasOwn(canonical, field)
    );
    childAfter = Object.fromEntries(
      Object.entries({ ...child.data, ...peers, playState, updatedAt }).filter(
        ([key]) => !(dropped as readonly string[]).includes(key)
      )
    );
    documents.push(documentPlan(child.path, "child", child.data, childAfter));
  } else {
    childAfter = combatStateWriteData(sessionToCombatState(hydrated.session), updatedAt);
    documents.push(documentPlan(`${path}/combat/state`, "child", {}, childAfter));
  }

  // THE PROOF the whole migration rests on: the child this run would store must
  // satisfy the STRICT v1 reader the app loads it back with. A `combat/state` the
  // app cannot parse is a character the owner cannot open.
  const reread = parseCombatState(childAfter);
  if (!reread.ok || reread.ownership !== "v1") {
    return quarantine(
      child?.path ?? `${path}/combat/state`,
      "non-canonical-child",
      `The projected combat/state would not parse strictly: ${
        reread.ok ? "not a v1 owner" : reread.reason
      }`
    );
  }

  return {
    documents,
    issues: [],
    legacy: true,
    childCreated: !child,
    childUpdated: Boolean(child),
    revisionStamped,
    logIdsStamped: stamped.stamped,
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
    logIdsStamped: 0,
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
    counts.logIdsStamped += planned.logIdsStamped;
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
    if (match?.[1] && match[2]) {
      identity.set(parentPath, { uid: match[1], charId: match[2] });
    }
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

export interface ParentCutoverReport {
  format: "d20-folio-parent-cutover-report-v1";
  mode: "fixtures" | "firestore";
  counts: ParentCutoverCounts;
  writes: { path: string; kind: string; before: string; after: string }[];
  issues: { path: string; code: string }[];
}

/** The one report every mode prints: counts, hashes and issue codes only. */
export function reportForParentCutover(
  plan: ParentCutoverPlan,
  mode: ParentCutoverReport["mode"] = "firestore"
): ParentCutoverReport {
  return {
    format: "d20-folio-parent-cutover-report-v1",
    mode,
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
 * Plan over portable character exports (`{schema, build, state}`) on disk, as if each
 * were an unmarked parent with no child. The hydration is the SAME one a live family
 * gets — `parseCharacterEnvelope` then `effectiveMaxHp` — so the exports need no
 * synthesized metadata and the run exercises the real codec over real builds. It is a
 * dry-run only: no Firebase, no credentials, and nothing is ever written.
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
    if (!isRecord(parsed)) {
      throw new TypeError(`Fixture ${pathHash(name)} is not an object`);
    }
    const charId = name.slice(0, -".json".length);
    families.push({
      uid: "fixtures",
      charId,
      parent: { path: `users/fixtures/characters/${charId}`, data: parsed },
    });
  }
  return planParentCutover(families, updatedAt);
}

/**
 * The refusal message when this run's module composition cannot be trusted, else
 * `undefined`. The migration hydrates through the app's SRD-AWARE codec, so a run
 * whose `@pack` resolved to the typed-empty stub — an absent `content-pack` symlink,
 * an exported `VITE_CONTENT_PACK=0`, a renamed loader warm-up target — would see a
 * pack-only spell id as unknown and rewrite it. BOTH signals are required: the
 * documented switch saying the pack SHOULD compose, and a positive runtime count
 * saying it DID.
 */
export function packCompositionRefusal(
  enabled: boolean,
  packSpellCount: number
): string | undefined {
  return enabled && packSpellCount > 0
    ? undefined
    : "Refusing: content pack not composed — the plan would rewrite pack-only references";
}

async function run(): Promise<void> {
  const options = parseCliOptions(processArgv.slice(2));
  // BEFORE any planning, in EVERY mode (`--fixtures` included).
  const { packSpells } = (await import("@pack")) as { packSpells: readonly unknown[] };
  const refusal = packCompositionRefusal(contentPackEnabled(), packSpells.length);
  if (refusal) throw new Error(refusal);
  // ONE stamp for the whole run: the plan is hashed and then written verbatim, so a
  // per-document `Timestamp.now()` would make the reread verification unprovable.
  const updatedAt = Timestamp.now();
  if (options.mode === "fixtures") {
    const plan = await planFixtures(options.directory, updatedAt);
    console.log(JSON.stringify(reportForParentCutover(plan, "fixtures"), null, 2));
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
    report: (plan) => reportForParentCutover(plan),
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
