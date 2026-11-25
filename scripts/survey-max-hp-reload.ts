#!/usr/bin/env node
/**
 * READ-ONLY survey (#1313): characters whose reloaded max HP changes with the fix.
 * Before the fix a reload derived the bare class average (hit dice + CON). After it,
 * the reload derives the by-the-book max: per-level HP grants included (Tough,
 * Dwarven Toughness, Draconic Resilience). The stored `build` never carries `hp`, so
 * this compares two derivations of the same stored build. No data is changed.
 *
 * Output: counts only. Never a name, an id, a path or a value from a document.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-max-hp-reload.ts
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
import { inferHpMax } from "@/lib/character-infer";
import { getClasses } from "@/lib/classes";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;

export interface MaxHpReloadSurvey {
  format: "d20-folio-max-hp-reload-survey-v1";
  characters: number;
  shared: number;
  /** Characters whose reloaded max HP differs after the fix. */
  changed: number;
  changedShared: number;
  /** How many characters gain each amount of max HP (amount → count). */
  byChange: Record<string, number>;
  /** Characters that couldn't be read, by reason (counts only). */
  unreadable: Record<string, number>;
}

/** Survey the corpus with the app's own codec. Pure apart from the codec. */
export async function surveyMaxHpReload(
  sources: readonly MigrationSourceDocument[]
): Promise<MaxHpReloadSurvey> {
  const survey: MaxHpReloadSurvey = {
    format: "d20-folio-max-hp-reload-survey-v1",
    characters: 0,
    shared: 0,
    changed: 0,
    changedShared: 0,
    byChange: {},
    unreadable: {},
  };
  for (const source of sources) {
    const match = PARENT.exec(source.path);
    if (!match) continue;
    survey.characters += 1;
    const shared = source.data.shared === true;
    if (shared) survey.shared += 1;
    try {
      const { character } = await parseStoredCharacter(match[2] ?? "", source.data);
      const before = inferHpMax(getClasses(character), character.abilityScores.CON);
      const delta = character.hp.max - before;
      if (delta !== 0) {
        survey.changed += 1;
        if (shared) survey.changedShared += 1;
        const key = delta > 0 ? `+${delta}` : String(delta);
        survey.byChange[key] = (survey.byChange[key] ?? 0) + 1;
      }
    } catch (error) {
      // The codec's reason code only (`Invalid character document: <code>:…`),
      // never a value.
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
    const survey = await surveyMaxHpReload(found.map((d) => d.source));
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
