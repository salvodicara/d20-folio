#!/usr/bin/env node
/**
 * READ-ONLY survey (#1215): before the `memberEffects` drain is deleted, how many fights
 * still hold queued member effects. Reads every campaign's live fight (`encounter`) and
 * every kept fight (`campaigns/{id}/combat/ended`, which a member can reopen). The last
 * client that appended to `memberEffects` is v0.23.1; zero here means the drain can go.
 *
 * A value that is present but not an empty array counts as queued (never as empty).
 *
 * Output: counts only. Never a name, an id, a path or a value from a document.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-member-effects.ts
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
const KEPT = /^campaigns\/([^/]+)\/combat\/ended$/;

export interface MemberEffectsSurvey {
  format: "d20-folio-member-effects-survey-v1";
  campaigns: number;
  liveFights: number;
  liveFightsWithQueued: number;
  liveQueuedEffects: number;
  keptFights: number;
  keptFightsWithQueued: number;
  keptQueuedEffects: number;
}

const queued = (value: unknown): boolean =>
  value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);
const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0);

export function surveyMemberEffects(
  sources: readonly MigrationSourceDocument[]
): MemberEffectsSurvey {
  const survey: MemberEffectsSurvey = {
    format: "d20-folio-member-effects-survey-v1",
    campaigns: 0,
    liveFights: 0,
    liveFightsWithQueued: 0,
    liveQueuedEffects: 0,
    keptFights: 0,
    keptFightsWithQueued: 0,
    keptQueuedEffects: 0,
  };
  for (const source of sources) {
    if (CAMPAIGN.test(source.path)) {
      survey.campaigns += 1;
      const fight = source.data.encounter;
      if (!isRecord(fight)) continue;
      survey.liveFights += 1;
      if (queued(fight.memberEffects)) survey.liveFightsWithQueued += 1;
      survey.liveQueuedEffects += count(fight.memberEffects);
    } else if (KEPT.test(source.path)) {
      survey.keptFights += 1;
      const fight = source.data.fight;
      const effects = isRecord(fight) ? fight.memberEffects : undefined;
      if (queued(effects)) survey.keptFightsWithQueued += 1;
      survey.keptQueuedEffects += count(effects);
    }
  }
  return survey;
}

export const DISCOVERY = [
  { collectionGroup: "campaigns", pattern: CAMPAIGN },
  { collectionGroup: "combat", pattern: KEPT },
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
    console.log(JSON.stringify(surveyMemberEffects(found.map((d) => d.source)), null, 2));
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
