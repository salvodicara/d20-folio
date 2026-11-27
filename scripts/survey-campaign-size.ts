#!/usr/bin/env node
/**
 * READ-ONLY: how big each campaign document is, and what grows in it. Firestore caps a
 * document at 1 MiB (1,048,576 bytes); the campaign document holds the live fight, the
 * initiative table, the members, the clock, the treasury and its log (architecture review,
 * 2026-11-22). Counts only: never an id, a name or a value. Sizes are the JSON length of
 * the stored data, an estimate close to Firestore's own size.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-campaign-size.ts
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import { readTargetConfiguration } from "./lib/migration-kit.ts";

const LIMIT = 1_048_576;

export interface CampaignSizeRow {
  bytes: number;
  treasuryLog: number;
  events: number;
  effectOps: number;
  combatants: number;
  members: number;
}

export interface CampaignSizeSurvey {
  campaigns: number;
  /** Largest first. */
  rows: CampaignSizeRow[];
  /** The largest document as a share of the 1 MiB limit (0..1). */
  largestShareOfLimit: number;
}

const length = (value: unknown): number => (Array.isArray(value) ? value.length : 0);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

export function surveyCampaignSizes(campaigns: readonly unknown[]): CampaignSizeSurvey {
  const rows = campaigns
    .map((raw) => {
      const data = record(raw);
      const encounter = record(data.encounter);
      return {
        bytes: Buffer.byteLength(JSON.stringify(data), "utf8"),
        treasuryLog: length(data.treasuryLog),
        events: length(encounter.events),
        effectOps: length(encounter.effectOps),
        combatants: length(encounter.combatants),
        members: Object.keys(record(data.memberDetails)).length,
      };
    })
    .sort((a, b) => b.bytes - a.bytes);
  return {
    campaigns: rows.length,
    rows,
    largestShareOfLimit: rows[0] ? Math.round((rows[0].bytes / LIMIT) * 1000) / 1000 : 0,
  };
}

async function run(): Promise<void> {
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
    const snapshot = await getFirestore(app).collection("campaigns").get();
    const survey = surveyCampaignSizes(snapshot.docs.map((doc) => doc.data()));
    console.log(JSON.stringify(survey, null, 2));
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
