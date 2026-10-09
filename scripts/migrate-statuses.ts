#!/usr/bin/env node
/**
 * Phase 2 steps 3–4 (PREPARED, NOT RUN): backfill `statuses` beside today's status
 * fields in every character's play state (docs/ARCHITECTURE_MAP.md, "Phase 2").
 *
 * Today a character's statuses live in five play-state fields of its
 * `users/{uid}/characters/{id}/combat/state` child (`playState.state`):
 * `activeFeatures`, `effectTimers`, `effectBoundaries`, `activeSpellCastLevels`,
 * `concentration`. Their meaning (which source, which declared duration, what
 * Concentration holds) is only recoverable by joining them with the character's
 * build and the catalogue — `deriveStatuses` (src/lib/status.ts) is that ONE join.
 *
 * This migration writes the join's result next to the old fields, as
 * `playState.state.statuses: Status[]`, so a later reader (one pure
 * `expire(statuses, boundary)`) no longer needs the catalogue. It NEVER removes or
 * rewrites an old field: deleting them is a separate, owner-approved step.
 *
 * ORDER (owner-gated, each step its own yes):
 *   1. ship the app dual-write (every play-state save writes `statuses` derived the
 *      same way) — otherwise a backfilled list goes stale on the next toggle, because
 *      today's client preserves an unknown `state` key verbatim;
 *   2. `--dry-run`, then `--apply --backup <dir>` here to backfill untouched characters;
 *   3. `--check` proves every stored list equals the derivation;
 *   4. only then switch readers to `statuses`, and later delete the old fields.
 *
 * IDEMPOTENT: a character whose stored `statuses` already equals the derivation is
 * unchanged; a character with no status keeps no field (absent ≡ empty). Snapshots are
 * independent past copies and are out of scope. The derivation is catalogue-aware, so
 * the run refuses unless the private content pack composed (a pack-only feature would
 * otherwise lose its declared duration).
 *
 * Output: counts, hashes and issue CODES. Never a payload, never a raw path.
 *
 * Run with (dry-run is the default and writes nothing):
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-statuses.ts
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-statuses.ts --check
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-statuses.ts \
 *     --apply --backup /absolute/fresh/private/directory
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import { FieldValue } from "firebase-admin/firestore";
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

// ── The engine seam (structural, so the scripts project never type-imports the app) ──

type OpaqueCharacter = { readonly __character: unique symbol };
type OpaqueSession = { readonly __session: unique symbol };

interface EngineModules {
  parseCharacterEnvelope: (
    build: RawMap,
    state: RawMap
  ) => { ok: true; character: OpaqueCharacter } | { ok: false; error: string };
  parsePersistedPlayStateV1: (
    value: unknown
  ) => { ok: true; session: OpaqueSession } | { ok: false; reason: string };
  deriveStatuses: (doc: {
    character: OpaqueCharacter;
    session: OpaqueSession;
  }) => readonly RawMap[];
}

async function engineFunction(file: string, name: string): Promise<unknown> {
  const module: unknown = await import(
    new URL(`../src/lib/${file}`, import.meta.url).href
  );
  if (!isRecord(module) || typeof module[name] !== "function") {
    throw new TypeError(`${file} does not export ${name}`);
  }
  return module[name];
}

const engine = {
  parseCharacterEnvelope: await engineFunction(
    "character-codec.ts",
    "parseCharacterEnvelope"
  ),
  parsePersistedPlayStateV1: await engineFunction(
    "session-state-codec.ts",
    "parsePersistedPlayStateV1"
  ),
  deriveStatuses: await engineFunction("status.ts", "deriveStatuses"),
} as EngineModules;

// ── The pure planner ────────────────────────────────────────────────────────

export interface StatusesDocumentPlan extends GuardedDocumentPlan {
  statuses: number;
}

export interface StatusesPlan extends GuardedPlan<StatusesDocumentPlan> {
  documents: StatusesDocumentPlan[];
  changedDocuments: StatusesDocumentPlan[];
  issues: MigrationIssue[];
  counts: {
    characters: number;
    withStatuses: number;
    statuses: number;
    toWrite: number;
    toClear: number;
  };
}

function issue(path: string, code: string, detail: string): MigrationIssue {
  return { path, code, detail };
}

/** The child after the backfill: `playState.state.statuses` equals the derivation,
 *  absent when the character has no status. Every other byte is untouched. */
function childWithStatuses(child: RawMap, statuses: readonly RawMap[]): RawMap {
  const playState = child.playState as RawMap;
  const { statuses: _stored, ...state } = playState.state as RawMap;
  void _stored;
  return {
    ...child,
    playState: {
      ...playState,
      state: statuses.length > 0 ? { ...state, statuses: [...statuses] } : state,
    },
  };
}

/**
 * Plan the whole corpus. Pure: no credentials, no Firebase. A family with any issue
 * is planned as no change at all.
 */
