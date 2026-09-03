#!/usr/bin/env node
/**
 * Codec-loss audit — the ADR-0009 dry-run for stage 0 of the stage-1 program: prove
 * that the closed-world codecs lose nothing over the six team fixtures and over a
 * production export. Read-only in every mode; nothing is ever written to Firestore.
 *
 *   node --import ./scripts/alias-loader.mjs scripts/audit-codec-loss.ts \
 *     --fixtures /absolute/dir          # portable exports: byte-identity measured
 *   node --import ./scripts/alias-loader.mjs scripts/audit-codec-loss.ts \
 *     --backup /absolute/dir            # a migration-kit tagged directory (backup or export)
 *   node --import ./scripts/alias-loader.mjs scripts/audit-codec-loss.ts \
 *     --export /absolute/fresh/private/dir   # read production (service account) into a
 *                                            # fresh tagged directory, then audit it
 *
 * Output: one JSON report — counts per document family, hashed findings, codes and lost
 * key paths. Never a payload, never a raw path, never a uid or character id. Exit 1 on
 * any loss or quarantine, or when the content pack is not composed (a pack-only id
 * would be misread as unknown and reported as loss).
 */

/// <reference types="node" />

import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import { contentPackEnabled } from "./content-pack-mode.ts";
import {
  auditDocument,
  auditPortableExport,
  classifyPath,
  type AuditVerdict,
  type DocumentKind,
} from "./lib/codec-loss-audit.ts";
import {
  decodeFirestoreValue,
  discoverDocuments,
  hashFirestoreDocument,
  isRecord,
  pathHash,
  readTargetConfiguration,
  writeBackupDirectory,
  type BackupManifest,
  type TaggedFirestoreValue,
} from "./lib/migration-kit.ts";
import { packCompositionRefusal } from "./migrate-character-parents.ts";

export type AuditMode = "fixtures" | "backup" | "export";
export interface AuditOptions {
  mode: AuditMode;
  directory: string;
}

const MODES: readonly AuditMode[] = ["fixtures", "backup", "export"];

export function parseAuditOptions(args: readonly string[]): AuditOptions {
  let chosen: AuditOptions | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const mode = MODES.find((candidate) => arg === `--${candidate}`);
    if (!mode) throw new Error(`Unknown argument: ${String(arg)}`);
    if (chosen) throw new Error("Choose exactly one of --fixtures, --backup, --export");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`--${mode} needs a path`);
    if (!isAbsolute(value)) throw new Error(`--${mode} must name an absolute directory`);
    chosen = { mode, directory: resolve(value) };
    index += 1;
  }
  if (!chosen) throw new Error("Choose one of --fixtures, --backup, --export");
  return chosen;
}

export interface AuditRow {
  path: string;
  kind: DocumentKind | undefined;
  verdict: AuditVerdict | undefined;
}

interface KindCounts {
  documents: number;
  byteIdentical: number;
  equal: number;
  loss: number;
  quarantine: number;
}

export interface AuditReport {
  mode: AuditMode;
  counts: Record<DocumentKind, KindCounts>;
  /** Documents of no audited family (the share projection, campaign documents). */
  skipped: number;
  findings: Array<{ document: string; kind: DocumentKind } & Record<string, unknown>>;
  ok: boolean;
}

export function buildReport(mode: AuditMode, rows: readonly AuditRow[]): AuditReport {
  const empty = (): KindCounts => ({
    documents: 0,
    byteIdentical: 0,
    equal: 0,
    loss: 0,
    quarantine: 0,
  });
  const counts: Record<DocumentKind, KindCounts> = {
    parent: empty(),
    snapshot: empty(),
    "combat-state": empty(),
    library: empty(),
  };
  const findings: AuditReport["findings"] = [];
  let skipped = 0;
  for (const row of rows) {
    if (!row.kind || !row.verdict) {
      skipped += 1;
      continue;
    }
    const bucket = counts[row.kind];
    bucket.documents += 1;
    const { verdict, ...rest } = row.verdict;
    if (verdict === "byte-identical") bucket.byteIdentical += 1;
    else if (verdict === "equal") bucket.equal += 1;
    else {
      if (verdict === "loss") bucket.loss += 1;
      else bucket.quarantine += 1;
      findings.push({ document: pathHash(row.path), kind: row.kind, verdict, ...rest });
    }
  }
  return { mode, counts, skipped, findings, ok: findings.length === 0 };
}

