#!/usr/bin/env node
/**
 * READ-ONLY survey: what the owner's groups actually play, to rank the rules work by
 * it (coordinator, 2026-11-12). For every stored character it counts its classes at
 * their levels, its subclasses, its species, the catalogue features on its sheet
 * (feats, boons, picked features) and the class features it gains in its next four
 * levels. It never writes.
 *
 * Output: catalogue ids (public SRD or pack ids) and counts only. Never a user, a
 * character, a name, a note or any custom (free-text) entry: a custom feature is
 * counted, not named.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-played-content.ts
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
  race?: string;
  classes?: ReadonlyArray<{ classId: string; subclassId?: string; level: number }>;
  features?: ReadonlyArray<{ srdId?: string; custom?: boolean }>;
  spells?: ReadonlyArray<{
    srdId?: string;
    custom?: boolean;
    prepared?: boolean;
    alwaysPrepared?: boolean;
  }>;
  weapons?: ReadonlyArray<{ srdId?: string; custom?: boolean }>;
  equipment?: ReadonlyArray<{ srdId?: string; custom?: boolean }>;
}
interface ClassTable {
  id: string;
  levels: ReadonlyArray<{ featureIds?: ReadonlyArray<string> }>;
}
interface ClassFeature {
  id: string;
  class: string;
  subclass?: string;
  level: number;
}

interface EngineModules {
  parseCharacterEnvelope: (
    build: RawMap,
    state: RawMap
  ) => { ok: true; character: ParsedCharacter } | { ok: false; error: string };
  classTables: ReadonlyArray<ClassTable>;
  classFeatures: ReadonlyArray<ClassFeature>;
  getMagicItem: (id: string) => unknown;
  getEquipment: (id: string) => { category: string } | undefined;
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
  classTables: await engineExport("data/classes.ts", "classTables"),
  classFeatures: await engineExport("data/classes.ts", "classFeatures"),
  getMagicItem: await engineExport("data/magic-items/index.ts", "getMagicItem"),
  getEquipment: await engineExport("data/equipment.ts", "getEquipment"),
} as EngineModules;

// ── The pure survey ──────────────────────────────────────────────────────────

/** How far ahead "the next levels" look. */
const LOOKAHEAD = 4;

export interface PlayedContentSurvey {
  format: "d20-folio-played-content-survey-v1";
  characters: number;
  /** `<class>:<level>` → characters (a multiclass counts each of its classes). */
  classLevels: Record<string, number>;
  /** `<class>:<subclass>` → characters. */
  subclasses: Record<string, number>;
  /** Species id → characters. */
  species: Record<string, number>;
  /** Catalogue feature id on a sheet (feats, boons, picked features) → characters. */
  features: Record<string, number>;
  /** Custom (homebrew) features on sheets: counted, never named. */
  customFeatures: number;
  /** Class feature id gained in a character's next four levels → characters. */
  upcoming: Record<string, number>;
  /** Catalogue spell id on a sheet → characters holding it, and how many prepare it
   *  (always-prepared counts as prepared). */
  spells: Record<string, { characters: number; prepared: number }>;
  /** Homebrew spells on sheets: counted, never named. */
  customSpells: number;
  /** Catalogue item id carried (weapons and equipment) → characters, and its kind. */
  items: Record<string, { characters: number; kind: ItemKind }>;
  /** Homebrew items on sheets: counted, never named. */
  customItems: number;
  /** Documents that couldn't be read, by reason code (counts only). */
  unreadable: Record<string, number>;
}

/** What an item is, for ordering the check: magic items first. */
export type ItemKind = "magic" | "weapon" | "armor" | "shield" | "gear" | "tool" | "pack";

const add = (map: Record<string, number>, key: string) => {
  map[key] = (map[key] ?? 0) + 1;
};

/** The class features a class (and its subclass) gains at exactly `level`. */
function featuresGainedAt(
  classId: string,
  subclassId: string | undefined,
  level: number
) {
  const table = engine.classTables.find((t) => t.id === classId);
  const base = table?.levels[level - 1]?.featureIds ?? [];
  const sub = subclassId
    ? engine.classFeatures
        .filter(
          (f) => f.class === classId && f.subclass === subclassId && f.level === level
        )
        .map((f) => f.id)
    : [];
  return [...base, ...sub];
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveyPlayedContent(
  sources: readonly MigrationSourceDocument[]
): PlayedContentSurvey {
  const survey: PlayedContentSurvey = {
    format: "d20-folio-played-content-survey-v1",
    characters: 0,
    classLevels: {},
    subclasses: {},
    species: {},
    features: {},
    customFeatures: 0,
    upcoming: {},
    spells: {},
    customSpells: 0,
    items: {},
    customItems: 0,
    unreadable: {},
  };
  const parents = sources
    .filter((source) => PARENT.test(source.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const parent of parents) {
    const build = isRecord(parent.data.build) ? parent.data.build : {};
    const parsed = engine.parseCharacterEnvelope(build, {});
    if (!parsed.ok) {
      add(survey.unreadable, "invalid-envelope");
      continue;
    }
    const character = parsed.character;
    survey.characters += 1;
    add(survey.species, character.race || "(none)");
    for (const entry of character.classes ?? []) {
      add(survey.classLevels, `${entry.classId}:${entry.level}`);
      if (entry.subclassId)
        add(survey.subclasses, `${entry.classId}:${entry.subclassId}`);
      const next = new Set<string>();
      for (
        let level = entry.level + 1;
        level <= Math.min(20, entry.level + LOOKAHEAD);
        level++
      ) {
        for (const id of featuresGainedAt(entry.classId, entry.subclassId, level))
          next.add(id);
      }
      for (const id of next) add(survey.upcoming, id);
    }
    const spellSeen = new Map<string, boolean>();
    for (const spell of character.spells ?? []) {
      if (spell.custom || !spell.srdId) {
        survey.customSpells += 1;
        continue;
      }
      const prepared = spell.prepared === true || spell.alwaysPrepared === true;
      spellSeen.set(spell.srdId, (spellSeen.get(spell.srdId) ?? false) || prepared);
    }
    for (const [id, prepared] of spellSeen) {
      const row = (survey.spells[id] ??= { characters: 0, prepared: 0 });
      row.characters += 1;
      if (prepared) row.prepared += 1;
    }
    const itemSeen = new Set<string>();
    for (const item of [...(character.weapons ?? []), ...(character.equipment ?? [])]) {
      if (item.custom || !item.srdId) {
        survey.customItems += 1;
        continue;
      }
      if (itemSeen.has(item.srdId)) continue;
      itemSeen.add(item.srdId);
      const kind: ItemKind = engine.getMagicItem(item.srdId)
        ? "magic"
        : ((engine.getEquipment(item.srdId)?.category as ItemKind | undefined) ?? "gear");
      const row = (survey.items[item.srdId] ??= { characters: 0, kind });
      row.characters += 1;
    }
    const seen = new Set<string>();
    for (const feature of character.features ?? []) {
      if (feature.custom) survey.customFeatures += 1;
      else if (feature.srdId && !seen.has(feature.srdId)) {
        seen.add(feature.srdId);
        add(survey.features, feature.srdId);
      }
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
    console.log(JSON.stringify(surveyPlayedContent(found.map((d) => d.source)), null, 2));
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