export function planStatuses(sources: readonly MigrationSourceDocument[]): StatusesPlan {
  const parents = new Map<string, MigrationSourceDocument>();
  const children = new Map<string, MigrationSourceDocument>();
  const issues: MigrationIssue[] = [];
  for (const source of [...sources].sort((a, b) => a.path.localeCompare(b.path))) {
    const family = PARENT.test(source.path)
      ? { map: parents, key: source.path }
      : CHILD.test(source.path)
        ? { map: children, key: source.path.slice(0, -"/combat/state".length) }
        : undefined;
    if (!family) {
      issues.push(
        issue(
          source.path,
          "unexpected-path",
          "Only parents and combat/state are in scope"
        )
      );
    } else if (family.map.has(family.key)) {
      issues.push(issue(source.path, "duplicate-document", "Path discovered twice"));
    } else {
      family.map.set(family.key, source);
    }
  }

  const counts = { characters: 0, withStatuses: 0, statuses: 0, toWrite: 0, toClear: 0 };
  const documents: StatusesDocumentPlan[] = [];
  for (const [parentPath, child] of children) {
    const parent = parents.get(parentPath);
    if (!parent) {
      issues.push(issue(child.path, "orphan-child", "combat/state without its parent"));
      continue;
    }
    const build = isRecord(parent.data.build) ? parent.data.build : {};
    const character = engine.parseCharacterEnvelope(build, {});
    if (!character.ok) {
      issues.push(issue(parent.path, "invalid-envelope", "The build does not parse"));
      continue;
    }
    const play = engine.parsePersistedPlayStateV1(child.data.playState);
    if (!play.ok) {
      issues.push(issue(child.path, "invalid-play-state", play.reason));
      continue;
    }
    const derived = engine.deriveStatuses({
      character: character.character,
      session: play.session,
    });
    const after = childWithStatuses(child.data, derived);
    const beforeHash = hashFirestoreDocument(child.data);
    const afterHash = hashFirestoreDocument(after);
    const changed = beforeHash !== afterHash;
    counts.characters += 1;
    if (derived.length > 0) counts.withStatuses += 1;
    counts.statuses += derived.length;
    if (changed) {
      if (derived.length > 0) counts.toWrite += 1;
      else counts.toClear += 1;
    }
    documents.push({
      path: child.path,
      before: child.data,
      after,
      beforeHash,
      afterHash,
      changed,
      statuses: derived.length,
    });
  }
  return {
    documents,
    changedDocuments: documents.filter((document) => document.changed),
    issues,
    counts,
  };
}

/** Migrated exactly when re-planning needs no write and raises no issue. */
export function verifyStatusesCorpus(
  sources: readonly MigrationSourceDocument[]
): MigrationIssue[] {
  const plan = planStatuses(sources);
  return [
    ...plan.issues,
    ...plan.changedDocuments.map((document) =>
      issue(document.path, "verification-failed", "The stored statuses are stale")
    ),
  ];
}

/** The one field this migration owns — never the whole child, so a concurrent play
 *  write to another field survives. */
export function writesForStatuses(document: GuardedDocumentPlan): GuardedWrite {
  const state = (document.after.playState as RawMap).state as RawMap;
  return {
    kind: "update",
    data: {
      "playState.state.statuses": Object.hasOwn(state, "statuses")
        ? state.statuses
        : FieldValue.delete(),
    },
  };
}

export function reportForStatuses(plan: StatusesPlan) {
  return {
    format: "d20-folio-statuses-report-v1",
    counts: plan.counts,
    changed: plan.changedDocuments.map((document) => ({
      path: pathHash(document.path),
      before: document.beforeHash,
      after: document.afterHash,
      statuses: document.statuses,
    })),
    issues: plan.issues.map((entry) => ({
      path: pathHash(entry.path),
      code: entry.code,
    })),
  };
}

export const DISCOVERY = [
  { collectionGroup: "characters", pattern: PARENT },
  { collectionGroup: "combat", pattern: CHILD },
];

/** Refuse unless the private pack composed (a derivation over the SRD alone would
 *  drop a pack feature's declared duration). */
export function packRefusal(
  enabled: boolean,
  packSpellCount: number
): string | undefined {
  return enabled && packSpellCount > 0
    ? undefined
    : "Refusing: content pack not composed — pack statuses would lose their durations";
}

async function run(): Promise<void> {
  const options = parseCliOptions(processArgv.slice(2));
  if (options.mode === "fixtures") throw new Error("--fixtures is not supported here");
  const { packSpells } = (await import("@pack")) as { packSpells: readonly unknown[] };
  const refusal = packRefusal(contentPackEnabled(), packSpells.length);
  if (refusal) throw new Error(refusal);
  const target = await readTargetConfiguration();
  const [{ initializeApp, applicationDefault, deleteApp }, { getFirestore }] =
    await Promise.all([import("firebase-admin/app"), import("firebase-admin/firestore")]);
  const app = initializeApp({
    projectId: target.projectId,
    ...(target.emulator ? {} : { credential: applicationDefault() }),
  });
  console.log(
    `Target: ${target.projectId} (${target.emulator ? "explicit emulator" : "production read"})`
  );
  try {
    await runGuardedMigration({
      migration: "statuses",
      label: "statuses-v1",
      discover: (database) => discoverDocuments(database, DISCOVERY),
      plan: planStatuses,
      verify: verifyStatusesCorpus,
      writesFor: writesForStatuses,
      report: reportForStatuses,
      options,
      db: getFirestore(app),
    });
  } finally {
    await deleteApp(app);
  }
}

if (processArgv[1] && import.meta.url === pathToFileURL(resolve(processArgv[1])).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
