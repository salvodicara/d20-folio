/**
 * Granted-feature resolution.
 *
 * Centralises the full set of SRD features a character has been granted — class +
 * matching-subclass features (level ≤ current), species traits, and origin/background
 * feats — so that species- and feat-granted mechanics (trackers, actions, passives)
 * actually resolve via smart-tracker instead of silently doing nothing.
 *
 * Used by character creation; level-up and import build feature lists their own way
 * today but should converge here.
 */
import { classFeatures } from "@/data/classes";
import { raceFeatureEntries } from "@/data/races";
import { FEATS_BY_ID } from "@/data/feats";
import { getBackgroundOriginFeat } from "@/data/backgrounds";
import { isFightingStylePlaceholder } from "@/lib/fighting-style";
import type { SrdFeatureRef, CharacterData } from "@/types/character";

export interface GrantedFeatureInput {
  classId: string;
  level: number;
  subclassId: string;
  raceId: string;
  originFeat?: string;
  bgFeat?: string;
}

/**
 * Returns deduped SrdFeatureRefs in order: class/subclass → species traits → feats.
 * Subclass features are included only when they match `subclassId`.
 */
export function buildGrantedFeatures(input: GrantedFeatureInput): SrdFeatureRef[] {
  const { classId, level, subclassId, raceId, originFeat, bgFeat } = input;
  const refs: SrdFeatureRef[] = [];
  const seen = new Set<string>();
  const add = (id: string): void => {
    if (id && !seen.has(id)) {
      seen.add(id);
      refs.push({ srdId: id });
    }
  };

  for (const f of classFeatures) {
    if (f.class !== classId) continue;
    if (f.level > level) continue;
    if (f.subclass && f.subclass !== subclassId) continue;
    add(f.id);
  }
  for (const e of raceFeatureEntries) {
    if (e.raceId === raceId) add(e.id);
  }
  for (const slug of [originFeat, bgFeat]) {
    if (slug && FEATS_BY_ID.has(slug)) add(slug);
  }
  // Collapse a resolved Fighting Style: when a concrete style feature
  // (`<placeholder>-<style>`, e.g. `paladin-fighting-style-defense`) is granted,
  // the chosen style IS the feature — the generic `<class>-fighting-style`
  // placeholder card is a redundant ghost, so drop it (issue #38). Placeholders
  // with no concrete sibling granted (Fighter/Ranger pick a style FEAT instead)
  // stay so their picker slot still surfaces.
  return refs.filter(
    (r) =>
      !(
        isFightingStylePlaceholder(r.srdId) &&
        refs.some((other) => other.srdId.startsWith(`${r.srdId}-`))
      )
  );
}

/**
 * The origin feats a character receives purely from its DECLARED facts — the
 * Background's Origin feat and the species `humanOriginFeat` — resolved as
 * derived data rather than read from the stored `features[]` snapshot.
 *
 * "Declare the least, infer the rest": a character that declares only
 * `background: "criminal"` has the Alert Origin feat by inference; nothing
 * needs to inject `{ srdId: "alert" }` into `features[]` for it to surface.
 *
 * OVERRIDE-FIRST background resolution: the stored `bgFeat` slug is fed to
 * `getBackgroundOriginFeat` as the player's `choice`, so a choice-background
 * (Pact Seeker → fey-pact | infernal-pact) honors the picked option, while a
 * fixed-feat background ignores a stale/blank `bgFeat` and derives its default.
 *
 * Returns deduped `SrdFeatureRef`s (background feat first, then species feat),
 * skipping unknown feat slugs. Background-less / featless characters get `[]`.
 */
export function deriveOriginFeats(input: {
  background?: string;
  bgFeat?: string;
  humanOriginFeat?: string;
}): SrdFeatureRef[] {
  const { background, bgFeat, humanOriginFeat } = input;
  const refs: SrdFeatureRef[] = [];
  const seen = new Set<string>();
  const add = (slug: string): void => {
    if (slug && FEATS_BY_ID.has(slug) && !seen.has(slug)) {
      seen.add(slug);
      refs.push({ srdId: slug });
    }
  };
  // Background Origin feat — derived from the declared background, with the
  // stored bgFeat acting as the override-first choice for choice-backgrounds.
  if (background) add(getBackgroundOriginFeat(background, bgFeat));
  // A blank background but an explicit stored bgFeat (legacy / custom-background
  // docs) still surfaces that feat so nothing regresses.
  else if (bgFeat) add(bgFeat);
  // Species Origin feat (e.g. Human → a chosen Origin feat).
  if (humanOriginFeat) add(humanOriginFeat);
  return refs;
}

/**
 * Re-project the character's Origin feats into `features[]` from the current
 * build CHOICES (background · `bgFeat` · species · `humanOriginFeat`). The CHOICE
 * is the single source of truth; `features[]` is the materialized view every
 * engine consumer (trackers / actions / grants) reads. Call this on every build
 * edit so a stale Origin feat can never linger: it DROPS any stored Origin-feat
 * ref the current choices no longer grant and ADDS the ones they do. Idempotent —
 * a character already in sync is returned unchanged in content. Non-Origin
 * feats (ASI feats, fighting styles) and custom features are always preserved.
 */
export function syncOriginFeats(character: CharacterData): CharacterData {
  const desired = deriveOriginFeats(character);
  const desiredIds = new Set(desired.map((r) => r.srdId));
  const kept = character.features.filter((f) => {
    if ("custom" in f) return true;
    const feat = FEATS_BY_ID.get(f.srdId);
    // Drop a stored Origin-category feat the current choices no longer grant.
    return feat?.category !== "origin" || desiredIds.has(f.srdId);
  });
  const presentIds = new Set(
    kept.filter((f): f is SrdFeatureRef => "srdId" in f).map((f) => f.srdId)
  );
  const toAdd = desired.filter((r) => !presentIds.has(r.srdId));
  return { ...character, features: [...kept, ...toAdd] };
}
