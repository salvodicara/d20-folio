/// <reference types="node" />
/**
 * Test helper (R6+R3 SLICE 8): reconstruct a locale's full chrome catalogue from
 * its per-domain `ui/<group>.json` shards — the same merge the runtime bootstrap
 * performs (`loadUiResources`), but synchronous (read from disk) so the i18n
 * parity/dedup guards keep asserting over the WHOLE catalogue after the split.
 *
 * Each shard is `{ <group>: { … } }`; a plain object-assign rebuilds the original
 * monolith shape. Reading from disk (not a static import) means the guards never
 * eagerly bundle both locales — and they automatically see any new shard.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export type Json = { [k: string]: string | Json | unknown[] };

const HERE = dirname(fileURLToPath(import.meta.url));
const I18N_ROOT = join(HERE, "..", "..", "..", "src", "i18n");

/** Merge every `ui/<group>.json` shard for a locale into one flat catalogue. */
export function mergedUi(locale: "en" | "it"): Json {
  const dir = join(I18N_ROOT, locale, "ui");
  const merged: Json = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const shard = JSON.parse(readFileSync(join(dir, file), "utf-8")) as Json;
    Object.assign(merged, shard);
  }
  return merged;
}