async function auditFixtures(directory: string): Promise<AuditRow[]> {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const rows: AuditRow[] = [];
  for (const name of names) {
    const json = await readFile(join(directory, name), "utf8");
    rows.push({
      path: `fixtures/${name}`,
      kind: "parent",
      verdict: auditPortableExport(json),
    });
  }
  return rows;
}

async function auditTaggedDirectory(directory: string): Promise<AuditRow[]> {
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8")
  ) as BackupManifest;
  const rows: AuditRow[] = [];
  for (const entry of manifest.documents) {
    const stored = JSON.parse(await readFile(join(directory, entry.file), "utf8")) as {
      data: TaggedFirestoreValue;
    };
    const data = decodeFirestoreValue(stored.data, {
      reference: (path) => ({ __reference: path }),
    });
    const kind = classifyPath(entry.path);
    rows.push({
      path: entry.path,
      kind,
      verdict: kind && isRecord(data) ? auditDocument(kind, data) : undefined,
    });
  }
  return rows;
}

const DISCOVERY = [
  { collectionGroup: "characters", pattern: /^users\/[^/]+\/characters\/[^/]+$/ },
  {
    collectionGroup: "snapshots",
    pattern: /^users\/[^/]+\/characters\/[^/]+\/snapshots\/[^/]+$/,
  },
  {
    collectionGroup: "combat",
    pattern: /^users\/[^/]+\/characters\/[^/]+\/combat\/state$/,
  },
  { collectionGroup: "library", pattern: /^users\/[^/]+\/library\/index$/ },
];

/** Read every audited family from production (read-only) into a fresh private tagged
 *  directory — the same format the migration backups use — so the audit and any later
 *  re-audit read exactly the same bytes. */
async function exportProduction(directory: string): Promise<void> {
  const target = await readTargetConfiguration();
  const [{ initializeApp, applicationDefault, deleteApp }, { getFirestore }] =
    await Promise.all([import("firebase-admin/app"), import("firebase-admin/firestore")]);
  const app = initializeApp({
    projectId: target.projectId,
    ...(target.emulator ? {} : { credential: applicationDefault() }),
  });
  console.error(
    `Target: ${target.projectId} (${target.emulator ? "explicit emulator" : "production read"})`
  );
  try {
    const documents = await discoverDocuments(getFirestore(app), DISCOVERY);
    await writeBackupDirectory({
      directory,
      migration: "codec-loss-audit",
      label: "export",
      documents: documents.map((document) => {
        const hash = hashFirestoreDocument(document.source.data);
        return {
          plan: {
            path: document.source.path,
            before: document.source.data,
            after: document.source.data,
            beforeHash: hash,
            afterHash: hash,
            changed: false,
          },
          updateTime: document.updateTime,
        };
      }),
    });
    console.error(`Exported ${documents.length} documents`);
  } finally {
    await deleteApp(app);
  }
}

async function run(): Promise<void> {
  const options = parseAuditOptions(processArgv.slice(2));
  // BEFORE any reading, in EVERY mode: an SRD-only composition would misread pack ids.
  const { packSpells } = (await import("@pack")) as { packSpells: readonly unknown[] };
  const refusal = packCompositionRefusal(contentPackEnabled(), packSpells.length);
  if (refusal) throw new Error(refusal);
  if (options.mode === "export") await exportProduction(options.directory);
  const rows =
    options.mode === "fixtures"
      ? await auditFixtures(options.directory)
      : await auditTaggedDirectory(options.directory);
  const report = buildReport(options.mode, rows);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (processArgv[1] && import.meta.url === pathToFileURL(resolve(processArgv[1])).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
