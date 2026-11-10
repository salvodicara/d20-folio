#!/usr/bin/env node
/**
 * READ-ONLY: how many client error reports (the `diagnostics` collection, ADR-0008)
 * arrived since a cut-off, by app version and by event. Counts only: never a message,
 * a uid, a breadcrumb or a document id. Reads at most READ_CAP of the newest reports.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-diagnostics.ts --since=2026-11-10T17:00:00Z
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import { readTargetConfiguration } from "./lib/migration-kit.ts";

const READ_CAP = 1000;

export interface DiagnosticsSummary {
  since: string;
  reports: number;
  players: number;
  byVersion: Record<string, number>;
  byEvent: Record<string, number>;
  truncated?: true;
}

interface StoredReport {
  uid?: unknown;
  event?: unknown;
  createdAt?: unknown;
  context?: unknown;
}

const label = (value: unknown): string =>
  typeof value === "string" && value !== "" ? value : "unknown";

export function summariseDiagnostics(
  reports: readonly StoredReport[],
  since: Date
): DiagnosticsSummary {
  const recent = reports.filter(
    (report) => report.createdAt instanceof Date && report.createdAt >= since
  );
  const byVersion: Record<string, number> = {};
  const byEvent: Record<string, number> = {};
  for (const report of recent) {
    const context = (report.context ?? {}) as { appVersion?: unknown };
    const version = label(context.appVersion);
    const event = label(report.event);
    byVersion[version] = (byVersion[version] ?? 0) + 1;
    byEvent[event] = (byEvent[event] ?? 0) + 1;
  }
  return {
    since: since.toISOString(),
    reports: recent.length,
    players: new Set(recent.map((report) => report.uid)).size,
    byVersion,
    byEvent,
  };
}

async function run(): Promise<void> {
  const sinceArg = processArgv.find((arg) => arg.startsWith("--since="))?.slice(8);
  const since = new Date(sinceArg ?? "");
  if (Number.isNaN(since.getTime())) throw new Error("Pass --since=<ISO date>");
  const target = await readTargetConfiguration();
  const [{ initializeApp, applicationDefault, deleteApp }, { getFirestore, Timestamp }] =
    await Promise.all([import("firebase-admin/app"), import("firebase-admin/firestore")]);
  const app = initializeApp({
    projectId: target.projectId,
    ...(target.emulator ? {} : { credential: applicationDefault() }),
  });
  console.log(
    `Target: ${target.projectId} (${target.emulator ? "explicit emulator" : "production read"})`
  );
  try {
    const snapshot = await getFirestore(app)
      .collection("diagnostics")
      .where("createdAt", ">=", since)
      .orderBy("createdAt", "desc")
      .limit(READ_CAP + 1)
      .get();
    const reports = snapshot.docs.slice(0, READ_CAP).map((doc) => {
      const data: StoredReport = doc.data();
      const created = data.createdAt;
      return {
        ...data,
        createdAt: created instanceof Timestamp ? created.toDate() : null,
      };
    });
    const summary = summariseDiagnostics(reports, since);
    if (snapshot.size > READ_CAP) summary.truncated = true;
    console.log(JSON.stringify(summary, null, 2));
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
