#!/usr/bin/env node
/**
 * v0.26.1 deploy step: a Monk's stored base Speed back to its species base.
 *
 * The sheet now adds Monk Unarmored Movement to the walking Speed itself. Before,
 * it didn't, so an imported Monk could store a base Speed that already counts the
 * bonus (Human Monk 3: "40" = 30 + 10); left alone, that sheet would show the bonus
 * twice. The rule, for a character with Monk levels:
 *   - stored base = species base + Unarmored Movement at its Monk level → species base;
 *   - stored base = species base → unchanged;
 *   - anything else → an issue (`unexpected-speed`), never a guess.
 * Characters without Monk levels are out of scope.
 *
 * IDEMPOTENT: after the reset every Monk reads its species base. The write sets only
 * `build.speed`, guarded by each document's `lastUpdateTime`.
 *
 * Output: counts, hashes and issue CODES. Never a payload, never a raw path.
 *
 * Run with (dry-run is the default and writes nothing; owner-gated, see the
 * `live-data-migration` skill):
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-monk-base-speed.ts
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-monk-base-speed.ts \
 *     --apply --backup /absolute/fresh/private/directory
 *   node --import ./scripts/alias-loader.mjs scripts/migrate-monk-base-speed.ts --check
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import { getClassTable } from "@/data/classes";
import { getRace } from "@/data/races";
import {
  discoverDocuments,
  hashFirestoreDocument,
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

const CHARACTER = /^users\/([^/]+)\/characters\/([^/]+)$/;

export interface MonkBaseSpeedPlan extends GuardedPlan {
  documents: GuardedDocumentPlan[];
  changedDocuments: GuardedDocumentPlan[];
  issues: MigrationIssue[];
  counts: { characters: number; monks: number; toReset: number; alreadyBase: number };
}

const isRecord = (value: unknown): value is RawMap =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The Monk level a stored build declares (0 when none). */
function monkLevel(build: RawMap): number {
  const classes = Array.isArray(build.classes) ? build.classes : [];
  return classes.reduce<number>(
    (sum, entry) =>
      isRecord(entry) && entry.classId === "monk" && typeof entry.level === "number"
        ? sum + entry.level
        : sum,
    0
  );
}

/** Unarmored Movement at that Monk level (SRD 5.2.1 Monk Features table). */
function unarmoredMovementFt(level: number): number {
  const row = getClassTable("monk")?.levels.find((l) => l.level === level);
  const value = row?.classSpecific?.unarmoredMovement;
  return typeof value === "number" ? value : 0;
}

/** Plan the whole corpus. Pure: no credentials, no Firebase. */
export function planMonkBaseSpeed(
  sources: readonly MigrationSourceDocument[]
): MonkBaseSpeedPlan {
  const issues: MigrationIssue[] = [];
  const documents: GuardedDocumentPlan[] = [];
  const counts = { characters: 0, monks: 0, toReset: 0, alreadyBase: 0 };
  const seen = new Set<string>();
  for (const source of [...sources].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!CHARACTER.test(source.path)) {
      issues.push({
        path: source.path,
        code: "unexpected-path",
        detail: "Not a character",
      });
      continue;
    }
    if (seen.has(source.path)) {
      issues.push({
        path: source.path,
        code: "duplicate-document",
        detail: "Seen twice",
      });
      continue;
    }
    seen.add(source.path);
    counts.characters += 1;
    const beforeHash = hashFirestoreDocument(source.data);
    const unchanged = (): void => {
      documents.push({
        path: source.path,
        before: source.data,
        after: source.data,
        beforeHash,
        afterHash: beforeHash,
        changed: false,
      });
    };
    const build = isRecord(source.data.build) ? source.data.build : null;
    const level = build ? monkLevel(build) : 0;
    if (!build || level === 0) {
      unchanged();
      continue;
    }
    counts.monks += 1;
    const species = typeof build.race === "string" ? getRace(build.race) : undefined;
    if (!species) {
      issues.push({
        path: source.path,
        code: "unknown-species",
        detail: "Species not found",
      });
      unchanged();
      continue;
    }
    const stored = typeof build.speed === "string" ? Number(build.speed) : Number.NaN;
    if (!Number.isInteger(stored)) {
      issues.push({
        path: source.path,
        code: "unreadable-speed",
        detail: "Speed not a number",
      });
      unchanged();
      continue;
    }
    const base = species.speed;
    if (stored === base) {
      counts.alreadyBase += 1;
      unchanged();
      continue;
    }
    if (stored !== base + unarmoredMovementFt(level)) {
      issues.push({
        path: source.path,
        code: "unexpected-speed",
        detail: "Neither the species base nor base + Unarmored Movement",
      });
      unchanged();
      continue;
    }
    counts.toReset += 1;
    const after: RawMap = { ...source.data, build: { ...build, speed: String(base) } };
    documents.push({
      path: source.path,
      before: source.data,
      after,
      beforeHash,
      afterHash: hashFirestoreDocument(after),
      changed: true,
    });
  }
  return {
    documents,
    changedDocuments: documents.filter((document) => document.changed),
    issues,
    counts,
  };
}

/** Clear exactly when re-planning needs no write and raises no issue. */
export function verifyMonkBaseSpeedCorpus(
  sources: readonly MigrationSourceDocument[]
): MigrationIssue[] {
  const plan = planMonkBaseSpeed(sources);
  return [
    ...plan.issues,
    ...plan.changedDocuments.map((document) => ({
      path: document.path,
      code: "bonus-left-in-base",
      detail: "A Monk's base Speed still counts Unarmored Movement",
    })),
  ];
}

/** The one field this script owns. */
export function writesForMonkBaseSpeed(document: GuardedDocumentPlan): GuardedWrite {
  const build = isRecord(document.after.build) ? document.after.build : {};
  return { kind: "update", data: { "build.speed": build.speed } };
}

export function reportForMonkBaseSpeed(plan: MonkBaseSpeedPlan) {
  return {
    format: "d20-folio-monk-base-speed-report-v1",
    counts: plan.counts,
    changed: plan.changedDocuments.map((document) => ({
      path: pathHash(document.path),
      before: document.beforeHash,
      after: document.afterHash,
    })),
    issues: plan.issues.map((entry) => ({
      path: pathHash(entry.path),
      code: entry.code,
    })),
  };
}

export const DISCOVERY = [{ collectionGroup: "characters", pattern: CHARACTER }];

async function run(): Promise<void> {
  const options = parseCliOptions(processArgv.slice(2));
  if (options.mode === "fixtures") throw new Error("--fixtures is not supported here");
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
      migration: "monk-base-speed",
      label: "monk-base-speed-v1",
      discover: (database) => discoverDocuments(database, DISCOVERY),
      plan: planMonkBaseSpeed,
      verify: verifyMonkBaseSpeedCorpus,
      writesFor: writesForMonkBaseSpeed,
      report: reportForMonkBaseSpeed,
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
