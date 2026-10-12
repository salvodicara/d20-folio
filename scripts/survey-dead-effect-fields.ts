#!/usr/bin/env node
/**
 * Phase 2 step 6 (docs/ARCHITECTURE_MAP.md): a READ-ONLY survey of live data before the
 * dead effect residue is deleted from the code. It answers one question per field: does
 * any stored document still hold a value the code would stop reading?
 *
 *   - `combat/state.activeEffects`        (a PC's legacy combat effects)
 *   - `campaigns/{id}.encounter.effectOps` (an encounter's apply/revoke ledger)
 *   - live world standings                 (`state.world.occurrences`, kind "standing",
 *                                            not ended, on the character's own self)
 *
 * It never writes, never backs up and never prints a payload or a path: only counts per
 * field (and, for standings, the fact kinds found). Approved by the owner 2026-10-12 as a
 * read-only look; a deletion that finds data is a separate, owner-approved migration.
 *
 * Run with production read credentials (Application Default Credentials):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-dead-effect-fields.ts
 * or against the emulator with FIRESTORE_EMULATOR_HOST set.
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import {
  discoverDocuments,
  isRecord,
  readTargetConfiguration,
} from "./lib/migration-kit.ts";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;
const CHILD = /^users\/([^/]+)\/characters\/([^/]+)\/combat\/state$/;
const CAMPAIGN = /^campaigns\/([^/]+)$/;

export interface SurveyCounts {
  characters: number;
  combatStates: number;
  campaigns: number;
  /** Combat states holding a non-empty `activeEffects` array. */
  activeEffects: number;
  /** Campaigns whose encounter holds a non-empty `effectOps` array. */
  effectOps: number;
  /** Documents (parent or child) whose world holds a live self standing. */
  liveStandings: number;
  /** How many live standings carry each fact kind (e.g. `active-key`). */
  standingFactKinds: Record<string, number>;
}

const nonEmptyArray = (value: unknown): boolean =>
  Array.isArray(value) && value.length > 0;

/** The fact kinds of the live standings on the character's own self, as the app reads them. */
export function liveStandingFactKinds(world: unknown): string[] {
  if (!isRecord(world) || !isRecord(world.occurrences)) return [];
  const kinds: string[] = [];
  for (const occurrence of Object.values(world.occurrences)) {
    if (
      !isRecord(occurrence) ||
      occurrence.kind !== "standing" ||
      occurrence.ending !== null
    ) {
      continue;
    }
    const target = occurrence.target;
    if (!isRecord(target) || target.entityId !== "self") continue;
    const material = target.material;
    if (!isRecord(material) || material.kind !== "character-play") continue;
    const fact = occurrence.fact;
    kinds.push(isRecord(fact) && typeof fact.kind === "string" ? fact.kind : "unknown");
  }
  return kinds;
}

/** The world a stored document carries: the child's play state, or a legacy parent state. */
function storedWorld(data: Record<string, unknown>): unknown {
  const playState = data.playState;
  if (isRecord(playState) && isRecord(playState.state)) return playState.state.world;
  return isRecord(data.state) ? data.state.world : undefined;
}

export function surveyDocuments(
  documents: ReadonlyArray<{ path: string; data: Record<string, unknown> }>
): SurveyCounts {
  const counts: SurveyCounts = {
    characters: 0,
    combatStates: 0,
    campaigns: 0,
    activeEffects: 0,
    effectOps: 0,
    liveStandings: 0,
    standingFactKinds: {},
  };
  for (const { path, data } of documents) {
    if (CAMPAIGN.test(path)) {
      counts.campaigns += 1;
      const encounter = data.encounter;
      if (isRecord(encounter) && nonEmptyArray(encounter.effectOps))
        counts.effectOps += 1;
      continue;
    }
    const child = CHILD.test(path);
    if (child) {
      counts.combatStates += 1;
      if (nonEmptyArray(data.activeEffects)) counts.activeEffects += 1;
    } else if (PARENT.test(path)) {
      counts.characters += 1;
    } else {
      continue;
    }
    const kinds = liveStandingFactKinds(storedWorld(data));
    if (kinds.length > 0) counts.liveStandings += 1;
    for (const kind of kinds) {
      counts.standingFactKinds[kind] = (counts.standingFactKinds[kind] ?? 0) + 1;
    }
  }
  return counts;
}

export const DISCOVERY = [
  { collectionGroup: "characters", pattern: PARENT },
  { collectionGroup: "combat", pattern: CHILD },
  { collectionGroup: "campaigns", pattern: CAMPAIGN },
];

async function run(): Promise<void> {
  if (processArgv.slice(2).length > 0) throw new Error("This survey takes no options");
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
    const documents = await discoverDocuments(getFirestore(app), DISCOVERY);
    const counts = surveyDocuments(documents.map((d) => d.source));
    console.log(JSON.stringify(counts, null, 2));
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
