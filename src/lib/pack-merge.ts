/**
 * Content-pack merge helpers — the ONE way pack entries join a public
 * collection (docs/ARCHITECTURE.md → "The content-pack seam").
 *
 * Both helpers are strict: an id collision between the public data and the
 * pack, or an overlay patch aimed at a missing entry, THROWS at module init —
 * a drifted pack must fail the build/tests loudly, never half-merge.
 * Pure module: no React, no Firebase, no locale reads.
 */
import type { SrdCatalogue } from "@/i18n/srd-en";

/** Concatenate pack entries onto a public id-carrying array; throw on id collision. */
export function mergePack<T extends { readonly id: string }>(
  kind: string,
  base: readonly T[],
  pack: readonly T[]
): T[] {
  if (pack.length === 0) return [...base];
  const ids = new Set(base.map((e) => e.id));
  for (const e of pack) {
    if (ids.has(e.id)) {
      throw new Error(`[content-pack] duplicate ${kind} id "${e.id}" (public + pack)`);
    }
    ids.add(e.id);
  }
  return [...base, ...pack];
}

/** Merge two id-keyed records (pack entries onto public); throw on key collision. */
export function mergePackRecord<T>(
  kind: string,
  base: Readonly<Record<string, T>>,
  pack: Readonly<Record<string, T>>
): Record<string, T> {
  const out: Record<string, T> = { ...base };
  for (const [id, value] of Object.entries(pack)) {
    if (id in out) {
      throw new Error(`[content-pack] duplicate ${kind} id "${id}" (public + pack)`);
    }
    out[id] = value;
  }
  return out;
}

/**
 * Compose one SRD i18n catalogue: public shard + pack ADDITIONS (new ids —
 * collision throws) + overlay PATCHES (field-level restores over EXISTING
 * entries — a patch aimed at a missing entry throws).
 */
export function mergeCatalogue(
  kind: string,
  base: SrdCatalogue,
  additions: SrdCatalogue | undefined,
  patches: SrdCatalogue | undefined
): SrdCatalogue {
  if (!additions && !patches) return base;
  const out: SrdCatalogue = { ...base };
  for (const [id, entry] of Object.entries(additions ?? {})) {
    if (id in out) {
      throw new Error(`[content-pack] duplicate ${kind} catalogue key "${id}"`);
    }
    out[id] = entry;
  }
  for (const [id, fields] of Object.entries(patches ?? {})) {
    const target = out[id];
    if (target === undefined) {
      throw new Error(`[content-pack] overlay patches missing ${kind} entry "${id}"`);
    }
    out[id] = { ...target, ...fields };
  }
  return out;
}
