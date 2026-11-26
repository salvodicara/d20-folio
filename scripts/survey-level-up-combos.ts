#!/usr/bin/env node
/**
 * READ-ONLY survey for the level-up dry run before the 2026-12-07 session: how many
 * stored characters sit at each whole-build combination (every class in stored order,
 * with its subclass and level), so each live combination gets an end-to-end level-up
 * test. It never writes.
 *
 * Output: catalogue ids and counts only. Never a user, a character id, a name or any
 * free text.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-level-up-combos.ts
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
  type RawMap,
} from "./lib/migration-kit.ts";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;

interface ParsedCharacter {
  classes?: ReadonlyArray<{ classId: string; subclassId?: string; level: number }>;
}

const codec: unknown = await import(
  new URL("../src/lib/character-codec.ts", import.meta.url).href
);
if (!isRecord(codec) || typeof codec.parseCharacterEnvelope !== "function") {
  throw new TypeError("character-codec.ts does not export parseCharacterEnvelope");
}
const parseCharacterEnvelope = codec.parseCharacterEnvelope as (
  build: RawMap,
  state: RawMap
) => { ok: true; character: ParsedCharacter } | { ok: false; error: string };

export interface LevelUpCombosSurvey {
  format: "d20-folio-level-up-combos-survey-v1";
  characters: number;
  /** `<class>[/<subclass>]:<level>` joined by " + " in stored order → characters. */
  combos: Record<string, number>;
  /** Documents that couldn't be read, by reason code (counts only). */
  unreadable: Record<string, number>;
}

const add = (map: Record<string, number>, key: string) => {
  map[key] = (map[key] ?? 0) + 1;
};

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveyLevelUpCombos(
  sources: readonly MigrationSourceDocument[]
): LevelUpCombosSurvey {
  const survey: LevelUpCombosSurvey = {
    format: "d20-folio-level-up-combos-survey-v1",
    characters: 0,
    combos: {},
    unreadable: {},
  };
  for (const parent of sources.filter((source) => PARENT.test(source.path))) {
    if (!isRecord(parent.data.build)) {
      add(survey.unreadable, "no-build");
      continue;
    }
    const parsed = parseCharacterEnvelope(parent.data.build, {});
    if (!parsed.ok) {
      add(survey.unreadable, "invalid-envelope");
      continue;
    }
    survey.characters += 1;
    const key = (parsed.character.classes ?? [])
      .map((c) => `${c.classId}${c.subclassId ? `/${c.subclassId}` : ""}:${c.level}`)
      .join(" + ");
    add(survey.combos, key || "(no class)");
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
    console.log(JSON.stringify(surveyLevelUpCombos(found.map((d) => d.source)), null, 2));
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
