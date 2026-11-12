#!/usr/bin/env node
/**
 * READ-ONLY survey (coordinator, 2026-11-12, walk M9): the class features a sheet holds
 * with no level in that feature's class (Second Wind on a Bard, added by hand from the
 * Features tab). For each such holding it prints the feature id, the character's total
 * level and, when the feature has a counter, its uses left and its maximum as the app
 * computes them today. It never writes.
 *
 * Output: catalogue ids and numbers only. Never a user, a character, a name, a note or
 * any custom entry; rows are sorted, so their order says nothing about the documents.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-orphan-class-features.ts
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

// ── The engine seam (structural, so the scripts project never type-imports the app) ──

interface ParsedCharacter {
  classes?: ReadonlyArray<{ classId: string; level: number }>;
  features?: ReadonlyArray<{ srdId?: string; custom?: boolean }>;
}
interface ClassFeature {
  id: string;
  class: string;
}
interface Tracker {
  id: string;
  total: number;
  used: number;
}

interface EngineModules {
  parseCharacterEnvelope: (
    build: RawMap,
    state: RawMap
  ) =>
    | { ok: true; character: ParsedCharacter; session: unknown }
    | { ok: false; error: string };
  classFeatures: ReadonlyArray<ClassFeature>;
  resolveTrackers: (doc: unknown) => ReadonlyArray<Tracker>;
}

async function engineExport(file: string, name: string): Promise<unknown> {
  const module: unknown = await import(new URL(`../src/${file}`, import.meta.url).href);
  if (!isRecord(module) || !(name in module)) {
    throw new TypeError(`${file} does not export ${name}`);
  }
  return module[name];
}

const engine = {
  parseCharacterEnvelope: await engineExport(
    "lib/character-codec.ts",
    "parseCharacterEnvelope"
  ),
  classFeatures: await engineExport("data/classes.ts", "classFeatures"),
  resolveTrackers: await engineExport("lib/smart-tracker.ts", "resolveTrackers"),
} as EngineModules;

// ── The pure survey ──────────────────────────────────────────────────────────

/** One class feature held with no level in its class. */
export interface OrphanHolding {
  feature: string;
  totalLevel: number;
  /** Uses left / maximum, as computed today; absent for a feature with no counter. */
  uses?: { current: number; max: number };
}

export interface OrphanClassFeatureSurvey {
  format: "d20-folio-orphan-class-features-v1";
  characters: number;
  /** Characters holding at least one such feature. */
  charactersWithOrphans: number;
  holdings: OrphanHolding[];
  /** Documents that couldn't be read, by reason code (counts only). */
  unreadable: Record<string, number>;
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveyOrphanClassFeatures(
  sources: readonly MigrationSourceDocument[]
): OrphanClassFeatureSurvey {
  const survey: OrphanClassFeatureSurvey = {
    format: "d20-folio-orphan-class-features-v1",
    characters: 0,
    charactersWithOrphans: 0,
    holdings: [],
    unreadable: {},
  };
  const classOf = new Map(engine.classFeatures.map((f) => [f.id, f.class]));
  for (const parent of sources.filter((source) => PARENT.test(source.path))) {
    const build = isRecord(parent.data.build) ? parent.data.build : {};
    const state = isRecord(parent.data.state) ? parent.data.state : {};
    const parsed = engine.parseCharacterEnvelope(build, state);
    if (!parsed.ok) {
      survey.unreadable["invalid-envelope"] =
        (survey.unreadable["invalid-envelope"] ?? 0) + 1;
      continue;
    }
    survey.characters += 1;
    const character = parsed.character;
    const classes = new Set((character.classes ?? []).map((c) => c.classId));
    const totalLevel = (character.classes ?? []).reduce((sum, c) => sum + c.level, 0);
    const orphans = [
      ...new Set(
        (character.features ?? []).flatMap((f) => {
          if (f.custom || !f.srdId) return [];
          const owner = classOf.get(f.srdId);
          return owner && !classes.has(owner) ? [f.srdId] : [];
        })
      ),
    ];
    if (orphans.length === 0) continue;
    survey.charactersWithOrphans += 1;
    const trackers = engine.resolveTrackers({
      id: "survey",
      character,
      session: parsed.session,
    });
    for (const feature of orphans) {
      const tracker = trackers.find((t) => t.id === feature);
      survey.holdings.push({
        feature,
        totalLevel,
        ...(tracker
          ? {
              uses: {
                current: Math.max(0, tracker.total - tracker.used),
                max: tracker.total,
              },
            }
          : {}),
      });
    }
  }
  survey.holdings.sort(
    (a, b) =>
      a.feature.localeCompare(b.feature) ||
      a.totalLevel - b.totalLevel ||
      (a.uses?.current ?? -1) - (b.uses?.current ?? -1)
  );
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
      JSON.stringify(surveyOrphanClassFeatures(found.map((d) => d.source)), null, 2)
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
