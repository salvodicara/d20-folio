#!/usr/bin/env node
/**
 * READ-ONLY survey (#1413): run before the write-chain rules deploy. It counts the
 * character parents, and those already holding a `writeId` or a `baseWriteId` key.
 * Before the client that writes the chain is live, both are expected to be 0: the new
 * rule then judges every live sheet as «never chained» and accepts its first chained
 * save.
 *
 * Output: counts only. Never a name, an id, a path or a value from a document.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-write-chain-keys.ts
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import {
  discoverDocuments,
  readTargetConfiguration,
  type MigrationSourceDocument,
} from "./lib/migration-kit.ts";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;

export interface WriteChainKeySurvey {
  format: "d20-folio-write-chain-keys-survey-v1";
  /** Every character parent. */
  parents: number;
  /** Parents holding a `writeId` key (any value). */
  withWriteId: number;
  /** Parents holding a `baseWriteId` key (any value, null included). */
  withBaseWriteId: number;
}

export function surveyWriteChainKeys(
  sources: readonly MigrationSourceDocument[]
): WriteChainKeySurvey {
  const survey: WriteChainKeySurvey = {
    format: "d20-folio-write-chain-keys-survey-v1",
    parents: 0,
    withWriteId: 0,
    withBaseWriteId: 0,
  };
  for (const source of sources) {
    if (!PARENT.test(source.path)) continue;
    survey.parents += 1;
    if (Object.hasOwn(source.data, "writeId")) survey.withWriteId += 1;
    if (Object.hasOwn(source.data, "baseWriteId")) survey.withBaseWriteId += 1;
  }
  return survey;
}

export const DISCOVERY = [{ collectionGroup: "characters", pattern: PARENT }];

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
    const found = await discoverDocuments(getFirestore(app), DISCOVERY);
    console.log(
      JSON.stringify(surveyWriteChainKeys(found.map((d) => d.source)), null, 2)
    );
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
