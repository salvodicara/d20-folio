/**
 * i18n catalogue I/O — the ONE place that reads the on-disk i18n JSON catalogues
 * (i18n build-time LEAK-LOCK, `docs/ARCHITECTURE.md` §2.5; companion to
 * {@link ./leak-detectors.ts}).
 *
 * Both the BUILD gate (`vite.config.ts` plugin + `scripts/i18n/check-i18n.ts`)
 * and the TEST-time parity/dedup guards read the catalogues through THIS module —
 * one synchronous fs reader, no duplicated `readdirSync`/`JSON.parse`. It mirrors
 * the runtime `loadUiResources` merge (`src/i18n/loaders.ts`) but synchronously
 * from disk, so the leak detectors see the exact same merged shape the app does.
 *
 * PURE Node: `node:fs` + `node:path` only. No app imports, no bundling — it is
 * tooling, lives under `scripts/` (typechecked by `tsconfig.node.json`), and is
 * never part of the client bundle.
 */
/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { contentPackEnabled } from "../content-pack-mode.ts";
import { type Json, type Locale } from "./flat.ts";

// The catalogue VALUE types + the pure flattener live in `flat.ts` (no node/fs) so
// the leak detectors + the unit guards can share them without dragging fs into the
// app tsconfig project. Re-exported here for the build-side callers' convenience.
export { flatEntries, LOCALES } from "./flat.ts";
export type { Json, Locale };

/** Absolute path to `src/i18n` — resolved relative to THIS module. */
export const I18N_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "src",
  "i18n"
);

/**
 * Absolute path to the content pack's i18n tree (`content-pack/i18n`) — the
 * pack's srd shards merge into every check below when the pack is enabled
 * (`scripts/content-pack-mode.ts`), so the leak-lock sees the same composed
 * catalogue shape the runtime merges (docs/ARCHITECTURE.md → content-pack seam).
 */
export const PACK_I18N_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "content-pack",
  "i18n"
);

/** Every `.json` shard name (without extension) in a locale's `<group>/` dir. */
function shardNames(locale: Locale, group: "ui" | "srd"): string[] {
  return readdirSync(join(I18N_ROOT, locale, group))
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function readShard(locale: Locale, group: "ui" | "srd", name: string): Json {
  return JSON.parse(
    readFileSync(join(I18N_ROOT, locale, group, `${name}.json`), "utf-8")
  ) as Json;
}

/** The top-level UI namespaces (the `ui/<group>.json` filenames), EN-derived. */
export function uiNamespaces(): string[] {
  return shardNames("en", "ui");
}

/** The SRD catalogue file names (the `srd/<kind>.json` filenames), EN-derived. */
export function srdCatalogueNames(): string[] {
  return shardNames("en", "srd");
}

/**
 * Merge every `ui/<group>.json` shard for a locale into one flat catalogue — the
 * same object-assign the runtime bootstrap does (each shard is `{ <group>: {…} }`,
 * so a plain assign rebuilds the monolith shape).
 */
export function mergedUi(locale: Locale): Json {
  const merged: Json = {};
  for (const name of shardNames(locale, "ui")) {
    Object.assign(merged, readShard(locale, "ui", name));
  }
  return merged;
}

/**
 * Read ONE SRD catalogue (`srd/<file>.json`) for a locale — the COMPOSED shape:
 * the public shard plus (pack mode) the content pack's same-named shard, exactly
 * what the runtime merge produces. Pack entries are id-keyed additions, so a
 * plain assign composes them (the runtime merge is the strict collision gate).
 */
export function srdCatalogue(locale: Locale, file: string): Json {
  const base = readShard(locale, "srd", file);
  if (!contentPackEnabled()) return base;
  const packPath = join(PACK_I18N_ROOT, locale, "srd", `${file}.json`);
  if (!existsSync(packPath)) return base;
  return Object.assign({}, base, JSON.parse(readFileSync(packPath, "utf-8")) as Json);
}
