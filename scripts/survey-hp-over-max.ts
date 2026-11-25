#!/usr/bin/env node
/**
 * READ-ONLY survey: characters whose stored current HP is above the maximum their stored
 * build allows. A level-up whose whole-sheet save was refused could leave this behind:
 * the level-up's raised HP went out through the play write (`combat/state`), while the
 * build (`users/{uid}/characters/{id}`) stayed at the old level. The live classic wizard
 * did not put the HP back on a refusal, and every whole-sheet save of a character shared
 * by link was refused (#1286). The app clamps HP on read, so nobody sees it; the stored
 * data is still wrong.
 *
 * Output: counts only. Never a name, an id, a path or a value.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-hp-over-max.ts
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
import { parseStoredCharacter } from "@/lib/character-read";
import { parseCombatState } from "@/lib/combat-state-codec";
import { parsePersistedPlayStateV1 } from "@/lib/session-state-codec";
import { effectiveMaxHp } from "@/lib/aggregate-character";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;
const CHILD = /^users\/([^/]+)\/characters\/([^/]+)\/combat\/state$/;

export interface HpOverMaxSurvey {
  format: "d20-folio-hp-over-max-survey-v1";
  characters: number;
  /** Characters shared by link (their whole-sheet saves were refused before #1286). */
  shared: number;
  /** Stored current HP above the build's maximum. */
  overMax: number;
  overMaxShared: number;
  /** The largest excess found (HP above the maximum), a number only. */
  largestExcess: number;
  /** Characters that couldn't be read, by reason (counts only). */
  unreadable: Record<string, number>;
}

/** What the survey needs from the app: the stored character's maximum HP, and its
 *  stored current HP. Injected, so the survey stays pure and testable. */
export interface HpReader {
  maxHp: (id: string, parent: Record<string, unknown>, child: unknown) => Promise<number>;
  storedCurrent: (child: unknown) => number | null;
}

/** Survey the corpus. Pure apart from the injected reader: no credentials, no Firebase. */
export async function surveyHpOverMax(
  sources: readonly MigrationSourceDocument[],
  reader: HpReader
): Promise<HpOverMaxSurvey> {
  const children = new Map<string, unknown>();
  for (const source of sources) {
    if (CHILD.test(source.path)) {
      children.set(source.path.slice(0, -"/combat/state".length), source.data);
    }
  }
  const survey: HpOverMaxSurvey = {
    format: "d20-folio-hp-over-max-survey-v1",
    characters: 0,
    shared: 0,
    overMax: 0,
    overMaxShared: 0,
    largestExcess: 0,
    unreadable: {},
  };
  const unreadable = (reason: string): void => {
    survey.unreadable[reason] = (survey.unreadable[reason] ?? 0) + 1;
  };
  for (const source of sources) {
    const match = PARENT.exec(source.path);
    if (!match) continue;
    survey.characters += 1;
    const shared = source.data.shared === true;
    if (shared) survey.shared += 1;
    const child = children.get(source.path);
    if (child === undefined) {
      unreadable("no-combat-state");
      continue;
    }
    const current = reader.storedCurrent(child);
    if (current === null) {
      unreadable("no-current-hp");
      continue;
    }
    let max: number;
    try {
      max = await reader.maxHp(match[2] ?? "", source.data, child);
    } catch (error) {
      // The reason's first word only: a code, never a value.
      unreadable(
        (error instanceof Error ? error.message : "error")
          .split(/[\s:]/)[0]
          ?.slice(0, 40) || "error"
      );
      continue;
    }
    if (current > max) {
      survey.overMax += 1;
      if (shared) survey.overMaxShared += 1;
      survey.largestExcess = Math.max(survey.largestExcess, current - max);
    }
  }
  return survey;
}

/** The app's own reading: the build parsed by the shared codec, the max from the same
 *  aggregate the sheet clamps with. */
export function appReader(): HpReader {
  return {
    async maxHp(id, parent, child) {
      const doc = await parseStoredCharacter(id, parent);
      const parsed = parseCombatState(child);
      if (!parsed.ok) throw new TypeError(`combat-state ${parsed.reason}`);
      const session = parsePersistedPlayStateV1(parsed.state.playState);
      if (!session.ok) throw new TypeError(`play-state ${session.reason}`);
      return effectiveMaxHp(doc.character, session.session);
    },
    storedCurrent(child) {
      if (!isRecord(child) || !isRecord(child.hp)) return null;
      return typeof child.hp.current === "number" ? child.hp.current : null;
    },
  };
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
    const survey = await surveyHpOverMax(
      found.map((d) => d.source),
      appReader()
    );
    console.log(JSON.stringify(survey, null, 2));
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
