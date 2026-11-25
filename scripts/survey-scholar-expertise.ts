#!/usr/bin/env node
/**
 * READ-ONLY survey (#1242): Wizards whose stored Expertise sits outside Scholar's six
 * skills. Until #1242 the new level-up screen offered Scholar's Expertise in any
 * proficient skill, but SRD 5.2.1 limits it to «Arcana, History, Investigation,
 * Medicine, Nature, or Religion». Expertise has no stored source, so a Wizard with
 * another Expertise source (a Bard, Rogue or Ranger level, or a feat) is counted
 * apart: its Expertise may be legal. It never writes.
 *
 * Output: counts only (SRD skill ids). Never a name, an id or a path.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-scholar-expertise.ts
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

/** SRD 5.2.1 Wizard Scholar's skills. */
const SCHOLAR = new Set([
  "arcana",
  "history",
  "investigation",
  "medicine",
  "nature",
  "religion",
]);
/** Classes whose own features grant Expertise. */
const EXPERTISE_CLASSES = new Set(["bard", "rogue", "ranger"]);

// ── The engine seam (structural, so the scripts project never type-imports the app) ──

interface ParsedCharacter {
  classes?: ReadonlyArray<{ classId: string; level: number }>;
  skills?: Readonly<Record<string, string>>;
  features?: ReadonlyArray<{ srdId?: string }>;
}

interface EngineModules {
  parseCharacterEnvelope: (
    build: RawMap,
    state: RawMap
  ) => { ok: true; character: unknown } | { ok: false; error: string };
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
} as EngineModules;

// ── The pure survey ──────────────────────────────────────────────────────────

export interface ScholarExpertiseSurvey {
  format: "d20-folio-scholar-expertise-survey-v1";
  /** Wizards at level 2 or more (they have Scholar). */
  wizards: number;
  /** Wizards with no other Expertise source holding Expertise outside the six. */
  outsideOnlyWizard: number;
  /** Wizards with another Expertise source (a Bard, Rogue or Ranger level, or a
   *  feat): their outside Expertise may be legal. */
  outsideWithOtherSource: number;
  /** How often each outside skill (SRD id) holds Expertise, among the first group. */
  skills: Record<string, number>;
  /** Documents that couldn't be read, by reason code (counts only). */
  unreadable: Record<string, number>;
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveyScholarExpertise(
  sources: readonly MigrationSourceDocument[]
): ScholarExpertiseSurvey {
  const survey: ScholarExpertiseSurvey = {
    format: "d20-folio-scholar-expertise-survey-v1",
    wizards: 0,
    outsideOnlyWizard: 0,
    outsideWithOtherSource: 0,
    skills: {},
    unreadable: {},
  };
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
    const classes = character.classes ?? [];
    if (!classes.some((c) => c.classId === "wizard" && c.level >= 2)) continue;
    survey.wizards += 1;
    const outside = Object.entries(character.skills ?? {})
      .filter(([id, tier]) => tier === "expertise" && !SCHOLAR.has(id))
      .map(([id]) => id);
    if (outside.length === 0) continue;
    // A feat that grants Expertise is another source; features carry no kind here,
    // so any feature id naming expertise counts as one.
    const otherSource =
      classes.some((c) => EXPERTISE_CLASSES.has(c.classId)) ||
      (character.features ?? []).some((f) => /expert/.test(f.srdId ?? ""));
    if (otherSource) {
      survey.outsideWithOtherSource += 1;
      continue;
    }
    survey.outsideOnlyWizard += 1;
    for (const id of outside) survey.skills[id] = (survey.skills[id] ?? 0) + 1;
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
      JSON.stringify(surveyScholarExpertise(found.map((d) => d.source)), null, 2)
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
