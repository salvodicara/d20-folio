#!/usr/bin/env node
/**
 * v0.26.0 deploy step: clear the dead `dmReaders` / `campaignReaders` fields from
 * every character document (`users/{uid}/characters/{id}`).
 *
 * The fields are old denormalized read ACLs. Nothing in the app, the Functions or
 * `firestore.rules` reads or writes them any more; they only keep stale copies of
 * who could once read a character. The production check of 2026-11-03 found them on
 * 11 of 12 characters. This replaces phase 2 of the retired
 * `backfill-attached-campaign` (its phase 1, the campaign pointers, checked 0).
 *
 * IDEMPOTENT: a character without either field is unchanged. The write deletes only
 * those two fields, guarded by each document's `lastUpdateTime`, so a concurrent save
 * of anything else is refused rather than overwritten.
 *
 * Output: counts, hashes and issue CODES. Never a payload, never a raw path.
 *
 * Run with (dry-run is the default and writes nothing; owner-gated, see the
 * `live-data-migration` skill):
 *   node --import ./scripts/alias-loader.mjs scripts/clear-acl-residue.ts
 *   node --import ./scripts/alias-loader.mjs scripts/clear-acl-residue.ts \
 *     --apply --backup /absolute/fresh/private/directory
 *   node --import ./scripts/alias-loader.mjs scripts/clear-acl-residue.ts --check
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import { FieldValue } from "firebase-admin/firestore";
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
export const RESIDUE_FIELDS = ["dmReaders", "campaignReaders"] as const;

export interface AclResiduePlan extends GuardedPlan {
  documents: GuardedDocumentPlan[];
  changedDocuments: GuardedDocumentPlan[];
  issues: MigrationIssue[];
  counts: {
    characters: number;
    withResidue: number;
    withDmReaders: number;
    withCampaignReaders: number;
  };
}

/** Plan the whole corpus. Pure: no credentials, no Firebase. */
export function planAclResidue(
  sources: readonly MigrationSourceDocument[]
): AclResiduePlan {
  const issues: MigrationIssue[] = [];
  const documents: GuardedDocumentPlan[] = [];
  const counts = {
    characters: 0,
    withResidue: 0,
    withDmReaders: 0,
    withCampaignReaders: 0,
  };
  const seen = new Set<string>();
  for (const source of [...sources].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!CHARACTER.test(source.path)) {
      issues.push({
        path: source.path,
        code: "unexpected-path",
        detail: "Only character documents are in scope",
      });
      continue;
    }
    if (seen.has(source.path)) {
      issues.push({
        path: source.path,
        code: "duplicate-document",
        detail: "Path discovered twice",
      });
      continue;
    }
    seen.add(source.path);
    counts.characters += 1;
    const has = RESIDUE_FIELDS.filter((field) => Object.hasOwn(source.data, field));
    if (has.includes("dmReaders")) counts.withDmReaders += 1;
    if (has.includes("campaignReaders")) counts.withCampaignReaders += 1;
    if (has.length > 0) counts.withResidue += 1;
    const { dmReaders: _dm, campaignReaders: _campaign, ...after } = source.data;
    void _dm;
    void _campaign;
    const beforeHash = hashFirestoreDocument(source.data);
    const afterHash = hashFirestoreDocument(after);
    documents.push({
      path: source.path,
      before: source.data,
      after,
      beforeHash,
      afterHash,
      changed: beforeHash !== afterHash,
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
export function verifyAclResidueCorpus(
  sources: readonly MigrationSourceDocument[]
): MigrationIssue[] {
  const plan = planAclResidue(sources);
  return [
    ...plan.issues,
    ...plan.changedDocuments.map((document) => ({
      path: document.path,
      code: "residue-left",
      detail: "The character still carries dmReaders or campaignReaders",
    })),
  ];
}

/** The two fields this script owns, deleted; nothing else is written. */
export function writesForAclResidue(document: GuardedDocumentPlan): GuardedWrite {
  const data: RawMap = {};
  for (const field of RESIDUE_FIELDS) {
    if (Object.hasOwn(document.before, field)) data[field] = FieldValue.delete();
  }
  return { kind: "update", data };
}

export function reportForAclResidue(plan: AclResiduePlan) {
  return {
    format: "d20-folio-acl-residue-report-v1",
    counts: { ...plan.counts, toClear: plan.changedDocuments.length },
    changed: plan.changedDocuments.map((document) => ({
      path: pathHash(document.path),
      before: document.beforeHash,
      after: document.afterHash,
      fields: RESIDUE_FIELDS.filter((field) => Object.hasOwn(document.before, field)),
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
      migration: "acl-residue",
      label: "acl-residue-v1",
      discover: (database) => discoverDocuments(database, DISCOVERY),
      plan: planAclResidue,
      verify: verifyAclResidueCorpus,
      writesFor: writesForAclResidue,
      report: reportForAclResidue,
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
