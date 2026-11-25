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
 *   - character builds: each written by this tree's codec, read and written back by the
 *     release's character codec; the watched keys must come back identical (an old
 *     tab keeps a newer build key, #1315).
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
/** A build this tree writes; `watch` names the build keys an old reader must keep. */
export interface CompatBuild {
  value: string;
  build: Record<string, unknown>;
  watch: string[];
}
export interface CompatInput {
  cases: CompatCase[];
  lists: CompatList[];
  builds?: CompatBuild[];
}
export interface CompatOutput {
  cases: Array<{
    list: string;
    value: string;
    result: "accepted" | "refused";
    where?: string;
  }>;
  lists: Array<{ list: string; missing: string[] } | { list: string; absent: true }>;
  builds?: Array<{
    value: string;
    result: "kept" | "changed" | "refused";
    where?: string;
  }>;
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

type ParseBuild = (
  build: Record<string, unknown>,
  state: Record<string, unknown>
) => { ok: true; character: unknown; session: unknown } | { ok: false; error: string };
type SerializeBuild = (doc: { character: unknown; session: unknown }) => {
  build: Record<string, unknown>;
};

/** Read each build and write it back with one codec: are the watched keys kept? */
export function readBuilds(
  parse: ParseBuild,
  serialize: SerializeBuild,
  builds: readonly CompatBuild[]
): NonNullable<CompatOutput["builds"]> {
  return builds.map(({ value, build, watch }) => {
    const parsed = parse(structuredClone(build), {});
    if (!parsed.ok) return { value, result: "refused" as const, where: parsed.error };
    const back = serialize({
      character: parsed.character,
      session: parsed.session,
    }).build;
    const changed = watch.filter(
      (key) => JSON.stringify(back[key]) !== JSON.stringify(build[key])
    );
    return changed.length === 0
      ? { value, result: "kept" as const }
      : { value, result: "changed" as const, where: changed.join(",") };
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
  const { parseCharacterEnvelope, serializeCharacterEnvelope } =
    (await import("@/lib/character-codec")) as unknown as {
      parseCharacterEnvelope: ParseBuild;
      serializeCharacterEnvelope: SerializeBuild;
    };
  const result: CompatOutput = {
    cases: readCases(parseCombatState, data.cases),
    lists,
    builds: readBuilds(
      parseCharacterEnvelope,
      serializeCharacterEnvelope,
      data.builds ?? []
    ),
  };
  writeFileSync(output, JSON.stringify(result));
}

const [, script, input, output] = process.argv;
if (script?.endsWith("forward-compat-probe.ts") && input && output) {
  run(input, output).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
