/**
 * The choices a SPECIES owes, for a character being created AND for one already
 * saved. One source for both: the species' trait grants.
 *
 *   - its `choice-grant-bundle`s (lineage, legacy, ancestry): decided in
 *     `session.grantBundleChoices[bundleKey]`;
 *   - the spellcasting ability its lineage spells use, when any of them defers to
 *     it: `character.speciesSpellAbility`;
 *   - every `choice-*` its traits confer (Elf Keen Senses, Human Skillful): their
 *     picks apply like any other choice, and are RECORDED per slot in
 *     `character.speciesChoices` (tool picks also in `toolChoices`), because a
 *     skill pick on its own merges into `skills` and could not be told apart.
 *
 * A character saved before the record existed reads its trait picks as pending:
 * the sheet asks them once, and nothing is written until the player chooses.
 * The Human Versatile feat is not one of these slots: `humanOriginFeat` holds it.
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
import { speciesNeedsSpellAbility } from "@/lib/species-spell-ability";
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

/** What a saved character's species still owes. */
export interface PendingSpeciesChoices {
  /** Bundle keys with no pick in the session. */
  bundleKeys: string[];
  /** The spellcasting ability its species spells use is still unset. */
  spellAbility: boolean;
  /** The trait slots with no recorded pick. */
  slots: FeatureChoiceSlots;
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
    "race" | "speciesSpellAbility" | "speciesChoices" | "toolChoices"
  >,
  session: Pick<SessionState, "grantBundleChoices">
): PendingSpeciesChoices {
  const raceId = character.race;
  const bundleKeys = speciesBundleKeys(raceId).filter(
    (key) => session.grantBundleChoices?.[key] === undefined
  );
  const spellAbility =
    speciesNeedsSpellAbility(raceId) && character.speciesSpellAbility === undefined;
  const recorded = (slotId: string) =>
    (character.speciesChoices?.[slotId]?.length ?? 0) > 0 ||
    (character.toolChoices?.[slotId]?.length ?? 0) > 0;
  const slots = filterSlots(
    collectChoiceSlots(speciesChoiceSources(raceId)),
    (slotId) => !recorded(slotId)
  );
  const anySlot = Object.values(slots).some((list: unknown[]) => list.length > 0);
  return {
    bundleKeys,
    spellAbility,
    slots,
    any: bundleKeys.length > 0 || spellAbility || anySlot,
  };
}

/**
 * `picks` for the species' `slots` applied to `character` (skills, tools,
 * languages, spells…) and recorded in `speciesChoices`, so they never read as
 * pending again. Picks for other slots are ignored.
 */
export function applySpeciesChoices(
  character: CharacterData,
  slots: FeatureChoiceSlots,
  picks: ChoicePicks
): CharacterData {
  const own = new Set(
    Object.values(slots).flatMap((list: { slotId: string }[]) =>
      list.map((s) => s.slotId)
    )
  );
  const record: Record<string, string[]> = { ...character.speciesChoices };
  for (const byId of Object.values(picks) as Record<string, ReadonlyArray<string>>[]) {
    for (const [slotId, ids] of Object.entries(byId)) {
      if (own.has(slotId) && ids.length > 0) record[slotId] = [...ids];
    }
  }
  if (Object.keys(record).length === Object.keys(character.speciesChoices ?? {}).length) {
    const unchanged = Object.entries(record).every(
      ([id, ids]) => character.speciesChoices?.[id]?.join() === ids.join()
    );
    if (unchanged) return character;
  }
  return { ...applyChoicePicks(character, slots, picks), speciesChoices: record };
}
