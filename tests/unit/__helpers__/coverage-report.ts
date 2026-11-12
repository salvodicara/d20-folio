/**
 * docs/RULES_COVERAGE_GENERATED.md, written from what the code and the tests prove:
 * the catalogue rows counted by the coverage rules (public SRD data only, so the page
 * reads the same with or without the content pack), the conformance count read from
 * the cases' statuses (CI proves each: `works` passes, the rest must fail), and the
 * Rules Glossary entry by entry with its proof. `pnpm rules:coverage` rewrites it;
 * `rules-coverage-generated.test.ts` fails when the committed page differs.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { classFeatures } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { MAGIC_ITEMS_PART_1 } from "@/data/magic-items/part-1";
import { MAGIC_ITEMS_PART_2 } from "@/data/magic-items/part-2";
import { MAGIC_ITEMS_PART_3 } from "@/data/magic-items/part-3";
import { SRD_MONSTERS_A_B } from "@/data/monsters/a-b";
import { SRD_MONSTERS_C_D } from "@/data/monsters/c-d";
import { SRD_MONSTERS_E_G } from "@/data/monsters/e-g";
import { SRD_MONSTERS_H_K } from "@/data/monsters/h-k";
import { SRD_MONSTERS_L_M } from "@/data/monsters/l-m";
import { SRD_MONSTERS_N_P } from "@/data/monsters/n-p";
import { SRD_MONSTERS_Q_S } from "@/data/monsters/q-s";
import { SRD_MONSTERS_T_Z } from "@/data/monsters/t-z";
import { SRD_RACES } from "@/data/races";
import { SRD_CANTRIPS } from "@/data/spells/cantrips";
import { SRD_SPELLS_LEVEL1 } from "@/data/spells/level1";
import { SRD_SPELLS_LEVEL2 } from "@/data/spells/level2";
import { SRD_SPELLS_LEVEL3 } from "@/data/spells/level3";
import { SRD_SPELLS_LEVEL4 } from "@/data/spells/level4";
import { SRD_SPELLS_LEVEL5 } from "@/data/spells/level5";
import { SRD_SPELLS_LEVEL6 } from "@/data/spells/level6";
import { SRD_SPELLS_LEVEL7 } from "@/data/spells/level7";
import { SRD_SPELLS_LEVEL8 } from "@/data/spells/level8";
import { SRD_SPELLS_LEVEL9 } from "@/data/spells/level9";
import { MONSTER_ACTION_SECTIONS, monsterActions } from "@/lib/play/monster-action";

import { corpusCases, PUBLIC_DIR } from "../conformance/cases";
import { GLOSSARY, type GlossaryEntry } from "./glossary-coverage";
import {
  classFeatureCoverage,
  coverageCell,
  featCoverage,
  magicItemCoverage,
  speciesTraitCoverage,
  spellCoverage,
  SRD_CARRIED,
} from "./rules-coverage";

export const GENERATED_DOC = "docs/RULES_COVERAGE_GENERATED.md";

const ROOT = path.resolve(PUBLIC_DIR, "../../..");

/** The public bestiary's entries: those the DM's card opens in one tap, the rest. */
function monsterCell(): { blocks: number; entries: number; cell: string } {
  const blocks = [
    ...SRD_MONSTERS_A_B,
    ...SRD_MONSTERS_C_D,
    ...SRD_MONSTERS_E_G,
    ...SRD_MONSTERS_H_K,
    ...SRD_MONSTERS_L_M,
    ...SRD_MONSTERS_N_P,
    ...SRD_MONSTERS_Q_S,
    ...SRD_MONSTERS_T_Z,
  ];
  let entries = 0;
  let tap = 0;
  for (const block of blocks) {
    const actions = new Set(
      monsterActions(block).map(({ section, entryId }) => `${section}:${entryId}`)
    );
    for (const section of MONSTER_ACTION_SECTIONS)
      for (const entry of block[section] ?? []) {
        entries += 1;
        const regeneration =
          entry.kind === "narrative" && entry.fact?.kind === "regeneration";
        if (actions.has(`${section}:${entry.id}`) || regeneration) tap += 1;
      }
  }
  return { blocks: blocks.length, entries, cell: `0 / ${tap} / ${entries - tap} / 0` };
}

function catalogueRows(): string[] {
  const spells = [
    ...SRD_CANTRIPS,
    ...SRD_SPELLS_LEVEL1,
    ...SRD_SPELLS_LEVEL2,
    ...SRD_SPELLS_LEVEL3,
    ...SRD_SPELLS_LEVEL4,
    ...SRD_SPELLS_LEVEL5,
    ...SRD_SPELLS_LEVEL6,
    ...SRD_SPELLS_LEVEL7,
    ...SRD_SPELLS_LEVEL8,
    ...SRD_SPELLS_LEVEL9,
  ];
  const features = classFeatures.filter((f) => f.source === "SRD");
  const traits = SRD_RACES.filter((race) => race.source === "SRD").flatMap((race) =>
    race.traits.map((trait) => speciesTraitCoverage(race.id, trait))
  );
  const feats = SRD_FEATS.filter((feat) => feat.source === "SRD");
  const items = [...MAGIC_ITEMS_PART_1, ...MAGIC_ITEMS_PART_2, ...MAGIC_ITEMS_PART_3];
  const monsters = monsterCell();
  return [
    `| Spells | ${spells.length} | ${coverageCell(spells.map(spellCoverage))} |`,
    `| Class features | ${features.length} | ${coverageCell(features.map((f) => classFeatureCoverage(f, SRD_CARRIED)))} |`,
    `| Species traits | ${traits.length} | ${coverageCell(traits)} |`,
    `| Feats | ${feats.length} | ${coverageCell(feats.map(featCoverage))} |`,
    `| Magic items | ${items.length} | ${coverageCell(items.map(magicItemCoverage))} |`,
    `| Monster entries (${monsters.blocks} stat blocks) | ${monsters.entries} | ${monsters.cell} |`,
  ];
}

