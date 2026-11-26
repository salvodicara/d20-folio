#!/usr/bin/env node
/**
 * READ-ONLY survey (#1324): multiclass characters whose derived max HP changes when
 * the hit-die maximum goes to the FIRST class (`classes[0]`, the class taken at
 * character level 1) instead of the highest-level class. No data is changed.
 *
 * Output: counts only. Never a name, an id, a path or a value from a document.
 * Current HP lives in the `combat/state` child, so this survey does not see it.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-max-hp-first-class.ts
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
import { deriveMaxHp } from "@/lib/aggregate-character";
import { getClasses, primaryClassEntry } from "@/lib/classes";
import type { CharacterData } from "@/types/character";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;

export interface FirstClassSurvey {
  format: "d20-folio-max-hp-first-class-survey-v1";
  characters: number;
  multiclass: number;
  /** Multiclass characters whose first entry is not the highest-level class. */
  firstNotHighest: number;
  /** Characters whose derived max HP changes with the first-class rule. */
  changed: number;
  changedUp: number;
  changedDown: number;
  changedShared: number;
  /** Of the changed: a non-zero hand bonus (`build.hp.bonus`). */
  changedWithBonus: number;
  /** Of the changed: a bonus equal to the change, so the player may already have
   *  hand-corrected the old max to the rule's number (the fix would count it twice). */
  changedBonusEqualsFix: number;
  /** Max-HP change → count. */
  byChange: Record<string, number>;
  unreadable: Record<string, number>;
}

/** The max HP the old rule gave: the highest-level class (ties → first) first. */
function highestFirstMax(character: CharacterData): number {
  const classes = getClasses(character);
  const headline = primaryClassEntry(character);
  const index = classes.findIndex(
    (e) => e.classId === headline.classId && e.level === headline.level
  );
  const reordered = [headline, ...classes.filter((_, i) => i !== index)];
  return deriveMaxHp({ ...character, classes: reordered });
}

export async function surveyFirstClass(
  sources: readonly MigrationSourceDocument[]
): Promise<FirstClassSurvey> {
  const survey: FirstClassSurvey = {
    format: "d20-folio-max-hp-first-class-survey-v1",
    characters: 0,
    multiclass: 0,
    firstNotHighest: 0,
    changed: 0,
    changedUp: 0,
    changedDown: 0,
    changedShared: 0,
    changedWithBonus: 0,
    changedBonusEqualsFix: 0,
    byChange: {},
    unreadable: {},
  };
  for (const source of sources) {
    const match = PARENT.exec(source.path);
    if (!match) continue;
    survey.characters += 1;
    const shared = source.data.shared === true;
    try {
      const { character } = await parseStoredCharacter(match[2] ?? "", source.data);
      const classes = getClasses(character);
      if (classes.length < 2) continue;
      survey.multiclass += 1;
      if (primaryClassEntry(character).classId !== classes[0]?.classId) {
        survey.firstNotHighest += 1;
      }
      const delta = deriveMaxHp(character) - highestFirstMax(character);
      if (delta === 0) continue;
      survey.changed += 1;
      if (delta > 0) survey.changedUp += 1;
      else survey.changedDown += 1;
      if (shared) survey.changedShared += 1;
      const bonus = Number.isSafeInteger(character.hpBonus)
        ? (character.hpBonus as number)
        : 0;
      if (bonus !== 0) survey.changedWithBonus += 1;
      if (bonus === delta) survey.changedBonusEqualsFix += 1;
      const key = delta > 0 ? `+${delta}` : String(delta);
      survey.byChange[key] = (survey.byChange[key] ?? 0) + 1;
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
    console.log(
      JSON.stringify(await surveyFirstClass(found.map((d) => d.source)), null, 2)
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
