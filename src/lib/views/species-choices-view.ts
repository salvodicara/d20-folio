/**
 * The «Scelte da completare» list for a saved character: each species choice it
 * still owes, named for the sheet (the bundle's own label — «Lignaggio elfico»,
 * «Discendenza draconica» — or the trait that asks — «Sensi Acuti»). The ability
 * item carries no name: the presenter labels it.
 */
import type { Locale } from "@/lib/locale";
import { pendingSpeciesChoices } from "@/lib/species-choices";
import type { CharacterData, SessionState } from "@/types/character";
import {
  lineageBundleVMs,
  raceTraitName,
  raceTraitNameOfSlot,
} from "@/lib/views/creation-view";
import { unresolvedBuildChoices } from "@/lib/unresolved-build-choices";

export type PendingSpeciesItem =
  | { kind: "bundle"; bundleKey: string; label: string }
  | { kind: "ability" }
  | { kind: "feat"; label: string }
  | { kind: "slot"; slotId: string; label: string };

export function pendingSpeciesItems(
  character: Pick<
    CharacterData,
    "race" | "skills" | "humanOriginFeat" | "speciesSpellAbility"
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
  if (pending.feat) {
    const trait = unresolvedBuildChoices(character, session).find(
      (c) => c.kind === "feat"
    );
    if (trait?.kind === "feat") {
      items.push({
        kind: "feat",
        label: raceTraitName(character.race, trait.traitId, locale),
      });
    }
  }
  if (pending.spellAbility) items.push({ kind: "ability" });
  for (const list of Object.values(pending.slots) as { slotId: string }[][]) {
    for (const { slotId } of list) {
      items.push({ kind: "slot", slotId, label: raceTraitNameOfSlot(slotId, locale) });
    }
  }
  return items;
}

type Translate = (key: string, args?: Record<string, string>) => string;

/**
 * The banner's sentence: the named choices, then the ability on its own — an unset
 * one already reads Charisma, so it says so («oggi usa Carisma — scegli quella giusta»).
 */
export function speciesChoicesLine(
  items: readonly PendingSpeciesItem[],
  t: Translate,
  locale: Locale
): string {
  const names = items.flatMap((item) => (item.kind === "ability" ? [] : [item.label]));
  const parts = names.length
    ? [
        t("play.speciesChoices.body", {
          items: new Intl.ListFormat(locale, { type: "conjunction" }).format(names),
        }),
      ]
    : [];
  if (items.some((item) => item.kind === "ability")) {
    parts.push(t("play.speciesChoices.abilityNote"));
  }
  return parts.join(" ");
}
