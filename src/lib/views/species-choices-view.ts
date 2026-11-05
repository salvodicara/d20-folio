/**
 * The «Scelte da completare» list for a saved character: each species choice it
 * still owes, named for the sheet (the bundle's own label — «Lignaggio elfico»,
 * «Discendenza draconica» — or the trait that asks — «Sensi Acuti»). The ability
 * item carries no name: the presenter labels it. A feat that owes the ability its
 * increase raised is named by the feat («Tocco Fatato»). A class pick the level
 * table gives and the build lacks is named with its count and class («4 Suppliche
 * Occulte (Warlock)»).
 */
import type { Locale } from "@/lib/locale";
import { pendingSpeciesChoices } from "@/lib/species-choices";
import type { AbilityCode } from "@/data/types";
import type { SessionState } from "@/types/character";
import type { ClassPickKind } from "@/lib/owed-class-picks";
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
  const pending = pendingSpeciesChoices(character, session);
  if (!pending.any) return classPicks;
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
  return [...items, ...classPicks];
}

type Translate = (key: string, args?: Record<string, string>) => string;

/**
 * The banner's sentence: the named choices, then the ability on its own — an unset
 * one already reads Charisma, so it says so («oggi usa Carisma — scegli quella giusta»)
 * — then the feats that ask which ability their increase raised.
 */
export function speciesChoicesLine(
  items: readonly PendingSpeciesItem[],
  t: Translate,
  locale: Locale
): string {
  const names = items.flatMap((item) =>
    item.kind === "ability" || item.kind === "feat-ability" || item.kind === "class-pick"
      ? []
      : [item.label]
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
  return parts.join(" ");
}
