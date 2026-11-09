/**
 * The variants re-chosen at a rest (Circle of the Land's terrain, Starry Form's
 * constellation, Fire Shield's warm or chill), as the classic ResourceRail lists them
 * and the new Play screen's rest model reads them: the `rest`-frequency grant bundles
 * (the `creation` ones, such as a lineage, belong to the Bio tab), one per choice.
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

/** The rest-frequency variants, one per choice. */
export function restGrantBundles(bundles: ReadonlyArray<GrantBundle>): GrantBundle[] {
  return uniqueGrantBundles(
    bundles.filter((bundle) => bundle.choiceFrequency === "rest")
  );
}
