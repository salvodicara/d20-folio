#!/usr/bin/env node
/**
 * READ-ONLY survey (#1324): multiclass characters whose max HP would change if the
 * hit-die maximum went to the FIRST class (`classes[0]`) instead of the highest-level
 * class, as the 2024 rules ask. No data is changed.
 *
 * Output: counts only. Never a name, an id, a path or a value from a document.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-multiclass-first-level.ts
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
import { parseStoredCharacter } from "@/lib/character-read";
import { getClasses } from "@/lib/classes";
import { classTableIndex } from "@/data/classes";
import type { ClassEntry } from "@/types/character";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;

export interface MulticlassFirstLevelSurvey {
  format: "d20-folio-multiclass-first-level-survey-v1";
  characters: number;
  multiclass: number;
  /** Multiclass characters whose highest-level class is not `classes[0]`. */
  primaryNotFirst: number;
  /** Max HP change (first-class maximum − highest-class maximum) → count. */
  byChange: Record<string, number>;
  unreadable: Record<string, number>;
}

/** The die-maximum gap between giving level 1's maximum to `classes[0]` and to the
 *  highest-level class (ties → first). 0 when they are the same class. */
export function firstLevelDelta(classes: readonly ClassEntry[]): number {
  if (classes.length < 2) return 0;
  const primary = classes.reduce((best, e) => (e.level > best.level ? e : best));
  const first = classes[0];
  if (!first || first === primary) return 0;
  const die = (e: ClassEntry) => classTableIndex.get(e.classId)?.hitDie ?? 8;
  const avg = (d: number) => Math.floor(d / 2) + 1;
  // Moving the maximum from the primary's die to the first class's die.
  return die(first) - avg(die(first)) - (die(primary) - avg(die(primary)));
}

export async function surveyMulticlassFirstLevel(
  sources: readonly MigrationSourceDocument[]
): Promise<MulticlassFirstLevelSurvey> {
  const survey: MulticlassFirstLevelSurvey = {
    format: "d20-folio-multiclass-first-level-survey-v1",
    characters: 0,
    multiclass: 0,
    primaryNotFirst: 0,
    byChange: {},
    unreadable: {},
  };
  for (const source of sources) {
    const match = PARENT.exec(source.path);
    if (!match) continue;
    survey.characters += 1;
    try {
      const { character } = await parseStoredCharacter(match[2] ?? "", source.data);
      const classes = getClasses(character);
      if (classes.length < 2) continue;
      survey.multiclass += 1;
      const primary = classes.reduce((best, e) => (e.level > best.level ? e : best));
      if (primary !== classes[0]) survey.primaryNotFirst += 1;
      const delta = firstLevelDelta(classes);
      if (delta !== 0) {
        const key = delta > 0 ? `+${delta}` : String(delta);
        survey.byChange[key] = (survey.byChange[key] ?? 0) + 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "error";
      const reason =
        message
          .replace(/^Invalid character document:\s*/, "")
          .split(/[\s:]/)[0]
          ?.slice(0, 40) || "error";
      survey.unreadable[reason] = (survey.unreadable[reason] ?? 0) + 1;
    }
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
    const survey = await surveyMulticlassFirstLevel(found.map((d) => d.source));
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
