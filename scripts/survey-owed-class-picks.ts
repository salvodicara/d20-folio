#!/usr/bin/env node
/**
 * READ-ONLY survey: how many stored characters owe class picks their level table
 * gives (Eldritch Invocations, cantrips, Metamagic, maneuvers, Weapon Mastery) —
 * the classic level-up asked a Warlock's invocations only at level 1, for one. It
 * reads each character's build and play state and asks the engine's own
 * `unresolvedBuildChoices` — the list the sheet's «Scelte da completare» banner
 * shows — so the counts match what players will be asked. It never writes.
 *
 * Output: counts only (per class and kind: how many characters owe, and how many
 * picks in all). Never a name, a character id or a path.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-owed-class-picks.ts
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
const CHILD = /^users\/([^/]+)\/characters\/([^/]+)\/combat\/state$/;

// ── The engine seam (structural, so the scripts project never type-imports the app) ──

type OpaqueCharacter = { readonly __character: unique symbol };
type OpaqueSession = { readonly __session: unique symbol };
interface Choice {
  kind: string;
  classId?: string;
  pick?: string;
  owed?: number;
}

interface EngineModules {
  parseCharacterEnvelope: (
    build: RawMap,
    state: RawMap
  ) => { ok: true; character: OpaqueCharacter } | { ok: false; error: string };
  parsePersistedPlayStateV1: (
    value: unknown
  ) => { ok: true; session: OpaqueSession } | { ok: false; reason: string };
  unresolvedBuildChoices: (character: unknown, session: unknown) => Choice[];
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
  parsePersistedPlayStateV1: await engineFunction(
    "session-state-codec.ts",
    "parsePersistedPlayStateV1"
  ),
  unresolvedBuildChoices: await engineFunction(
    "unresolved-build-choices.ts",
    "unresolvedBuildChoices"
  ),
} as EngineModules;

// ── The pure survey ──────────────────────────────────────────────────────────

export interface OwedClassPicksSurvey {
  format: "d20-folio-owed-class-picks-survey-v1";
  characters: number;
  /** Characters owing at least one class pick. */
  owingAny: number;
  /** Per class id, then kind: characters owing it and the picks owed in all. */
  byClass: Record<string, Record<string, { characters: number; picks: number }>>;
  /** Documents that couldn't be read, by reason code (counts only). */
  unreadable: Record<string, number>;
  /** For characters owing Weapon Mastery: raw field paths (array indices as `[]`,
   *  never values) that mention "master" outside `build.classes[].weaponMasteries`,
   *  so an older home of the picks the reader misses would show up here. */
  masteryPathsElsewhere: Record<string, number>;
}

/** Field paths under `value` whose last key mentions "master" (indices as `[]`). */
function masteryPaths(value: unknown, path: string, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) masteryPaths(item, `${path}[]`, out);
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      const next = path ? `${path}.${key}` : key;
      if (/master/i.test(key)) out.add(next);
      masteryPaths(child, next, out);
    }
  }
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveyOwedClassPicks(
  sources: readonly MigrationSourceDocument[]
): OwedClassPicksSurvey {
  const parents = new Map<string, MigrationSourceDocument>();
  const children = new Map<string, MigrationSourceDocument>();
  for (const source of sources) {
    if (PARENT.test(source.path)) parents.set(source.path, source);
    else if (CHILD.test(source.path)) {
      children.set(source.path.slice(0, -"/combat/state".length), source);
    }
  }
  const survey: OwedClassPicksSurvey = {
    format: "d20-folio-owed-class-picks-survey-v1",
    characters: 0,
    owingAny: 0,
    byClass: {},
    unreadable: {},
    masteryPathsElsewhere: {},
  };
  const unreadable = (code: string) => {
    survey.unreadable[code] = (survey.unreadable[code] ?? 0) + 1;
  };
  for (const [path, parent] of [...parents].sort(([a], [b]) => a.localeCompare(b))) {
    const build = isRecord(parent.data.build) ? parent.data.build : {};
    const parsed = engine.parseCharacterEnvelope(build, {});
    if (!parsed.ok) {
      unreadable("invalid-envelope");
      continue;
    }
    const child = children.get(path);
    const play = child ? engine.parsePersistedPlayStateV1(child.data.playState) : null;
    if (play && !play.ok) {
      unreadable("invalid-play-state");
      continue;
    }
    const session = play?.ok ? play.session : {};
    const owed = engine
      .unresolvedBuildChoices(parsed.character, session)
      .filter((c) => c.kind === "class-pick");
    survey.characters += 1;
    if (owed.length > 0) survey.owingAny += 1;
    if (owed.some((c) => c.pick === "weaponMasteries")) {
      const paths = new Set<string>();
      masteryPaths(parent.data, "", paths);
      if (child) masteryPaths(child.data, "combat/state", paths);
      paths.delete("build.classes[].weaponMasteries");
      for (const found of paths) {
        survey.masteryPathsElsewhere[found] =
          (survey.masteryPathsElsewhere[found] ?? 0) + 1;
      }
    }
    for (const { classId = "?", pick = "?", owed: n = 0 } of owed) {
      const byKind = (survey.byClass[classId] ??= {});
      const row = (byKind[pick] ??= { characters: 0, picks: 0 });
      row.characters += 1;
      row.picks += n;
    }
  }
  return survey;
}

export const DISCOVERY = [
  { collectionGroup: "characters", pattern: PARENT },
  { collectionGroup: "combat", pattern: CHILD },
];

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
      JSON.stringify(surveyOwedClassPicks(found.map((d) => d.source)), null, 2)
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
