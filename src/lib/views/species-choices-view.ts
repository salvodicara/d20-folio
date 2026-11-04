/**
 * The «Scelte da completare» list for a saved character: each species choice it
 * still owes, named for the sheet (the bundle's own label — «Lignaggio elfico»,
 * «Discendenza draconica» — or the trait that asks — «Sensi Acuti»). The ability
 * item carries no name: the presenter labels it.
 */
import type { Locale } from "@/lib/locale";
import { pendingSpeciesChoices } from "@/lib/species-choices";
import type { CharacterData, SessionState } from "@/types/character";
import { lineageBundleVMs, raceTraitNameOfSlot } from "@/lib/views/creation-view";

export type PendingSpeciesItem =
  | { kind: "bundle"; bundleKey: string; label: string }
  | { kind: "ability" }
  | { kind: "slot"; slotId: string; label: string };

export function pendingSpeciesItems(
  character: Pick<
    CharacterData,
    "race" | "speciesSpellAbility" | "speciesChoices" | "toolChoices"
  >,
  session: Pick<SessionState, "grantBundleChoices">,
  locale: Locale
): PendingSpeciesItem[] {
  const pending = pendingSpeciesChoices(character, session);
  if (!pending.any) return [];
  const bundles = lineageBundleVMs(character.race, locale);
  const items: PendingSpeciesItem[] = pending.bundleKeys.map((bundleKey) => ({
    kind: "bundle",
    bundleKey,
    label: bundles.find((b) => b.bundleKey === bundleKey)?.label ?? bundleKey,
  }));
  if (pending.spellAbility) items.push({ kind: "ability" });
  for (const list of Object.values(pending.slots) as { slotId: string }[][]) {
    for (const { slotId } of list) {
      items.push({ kind: "slot", slotId, label: raceTraitNameOfSlot(slotId, locale) });
    }
  }
  return items;
}
