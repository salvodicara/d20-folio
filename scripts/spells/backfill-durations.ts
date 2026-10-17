/**
 * Write each spell's structured `duration` from its printed EN duration, right after
 * its `concentration` line. Idempotent: a spell that already carries a `duration`
 * line has it rewritten. The catalogue guard (spell-data-integrity) checks the result.
 *
 *   node --import ./scripts/alias-loader.mjs scripts/spells/backfill-durations.ts \
 *     src/i18n/en/srd/spells.json src/data/spells/level1.ts ...
 *
 * Pack spells: pass the pack's EN catalogue and its data file the same way.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { SpellDuration } from "../../src/data/types";
import { parseSpellDurationText } from "./spell-duration-text";

/** The spell object's own fields sit at four spaces in every spell data file. */
const ID_LINE = /^ {4}id: "([^"]+)",$/;
const CONCENTRATION_LINE = /^ {4}concentration: (true|false),$/;
const DURATION_LINE = /^ {4}duration: /;

function literal(duration: SpellDuration): string {
  return "amount" in duration
    ? `{ kind: "${duration.kind}", amount: ${duration.amount} }`
    : `{ kind: "${duration.kind}" }`;
}

/** The file with every spell's `duration` line written; ids without an EN duration
 *  are reported and left as they are. */
export function backfillDurations(
  source: string,
  durationText: (id: string) => string | undefined
): { source: string; written: number; missing: string[] } {
  const out: string[] = [];
  const missing: string[] = [];
  let written = 0;
  let id: string | null = null;
  for (const line of source.split("\n")) {
    // A spell's own `duration` line (only spell fields sit at four spaces) is rewritten.
    if (DURATION_LINE.test(line)) continue;
    out.push(line);
    const idMatch = ID_LINE.exec(line);
    if (idMatch) {
      id = idMatch[1] ?? null;
      continue;
    }
    if (id !== null && CONCENTRATION_LINE.test(line)) {
      const text = durationText(id);
      if (text === undefined) missing.push(id);
      else {
        out.push(`    duration: ${literal(parseSpellDurationText(text).duration)},`);
        written++;
      }
      id = null;
    }
  }
  return { source: out.join("\n"), written, missing };
}

function main(args: string[]): void {
  const [catalogue, ...files] = args;
  if (!catalogue || files.length === 0) {
    throw new Error("usage: backfill-durations.ts <en spells.json> <data file>...");
  }
  const en = JSON.parse(readFileSync(catalogue, "utf8")) as Record<
    string,
    { duration?: string }
  >;
  for (const file of files) {
    const result = backfillDurations(
      readFileSync(file, "utf8"),
      (id) => en[id]?.duration
    );
    writeFileSync(file, result.source);
    console.log(`${file}: ${result.written} written`);
    if (result.missing.length > 0) {
      console.log(`  no EN duration: ${result.missing.join(", ")}`);
    }
  }
}

if (process.argv[1]?.endsWith("backfill-durations.ts")) main(process.argv.slice(2));