/** Each public conformance case's status, read as text (no test runs here). */
function conformanceCount(): { works: number; pending: number; total: number } {
  let works = 0;
  let pending = 0;
  for (const file of readdirSync(PUBLIC_DIR).filter((f) => f.endsWith(".test.ts"))) {
    const text = readFileSync(path.join(PUBLIC_DIR, file), "utf8");
    works += [...text.matchAll(/status:\s*"works"/g)].length;
    pending += [...text.matchAll(/status:\s*"(M\d+|data)"/g)].length;
  }
  return { works, pending, total: corpusCases().length };
}

/** Source files (outside tests) that are screens: React components. A gap's
 *  `waitsFor` names the function a screen calls, or the hook it mounts. */
function screenSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) out.push(readFileSync(full, "utf8"));
    }
  };
  walk(path.join(ROOT, "src"));
  return out;
}

let screens: string[] | null = null;

/** True when a screen (a React component) calls `fn` or mounts the hook `fn`. */
export function aScreenCalls(fn: string): boolean {
  screens ??= screenSources();
  return screens.some((text) => new RegExp(`\\b${fn}\\b`).test(text));
}

/** The functions a gap waits for that a screen now calls (the gap may be closed). */
export function gapsAScreenNowCalls(): Array<{ entry: string; fn: string }> {
  return GLOSSARY.flatMap((entry) =>
    (entry.waitsFor ?? []).filter(aScreenCalls).map((fn) => ({ entry: entry.entry, fn }))
  );
}

const cell = (text: string) => text.replace(/\|/g, "\\|");

function glossaryRow(entry: GlossaryEntry): string {
  const proof =
    entry.status === "gap"
      ? entry.waitsFor?.length
        ? `engine done; no screen calls ${entry.waitsFor.map((fn) => `\`${fn}\``).join(", ")}`
        : "engine missing"
      : entry.evidence.map((file) => `\`${file}\``).join(", ") || "—";
  return `| ${cell(entry.entry)} | ${entry.status} | ${proof} | ${cell(entry.note)} |`;
}

export function renderCoverageDoc(): string {
  const conformance = conformanceCount();
  const count = (status: GlossaryEntry["status"]) =>
    GLOSSARY.filter((entry) => entry.status === status).length;
  return [
    "# Rules coverage (generated)",
    "",
    "<!-- Written by `pnpm rules:coverage` from the code and the tests; do not edit by hand.",
    "     tests/unit/rules-coverage-generated.test.ts fails when this page is out of date. -->",
    "",
    "Side by side with the hand-written [RULES_COVERAGE.md](RULES_COVERAGE.md) and",
    "[RULES_GLOSSARY_AUDIT.md](RULES_GLOSSARY_AUDIT.md) until the coordinator has compared",
    "them; then those tables go. How each class is counted: `tests/unit/__helpers__/rules-coverage.ts`.",
    "",
    "## Catalogues (public SRD 5.2.1): what the data declares",
    "",
    "**Declared, not proven.** These counts read what each entry's data declares: auto =",
    "an effect the engine could apply with no input; 1 tap = a counter, an action, a cast or",
    "a pick; text only = nothing declared, the table plays it by hand. A declared effect",
    "that no screen applies still counts as auto here; the proven class comes from the",
    "edge cases below, through the functions a screen calls.",
    "",
    "| Catalogue | Entries | Declared auto / 1 tap / Text only / Impossible |",
    "| --- | --- | --- |",
    ...catalogueRows(),
    "",
    "## Edge cases",
    "",
    `${conformance.works} of the corpus's ${conformance.total} edge cases work, each proven by a public test; ${conformance.pending} more have a public test waiting for the engine (docs/architecture/2026-11-edge-cases/corpus.md). Cases about pack content are counted by the pack's own tests.`,
    "",
    "## Rules Glossary",
    "",
    `${GLOSSARY.length} rows: ${count("modeled")} modeled, ${count("table-side")} table-side, ${count("gap")} gaps. Modeled = the audit found the engine applies it, and the tests named exist (they prove the engine, not yet that a screen calls it); table-side = left to the table by design; gap = a table would want the app to apply it. First pass from RULES_GLOSSARY_AUDIT.md, under review by the rules lane.`,
    "",
    "| Entry | Status | Proof | Where, or why |",
    "| --- | --- | --- | --- |",
    ...GLOSSARY.map(glossaryRow),
    "",
  ].join("\n");
}
