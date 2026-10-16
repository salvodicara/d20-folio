/**
 * The runtime content pack's wire format: how the private pack travels as JSON.
 *
 * The production build bundles no private content. At deploy time the composed
 * pack is turned into a few JSON files (`buildPackFiles`) and uploaded to a
 * Storage path only allowlisted accounts can read; after sign-in the app
 * downloads them and `src/data/pack-runtime.ts` serves them under the same
 * `@pack` exports the data layer already imports. See docs/ARCHITECTURE.md →
 * "The content-pack seam".
 *
 * Files:
 *  - `core.json` — every eager export (CORE_KEYS) plus the lazy-file index.
 *  - `en-prose.json` — the lazy English descriptions (`@pack/i18n-en-prose`).
 *  - `srd-<locale>.json` — the non-EN catalogue additions (`loadPackSrdCatalogues`).
 *  - `lazy-<kind>-<locale>.json` — the lazy catalogue shards (`loadPackLazySrd`).
 *
 * Pure: no Node, no Firebase. Imports types only, so it never joins the
 * `@pack` ↔ `srd-en` module cycle.
 */
import type * as PackModule from "@/data/pack-empty";
import type { LazySrdKind } from "@/i18n/srd-en";
import type { Locale } from "@/lib/locale";
import type { SrdCataloguePatch } from "@/data/pack-types";
import type { SrdCatalogue } from "@/i18n/srd-en";

type PackExports = typeof PackModule;

/** The data exports `core.json` carries, read eagerly by the data layer. */
export const CORE_KEYS = [
  "packSpells",
  "packFeats",
  "packRaces",
  "packBackgroundsRaw",
  "packBackgroundEquipment",
  "packMagicItems",
  "packManeuvers",
  "packBeasts",
  "packMonsters",
  "packMonsterArt",
  "packItemArt",
  "packClassTables",
  "packClassFeatures",
  "packSubclasses",
  "packQuickbuildPresets",
  "packGrantExtensions",
  "packNameCatalogues",
  "packSrdEn",
  "srdOverlay",
  "uiOverlay",
] as const satisfies ReadonlyArray<keyof PackExports>;

export type CoreKey = (typeof CORE_KEYS)[number];

/**
 * Pack exports that are not in `core.json`, each for a reason: the lazy prose
 * and the two loaders travel as their own files; fixtures and scenarios are
 * dev-only and stay with the local pack.
 */
export const NOT_IN_RUNTIME_PACK = [
  "packSrdEnProse",
  "loadPackSrdCatalogues",
  "loadPackLazySrd",
  "packFixtures",
  "packScenarios",
] as const satisfies ReadonlyArray<keyof PackExports>;

/** Which optional files exist, so a loader never asks for one that does not. */
export interface PackIndex {
  srd: Locale[];
  lazySrd: Array<[Locale, LazySrdKind]>;
}

export type PackCore = Pick<PackExports, CoreKey> & { index: PackIndex };

/** Everything the composed pack provides, gathered by the emitter. */
export interface PackSource {
  exports: Pick<PackExports, CoreKey>;
  enProse: SrdCataloguePatch;
  srd: Partial<Record<Locale, SrdCataloguePatch>>;
  lazySrd: Partial<Record<Locale, Partial<Record<LazySrdKind, SrdCatalogue>>>>;
}

export interface PackFiles {
  /** Content hash: the Storage folder name and the build's `VITE_PACK_VERSION`. */
  version: string;
  index: PackIndex;
  files: Record<string, string>;
}

/** Marks a back-reference to an ancestor `n` levels up (`0` = the parent). */
const ANCESTOR = "$ancestor";

/**
 * JSON with one extension: a value that is its own ancestor (the Beast Master's
 * companion lists itself among its `variants`) becomes `{ "$ancestor": n }`.
 * Objects merely shared by two parents are written twice; they decode as equal
 * copies, which is all the data layer relies on.
 */
export function encodeJson(value: unknown): string {
  const ancestors: object[] = [];
  const walk = (node: unknown): unknown => {
    if (node === null || typeof node !== "object") {
      if (typeof node === "function")
        throw new Error("pack-wire: functions cannot travel");
      return node;
    }
    const depth = ancestors.lastIndexOf(node);
    if (depth !== -1) return { [ANCESTOR]: ancestors.length - 1 - depth };
    ancestors.push(node);
    try {
      if (Array.isArray(node)) return node.map(walk);
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(node)) {
        if (child !== undefined) out[key] = walk(child);
      }
      return out;
    } finally {
      ancestors.pop();
    }
  };
  return JSON.stringify(walk(value));
}

export function decodeJson(text: string): unknown {
  const ancestors: object[] = [];
  const walk = (node: unknown): unknown => {
    if (node === null || typeof node !== "object") return node;
    const keys = Object.keys(node);
    if (keys.length === 1 && keys[0] === ANCESTOR) {
      const up = (node as Record<string, number>)[ANCESTOR] ?? 0;
      return ancestors[ancestors.length - 1 - up];
    }
    ancestors.push(node);
    try {
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) node[i] = walk(node[i]);
      } else {
        const record = node as Record<string, unknown>;
        for (const key of keys) record[key] = walk(record[key]);
      }
      return node;
    } finally {
      ancestors.pop();
    }
  };
  return walk(JSON.parse(text));
}

/** FNV-1a, 64-bit, as 16 hex chars: stable, fast, and dependency-free. */
function contentHash(parts: string[]): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      hash ^= BigInt(part.charCodeAt(i));
      hash = (hash * prime) & mask;
    }
    hash ^= 0xffn;
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function buildPackFiles(source: PackSource): PackFiles {
  const index: PackIndex = { srd: [], lazySrd: [] };
  const files: Record<string, string> = {};

  for (const [locale, patch] of Object.entries(source.srd) as Array<
    [Locale, SrdCataloguePatch]
  >) {
    index.srd.push(locale);
    files[`srd-${locale}.json`] = encodeJson(patch);
  }
  for (const [locale, kinds] of Object.entries(source.lazySrd) as Array<
    [Locale, Partial<Record<LazySrdKind, SrdCatalogue>>]
  >) {
    for (const [kind, catalogue] of Object.entries(kinds) as Array<
      [LazySrdKind, SrdCatalogue]
    >) {
      index.lazySrd.push([locale, kind]);
      files[`lazy-${kind}-${locale}.json`] = encodeJson(catalogue);
    }
  }
  files["en-prose.json"] = encodeJson(source.enProse);

  const core: Record<string, unknown> = { index };
  for (const key of CORE_KEYS) core[key] = source.exports[key];
  files["core.json"] = encodeJson(core);

  const names = Object.keys(files).sort();
  const version = contentHash(names.flatMap((name) => [name, files[name] ?? ""]));
  return { version, index, files };
}
