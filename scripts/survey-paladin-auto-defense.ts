#!/usr/bin/env node
/**
 * READ-ONLY survey: Paladins holding the Defense style the old level-up added on
 * its own at Paladin 2, and how many of them also hold the Fighting Style feat they
 * picked (two styles: an unpicked +1 AC in armor). SRD 5.2.1 gives one style feat
 * of the player's choice. It never writes.
 *
 * Output: counts only. Never a name, an id or a path.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-paladin-auto-defense.ts
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
const AUTO_DEFENSE = "paladin-fighting-style-defense";

// ── The engine seam (structural, so the scripts project never type-imports the app) ──

interface ParsedCharacter {
  features?: ReadonlyArray<{ srdId?: string }>;
}

interface EngineModules {
  parseCharacterEnvelope: (
    build: RawMap,
    state: RawMap
  ) => { ok: true; character: unknown } | { ok: false; error: string };
  listAllFightingStyles: () => ReadonlyArray<{ id: string }>;
}

async function engineFunction(file: string, name: string): Promise<unknown> {
  const module: unknown = await import(
    new URL(`../src/lib/${file}`, import.meta.url).href
  );
  if (!isRecord(module) || typeof module[name] !== "function") {
    throw new TypeError(`${file} does not export ${name}`);
  }
  return module[name];
}

const engine = {
  parseCharacterEnvelope: await engineFunction(
    "character-codec.ts",
    "parseCharacterEnvelope"
  ),
  listAllFightingStyles: await engineFunction(
    "fighting-style.ts",
    "listAllFightingStyles"
  ),
} as EngineModules;

// ── The pure survey ──────────────────────────────────────────────────────────

export interface PaladinAutoDefenseSurvey {
  format: "d20-folio-paladin-auto-defense-survey-v1";
  /** Characters holding the auto-added Defense style. */
  withAutoDefense: number;
  /** …of whom also hold a Fighting Style feat they picked (two styles). */
  withTwoStyles: number;
  /** Documents that couldn't be read, by reason code (counts only). */
  unreadable: Record<string, number>;
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveyPaladinAutoDefense(
  sources: readonly MigrationSourceDocument[]
): PaladinAutoDefenseSurvey {
  const survey: PaladinAutoDefenseSurvey = {
    format: "d20-folio-paladin-auto-defense-survey-v1",
    withAutoDefense: 0,
    withTwoStyles: 0,
    unreadable: {},
  };
  const styles = new Set(engine.listAllFightingStyles().map((s) => s.id));
  const parents = sources
    .filter((s) => PARENT.test(s.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const parent of parents) {
    const build = isRecord(parent.data.build) ? parent.data.build : {};
    const parsed = engine.parseCharacterEnvelope(build, {});
    if (!parsed.ok) {
      survey.unreadable["invalid-envelope"] =
        (survey.unreadable["invalid-envelope"] ?? 0) + 1;
      continue;
    }
    const character = parsed.character as ParsedCharacter;
    const ids = (character.features ?? []).map((f) => f.srdId ?? "");
    if (ids.includes(AUTO_DEFENSE)) {
      survey.withAutoDefense += 1;
      if (ids.some((id) => styles.has(id))) survey.withTwoStyles += 1;
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
      JSON.stringify(surveyPaladinAutoDefense(found.map((d) => d.source)), null, 2)
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
