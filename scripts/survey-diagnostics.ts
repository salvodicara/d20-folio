#!/usr/bin/env node
/**
 * READ-ONLY: how many client error reports (the `diagnostics` collection, ADR-0008)
 * arrived since a cut-off, by app version and by event. Counts only: never a message,
 * a uid, a breadcrumb or a document id. Reads at most READ_CAP of the newest reports.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-diagnostics.ts --since=2026-11-10T17:00:00Z
 *
 * `--trail=<event>` lists each report of one event instead: its app version, the
 * minutes since the previous one, its breadcrumb trail as event names only, and, by
 * count, the characters (and shared ones) of the accounts involved. Still no message,
 * uid or id.
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

/** One report of a traced event: no uid, no id, no message text. */
export interface TrailEntry {
  appVersion: string;
  /** Minutes since the previous report of the same event (null for the first). */
  minutesSincePrevious: number | null;
  /** The multi-tab lease line («Failed to obtain primary lease») within 60 s before. */
  leaseWithinMinute: boolean;
  /** The breadcrumbs, oldest first, as event names; a code-like reason in brackets. */
  trail: string[];
}

interface StoredCrumb {
  t?: unknown;
  event?: unknown;
  data?: { message?: unknown; reason?: unknown; where?: unknown };
}

const LEASE = /Failed to obtain primary lease/;
const CODE = /^[a-z0-9:._-]{1,64}$/;

function crumbLabel(crumb: StoredCrumb): string {
  const event = label(crumb.event);
  if (typeof crumb.data?.message === "string" && LEASE.test(crumb.data.message))
    return `${event}[lease]`;
  const codes = [crumb.data?.reason, crumb.data?.where].filter(
    (value): value is string => typeof value === "string" && CODE.test(value)
  );
  return codes.length > 0 ? `${event}[${codes.join(" ")}]` : event;
}

/**
 * Every report of `event`, oldest first, with the breadcrumb trail that led to it as
 * event names only (`--trail=<event>`): what the app did just before the error.
 */
export function trailOf(
  reports: ReadonlyArray<StoredReport & { createdAtMs?: unknown; breadcrumbs?: unknown }>,
  event: string
): TrailEntry[] {
  const matching = reports
    .filter((report) => report.event === event && report.createdAt instanceof Date)
    .sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
  let previous: number | null = null;
  return matching.map((report) => {
    const when = (report.createdAt as Date).getTime();
    const crumbs = Array.isArray(report.breadcrumbs)
      ? (report.breadcrumbs as StoredCrumb[])
      : [];
    const entry: TrailEntry = {
      appVersion: label(((report.context ?? {}) as { appVersion?: unknown }).appVersion),
      minutesSincePrevious:
        previous === null ? null : Math.round((when - previous) / 60_000),
      leaseWithinMinute: crumbs.some(
        (crumb) =>
          typeof crumb.t === "number" &&
          when - crumb.t <= 60_000 &&
          typeof crumb.data?.message === "string" &&
          LEASE.test(crumb.data.message)
      ),
      trail: crumbs.map(crumbLabel),
    };
    previous = when;
    return entry;
  });
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
    const traced = processArgv.find((arg) => arg.startsWith("--trail="))?.slice(8);
    if (traced) {
      const db = getFirestore(app);
      const snap = await db
        .collection("diagnostics")
        .where("event", "==", traced)
        .limit(READ_CAP)
        .get();
      const reports = snap.docs
        .map((doc) => {
          const data = doc.data() as StoredReport & { breadcrumbs?: unknown };
          const created = data.createdAt;
          return {
            ...data,
            createdAt: created instanceof Timestamp ? created.toDate() : null,
          };
        })
        .filter((report) => report.createdAt !== null && report.createdAt >= since);
      // The accounts involved, by count only: their characters, and how many are shared
      // (a shared sheet's save also writes its public projection, under its own rule).
      const uids = [...new Set(reports.map((report) => report.uid))].filter(
        (uid): uid is string => typeof uid === "string" && uid !== ""
      );
      let characters = 0;
      let shared = 0;
      for (const uid of uids) {
        const owned = await db
          .collection(`users/${uid}/characters`)
          .select("shared")
          .get();
        characters += owned.size;
        shared += owned.docs.filter((doc) => doc.get("shared") === true).length;
      }
      console.log(
        JSON.stringify(
          {
            event: traced,
            since: since.toISOString(),
            accounts: uids.length,
            characters,
            shared,
            reports: trailOf(reports, traced),
          },
          null,
          2
        )
      );
      return;
    }
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
