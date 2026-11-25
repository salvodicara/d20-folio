/**
 * The «Scelte da completare» list for a saved character: each species choice it
 * still owes, named for the sheet (the bundle's own label — «Lignaggio elfico»,
 * «Discendenza draconica» — or the trait that asks — «Sensi Acuti»). The ability
 * item carries no name: the presenter labels it. A feat that owes the ability its
 * increase raised is named by the feat («Tocco Fatato»). A class pick the level
 * table gives and the build lacks is named with its count and class («4 Suppliche
 * Occulte (Warlock)»). A Lore Bard's Magical Discoveries held without their
 * always-prepared mark are named by their spells, the ones to confirm preselected.
 */
import type { Locale } from "@/lib/locale";
import { pendingSpeciesChoices } from "@/lib/species-choices";
import type { AbilityCode } from "@/data/types";
import type { SessionState } from "@/types/character";
import type { ClassPickKind } from "@/lib/owed-class-picks";
import { discoveryPlacesFreed } from "@/lib/magical-discoveries";
import { spellName } from "@/lib/views/level-up-view";
import { owedClassPickLabel } from "@/lib/views/owed-class-picks-view";
import {
  featName,
  lineageBundleVMs,
  raceTraitName,
  raceTraitNameOfSlot,
} from "@/lib/views/creation-view";
import {
  unresolvedBuildChoices,
  type BuildForChoices,
} from "@/lib/unresolved-build-choices";

export type PendingSpeciesItem =
  | { kind: "bundle"; bundleKey: string; label: string }
  | { kind: "ability" }
  | { kind: "feat"; label: string }
  | { kind: "slot"; slotId: string; label: string }
  | {
      kind: "feat-ability";
      featId: string;
      label: string;
      abilities: ReadonlyArray<AbilityCode>;
    }
  | {
      kind: "class-pick";
      classId: string;
      pick: ClassPickKind;
      owed: number;
      label: string;
    }
  | {
      kind: "discovery-mark";
      /** The spells that can be the discoveries, named. */
      candidates: { id: string; label: string }[];
      /** How many to mark (the chips' limit). */
      missing: number;
      /** The ones the row starts with: the first `missing` candidates. */
      preselected: string[];
    };

export function pendingSpeciesItems(
  character: BuildForChoices,
  session: Pick<SessionState, "grantBundleChoices">,
  locale: Locale
): PendingSpeciesItem[] {
  const classPicks = unresolvedBuildChoices(character, session).flatMap((c) =>
    c.kind === "class-pick"
      ? [
          {
            kind: "class-pick" as const,
            classId: c.classId,
            pick: c.pick,
            owed: c.owed,
            label: owedClassPickLabel(c.pick, c.owed, c.classId, locale),
          },
        ]
      : []
  );
  const discoveries = unresolvedBuildChoices(character, session).flatMap((c) =>
    c.kind === "discovery-mark"
      ? [
          {
            kind: "discovery-mark" as const,
            candidates: c.candidates.map((id) => ({ id, label: spellName(id, locale) })),
            missing: c.missing,
            preselected: c.candidates.slice(0, c.missing),
          },
        ]
      : []
  );
  const pending = pendingSpeciesChoices(character, session);
  if (!pending.any) return [...classPicks, ...discoveries];
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
  for (const { featId, abilities } of pending.featAbilities) {
    items.push({
      kind: "feat-ability",
      featId,
      label: featName(featId, locale),
      abilities,
    });
  }
  return [...items, ...classPicks, ...discoveries];
}

type Translate = (key: string, args?: Record<string, unknown>) => string;

/**
 * The Magical Discoveries sentence for the spells `spellIds`: they are your
 * discoveries, and confirming keeps them always prepared and frees N of the Bard's
 * normal prepared places (said only when it frees any). Empty for no spell.
 */
export function discoverySentence(
  character: BuildForChoices,
  spellIds: readonly string[],
  t: Translate,
  locale: Locale
): string {
  if (spellIds.length === 0) return "";
  const spells = new Intl.ListFormat(locale, { type: "conjunction" }).format(
    spellIds.map((id) => spellName(id, locale))
  );
  const freed = discoveryPlacesFreed(
    { classes: character.classes ?? [], spells: character.spells ?? [] },
    spellIds
  );
  return t(
    freed > 0
      ? "play.speciesChoices.discoveryFrees"
      : "play.speciesChoices.discoveryKeeps",
    { count: spellIds.length, spells, freed }
  );
}

/**
 * The banner's sentence: the named choices, then the ability on its own — an unset
 * one already reads Charisma, so it says so («oggi usa Carisma — scegli quella giusta»)
 * — then the feats that ask which ability their increase raised.
 */
export function speciesChoicesLine(
  items: readonly PendingSpeciesItem[],
  t: Translate,
  locale: Locale,
  character: BuildForChoices
): string {
  const names = items.flatMap((item) =>
    item.kind === "bundle" || item.kind === "feat" || item.kind === "slot"
      ? [item.label]
      : []
  );
  const list = (labels: string[]) =>
    new Intl.ListFormat(locale, { type: "conjunction" }).format(labels);
  const parts = names.length
    ? [
        t("play.speciesChoices.body", {
          items: list(names),
        }),
      ]
    : [];
  if (items.some((item) => item.kind === "ability")) {
    parts.push(t("play.speciesChoices.abilityNote"));
  }
  const feats = items.flatMap((item) =>
    item.kind === "feat-ability" ? [item.label] : []
  );
  if (feats.length > 0) {
    parts.push(t("play.speciesChoices.featAbilityNote", { feats: list(feats) }));
  }
  const owed = items.flatMap((item) => (item.kind === "class-pick" ? [item.label] : []));
  if (owed.length > 0) {
    parts.push(t("play.speciesChoices.classBody", { items: list(owed) }));
  }
  const discoveries = items.find((item) => item.kind === "discovery-mark");
  if (discoveries) {
    parts.push(discoverySentence(character, discoveries.preselected, t, locale));
  }
  return parts.join(" ");
}
