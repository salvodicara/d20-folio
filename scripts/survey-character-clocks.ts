#!/usr/bin/env node
/**
 * READ-ONLY survey: the game clocks of the characters attached to campaigns, for the
 * campaign-clock design (one clock per campaign; a solo character keeps its own).
 * For each attached character it reads the play state the app persists and counts:
 *   - a set time of day (`session.timeOfDay`; absent is the default, no time set);
 *   - live round timers (`session.effectTimers`), how many, and by state key;
 *   - per campaign, how many distinct times of day its members' sheets hold
 *     (more than one means the clocks disagree and a merge must pick one).
 * It never writes.
 *
 * Output: counts only. Never a name, an id or a path: campaigns are listed
 * anonymously, sorted by their counts.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-character-clocks.ts
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

const CAMPAIGN = /^campaigns\/([^/]+)$/;
const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;
const CHILD = /^users\/([^/]+)\/characters\/([^/]+)\/combat\/state$/;

// ── The engine seam (structural, so the scripts project never type-imports the app) ──

interface ClockSession {
  timeOfDay?: number;
  effectTimers?: Record<string, unknown>;
}

interface EngineModules {
  parsePersistedPlayStateV1: (
    value: unknown
  ) => { ok: true; session: ClockSession } | { ok: false; reason: string };
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
  parsePersistedPlayStateV1: await engineFunction(
    "session-state-codec.ts",
    "parsePersistedPlayStateV1"
  ),
} as EngineModules;

// ── The pure survey ──────────────────────────────────────────────────────────

export interface CampaignClockRow {
  /** Members with a character attached. */
  attached: number;
  /** Of those, how many found (a pointer to a deleted character is not counted). */
  found: number;
  withTimeOfDay: number;
  /** Distinct `timeOfDay` values among them (an absent clock counts as one value). */
  distinctTimes: number;
  liveTimers: number;
}

export interface CharacterClocksSurvey {
  format: "d20-folio-character-clocks-survey-v1";
  campaigns: number;
  /** Characters attached to a campaign and found. */
  characters: number;
  /** Characters with a time of day set (not the default). */
  withTimeOfDay: number;
  /** Characters with at least one live round timer. */
  withEffectTimers: number;
  /** All live round timers, and how many per state key. */
  effectTimers: number;
  effectTimersByKey: Record<string, number>;
  /** Campaigns whose members' clocks hold more than one value. */
  campaignsWhereClocksDisagree: number;
  perCampaign: CampaignClockRow[];
  /** Documents that couldn't be read, by reason code (counts only). */
  unreadable: Record<string, number>;
}

/** The characters a campaign's roster points at, as `users/{uid}/characters/{id}`. */
function attachedPaths(campaign: MigrationSourceDocument): string[] {
  const details = campaign.data.memberDetails;
  if (!isRecord(details)) return [];
  const paths: string[] = [];
  for (const [uid, member] of Object.entries(details)) {
    if (!isRecord(member)) continue;
    const characterId = member.characterId;
    if (typeof characterId === "string" && characterId.length > 0) {
      paths.push(`users/${uid}/characters/${characterId}`);
    }
  }
  return paths.sort();
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveyCharacterClocks(
  sources: readonly MigrationSourceDocument[]
): CharacterClocksSurvey {
  const campaigns: MigrationSourceDocument[] = [];
  const parents = new Set<string>();
  const states = new Map<string, MigrationSourceDocument>();
  for (const source of sources) {
    if (CAMPAIGN.test(source.path)) campaigns.push(source);
    else if (PARENT.test(source.path)) parents.add(source.path);
    else if (CHILD.test(source.path)) {
      states.set(source.path.slice(0, -"/combat/state".length), source);
    }
  }
  const survey: CharacterClocksSurvey = {
    format: "d20-folio-character-clocks-survey-v1",
    campaigns: campaigns.length,
    characters: 0,
    withTimeOfDay: 0,
    withEffectTimers: 0,
    effectTimers: 0,
    effectTimersByKey: {},
    campaignsWhereClocksDisagree: 0,
    perCampaign: [],
    unreadable: {},
  };
  const unreadable = (code: string) => {
    survey.unreadable[code] = (survey.unreadable[code] ?? 0) + 1;
  };
  // A character attached to two campaigns is counted once in the totals.
  const counted = new Set<string>();
  for (const campaign of [...campaigns].sort((a, b) => a.path.localeCompare(b.path))) {
    const paths = attachedPaths(campaign);
    const row: CampaignClockRow = {
      attached: paths.length,
      found: 0,
      withTimeOfDay: 0,
      distinctTimes: 0,
      liveTimers: 0,
    };
    const times = new Set<string>();
    for (const path of paths) {
      if (!parents.has(path)) continue;
      const state = states.get(path);
      const play = state ? engine.parsePersistedPlayStateV1(state.data.playState) : null;
      if (play && !play.ok) {
        unreadable("invalid-play-state");
        continue;
      }
      const session: ClockSession = play?.ok ? play.session : {};
      const timers = Object.keys(session.effectTimers ?? {});
      row.found += 1;
      times.add(session.timeOfDay === undefined ? "unset" : String(session.timeOfDay));
      if (session.timeOfDay !== undefined) row.withTimeOfDay += 1;
      row.liveTimers += timers.length;
      if (counted.has(path)) continue;
      counted.add(path);
      survey.characters += 1;
      if (session.timeOfDay !== undefined) survey.withTimeOfDay += 1;
      if (timers.length > 0) survey.withEffectTimers += 1;
      survey.effectTimers += timers.length;
      for (const key of timers) {
        survey.effectTimersByKey[key] = (survey.effectTimersByKey[key] ?? 0) + 1;
      }
    }
    row.distinctTimes = times.size;
    if (times.size > 1) survey.campaignsWhereClocksDisagree += 1;
    survey.perCampaign.push(row);
  }
  // Anonymous rows: ordered by their counts, never by the campaign they came from.
  survey.perCampaign.sort(
    (a, b) =>
      b.found - a.found ||
      b.distinctTimes - a.distinctTimes ||
      b.withTimeOfDay - a.withTimeOfDay ||
      b.liveTimers - a.liveTimers ||
      b.attached - a.attached
  );
  return survey;
}

export const DISCOVERY = [
  { collectionGroup: "campaigns", pattern: CAMPAIGN },
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
      JSON.stringify(surveyCharacterClocks(found.map((d) => d.source)), null, 2)
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
