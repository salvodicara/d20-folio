#!/usr/bin/env node
/**
 * READ-ONLY survey (#1320): the shape numbers the fence compares, so the operator can
 * confirm the fence is a no-op today. Counts characters by `schema` and play
 * documents (`combat/state`) by `playState.version`, and how many carry none.
 *
 * Output: counts only. Never a name, an id, a path or a value from a document.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-shape-numbers.ts
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import {
  discoverDocuments,
  isRecord,
  readTargetConfiguration,
  type MigrationSourceDocument,
} from "./lib/migration-kit.ts";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;
const PLAY = /^users\/([^/]+)\/characters\/([^/]+)\/combat\/state$/;

export interface ShapeNumberSurvey {
  format: "d20-folio-shape-numbers-survey-v1";
  /** Characters by stored `schema` ("none" when absent or not a number). */
  characterSchema: Record<string, number>;
  /** Play documents by `playState.version` ("none" when absent or not a number). */
  playStateVersion: Record<string, number>;
}

const key = (v: unknown): string =>
  typeof v === "number" && Number.isFinite(v) ? String(v) : "none";

export function surveyShapeNumbers(
  sources: readonly MigrationSourceDocument[]
): ShapeNumberSurvey {
  const survey: ShapeNumberSurvey = {
    format: "d20-folio-shape-numbers-survey-v1",
    characterSchema: {},
    playStateVersion: {},
  };
  for (const source of sources) {
    if (PARENT.test(source.path)) {
      const k = key(source.data.schema);
      survey.characterSchema[k] = (survey.characterSchema[k] ?? 0) + 1;
    } else if (PLAY.test(source.path)) {
      const play = source.data.playState;
      const k = key(isRecord(play) ? play.version : undefined);
      survey.playStateVersion[k] = (survey.playStateVersion[k] ?? 0) + 1;
    }
  }
  return survey;
}

export const DISCOVERY = [
  { collectionGroup: "characters", pattern: PARENT },
  { collectionGroup: "combat", pattern: PLAY },
];

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
    console.log(JSON.stringify(surveyShapeNumbers(found.map((d) => d.source)), null, 2));
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
