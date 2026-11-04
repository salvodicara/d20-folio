/**
 * The choices a SPECIES owes, for a character being created AND for one already
 * saved. One source for both: the species' trait grants.
 *
 *   - its `choice-grant-bundle`s (lineage, legacy, ancestry): decided in
 *     `session.grantBundleChoices[bundleKey]`;
 *   - the spellcasting ability its spells use, when any of them defers to it:
 *     `character.speciesSpellAbility` (unset reads Charisma);
 *   - every `choice-*` its traits confer (Elf Keen Senses, Human Skillful).
 *
 * For a saved character, what is still owed comes from `unresolvedBuildChoices`
 * (the same list the production survey reads): a skill pick from named options
 * counts as made when one of them is proficient, and a pick "from any skill"
 * (Skillful) cannot be told apart from a class's, so it is never asked again.
 * The Human Versatile feat is not one of these slots: `humanOriginFeat` holds it,
 * and a saved Human without one owes it (`feat`).
 *
 * Pure module — no React, no locale reads.
 */
import { SRD_RACES } from "@/data/races";
import {
  applyChoicePicks,
  collectChoiceSlots,
  type ChoicePicks,
  type FeatureChoiceSlots,
} from "@/lib/feature-choices";
import type { GrantSource } from "@/lib/grants";
import { resolveGrantSourcesForRace } from "@/lib/resolve-grant-sources";
import { unresolvedBuildChoices } from "@/lib/unresolved-build-choices";
import type { CharacterData, SessionState } from "@/types/character";

/** The species' trait sources whose `choice-*` grants it owes (Versatile left out). */
export function speciesChoiceSources(raceId: string): GrantSource[] {
  return resolveGrantSourcesForRace(raceId).map((src) => ({
    ...src,
    grants: (src.grants ?? []).filter((g) => g.type !== "choice-feat"),
  }));
}

/** Every `choice-grant-bundle` key on the species' traits (lineage, legacy, ancestry). */
export function speciesBundleKeys(raceId: string): string[] {
  const race = SRD_RACES.find((r) => r.id === raceId);
  return (race?.traits ?? []).flatMap((trait) =>
    (trait.grants ?? []).flatMap((g) =>
      g.type === "choice-grant-bundle" ? [g.bundleKey] : []
    )
  );
}

/** What a saved character's species still owes, ready for the pickers. */
export interface PendingSpeciesChoices {
  /** Bundle keys with no pick in the session. */
  bundleKeys: string[];
  /** The spellcasting ability its species spells use is unset (reads Charisma). */
  spellAbility: boolean;
  /** The trait slots still owed (only the ones the sheet can tell were never made). */
  slots: FeatureChoiceSlots;
  /** The species' origin feat (a Human's Versatile) was never chosen. */
  feat: boolean;
  /** Anything at all is owed. */
  any: boolean;
}

/** A slot list keeping only the slots `keep` accepts. */
function filterSlots(
  slots: FeatureChoiceSlots,
  keep: (slotId: string) => boolean
): FeatureChoiceSlots {
  const by = <T extends { slotId: string }>(list: T[]) =>
    list.filter((s) => keep(s.slotId));
  return {
    skill: by(slots.skill),
    tool: by(slots.tool),
    skillOrTool: by(slots.skillOrTool),
    language: by(slots.language),
    spell: by(slots.spell),
    expertise: by(slots.expertise),
    feat: by(slots.feat),
  };
}

/** The species' own choices a saved character has not made yet. */
export function pendingSpeciesChoices(
  character: Pick<
    CharacterData,
    "race" | "skills" | "humanOriginFeat" | "speciesSpellAbility"
  >,
  session: Pick<SessionState, "grantBundleChoices">
): PendingSpeciesChoices {
  const owed = unresolvedBuildChoices(character, session);
  const bundleKeys = owed.flatMap((c) => (c.kind === "bundle" ? [c.bundleKey] : []));
  const spellAbility = owed.some((c) => c.kind === "species-spell-ability");
  const feat = owed.some((c) => c.kind === "feat");
  // A trait's slots are namespaced `race:<raceId>:<traitId>::…`.
  const traits = new Set(
    owed.flatMap((c) =>
      c.kind === "skill" && c.verifiable ? [`race:${character.race}:${c.traitId}::`] : []
    )
  );
  const slots = filterSlots(
    collectChoiceSlots(speciesChoiceSources(character.race)),
    (slotId) => [...traits].some((prefix) => slotId.startsWith(prefix))
  );
  return {
    bundleKeys,
    spellAbility,
    slots,
    feat,
    any: bundleKeys.length > 0 || spellAbility || feat || traits.size > 0,
  };
}

/** `picks` applied for the given species `slots` only; other slots' picks are ignored. */
export function applySpeciesChoices(
  character: CharacterData,
  slots: FeatureChoiceSlots,
  picks: ChoicePicks
): CharacterData {
  const own = filterSlots(slots, () => true);
  const ids = new Set(
    Object.values(own).flatMap((list: { slotId: string }[]) => list.map((s) => s.slotId))
  );
  const only = (byId: Readonly<Record<string, ReadonlyArray<string>>>) =>
    Object.fromEntries(
      Object.entries(byId).filter(([id, picked]) => ids.has(id) && picked.length > 0)
    );
  const mine: ChoicePicks = {
    skill: only(picks.skill),
    tool: only(picks.tool),
    skillOrTool: only(picks.skillOrTool),
    language: only(picks.language),
    spell: only(picks.spell),
    expertise: only(picks.expertise),
    feat: only(picks.feat),
  };
  const any = Object.values(mine).some(
    (byId: Record<string, ReadonlyArray<string>>) => Object.keys(byId).length > 0
  );
  return any ? applyChoicePicks(character, own, mine) : character;
}
