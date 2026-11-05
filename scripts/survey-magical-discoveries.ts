#!/usr/bin/env node
/**
 * READ-ONLY survey: College of Lore Bards at level 6 or higher whose Magical
 * Discoveries picks are above what they can cast. The rule: each pick is a cantrip
 * or a spell of a level the Bard has spell slots for; the level-up picker offered any
 * level up to 9. The stored spell carries no "picked through Magical Discoveries"
 * mark, so the survey counts the always-prepared spells NOT on the Bard list whose
 * level is above the character's highest spell slot: those can only have come from
 * that picker (Magic Initiate and Fey Touched give level 1). It never writes.
 *
 * Output: counts only. Never a name, a character id or a path.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-magical-discoveries.ts
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
} from "./lib/migration-kit.ts";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;
const LORE = "college-of-lore";
const DISCOVERIES_LEVEL = 6;

// ── The engine seam (structural, so the scripts project never type-imports the app) ──

interface ClassEntry {
  classId: string;
  subclassId?: string;
  level: number;
}
interface SpellRef {
  srdId?: string;
  alwaysPrepared?: boolean;
}
interface ParsedCharacter {
  classes: ClassEntry[];
  spells: SpellRef[];
}
interface SpellData {
  level: number;
  classes: readonly string[];
}

interface EngineModules {
  parseCharacterEnvelope: (
    build: Record<string, unknown>,
    state: Record<string, unknown>
  ) => { ok: true; character: ParsedCharacter } | { ok: false; error: string };
  highestSpellSlotLevel: (classes: ClassEntry[]) => number;
  getSpellById: (id: string) => SpellData | undefined;
}

async function engineFunction(path: string, name: string): Promise<unknown> {
  const module: unknown = await import(new URL(`../src/${path}`, import.meta.url).href);
  if (!isRecord(module) || typeof module[name] !== "function") {
    throw new TypeError(`${path} does not export ${name}`);
  }
  return module[name];
}

const engine = {
  parseCharacterEnvelope: await engineFunction(
    "lib/character-codec.ts",
    "parseCharacterEnvelope"
  ),
  highestSpellSlotLevel: await engineFunction(
    "lib/multiclass-slots.ts",
    "highestSpellSlotLevel"
  ),
  getSpellById: await engineFunction("data/spells.ts", "getSpellById"),
} as EngineModules;

// ── The pure survey ──────────────────────────────────────────────────────────

export interface MagicalDiscoveriesSurvey {
  format: "d20-folio-magical-discoveries-survey-v1";
  /** College of Lore Bards at level 6 or higher. */
  loreBardsWithDiscoveries: number;
  /** Of those, characters holding at least one pick above their highest slot. */
  overCastable: number;
  /** Picks above the character's highest slot, in all. */
  overCastablePicks: number;
  /** Documents that couldn't be read, by reason code (counts only). */
  unreadable: Record<string, number>;
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveyMagicalDiscoveries(
  sources: readonly MigrationSourceDocument[]
): MagicalDiscoveriesSurvey {
  const survey: MagicalDiscoveriesSurvey = {
    format: "d20-folio-magical-discoveries-survey-v1",
    loreBardsWithDiscoveries: 0,
    overCastable: 0,
    overCastablePicks: 0,
    unreadable: {},
  };
  for (const source of [...sources].sort((a, b) => a.path.localeCompare(b.path))) {
    if (!PARENT.test(source.path)) continue;
    const build = isRecord(source.data.build) ? source.data.build : {};
    const parsed = engine.parseCharacterEnvelope(build, {});
    if (!parsed.ok) {
      survey.unreadable["invalid-envelope"] =
        (survey.unreadable["invalid-envelope"] ?? 0) + 1;
      continue;
    }
    const { classes, spells } = parsed.character;
    const lore = classes.find(
      (c) => c.classId === "bard" && c.subclassId === LORE && c.level >= DISCOVERIES_LEVEL
    );
    if (!lore) continue;
    survey.loreBardsWithDiscoveries += 1;
    const highest = engine.highestSpellSlotLevel(classes);
    const over = spells.filter((ref) => {
      if (!ref.alwaysPrepared || !ref.srdId) return false;
      const spell = engine.getSpellById(ref.srdId);
      return !!spell && !spell.classes.includes("bard") && spell.level > highest;
    }).length;
    if (over > 0) survey.overCastable += 1;
    survey.overCastablePicks += over;
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
      JSON.stringify(surveyMagicalDiscoveries(found.map((d) => d.source)), null, 2)
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
