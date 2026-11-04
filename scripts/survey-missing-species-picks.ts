#!/usr/bin/env node
/**
 * READ-ONLY survey: how many stored characters lack a pick their species asks for
 * (the old creation wizard never asked an Elf's lineage, a Dragonborn's or a
 * Goliath's ancestry, a Tiefling's legacy, the species spellcasting ability or a
 * species skill). It reads each character's build and play state and asks the
 * engine's own `unresolvedBuildChoices`, the list the sheet's banner shows, so the
 * counts match what players will see. It never writes.
 *
 * Output: counts only (per species, per missing pick). Never a name, an id or a path.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-missing-species-picks.ts
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
  bundleKey?: string;
  traitId?: string;
  verifiable?: boolean;
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

/** A missing pick as a count key: `bundle:elf-lineage`, `skill:skillful:unverifiable`. */
function choiceKey(choice: Choice): string {
  if (choice.kind === "bundle") return `bundle:${choice.bundleKey ?? "?"}`;
  if (choice.kind === "skill") {
    return `skill:${choice.traitId ?? "?"}${choice.verifiable === false ? ":unverifiable" : ""}`;
  }
  if (choice.kind === "feat") return `feat:${choice.traitId ?? "?"}`;
  return choice.kind;
}

export interface SpeciesPicksSurvey {
  format: "d20-folio-species-picks-survey-v1";
  characters: number;
  /** Characters with at least one pick the sheet can say is missing. */
  missingAny: number;
  /** Per species: how many characters, and how many lack each pick. */
  bySpecies: Record<string, { characters: number; missing: Record<string, number> }>;
  /** Documents that couldn't be read, by reason code (counts only). */
  unreadable: Record<string, number>;
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveySpeciesPicks(
  sources: readonly MigrationSourceDocument[]
): SpeciesPicksSurvey {
  const parents = new Map<string, MigrationSourceDocument>();
  const children = new Map<string, MigrationSourceDocument>();
  for (const source of sources) {
    if (PARENT.test(source.path)) parents.set(source.path, source);
    else if (CHILD.test(source.path)) {
      children.set(source.path.slice(0, -"/combat/state".length), source);
    }
  }
  const survey: SpeciesPicksSurvey = {
    format: "d20-folio-species-picks-survey-v1",
    characters: 0,
    missingAny: 0,
    bySpecies: {},
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
    const character = parsed.character as unknown as { race: string };
    const session = play?.ok ? play.session : {};
    const choices = engine.unresolvedBuildChoices(character, session);
    const species = character.race || "(none)";
    const row = (survey.bySpecies[species] ??= { characters: 0, missing: {} });
    survey.characters += 1;
    row.characters += 1;
    if (choices.some((c) => c.verifiable !== false)) survey.missingAny += 1;
    for (const choice of choices) {
      const key = choiceKey(choice);
      row.missing[key] = (row.missing[key] ?? 0) + 1;
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
    console.log(JSON.stringify(surveySpeciesPicks(found.map((d) => d.source)), null, 2));
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
