#!/usr/bin/env node
/**
 * READ-ONLY survey (#1318): characters whose max HP changes when it follows the
 * EFFECTIVE CON (a hand-set ability pin, an attuned item that sets or raises CON)
 * instead of the raw score. No data is changed.
 *
 * Output: counts only. Never a name, an id, a path or a value from a document.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-max-hp-effective-con.ts
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
import type { CharacterData } from "@/types/character";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;

export interface EffectiveConSurvey {
  format: "d20-folio-max-hp-effective-con-survey-v1";
  characters: number;
  shared: number;
  /** Characters whose derived max HP changes with the effective CON. */
  changed: number;
  changedShared: number;
  /** Max-HP change → count. */
  byChange: Record<string, number>;
  unreadable: Record<string, number>;
}

/** The max HP the raw score gives: no pin, no CON item. */
function rawConMax(character: CharacterData): number {
  return deriveMaxHp({
    ...character,
    abilityScoreOverrides: undefined,
    equipment: character.equipment.map((ref) => ({ ...ref, attuned: false })),
  });
}

export async function surveyEffectiveCon(
  sources: readonly MigrationSourceDocument[]
): Promise<EffectiveConSurvey> {
  const survey: EffectiveConSurvey = {
    format: "d20-folio-max-hp-effective-con-survey-v1",
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
      const delta = deriveMaxHp(character) - rawConMax(character);
      if (delta !== 0) {
        survey.changed += 1;
        if (shared) survey.changedShared += 1;
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
    console.log(
      JSON.stringify(await surveyEffectiveCon(found.map((d) => d.source)), null, 2)
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
