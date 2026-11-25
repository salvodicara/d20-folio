#!/usr/bin/env node
/**
 * READ-ONLY survey (#1241): how many stored characters hold a Weapon Mastery their
 * class may not pick. Until #1241 the pickers offered every masterable weapon, but
 * SRD 5.2.1 limits each class: a Barbarian to Melee weapons, a Rogue (and every class)
 * to weapons it is proficient with. It asks the engine's own `listMasterableWeapons`,
 * the list the pickers now offer, so the counts match what the sheet will allow. It
 * never writes.
 *
 * Output: counts only (per class; SRD weapon ids). Never a name, an id or a path.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-weapon-mastery-picks.ts
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
  classes?: ReadonlyArray<{ classId: string; weaponMasteries?: readonly string[] }>;
}

interface EngineModules {
  parseCharacterEnvelope: (
    build: RawMap,
    state: RawMap
  ) => { ok: true; character: unknown } | { ok: false; error: string };
  listMasterableWeapons: (classId?: string) => ReadonlyArray<{ id: string }>;
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
  listMasterableWeapons: await engineFunction(
    "weapon-mastery-pick.ts",
    "listMasterableWeapons"
  ),
} as EngineModules;

// ── The pure survey ──────────────────────────────────────────────────────────

export interface WeaponMasterySurvey {
  format: "d20-folio-weapon-mastery-survey-v1";
  characters: number;
  /** Characters holding at least one mastery their class may not pick. */
  outsideAny: number;
  /** Per class: entries with masteries, entries holding one outside the list, and
   *  how often each outside weapon (SRD id) is held. */
  byClass: Record<
    string,
    { entries: number; outside: number; weapons: Record<string, number> }
  >;
  /** Documents that couldn't be read, by reason code (counts only). */
  unreadable: Record<string, number>;
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveyWeaponMasteryPicks(
  sources: readonly MigrationSourceDocument[]
): WeaponMasterySurvey {
  const survey: WeaponMasterySurvey = {
    format: "d20-folio-weapon-mastery-survey-v1",
    characters: 0,
    outsideAny: 0,
    byClass: {},
    unreadable: {},
  };
  const allowed = new Map<string, Set<string>>();
  const allowedFor = (classId: string) => {
    let set = allowed.get(classId);
    if (!set) {
      set = new Set(engine.listMasterableWeapons(classId).map((w) => w.id));
      allowed.set(classId, set);
    }
    return set;
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
    survey.characters += 1;
    let outside = false;
    for (const entry of (parsed.character as ParsedCharacter).classes ?? []) {
      const held = entry.weaponMasteries ?? [];
      if (held.length === 0) continue;
      const row = (survey.byClass[entry.classId] ??= {
        entries: 0,
        outside: 0,
        weapons: {},
      });
      row.entries += 1;
      const wrong = held.filter((id) => !allowedFor(entry.classId).has(id));
      if (wrong.length === 0) continue;
      row.outside += 1;
      outside = true;
      for (const id of wrong) row.weapons[id] = (row.weapons[id] ?? 0) + 1;
    }
    if (outside) survey.outsideAny += 1;
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
      JSON.stringify(surveyWeaponMasteryPicks(found.map((d) => d.source)), null, 2)
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
