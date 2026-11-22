/**
 * The forward-compat probe, run INSIDE the deployed release (its own alias loader, so
 * every `@/…` import is the release's code): does the live client read what this tree
 * can write? Two inputs, built by `survey-forward-compat.ts` with this tree's code:
 *   - documents: combat/state documents, one per value of each closed list the strict
 *     codecs check (and the dev characters as written whole), each parsed by the
 *     release's `parseCombatState`: accepted or refused, and where;
 *   - closed lists: each list the release's strict play-state codec filters by (damage
 *     types, conditions, sizes, familiar types), with the values this tree can store:
 *     the release's own list says which it lacks (a lacking value is dropped on read,
 *     so the strict round-trip refuses the document).
 * Only entry points both releases share. No network, no writes beyond its output file.
 *
 *   node --import <release>/scripts/alias-loader.mjs <this>/scripts/lib/forward-compat-probe.ts <in.json> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

export interface CompatCase {
  list: string;
  value: string;
  doc: unknown;
}
export interface CompatList {
  list: string;
  module: string;
  exportName: string;
  values: readonly string[];
}
export interface CompatInput {
  cases: CompatCase[];
  lists: CompatList[];
}
export interface CompatOutput {
  cases: Array<{
    list: string;
    value: string;
    result: "accepted" | "refused";
    where?: string;
  }>;
  lists: Array<{ list: string; missing: string[] } | { list: string; absent: true }>;
}

type Parse = (doc: unknown) => { ok: boolean; reason?: string; where?: string };

export function readCases(
  parse: Parse,
  cases: readonly CompatCase[]
): CompatOutput["cases"] {
  return cases.map(({ list, value, doc }) => {
    const parsed = parse(doc);
    return parsed.ok
      ? { list, value, result: "accepted" as const }
      : {
          list,
          value,
          result: "refused" as const,
          where: parsed.where ?? parsed.reason ?? "?",
        };
  });
}

async function run(input: string, output: string): Promise<void> {
  const data = JSON.parse(readFileSync(input, "utf8")) as CompatInput;
  const { parseCombatState } = (await import("@/lib/combat-state-codec")) as {
    parseCombatState: Parse;
  };
  const lists: CompatOutput["lists"] = [];
  for (const { list, module, exportName, values } of data.lists) {
    try {
      const known = (
        (await import(/* @vite-ignore */ module)) as Record<string, unknown>
      )[exportName];
      if (!Array.isArray(known)) throw new Error("not a list");
      lists.push({ list, missing: values.filter((v) => !known.includes(v)) });
    } catch {
      lists.push({ list, absent: true });
    }
  }
  const result: CompatOutput = { cases: readCases(parseCombatState, data.cases), lists };
  writeFileSync(output, JSON.stringify(result));
}

const [, script, input, output] = process.argv;
if (script?.endsWith("forward-compat-probe.ts") && input && output) {
  run(input, output).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
