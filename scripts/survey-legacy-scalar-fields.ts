#!/usr/bin/env node
/**
 * Edge-case family M11 (docs/architecture/2026-11-edge-cases.md): a READ-ONLY count of
 * stored homebrew that still uses the retired scaling notation, before its reader is
 * removed. The catalogue no longer uses either field (catalogue-scalar-dialects guard).
 *
 *   - a `damage-rider` grant with `diceByLevel`        (now `levelDice`)
 *   - an `hp-flat` / `damage-retaliation` grant with `castLevelScaling` (now `castScaled`)
 *
 * It searches every player library (`users/{uid}/library/*`) and character
 * (`users/{uid}/characters/{id}`) at any depth. It never writes and never prints a
 * payload or a path: counts only. If a count is above 0, the conversion is a
 * snapshot → dry-run → apply migration with the deploy's yes (release draft); if both
 * are 0, the legacy reader can go.
 *
 * Run with production read credentials (Application Default Credentials):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-legacy-scalar-fields.ts
 * or against the emulator with FIRESTORE_EMULATOR_HOST set.
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import {
  discoverDocuments,
  isRecord,
  readTargetConfiguration,
} from "./lib/migration-kit.ts";

const LIBRARY = /^users\/([^/]+)\/library\/([^/]+)$/;
const CHARACTER = /^users\/([^/]+)\/characters\/([^/]+)$/;

export interface LegacyScalarCounts {
  documents: number;
  libraries: number;
  characters: number;
  /** Damage riders still carrying `diceByLevel`. */
  diceByLevel: number;
  /** `hp-flat` / `damage-retaliation` grants still carrying `castLevelScaling`. */
  castLevelScaling: number;
  /** Documents holding at least one of the above. */
  documentsWithLegacy: number;
}

function countLegacy(value: unknown, into: { dice: number; cast: number }): void {
  if (Array.isArray(value)) {
    for (const item of value) countLegacy(item, into);
    return;
  }
  if (!isRecord(value)) return;
  if (value.type === "damage-rider" && "diceByLevel" in value) into.dice += 1;
  if (
    (value.type === "hp-flat" || value.type === "damage-retaliation") &&
    "castLevelScaling" in value
  ) {
    into.cast += 1;
  }
  for (const child of Object.values(value)) countLegacy(child, into);
}

export function surveyLegacyScalarFields(
  documents: ReadonlyArray<{ path: string; data: Record<string, unknown> }>
): LegacyScalarCounts {
  const counts: LegacyScalarCounts = {
    documents: 0,
    libraries: 0,
    characters: 0,
    diceByLevel: 0,
    castLevelScaling: 0,
    documentsWithLegacy: 0,
  };
  for (const { path, data } of documents) {
    if (LIBRARY.test(path)) counts.libraries += 1;
    else if (CHARACTER.test(path)) counts.characters += 1;
    else continue;
    counts.documents += 1;
    const found = { dice: 0, cast: 0 };
    countLegacy(data, found);
    counts.diceByLevel += found.dice;
    counts.castLevelScaling += found.cast;
    if (found.dice + found.cast > 0) counts.documentsWithLegacy += 1;
  }
  return counts;
}

export const DISCOVERY = [
  { collectionGroup: "library", pattern: LIBRARY },
  { collectionGroup: "characters", pattern: CHARACTER },
];

async function run(): Promise<void> {
  if (processArgv.slice(2).length > 0) throw new Error("This survey takes no options");
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
    const documents = await discoverDocuments(getFirestore(app), DISCOVERY);
    console.log(
      JSON.stringify(surveyLegacyScalarFields(documents.map((d) => d.source)), null, 2)
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
