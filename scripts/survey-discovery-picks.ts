#!/usr/bin/env node
/**
 * READ-ONLY survey (#1289): do the stored Lore Bards' Magical Discoveries picks carry
 * the mark of the feature that granted them (`grantedBy`)? The level-up swap offers
 * only marked picks, and the mark exists only on picks saved since 2026-11-12, so a
 * Bard who picked earlier would not see the swap. It counts, per Lore Bard of level 6
 * or more, the always-prepared spells marked by the feature, and the always-prepared
 * spells with no mark at all. It never writes.
 *
 * Output: counts only. Never a name, an id, a path or a spell.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-discovery-picks.ts
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
const FEATURE = "bard-lore-additional-magical-secrets";

interface ParsedCharacter {
  features?: ReadonlyArray<{ srdId?: string }>;
  classes?: ReadonlyArray<{ classId: string; subclassId?: string; level: number }>;
  spells?: ReadonlyArray<{
    srdId?: string;
    alwaysPrepared?: boolean;
    grantedBy?: string;
  }>;
}

interface EngineModules {
  parseCharacterEnvelope: (
    build: RawMap,
    state: RawMap
  ) => { ok: true; character: unknown } | { ok: false; error: string };
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
} as EngineModules;

/** Spell id → its class lists, from the app's own catalogue (SRD + pack). */
const spellClasses: ReadonlyMap<string, readonly string[]> = await (async () => {
  const module: unknown = await import(
    new URL("../src/data/spells.ts", import.meta.url).href
  );
  const all = isRecord(module) && Array.isArray(module.spells) ? module.spells : [];
  return new Map(
    (all as Array<{ id: string; classes?: string[] }>).map((sp) => [
      sp.id,
      sp.classes ?? [],
    ])
  );
})();

export interface DiscoveryPicksSurvey {
  format: "d20-folio-discovery-picks-survey-v1";
  /** Lore Bards of Bard level 6 or more (they have Magical Discoveries). */
  loreBards: number;
  /** Per Lore Bard: how many always-prepared spells carry the feature's mark, and how
   *  many always-prepared spells carry no mark (a pick saved before the mark existed,
   *  or another unmarked source). Keyed "marked/unmarked" → number of Bards. */
  byMarks: Record<string, number>;
  /** Lore Bards whose features list the Magical Discoveries feature. */
  withFeature: number;
  /** Per Lore Bard: spells on the Cleric/Druid/Wizard lists but NOT on the Bard
   *  list (only Magical Discoveries can give those to a pure Bard), by their flags:
   *  "always" (alwaysPrepared), "prepared", "known". Keyed "always/prepared/known". */
  outsideBardList: Record<string, number>;
  unreadable: Record<string, number>;
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export function surveyDiscoveryPicks(
  sources: readonly MigrationSourceDocument[]
): DiscoveryPicksSurvey {
  const survey: DiscoveryPicksSurvey = {
    format: "d20-folio-discovery-picks-survey-v1",
    loreBards: 0,
    byMarks: {},
    withFeature: 0,
    outsideBardList: {},
    unreadable: {},
  };
  for (const parent of sources.filter((s) => PARENT.test(s.path))) {
    const build = isRecord(parent.data.build) ? parent.data.build : {};
    const parsed = engine.parseCharacterEnvelope(build, {});
    if (!parsed.ok) {
      survey.unreadable["invalid-envelope"] =
        (survey.unreadable["invalid-envelope"] ?? 0) + 1;
      continue;
    }
    const character = parsed.character as ParsedCharacter;
    const bard = (character.classes ?? []).find(
      (c) => c.classId === "bard" && c.subclassId === "college-of-lore" && c.level >= 6
    );
    if (!bard) continue;
    survey.loreBards += 1;
    const always = (character.spells ?? []).filter((s) => s.srdId && s.alwaysPrepared);
    const marked = always.filter((s) => s.grantedBy === FEATURE).length;
    const unmarked = always.filter((s) => !s.grantedBy).length;
    const key = `${marked}/${unmarked}`;
    survey.byMarks[key] = (survey.byMarks[key] ?? 0) + 1;
    if ((character.features ?? []).some((f) => f.srdId === FEATURE))
      survey.withFeature += 1;
    const outside = (character.spells ?? []).filter((sp) => {
      const lists = sp.srdId ? spellClasses.get(sp.srdId) : undefined;
      return (
        !!lists &&
        !lists.includes("bard") &&
        lists.some((c) => c === "cleric" || c === "druid" || c === "wizard")
      );
    });
    const flags = [
      outside.filter((sp) => sp.alwaysPrepared).length,
      outside.filter(
        (sp) => !sp.alwaysPrepared && (sp as { prepared?: boolean }).prepared
      ).length,
      outside.filter(
        (sp) => !sp.alwaysPrepared && !(sp as { prepared?: boolean }).prepared
      ).length,
    ].join("/");
    survey.outsideBardList[flags] = (survey.outsideBardList[flags] ?? 0) + 1;
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
      JSON.stringify(surveyDiscoveryPicks(found.map((d) => d.source)), null, 2)
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
