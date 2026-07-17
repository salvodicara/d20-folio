/**
 * Resolve `choice-feat` grants (origin-feat grant).
 *
 * The source grants a WHOLE FEAT of the player's choice, drawn from a feat
 * `category`. Two SRD 2024 consumers:
 *   - Warlock invocation **Lessons of the First Ones** ("you gain one Origin
 *     feat of your choice"; Repeatable — a *different* Origin feat each time).
 *   - Human **Versatile** trait ("You gain an Origin feat of your choice").
 *
 * This module is the bridge between the declarative `choice-feat` grant and
 * the actual `character.features[]` injection. The picker UI calls
 * `pendingFeatSlotsForFeat(source)` to know what to prompt, the player resolves
 * each pick to a feat slug, then `applyFeatChoicePicks(character, picks)`
 * returns the character with the chosen feat(s) appended as ordinary
 * `SrdFeatureRef`s — so the existing feat pipeline
 * (`resolveGrantSourcesForFeatures`, the tracker/action resolvers) applies the
 * chosen feat's grants/tracker/actions/spell-choices. This mirrors exactly how
 * the Background origin feat is modelled (a whole feat resolved via the feat
 * pipeline), NOT a loose bundle of grants on the source.
 *
 * The available-feats list excludes feats the character ALREADY has — unless a
 * feat is `repeatable` — so "choose a different Origin feat each time" is
 * enforced for the Repeatable invocation by construction. Pure module — no
 * React/store deps.
 */
import type { Grant } from "@/lib/grants";
import type { FeatCategory } from "@/data/types";
import { SRD_FEATS, FEATS_BY_ID } from "@/data/feats";
import { arePicksComplete } from "@/lib/feat-choices-common";
import type { CharacterData, SrdFeatureRef, CustomFeature } from "@/types/character";

/** A single unresolved pending feat pick parsed from a source's grants. */
export interface FeatChoiceSlot {
  /** The feat category the pick is drawn from (Origin feat → "origin"). */
  category: FeatCategory;
  /** How many feats this slot grants (1 for every current case). */
  amount: number;
  /** Stable id within the source — slot-0, slot-1, ... — for React keys. */
  slotId: string;
}

/** Feat ids the player has selected, keyed by slot id. */
export type FeatChoicePicks = Record<string, ReadonlyArray<string>>;

/**
 * Walk a source's grants and emit one FeatChoiceSlot per `choice-feat` grant.
 * Returns an empty array for sources with none.
 */
export function pendingFeatSlotsForFeat(source: {
  grants?: ReadonlyArray<Grant>;
}): FeatChoiceSlot[] {
  const slots: FeatChoiceSlot[] = [];
  let idx = 0;
  for (const g of source.grants ?? []) {
    if (g.type === "choice-feat") {
      slots.push({ category: g.category, amount: g.amount, slotId: `slot-${idx++}` });
    }
  }
  return slots;
}

/** Returns true when every slot has exactly its required number of picks. */
export function isFeatPicksComplete(
  slots: ReadonlyArray<FeatChoiceSlot>,
  picks: FeatChoicePicks
): boolean {
  return arePicksComplete(slots, picks);
}

/** Feat slugs the character already has, read off its feature refs. */
function knownFeatIds(
  features: ReadonlyArray<SrdFeatureRef | CustomFeature>
): Set<string> {
  const ids = new Set<string>();
  for (const f of features) {
    if ("custom" in f) continue;
    if (FEATS_BY_ID.has(f.srdId)) ids.add(f.srdId);
  }
  return ids;
}

/**
 * Available feats for a slot — used by the picker UI's list. Filters to the
 * slot's `category` and EXCLUDES feats the character already has, UNLESS the
 * feat is `repeatable` (a repeatable feat may be taken again). This enforces
 * "choose a different Origin feat each time" for the Repeatable invocation:
 * once an Origin feat is on the character, it drops out of the pool for the
 * next `choice-feat` slot.
 *
 * Also excludes any ids passed in `alsoExclude` — the picker threads the picks
 * already made in OTHER slots of the same wizard step so the player can't pick
 * the same non-repeatable feat twice across two slots before either is applied.
 */
export function listAvailableForFeatSlot(
  slot: FeatChoiceSlot,
  character: Pick<CharacterData, "features">,
  alsoExclude: ReadonlyArray<string> = []
): ReadonlyArray<{ id: string; repeatable: boolean }> {
  const known = knownFeatIds(character.features);
  const excludedPicks = new Set(alsoExclude);
  // Returns stable ids only — the caller localizes each feat's name off the
  // `feat` catalogue by id (the display name was stripped from the data layer).
  return SRD_FEATS.filter((f) => {
    if (f.category !== slot.category) return false;
    // A non-repeatable feat already owned (or already picked in a sibling slot)
    // drops out; a repeatable feat always stays available.
    if (!f.repeatable && (known.has(f.id) || excludedPicks.has(f.id))) return false;
    return true;
  }).map((f) => ({ id: f.id, repeatable: f.repeatable }));
}

/**
 * Apply the picked feat ids to a character's `features[]`. Each valid pick that
 * isn't already present lands as an ordinary `{ srdId }` `SrdFeatureRef`, so the
 * existing feat pipeline resolves its grants/tracker/actions. Unknown ids
 * (defensive) and ids already on the character are skipped — idempotent and
 * non-destructive (re-applying the same picks is a no-op). Returns the same
 * reference when nothing changes.
 */
export function applyFeatChoicePicks(
  character: CharacterData,
  picks: FeatChoicePicks
): CharacterData {
  const allIds = Object.values(picks).flat();
  if (allIds.length === 0) return character;
  const have = new Set<string>();
  for (const f of character.features) {
    if (!("custom" in f)) have.add(f.srdId);
  }
  const added: SrdFeatureRef[] = [];
  for (const id of allIds) {
    if (!FEATS_BY_ID.has(id)) continue; // never inject a bogus / category slug
    if (have.has(id)) continue; // already on the character — don't double-add
    added.push({ srdId: id });
    have.add(id);
  }
  if (added.length === 0) return character;
  return { ...character, features: [...character.features, ...added] };
}
