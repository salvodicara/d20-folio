/**
 * The variant choosers a sheet offers (`choice-grant-bundle`), by when their rule lets
 * the choice change (`GrantBundle.choiceFrequency`):
 *
 * - at a rest, the rest screens offer the `rest` ones (Circle of the Land's terrain,
 *   Hunter's Prey);
 * - the resource rail (classic) shows those, the `cast` ones (Fire Shield's warm or
 *   chill), and a `once` choice only while it is unmade (Primal Order, an item's type),
 *   so it can be made but not swapped; the `creation` ones (a lineage) are the Bio
 *   tab's.
 */
import type { GrantBundle } from "@/lib/grants";

/** One chooser per `bundleKey`: two features can share one (Circle Spells and
 *  Nature's Ward); the first wins and its `selected` is authoritative. */
export function uniqueGrantBundles(bundles: ReadonlyArray<GrantBundle>): GrantBundle[] {
  const seen = new Set<string>();
  return bundles.filter((bundle) => {
    if (seen.has(bundle.bundleKey)) return false;
    seen.add(bundle.bundleKey);
    return true;
  });
}

/** The choices re-made at a rest, one per choice. */
export function restGrantBundles(bundles: ReadonlyArray<GrantBundle>): GrantBundle[] {
  return uniqueGrantBundles(
    bundles.filter((bundle) => bundle.choiceFrequency === "rest")
  );
}

/** The choosers the resource rail shows, one per choice. */
export function railGrantBundles(bundles: ReadonlyArray<GrantBundle>): GrantBundle[] {
  return uniqueGrantBundles(bundles).filter(
    (bundle) =>
      bundle.choiceFrequency === "rest" ||
      bundle.choiceFrequency === "cast" ||
      (bundle.choiceFrequency === "once" && bundle.selected === null)
  );
}
