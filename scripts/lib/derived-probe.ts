/**
 * The derived-sheet probe: for each stored character family (parent + `combat/state`),
 * the numbers the sheet shows, as a flat `path → value` map. ONE file runs against two
 * engines: the current tree, and a checkout of the deployed release (the survey copies
 * it there and runs it with that tree's `alias-loader`, so every `@/…` import below is
 * the release's own code). It only uses entry points both releases share.
 *
 * Pure reads: no Firebase, no network, no writes. Output keeps catalogue ids (skills,
 * trackers, actions) but no name and no character id: characters are numbered.
 *
 * As a script: `node --import <tree>/scripts/alias-loader.mjs <tree>/scripts/lib/derived-probe.ts <in.json> <out.json>`
 */
import { readFile, writeFile } from "node:fs/promises";
import process, { argv } from "node:process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export type RawMap = Record<string, unknown>;
export interface ProbeSource {
  readonly path: string;
  readonly data: RawMap;
}
/** One character's derived numbers (or the reason it could not be read). */
export type ProbeResult =
  | { ok: true; stats: Record<string, number | string> }
  | { ok: false; reason: string };

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;

function isRecord(value: unknown): value is RawMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface Engine {
  parseCharacterEnvelope: (
    build: RawMap,
    state: RawMap
  ) => { ok: boolean; character?: unknown; error?: string };
  parsePersistedPlayStateV1: (value: unknown) => {
    ok: boolean;
    session?: unknown;
    reason?: string;
  };
  effectiveAC: (character: unknown, session: unknown) => number;
  effectiveMaxHp: (character: unknown, session: unknown) => number;
  deriveSavesAndChecks: (character: unknown, session: unknown) => RawMap;
  resolveTrackers: (doc: unknown) => RawMap[];
  resolveActions: (doc: unknown) => RawMap[];
  aggregateCharacterGrants: (character: unknown, session: unknown) => RawMap;
  deriveSensesAndSpeeds: (
    aggregate: unknown,
    walking: number,
    exhaustion: number
  ) => RawMap;
  buildSpellsViewModel: (
    doc: unknown,
    classId: string,
    locale: string,
    isEdit: boolean
  ) => RawMap;
}

async function load(file: string, name: string): Promise<unknown> {
  // Relative to this file, so a copy inside another tree loads that tree's engine.
  const module = (await import(
    new URL(`../../src/lib/${file}.ts`, import.meta.url).href
  )) as RawMap;
  if (typeof module[name] !== "function") throw new TypeError(`${file} has no ${name}`);
  return module[name];
}

let envHooked = false;

export async function loadEngine(): Promise<Engine> {
  // Vite's `import.meta.env` for the app modules (plain Node has none), once.
  if (!envHooked && typeof process !== "undefined" && !process.env.VITEST) {
    const { register } = await import("node:module");
    register(new URL("./vite-env-hooks.mjs", import.meta.url));
    envHooked = true;
  }
  return {
    parseCharacterEnvelope: (await load(
      "character-codec",
      "parseCharacterEnvelope"
    )) as Engine["parseCharacterEnvelope"],
    parsePersistedPlayStateV1: (await load(
      "session-state-codec",
      "parsePersistedPlayStateV1"
    )) as Engine["parsePersistedPlayStateV1"],
    effectiveAC: (await load(
      "aggregate-character",
      "effectiveAC"
    )) as Engine["effectiveAC"],
    effectiveMaxHp: (await load(
      "aggregate-character",
      "effectiveMaxHp"
    )) as Engine["effectiveMaxHp"],
    aggregateCharacterGrants: (await load(
      "aggregate-character",
      "aggregateCharacterGrants"
    )) as Engine["aggregateCharacterGrants"],
    deriveSavesAndChecks: (await load(
      "views/saves-checks-view",
      "deriveSavesAndChecks"
    )) as Engine["deriveSavesAndChecks"],
    deriveSensesAndSpeeds: (await load(
      "views/sheet-view",
      "deriveSensesAndSpeeds"
    )) as Engine["deriveSensesAndSpeeds"],
    resolveTrackers: (await load(
      "smart-tracker",
      "resolveTrackers"
    )) as Engine["resolveTrackers"],
    resolveActions: (await load(
      "smart-tracker",
      "resolveActions"
    )) as Engine["resolveActions"],
    buildSpellsViewModel: (await load(
      "views/spells-view",
      "buildSpellsViewModel"
    )) as Engine["buildSpellsViewModel"],
  };
}

/** Numeric leaves (and short dice formulas) of a view value, under `prefix`. Arrays of
 *  rows with an `id` key by that id; other arrays by index. Labels are skipped. */
function flatten(
  value: unknown,
  prefix: string,
  out: Record<string, number | string>,
  depth = 0
): void {
  if (depth > 4) return;
  if (typeof value === "number" && Number.isFinite(value)) {
    out[prefix] = value;
    return;
  }
  if (typeof value === "string") {
    if (/^\d*d\d+([+-]\d+)?$|^[+-]?\d+$/.test(value.replace(/\s/g, "")))
      out[prefix] = value.replace(/\s/g, "");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const key = isRecord(item) && typeof item.id === "string" ? item.id : String(index);
      flatten(item, `${prefix}.${key}`, out, depth + 1);
    });
    return;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (/label|name|description|key$|text|tooltip|hint|icon|art/i.test(key)) continue;
      flatten(child, prefix ? `${prefix}.${key}` : key, out, depth + 1);
    }
  }
}

