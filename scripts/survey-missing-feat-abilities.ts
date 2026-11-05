#!/usr/bin/env node
/**
 * READ-ONLY survey: how many stored characters hold a feat that still owes "the
 * ability increased by this feat" (the feat ref's `featAbility`, stored by
 * level-ups since it existed; older ones never wrote it) where something on the
 * feat reads it. It reads each character's build and play state and asks the
 * engine's own `unresolvedBuildChoices` — the list the sheet's «Scelte da
 * completare» banner shows — so the counts match what players will be asked. It
 * never writes.
 *
 * Output: counts only (per feat id, how many characters owe the answer). Never a
 * name, a character id or a path.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-missing-feat-abilities.ts
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
  featId?: string;
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

export interface FeatAbilitiesSurvey {
  format: "d20-folio-feat-abilities-survey-v1";
  characters: number;
  /** Characters owing at least one feat's answer. */
  owingAny: number;
  /** Per feat id: how many characters owe its answer. */
  byFeat: Record<string, number>;
  /** Documents that couldn't be read, by reason code (counts only). */
  unreadable: Record<string, number>;
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveyFeatAbilities(
  sources: readonly MigrationSourceDocument[]
): FeatAbilitiesSurvey {
  const parents = new Map<string, MigrationSourceDocument>();
  const children = new Map<string, MigrationSourceDocument>();
  for (const source of sources) {
    if (PARENT.test(source.path)) parents.set(source.path, source);
    else if (CHILD.test(source.path)) {
      children.set(source.path.slice(0, -"/combat/state".length), source);
    }
  }
  const survey: FeatAbilitiesSurvey = {
    format: "d20-folio-feat-abilities-survey-v1",
    characters: 0,
    owingAny: 0,
    byFeat: {},
    unreadable: {},
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
      .filter((c) => c.kind === "feat-ability");
    survey.characters += 1;
    if (owed.length > 0) survey.owingAny += 1;
    for (const { featId = "?" } of owed) {
      survey.byFeat[featId] = (survey.byFeat[featId] ?? 0) + 1;
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
    console.log(JSON.stringify(surveyFeatAbilities(found.map((d) => d.source)), null, 2));
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
