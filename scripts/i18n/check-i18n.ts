/**
 * i18n build GATE — runs every leak detector, returning the list of problems
 * (i18n build-time LEAK-LOCK, `docs/ARCHITECTURE.md` §2.5).
 *
 * This is the BUILD half of the lock: it makes `pnpm build` go RED on ANY i18n
 * leak, so a leak can never reach a user. It is invoked from two seams that share
 * this ONE implementation (DRY):
 *   - the Vite `buildStart` plugin (`vite.config.ts`) — fails `vite build` (so it
 *     runs free in pre-push / `just deploy` / CI, which all run `pnpm build`);
 *   - `pnpm i18n:check` (this file run directly) — a standalone CLI the hooks / CI
 *     can call independently of a full build.
 *
 * It checks, over EN + IT (and every SRD catalogue):
 *   1. EN↔IT key parity (UI + every SRD catalogue), both directions;
 *   2. no empty / whitespace-only value in either locale;
 *   3. no English-in-IT leak (EN==IT value that reads as English);
 *   4. no `t("…")` literal in `src/` whose key is missing from the EN catalogue.
 *
 * PURE Node tooling under `scripts/` — never in the client bundle.
 */
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  I18N_ROOT,
  LOCALES,
  mergedUi,
  srdCatalogue,
  srdCatalogueNames,
  uiNamespaces,
  type Json,
} from "./catalogue-io.ts";
import {
  emptyValues,
  englishInItLeaks,
  hasParityViolation,
  missingReferencedKeys,
  parityViolations,
  setUiHeads,
} from "./leak-detectors.ts";

/** Absolute path to `src/` (sibling of `src/i18n`). */
const SRC_ROOT = join(I18N_ROOT, "..");

/** Recursively collect every `.ts`/`.tsx` source file under `src/` (no tests). */
function sourceFiles(dir: string, acc: { file: string; source: string }[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !full.endsWith(".d.ts") &&
      !/\.test\.tsx?$/.test(full)
    ) {
      acc.push({ file: relative(SRC_ROOT, full), source: readFileSync(full, "utf-8") });
    }
  }
}

/** Run all i18n leak checks; return human-readable problem strings (empty = OK). */
export function runI18nChecks(): string[] {
  const problems: string[] = [];

  // 1–3. UI catalogue parity + empties.
  const enUi = mergedUi("en");
  const itUi = mergedUi("it");
  const uiParity = parityViolations("ui", enUi, itUi);
  if (hasParityViolation(uiParity)) {
    if (uiParity.missingInB.length)
      problems.push(
        `ui: IT missing ${uiParity.missingInB.length} key(s): ${uiParity.missingInB.join(", ")}`
      );
    if (uiParity.missingInA.length)
      problems.push(
        `ui: EN missing ${uiParity.missingInA.length} key(s): ${uiParity.missingInA.join(", ")}`
      );
  }
  for (const locale of LOCALES) {
    const empties = emptyValues(locale === "en" ? enUi : itUi);
    if (empties.length)
      problems.push(`ui [${locale}]: empty value(s): ${empties.join(", ")}`);
  }

  // 1–3. each SRD catalogue: parity + empties + English-in-IT.
  for (const name of srdCatalogueNames()) {
    const en: Json = srdCatalogue("en", name);
    const it: Json = srdCatalogue("it", name);
    const par = parityViolations(`srd/${name}`, en, it);
    if (hasParityViolation(par)) {
      if (par.missingInB.length)
        problems.push(
          `srd/${name}: IT missing ${par.missingInB.length} key(s): ${par.missingInB.join(", ")}`
        );
      if (par.missingInA.length)
        problems.push(
          `srd/${name}: EN missing ${par.missingInA.length} key(s): ${par.missingInA.join(", ")}`
        );
    }
    for (const [locale, cat] of [
      ["en", en],
      ["it", it],
    ] as const) {
      const empties = emptyValues(cat);
      if (empties.length)
        problems.push(`srd/${name} [${locale}]: empty value(s): ${empties.join(", ")}`);
    }
    const leaks = englishInItLeaks(en, it).map((l) => `${l.id}.${l.field}`);
    if (leaks.length)
      problems.push(
        `srd/${name}: ${leaks.length} English-in-IT value(s) (translate via the SRD 5.2.1 cascade): ${leaks.join(", ")}`
      );
  }

  // 4. referenced `t("…")` literals all exist in the EN catalogue.
  setUiHeads(uiNamespaces());
  const files: { file: string; source: string }[] = [];
  sourceFiles(SRC_ROOT, files);
  const missing = missingReferencedKeys(files, enUi);
  if (missing.length)
    problems.push(
      `t() references ${missing.length} key(s) absent from the catalogue:\n` +
        missing.map((m) => `  ${m.file}: "${m.key}"`).join("\n")
    );

  return problems;
}

// Run directly (`pnpm i18n:check`): print + exit non-zero on any problem.
if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = runI18nChecks();
  if (problems.length) {
    console.error(
      "✗ i18n leak-lock FAILED — the build cannot ship an untranslated string:\n"
    );
    for (const p of problems) console.error("  • " + p);
    console.error(
      "\nFix the leak: translate via the IT SRD 5.2.1 cascade (never leave IT == English),\n" +
        "or add the missing key to BOTH en/it ui/<group>.json shards.\n"
    );
    process.exit(1);
  }
  console.log("✓ i18n leak-lock: catalogues complete, no untranslated string.");
}
