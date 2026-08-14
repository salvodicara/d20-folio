/** Public projections of the one exact CharacterBuild runtime schema. */

import type { CharacterBuildSchemaShape } from "@/lib/character-build-schema";

export type CharacterBuild = CharacterBuildSchemaShape;
export type CharacterBuildIdentity = CharacterBuild["identity"];
export type CharacterBuildClass = CharacterBuild["classes"][number];
export type CharacterClassChoices = CharacterBuildClass["choices"];
export type CharacterBuildOrigin = CharacterBuild["origin"];
export type CharacterBuildProficiencies = CharacterBuild["proficiencies"];
export type CharacterSkillRank = CharacterBuildProficiencies["skills"][string];

export type CharacterSpellChoice = CharacterBuild["spells"][string];
export type CharacterSpellSource = CharacterSpellChoice["source"];
export type CharacterSpellDefinition = CharacterSpellChoice["definition"];
export type CharacterCustomSpellDefinition = Extract<
  CharacterSpellDefinition,
  { readonly kind: "custom" }
>;

export type CharacterTag = CharacterSpellChoice["tags"][number];
export type CharacterFeatureChoice = CharacterBuild["features"][string];
export type CharacterFeatureSource = CharacterFeatureChoice["source"];
export type CharacterFeatureDefinition = CharacterFeatureChoice["definition"];
export type CharacterCustomFeatureDefinition = Extract<
  CharacterFeatureDefinition,
  { readonly kind: "custom" }
>;
export type CharacterFeatureContentBlock =
  CharacterCustomFeatureDefinition["contentBlocks"][number];
export type CharacterFeatureResource =
  CharacterCustomFeatureDefinition["resources"][string];
export type CharacterFeatureAction = CharacterCustomFeatureDefinition["actions"][number];

export type CharacterBuildOverrides = CharacterBuild["overrides"];
export type CharacterSpellcastingOverrides =
  CharacterBuildOverrides["spellcastingByClass"][string];
export type CharacterInitiativeRollOverride = CharacterBuildOverrides["initiativeRoll"];
export type CharacterLore = CharacterBuild["lore"];
export type CharacterCombatAlgorithmStep = CharacterBuild["combatAlgorithm"][number];
export type CharacterCustomCondition = CharacterBuild["customConditions"][string];

export type CharacterBuildSeed = Pick<
  CharacterBuild,
  "identity" | "classes" | "abilityScores"
>;

export type CharacterBuildParseResult =
  | { readonly ok: true; readonly value: CharacterBuild }
  | { readonly ok: false };