/** The aggregate's defense sets (Sets, which `flatten` skips): each member one
 *  `defenses.<field>.<value>` entry, so a resistance, an immunity or a source-bound
 *  immunity («magic can't put you to sleep») gained or lost shows as a diff. A field
 *  one engine lacks is simply absent (an «added» or «removed» model change). */
const DEFENSE_FIELDS = [
  "damageResistances",
  "damageImmunities",
  "damageVulnerabilities",
  "conditionImmunities",
  "damageSourceResistances",
] as const;

export function defenses(aggregate: RawMap, out: Record<string, number | string>): void {
  for (const field of DEFENSE_FIELDS) {
    const value: unknown = aggregate[field];
    const members: readonly unknown[] =
      value instanceof Set
        ? Array.from(value as Set<unknown>)
        : Array.isArray(value)
          ? (value as unknown[])
          : [];
    for (const member of members) {
      if (typeof member === "string") out[`defenses.${field}.${member}`] = 1;
    }
  }
  if (aggregate.allDamageResistance === true) out["defenses.allDamageResistance"] = 1;
  const bySource: unknown = aggregate.sourceConditionImmunities;
  if (Array.isArray(bySource)) {
    for (const entry of bySource) {
      if (
        isRecord(entry) &&
        typeof entry.condition === "string" &&
        typeof entry.sourceId === "string"
      )
        out[`defenses.sourceConditionImmunities.${entry.condition}:${entry.sourceId}`] =
          1;
    }
  }
}

function classIdsOf(character: unknown): string[] {
  const classes =
    isRecord(character) && Array.isArray(character.classes) ? character.classes : [];
  return classes.flatMap((c) =>
    isRecord(c) && typeof c.classId === "string" ? [c.classId] : []
  );
}

/** One family's derived numbers. */
export function probeCharacter(
  engine: Engine,
  parent: RawMap,
  combat: RawMap | undefined
): ProbeResult {
  try {
    const build = isRecord(parent.build) ? parent.build : {};
    const state = isRecord(parent.state) ? parent.state : {};
    const envelope = engine.parseCharacterEnvelope(build, state);
    if (!envelope.ok || envelope.character === undefined)
      return { ok: false, reason: "envelope" };
    const play = engine.parsePersistedPlayStateV1(combat?.playState);
    if (!play.ok || play.session === undefined)
      return { ok: false, reason: "play-state" };
    const character = envelope.character;
    const session = play.session;
    const doc = { id: "probe", character, session };
    const stats: Record<string, number | string> = {
      ac: engine.effectiveAC(character, session),
      hpMax: engine.effectiveMaxHp(character, session),
    };
    flatten(engine.deriveSavesAndChecks(character, session), "checks", stats);
    for (const tracker of engine.resolveTrackers(doc)) {
      if (typeof tracker.id === "string" && typeof tracker.total === "number") {
        stats[`resources.${tracker.id}.total`] = tracker.total;
      }
    }
    for (const action of engine.resolveActions(doc)) {
      if (typeof action.id !== "string") continue;
      const summary = isRecord(action.summary) ? action.summary : action;
      flatten(summary, `actions.${action.id}`, stats, 1);
    }
    const aggregate = engine.aggregateCharacterGrants(character, session);
    defenses(aggregate, stats);
    const exhaustion =
      isRecord(session) && typeof session.exhaustion === "number"
        ? session.exhaustion
        : 0;
    const walking =
      isRecord(character) && typeof character.speed === "number" ? character.speed : 30;
    flatten(
      engine.deriveSensesAndSpeeds(aggregate, walking, exhaustion),
      "speeds",
      stats
    );
    for (const classId of classIdsOf(character)) {
      flatten(
        engine.buildSpellsViewModel(doc, classId, "en", false),
        `spells.${classId}`,
        stats,
        1
      );
    }
    return { ok: true, stats };
  } catch {
    return { ok: false, reason: "threw" };
  }
}

/** Every parent with its `combat/state`, numbered in path order. */
export async function probeCorpus(
  sources: readonly ProbeSource[]
): Promise<ProbeResult[]> {
  const engine = await loadEngine();
  const children = new Map<string, RawMap>();
  for (const source of sources) {
    if (source.path.endsWith("/combat/state"))
      children.set(source.path.slice(0, -"/combat/state".length), source.data);
  }
  return sources
    .filter((source) => PARENT.test(source.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((source) => probeCharacter(engine, source.data, children.get(source.path)));
}

if (argv[1] && import.meta.url === pathToFileURL(resolve(argv[1])).href) {
  const [input, output] = argv.slice(2);
  if (!input || !output) throw new Error("usage: derived-probe.ts <in.json> <out.json>");
  const sources = JSON.parse(await readFile(input, "utf8")) as ProbeSource[];
  await writeFile(output, JSON.stringify(await probeCorpus(sources)), { mode: 0o600 });
}
