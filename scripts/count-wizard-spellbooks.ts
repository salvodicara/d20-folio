#!/usr/bin/env node
/**
 * Read-only: how far each live wizard's spellbook falls short of the 2024 rule (a book
 * of 6 level-1 spells, then 2 more per Wizard level). The app has asked for the
 * Prepared Spells column instead, so a wizard's list on the sheet (which is the book)
 * is short. Counts only: never a user, a character, a name or a spell.
 *
 *   PROD read: GOOGLE_APPLICATION_CREDENTIALS=… node scripts/count-wizard-spellbooks.ts
 *   Emulator:  FIRESTORE_EMULATOR_HOST=… node scripts/count-wizard-spellbooks.ts
 *
 * A spell counts toward the book when it is a levelled Wizard spell on the sheet that a
 * grant did not add (`grantedBy`, Divination Savant and the like come on top) and that
 * is not always prepared. The sheet cannot tell a level-up pick from a spell copied in
 * by hand, so copied spells count too: the shortfall is a floor, never an overcount.
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

// ── The engine seam (structural, so the scripts project never type-imports the app) ──

interface ParsedSpell {
  srdId?: string;
  custom?: boolean;
  prepared?: boolean;
  alwaysPrepared?: boolean;
  grantedBy?: string;
}
interface ParsedCharacter {
  classes?: ReadonlyArray<{ classId: string; level: number }>;
  spells?: ReadonlyArray<ParsedSpell>;
}
interface EngineModules {
  parseCharacterEnvelope: (
    build: Record<string, unknown>,
    state: Record<string, unknown>
  ) => { ok: true; character: ParsedCharacter } | { ok: false };
  getSpellById: (id: string) => { level: number; classes: readonly string[] } | undefined;
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
  getSpellById: await engineExport("data/spells.ts", "getSpellById"),
} as EngineModules;

// ── The pure count ───────────────────────────────────────────────────────────

/** The 2024 book: 6 level-1 spells, then 2 per Wizard level after the first. */
export const bookTarget = (wizardLevel: number): number => 6 + 2 * (wizardLevel - 1);

export interface WizardBookRow {
  wizardLevel: number;
  /** Levelled Wizard spells on the sheet that count toward the book. */
  book: number;
  /** Of those, prepared. */
  prepared: number;
  /** Levelled spells a grant added (on top of the book). */
  granted: number;
  /** Homebrew spells on the sheet (not judged). */
  custom: number;
  target: number;
  shortfall: number;
}

export interface WizardBookCount {
  format: "d20-folio-wizard-spellbook-count-v1";
  wizards: WizardBookRow[];
  /** Documents that couldn't be read (counts only). */
  unreadable: number;
}

/** Count the corpus. Pure: no credentials, no Firebase. */
export function countWizardSpellbooks(
  sources: readonly MigrationSourceDocument[]
): WizardBookCount {
  const out: WizardBookCount = {
    format: "d20-folio-wizard-spellbook-count-v1",
    wizards: [],
    unreadable: 0,
  };
  for (const source of sources.filter((s) => PARENT.test(s.path))) {
    const build = isRecord(source.data.build) ? source.data.build : {};
    const parsed = engine.parseCharacterEnvelope(build, {});
    if (!parsed.ok) {
      out.unreadable += 1;
      continue;
    }
    const wizardLevel =
      parsed.character.classes?.find((c) => c.classId === "wizard")?.level ?? 0;
    if (wizardLevel === 0) continue;
    const row = { book: 0, prepared: 0, granted: 0, custom: 0 };
    for (const spell of parsed.character.spells ?? []) {
      if (spell.custom || !spell.srdId) {
        row.custom += 1;
        continue;
      }
      const data = engine.getSpellById(spell.srdId);
      if (!data || data.level === 0) continue;
      if (spell.grantedBy) row.granted += 1;
      else if (!spell.alwaysPrepared && data.classes.includes("wizard")) {
        row.book += 1;
        if (spell.prepared) row.prepared += 1;
      }
    }
    const target = bookTarget(wizardLevel);
    out.wizards.push({
      wizardLevel,
      ...row,
      target,
      shortfall: Math.max(0, target - row.book),
    });
  }
  out.wizards.sort((a, b) => a.wizardLevel - b.wizardLevel || a.book - b.book);
  return out;
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
      JSON.stringify(countWizardSpellbooks(found.map((d) => d.source)), null, 2)
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
