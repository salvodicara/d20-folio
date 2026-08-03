/**
 * Shared SRD-feature lookup.
 *
 * A single source of truth for resolving an `srdId` to its backing SRD entry,
 * searching class features first, then feats, then race traits. The three
 * indices have proven zero cross-collisions, so lookup order is irrelevant
 * (no id appears in more than one index).
 *
 * Leaf module by design: it imports only the three data indices and nothing
 * from the mechanics engine (smart-tracker / compute / grants), so any of
 * those can depend on it without risking a circular import.
 */
import type { SrdClassFeatureData, SrdFeatData } from "@/data/types";
import { classFeatureIndex } from "@/data/classes";
import { FEATS_BY_ID } from "@/data/feats";
import { raceFeatureIndex, raceTraitCatKey, type RaceFeatureEntry } from "@/data/races";
import type { SrdKind } from "@/i18n/srd-en";
import { srdText, customText, litText, type LocText } from "@/lib/loc-text";

/** An SRD feature source the grant pipeline resolves (class-feature/feat/race-trait). */
export type SrdFeatureSource = SrdClassFeatureData | SrdFeatData | RaceFeatureEntry;

/**
 * Resolve an `srdId` to its SRD class-feature, feat, or race-trait entry.
 * Returns `undefined` if the id is unknown. All three entry shapes share
 * `.id` / `.name` / `.grants` / `.mechanics?`, so callers can read those
 * common fields off the union directly.
 */
export function getSrdFeatureSource(srdId: string): SrdFeatureSource | undefined {
  return (
    classFeatureIndex.get(srdId) ?? FEATS_BY_ID.get(srdId) ?? raceFeatureIndex.get(srdId)
  );
}

/**
 * The stable i18n-catalogue reference `{ kind, key }` for an SRD feature source
 * (R6+R3 SLICE 7c) — the base path the engine extends with `.grants.<i>` /
 * `.mechanics.actions.<i>` to localize a feature's grant/action strings, and the
 * view resolves a `name`/`description` field from directly. A race-trait entry
 * (it carries `raceId`) keys under `kind: "race"` by its id-derived
 * {@link raceTraitCatKey}; a class-feature/feat keys under its own `srdId`. NO
 * `name.en` read — purely id math (golden rule 7).
 */
export function srdRefForFeatureSource(entry: SrdFeatureSource): {
  kind: SrdKind;
  key: string;
} {
  if ("raceId" in entry) {
    return { kind: "race", key: raceTraitCatKey(entry) };
  }
  // A feat carries a `category`; a class feature carries a `class`. Both key by
  // their own id under their respective catalogue.
  const kind: SrdKind = "category" in entry ? "feat" : "class-feature";
  return { kind, key: entry.id };
}

/**
 * Provenance NAME ref for a granting feature — its ONE catalogue name (golden
 * rule 6), so a rider token can read "+2d6 (Frenzy)" and a breakdown's why line
 * can lead with "Martial Arts:" by the feature's canonical title. Lives on this
 * LEAF module so every engine layer that needs it (compute's AC formulas, the
 * smart-tracker's riders + die upgrades) shares ONE resolver without a cycle. An
 * absent/unknown id (defensive — every SRD rider carries a `sourceId`) falls back
 * to the id literal, never a thrown resolver. The view materializes it via
 * `localizeText`.
 */
export function featureNameLoc(sourceId: string | undefined): LocText {
  if (!sourceId) return litText({ en: "Extra damage", it: "Danni extra" });
  const src = getSrdFeatureSource(sourceId);
  if (!src) return customText(sourceId);
  const ref = srdRefForFeatureSource(src);
  return srdText(ref.kind, ref.key, "name");
}
