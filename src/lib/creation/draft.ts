/**
 * The CREATION DRAFT — the character being built, before it is saved.
 *
 * One pure state + reducer + derivations, shared by every creation surface (the
 * old wizard and the new creation screen): what the player has picked, what is
 * legal, what is still missing, and which steps the journey has. Rules are READ
 * from the engine (`creation-choices`, `feature-choices`, `quickbuild`,
 * `point-buy`, the class/race/background tables); this module only wires them
 * to the draft. The final assembly (draft → stored character) is `./build.ts`.
 *
 * Pure module — no React, no locale reads. Display strings (requirement
 * labels, step titles) are the UI's job: everything here is a stable key.
 */
import { classTables } from "@/data/classes";
import { SRD_RACES } from "@/data/races";
import { SRD_BACKGROUNDS, getBackgroundEquipmentOptions } from "@/data/backgrounds";
import type {
  AbilityCode,
  BackgroundEquipmentOption,
  SrdBackgroundData,
  SrdClassTable,
  SrdRaceData,
} from "@/data/types";
import {
  DEFAULT_QUICKBUILD_CLASS,
  DEFAULT_QUICKBUILD_PRESET,
  QUICKBUILD_PRESETS,
  type QuickbuildPreset,
} from "@/data/quickbuild";
import type { ToolChoiceContext } from "@/data/background-equipment";
import { buildGrantedFeatures } from "@/lib/character-build";
import { abilityModifier, calculateMaxHP, proficiencyBonus } from "@/lib/compute";
import { hpPerLevelGrantBonus } from "@/lib/level-up";
import {
  ORIGIN_LANGUAGE_SLOTS,
  SPECIES_SLOT_PREFIX,
  creationChoiceSlots,
} from "@/lib/creation-choices";
import { speciesNeedsSpellAbility } from "@/lib/species-spell-ability";
import { speciesBundleKeys } from "@/lib/species-choices";
import {
  isAllChoicesComplete,
  partitionChoiceSlotsBySource,
  pruneChoicePicks,
  type ChoicePicks,
  type FeatureChoiceSlots,
} from "@/lib/feature-choices";
import { isSpellChoicesComplete } from "@/lib/feat-spell-choices";
import {
  isLanguagePicksComplete,
  type LanguageChoicePicks,
} from "@/lib/feat-language-choices";
import {
  appliedQuickbuildState,
  backgroundSkillIds,
  reseedForBackground,
  sameAppliedQuickbuild,
  type AppliedQuickbuild,
} from "@/lib/quickbuild";
import {
  toolChoiceContextForBackground,
  toolChoiceContextForClass,
} from "@/lib/resolve-grant-sources";
import { skillNameToId } from "@/lib/skills";
import type { SrdFeatureRef } from "@/types/character";
import { pointBuyRemaining } from "./point-buy";
import { CREATION_STEPS, type CreationStep } from "./steps";
import { toggleLockedPick, togglePick } from "./picks";
import {
  abilityScoreBonusChoiceIsValid,
  effectiveAbilityScores,
  toggleAbilityScoreBonus,
  type AbilityScoreBonusMode,
} from "./ability-bonus";

export { CREATION_STEPS, type CreationStep } from "./steps";

// ─── State ────────────────────────────────────────────────────────────────────

/** How the starting hit points are set: the fixed average, or a rolled total. */
export type HpMethod = "average" | "rolled";

/**
 * Everything the player has decided so far. The build fields are exactly the
 * {@link AppliedQuickbuild} shape (so "has the player sculpted the build?" is a
 * field-by-field comparison); `applied` is the build the draft was last
 * prefilled with, the yardstick for that comparison.
 */
export interface CreationDraft extends AppliedQuickbuild {
  name: string;
  /** The stable alignment id, or "" when not chosen. */
  alignment: string;
  hpMethod: HpMethod;
  rolledHp: number | null;
  /** The build the draft was last prefilled with. */
  applied: AppliedQuickbuild;
}

/** A draft holding `build`, prefilled from it (the `applied` yardstick). */
function draftFromBuild(
  build: AppliedQuickbuild,
  rest: Pick<CreationDraft, "name" | "alignment" | "hpMethod" | "rolledHp">
): CreationDraft {
  return {
    ...build,
    classSkills: [...build.classSkills],
    cantrips: [...build.cantrips],
    spells: [...build.spells],
    lineageChoices: { ...build.lineageChoices },
    ...rest,
    applied: build,
  };
}

/**
 * The draft creation OPENS with: never a blank form — the default class's
 * ready-made build, complete, every control editing it from there.
 */
export function initialCreationDraft(): CreationDraft {
  return draftFromBuild(
    appliedQuickbuildState(DEFAULT_QUICKBUILD_CLASS, DEFAULT_QUICKBUILD_PRESET),
    { name: "", alignment: "", hpMethod: "average", rolledHp: null }
  );
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type CreationDraftAction =
  | { type: "setName"; name: string }
  | { type: "setAlignment"; alignment: string }
  /** Pick a class by hand (guided path): class-dependent picks reset. */
  | { type: "selectClass"; classId: string }
  /** A raw level input (clamped to 1–20): level-dependent picks reset. */
  | { type: "setLevel"; level: number }
  | { type: "setSubclass"; subclassId: string }
  /** A new species: its feat and lineage picks reset. */
  | { type: "selectRace"; raceId: string }
  /** A new background: its ASI + class skills re-seed (unsculpted) or clear. */
  | { type: "selectBackground"; backgroundId: string }
  | { type: "setUsePointBuy"; usePointBuy: boolean }
  | { type: "setAbilityScores"; abilityScores: Record<AbilityCode, number> }
  | { type: "switchAbilityBonusMode"; mode: AbilityScoreBonusMode }
  | { type: "toggleAbilityBonus"; code: AbilityCode }
  | { type: "setLanguagePicks"; picks: LanguageChoicePicks }
  | { type: "setHumanFeat"; featId: string }
  | { type: "setLineageChoice"; bundleKey: string; optionId: string }
  | { type: "setSpeciesSpellAbility"; ability: AbilityCode }
  | { type: "setChoicePicks"; picks: ChoicePicks }
  | { type: "toggleClassSkill"; skillId: string }
  | {
      type: "toggleClassSpell";
      list: "cantrips" | "spells";
      spellId: string;
      limit: number;
    }
  | { type: "setClassEquipment"; label: string }
  | { type: "setBackgroundEquipment"; label: string }
  /** Replace the whole build with a class's preset (the name is never touched). */
  | { type: "applyQuickbuild"; classId: string; preset: QuickbuildPreset }
  | { type: "setHpMethod"; method: HpMethod }
  | { type: "setRolledHp"; rolledHp: number | null };

/** The draft's pure transition function. */
export function creationDraftReducer(
  draft: CreationDraft,
  action: CreationDraftAction
): CreationDraft {
  switch (action.type) {
    case "setName":
      return { ...draft, name: action.name };
    case "setAlignment":
      return { ...draft, alignment: action.alignment };
    case "selectClass":
      // Reset spell + subclass + skill picks when the class changes (on-rails).
      return {
        ...draft,
        classId: action.classId,
        subclassId: "",
        classSkills: [],
        cantrips: [],
        spells: [],
      };
    case "setLevel":
      return {
        ...draft,
        level: Math.max(1, Math.min(20, action.level || 1)),
        subclassId: "",
        cantrips: [],
        spells: [],
      };
    case "setSubclass":
      return { ...draft, subclassId: action.subclassId };
    case "selectRace":
      // A species picked (even the same one again) starts every one of its own
      // decisions fresh: nothing carried from the opening build or an earlier pick.
      return {
        ...draft,
        raceId: action.raceId,
        humanFeat: "",
        lineageChoices: {},
        speciesSpellAbility: "",
        choicePicks: withoutSpeciesPicks(draft.choicePicks),
      };
    case "selectBackground": {
      // A new background brings its own three eligible abilities and its own
      // skill grants, so the prior +2/+1 and class skills cannot simply carry
      // over (no reachable invalid state). A sheet that is still the build it
      // was handed gets them RE-SEEDED for the new background; a sculpted one
      // clears.
      const preset = QUICKBUILD_PRESETS[draft.classId];
      const next = { ...draft, backgroundId: action.backgroundId };
      if (isSculpted(draft) || !preset) {
        return { ...next, classSkills: [], bgAsiChoices: {} };
      }
      const seeded = reseedForBackground(
        draft.classId,
        preset.abilityOrder,
        draft.classSkills,
        action.backgroundId
      );
      return {
        ...next,
        classSkills: seeded.classSkills,
        bgAsiChoices: seeded.bgAsiChoices,
      };
    }
    case "setUsePointBuy":
      return { ...draft, usePointBuy: action.usePointBuy };
    case "setAbilityScores":
      return { ...draft, abilityScores: action.abilityScores };
    case "switchAbilityBonusMode":
      return { ...draft, bgAsiMode: action.mode, bgAsiChoices: {} };
    case "toggleAbilityBonus": {
      const bgAsiChoices = toggleAbilityScoreBonus(
        draft.bgAsiMode,
        draft.bgAsiChoices,
        action.code
      );
      return bgAsiChoices === draft.bgAsiChoices ? draft : { ...draft, bgAsiChoices };
    }
    case "setLanguagePicks":
      return { ...draft, languagePicks: action.picks };
    case "setHumanFeat":
      return { ...draft, humanFeat: action.featId };
    case "setLineageChoice":
      return {
        ...draft,
        lineageChoices: { ...draft.lineageChoices, [action.bundleKey]: action.optionId },
      };
    case "setSpeciesSpellAbility":
      return { ...draft, speciesSpellAbility: action.ability };
    case "setChoicePicks":
      return { ...draft, choicePicks: action.picks };
    case "toggleClassSkill": {
      const classSkills = toggleLockedPick(
        draft.classSkills,
        action.skillId,
        classSkillCount(draft.classId),
        backgroundSkillIds(draft.backgroundId)
      );
      return classSkills === draft.classSkills ? draft : { ...draft, classSkills };
    }
    case "toggleClassSpell":
      return {
        ...draft,
        [action.list]: togglePick(draft[action.list], action.spellId, action.limit),
      };
    case "setClassEquipment":
      return { ...draft, classEquipLabel: action.label };
    case "setBackgroundEquipment":
      return { ...draft, bgEquipLabel: action.label };
    case "applyQuickbuild":
      return draftFromBuild(appliedQuickbuildState(action.classId, action.preset), {
        name: draft.name,
        alignment: draft.alignment,
        hpMethod: draft.hpMethod,
        rolledHp: draft.rolledHp,
      });
    case "setHpMethod":
      return { ...draft, hpMethod: action.method };
    case "setRolledHp":
      return { ...draft, rolledHp: action.rolledHp };
  }
}

// ─── Derivations ──────────────────────────────────────────────────────────────

function classTableOf(classId: string): SrdClassTable | undefined {
  return classTables.find((c) => c.id === classId);
}

function classSkillCount(classId: string): number {
  return classTableOf(classId)?.skillChoices.count ?? 0;
}

/**
 * The creation-time lineage bundles a species asks for (Elven / Gnomish
 * Lineage): the keys of EVERY `choice-grant-bundle` its traits carry. A 2024
 * species decides each one when it is chosen (Elven Lineage, Fiendish Legacy,
 * Draconic and Giant Ancestry), whatever the bundle's `choiceFrequency` says about
 * changing it later; the pick lands in `session.grantBundleChoices` either way.
 */
export function creationLineageBundleKeys(raceId: string): string[] {
  return speciesBundleKeys(raceId);
}

/** The chosen option label, falling back to the first option when stale. */
function effectiveOptionLabel(
  options: ReadonlyArray<BackgroundEquipmentOption>,
  chosen: string
): string {
  return options.some((o) => o.label === chosen) ? chosen : (options[0]?.label ?? chosen);
}

/** The granted feature set a draft confers (class/subclass + species + feats). */
export function draftGrantedFeatures(
  draft: Pick<
    CreationDraft,
    "classId" | "level" | "subclassId" | "humanFeat" | "backgroundId"
  >,
  raceId: string
): SrdFeatureRef[] {
  return buildGrantedFeatures({
    classId: draft.classId,
    level: draft.level,
    subclassId: draft.subclassId,
    raceId,
    originFeat: draft.humanFeat,
    bgFeat: SRD_BACKGROUNDS.find((b) => b.id === draft.backgroundId)?.feat,
  });
}

/** Everything a draft implies — read by the screens, the gates and the build. */
export interface CreationFacts {
  classTable: SrdClassTable | undefined;
  raceData: SrdRaceData | undefined;
  backgroundData: SrdBackgroundData | undefined;
  isHuman: boolean;
  subclassLevel: number;
  /** A subclass is due at this level (and the class has some). */
  subclassDue: boolean;
  /** The background's origin feat slug ("" when none). */
  backgroundFeat: string;

  /** Base scores + the background bonuses, each capped at 20. */
  effectiveScores: Record<AbilityCode, number>;
  pointsRemaining: number;
  abilityBonusValid: boolean;

  /** Skills the background grants — locked, never a class pick. */
  backgroundSkillIds: string[];
  classSkillPool: string[];
  classSkillCount: number;
  skillsComplete: boolean;

  cantripsNeeded: number;
  spellsNeeded: number;
  maxSpellLevel: number;
  hasSpellSlots: boolean;
  isPreparedCaster: boolean;
  /** The class picks cantrips and/or spells at this level. */
  hasClassSpellPicks: boolean;
  cantripsComplete: boolean;
  spellsComplete: boolean;

  /** Every pending `choice-*` slot the build's sources confer. */
  choiceSlots: FeatureChoiceSlots;
  /** The draft's choice picks pruned to the live slots. */
  choicePicks: ChoicePicks;
  /** The slots the Human Versatile feat causes (render under its picker). */
  humanFeatSlots: FeatureChoiceSlots;
  /**
   * Every other slot (background feat + class features + species traits). The
   * species' own slots are ALSO listed in {@link speciesChoiceSlots}, for a
   * screen that asks them on the species step.
   */
  otherChoiceSlots: FeatureChoiceSlots;
  /** The slots the species' traits confer (Elf Keen Senses, Human Skillful). */
  speciesChoiceSlots: FeatureChoiceSlots;
  speciesChoicesComplete: boolean;
  /** The species' lineage spells use an INT/WIS/CHA the player picks. */
  needsSpeciesSpellAbility: boolean;
  humanFeatChoicesComplete: boolean;
  otherChoicesComplete: boolean;
  otherSpellChoicesComplete: boolean;

  languagesComplete: boolean;
  lineageBundleKeys: string[];
  lineageComplete: boolean;

  classEquipmentOptions: ReadonlyArray<BackgroundEquipmentOption>;
  backgroundEquipmentOptions: ReadonlyArray<BackgroundEquipmentOption>;
  classEquipLabel: string;
  bgEquipLabel: string;
  hasStartingEquipment: boolean;
  classToolChoice: ToolChoiceContext | undefined;
  bgToolChoice: ToolChoiceContext | undefined;

  hitDie: number;
  averageHp: number;
  /** Per-level HP grants (Tough, Dwarven Toughness, …) × level. */
  hpBonus: number;
  /** The starting max HP (average or rolled, plus the per-level grants). */
  maxHp: number;
  armorClass: number;
  proficiencyBonus: number;
  spellSaveDc: number | null;

  /** The draft differs from the build it was last prefilled with. */
  sculpted: boolean;
}

/** `picks` without any species-trait pick (ids under {@link SPECIES_SLOT_PREFIX}). */
function withoutSpeciesPicks(picks: ChoicePicks): ChoicePicks {
  const drop = (byId: Readonly<Record<string, ReadonlyArray<string>>>) =>
    Object.fromEntries(
      Object.entries(byId).filter(([id]) => !id.startsWith(SPECIES_SLOT_PREFIX))
    );
  return {
    skill: drop(picks.skill),
    tool: drop(picks.tool),
    skillOrTool: drop(picks.skillOrTool),
    language: drop(picks.language),
    spell: drop(picks.spell),
    expertise: drop(picks.expertise),
    feat: drop(picks.feat),
  };
}

/** The slots of every kind whose namespaced id starts with `prefix`. */
function slotsWithPrefix(slots: FeatureChoiceSlots, prefix: string): FeatureChoiceSlots {
  const keep = <T extends { slotId: string }>(list: T[]) =>
    list.filter((s) => s.slotId.startsWith(prefix));
  return {
    skill: keep(slots.skill),
    tool: keep(slots.tool),
    skillOrTool: keep(slots.skillOrTool),
    language: keep(slots.language),
    spell: keep(slots.spell),
    expertise: keep(slots.expertise),
    feat: keep(slots.feat),
  };
}

/**
 * Every decision the species owes is made: each lineage bundle, the spellcasting
 * ability its lineage spells use, every pick its traits confer, and for a Human
 * the Versatile origin feat with that feat's own picks.
 */
export function speciesStepComplete(draft: CreationDraft, facts: CreationFacts): boolean {
  return (
    facts.lineageComplete &&
    (!facts.needsSpeciesSpellAbility || draft.speciesSpellAbility !== "") &&
    facts.speciesChoicesComplete &&
    (!facts.isHuman || (draft.humanFeat !== "" && facts.humanFeatChoicesComplete))
  );
}

/** Derive every fact of a draft (pure; cheap enough to run per render). */
export function creationFacts(draft: CreationDraft): CreationFacts {
  const classTable = classTableOf(draft.classId);
  const raceData = SRD_RACES.find((r) => r.id === draft.raceId);
  const backgroundData = SRD_BACKGROUNDS.find((b) => b.id === draft.backgroundId);
  const isHuman = draft.raceId === "human";
  const subclassLevel = classTable?.subclassLevel ?? 3;
  const subclassDue =
    draft.level >= subclassLevel && (classTable?.subclasses.length ?? 0) > 0;
  const backgroundFeat = backgroundData?.feat ?? "";

  const effectiveScores = effectiveAbilityScores(draft.abilityScores, draft.bgAsiChoices);

  const bgSkills = backgroundSkillIds(draft.backgroundId);
  const skillCount = classTable ? classTable.skillChoices.count : 0;
  const skillPool = (classTable ? classTable.skillChoices.from : [])
    .map(skillNameToId)
    .filter((id): id is string => id !== null);

  const levelData = classTable?.levels[draft.level - 1];
  const cantripsNeeded = levelData?.cantripsKnown ?? 0;
  const slotRow = levelData?.spellSlots ?? [];
  const hasSpellSlots = slotRow.some((s) => s > 0);
  const maxSpellLevel = slotRow.reduce((max, slots, i) => (slots > 0 ? i + 1 : max), 0);
  const spellsNeeded = levelData?.spellsKnown ?? 0;

  const choiceSlots = creationChoiceSlots({
    classId: draft.classId,
    level: draft.level,
    subclassId: draft.subclassId,
    backgroundId: draft.backgroundId,
    humanFeat: draft.humanFeat,
    bgFeat: backgroundFeat,
    raceId: draft.raceId,
  });
  const choicePicks = pruneChoicePicks(choiceSlots, draft.choicePicks);
  const { caused: humanFeatSlots, rest: otherChoiceSlots } = partitionChoiceSlotsBySource(
    choiceSlots,
    isHuman ? draft.humanFeat : null
  );

  const speciesChoiceSlots = slotsWithPrefix(choiceSlots, SPECIES_SLOT_PREFIX);
  const lineageBundleKeys = creationLineageBundleKeys(draft.raceId);

  const classEquipmentOptions = classTable?.startingEquipment ?? [];
  const backgroundEquipmentOptions = getBackgroundEquipmentOptions(draft.backgroundId);

  const hitDie = classTable?.hitDie ?? 0;
  const averageHp = classTable
    ? calculateMaxHP(classTable.hitDie, effectiveScores.CON, draft.level)
    : 0;
  const hpBonus = classTable
    ? hpPerLevelGrantBonus({
        features: draftGrantedFeatures(draft, raceData?.id ?? draft.raceId),
        humanOriginFeat: draft.humanFeat,
        bgFeat: backgroundFeat,
      }).bonus * draft.level
    : 0;
  const pb = proficiencyBonus(draft.level);

  const classEquipLabel = effectiveOptionLabel(
    classEquipmentOptions,
    draft.classEquipLabel
  );
  const bgEquipLabel = effectiveOptionLabel(
    backgroundEquipmentOptions,
    draft.bgEquipLabel
  );

  return {
    classTable,
    raceData,
    backgroundData,
    isHuman,
    subclassLevel,
    subclassDue,
    backgroundFeat,

    effectiveScores,
    pointsRemaining: pointBuyRemaining(draft.abilityScores),
    abilityBonusValid: abilityScoreBonusChoiceIsValid(
      draft.bgAsiMode,
      draft.bgAsiChoices
    ),

    backgroundSkillIds: bgSkills,
    classSkillPool: skillPool,
    classSkillCount: skillCount,
    skillsComplete: draft.classSkills.length >= skillCount,

    cantripsNeeded,
    spellsNeeded,
    maxSpellLevel,
    hasSpellSlots,
    isPreparedCaster: classTable?.spellcasting?.preparedCaster ?? false,
    hasClassSpellPicks:
      classTable?.spellcasting != null && (cantripsNeeded > 0 || hasSpellSlots),
    cantripsComplete: draft.cantrips.length >= cantripsNeeded,
    spellsComplete: draft.spells.length >= spellsNeeded,

    choiceSlots,
    choicePicks,
    humanFeatSlots,
    otherChoiceSlots,
    speciesChoiceSlots,
    speciesChoicesComplete: isAllChoicesComplete(speciesChoiceSlots, choicePicks),
    needsSpeciesSpellAbility: speciesNeedsSpellAbility(draft.raceId),
    humanFeatChoicesComplete: isAllChoicesComplete(humanFeatSlots, choicePicks),
    otherChoicesComplete: isAllChoicesComplete(otherChoiceSlots, choicePicks),
    otherSpellChoicesComplete: isSpellChoicesComplete(
      otherChoiceSlots.spell,
      choicePicks.spell
    ),

    languagesComplete: isLanguagePicksComplete(
      ORIGIN_LANGUAGE_SLOTS,
      draft.languagePicks
    ),
    lineageBundleKeys,
    lineageComplete: lineageBundleKeys.every(
      (key) => draft.lineageChoices[key] !== undefined
    ),

    classEquipmentOptions,
    backgroundEquipmentOptions,
    classEquipLabel,
    bgEquipLabel,
    hasStartingEquipment:
      classEquipmentOptions.length > 0 || backgroundEquipmentOptions.length > 0,
    classToolChoice: toolChoiceContextForClass(draft.classId, choicePicks.tool),
    bgToolChoice: toolChoiceContextForBackground(draft.backgroundId, choicePicks.tool),

    hitDie,
    averageHp,
    hpBonus,
    maxHp:
      (draft.hpMethod === "rolled" && draft.rolledHp != null
        ? draft.rolledHp
        : averageHp) + hpBonus,
    armorClass: 10 + abilityModifier(effectiveScores.DEX),
    proficiencyBonus: pb,
    spellSaveDc: classTable?.spellcasting
      ? 8 + pb + abilityModifier(effectiveScores[classTable.spellcasting.ability])
      : null,

    sculpted: !sameAppliedQuickbuild(draft.applied, {
      ...appliedFields(draft),
      choicePicks,
      classEquipLabel,
      bgEquipLabel,
    }),
  };
}

/** The draft's build fields (the {@link AppliedQuickbuild} part, raw). */
function appliedFields(draft: CreationDraft): AppliedQuickbuild {
  return {
    classId: draft.classId,
    subclassId: draft.subclassId,
    level: draft.level,
    raceId: draft.raceId,
    backgroundId: draft.backgroundId,
    usePointBuy: draft.usePointBuy,
    abilityScores: draft.abilityScores,
    bgAsiMode: draft.bgAsiMode,
    bgAsiChoices: draft.bgAsiChoices,
    classSkills: draft.classSkills,
    cantrips: draft.cantrips,
    spells: draft.spells,
    languagePicks: draft.languagePicks,
    lineageChoices: draft.lineageChoices,
    humanFeat: draft.humanFeat,
    speciesSpellAbility: draft.speciesSpellAbility,
    choicePicks: draft.choicePicks,
    classEquipLabel: draft.classEquipLabel,
    bgEquipLabel: draft.bgEquipLabel,
  };
}

/** Has the player changed the build since it was last prefilled? */
export function isSculpted(draft: CreationDraft): boolean {
  return creationFacts(draft).sculpted;
}

// ─── Requirements, gates and the journey ────────────────────────────────────

export type CreationRequirementKey =
  | "name"
  | "class"
  | "subclass"
  | "lineage"
  | "humanFeat"
  | "originFeat"
  | "languages"
  | "skills"
  | "spells"
  | "bgAsi";

/** One condition a complete character meets, and the step that fixes it. */
export interface CreationRequirement {
  key: CreationRequirementKey;
  met: boolean;
  step: CreationStep;
}

/**
 * Everything a character needs before it can be created — ONE list drives both
 * the Create gate and the "what's left" explainer, so they can never disagree.
 */
export function creationRequirements(
  draft: CreationDraft,
  facts: CreationFacts = creationFacts(draft)
): CreationRequirement[] {
  return [
    { key: "name", met: !!draft.name.trim(), step: "class" },
    { key: "class", met: !!facts.classTable, step: "class" },
    { key: "subclass", met: !facts.subclassDue || !!draft.subclassId, step: "class" },
    { key: "lineage", met: facts.lineageComplete, step: "race" },
    { key: "humanFeat", met: !facts.isHuman || !!draft.humanFeat, step: "race" },
    {
      key: "originFeat",
      met: facts.humanFeatChoicesComplete && facts.otherChoicesComplete,
      // Where the first incomplete picker actually is: the Human feat's choices
      // expand on the species step, spell picks on the Spells step, every other
      // catch-all choice on the Review step itself.
      step: !facts.humanFeatChoicesComplete
        ? "race"
        : !facts.otherSpellChoicesComplete
          ? "spells"
          : "review",
    },
    // The 2024 origin languages (Common + 2 of your choice).
    { key: "languages", met: facts.languagesComplete, step: "languages" },
    // The class skill proficiencies (trivially met when the class grants none).
    { key: "skills", met: facts.skillsComplete, step: "skills" },
    // A caster begins with its cantrips AND its leveled spells chosen.
    {
      key: "spells",
      met: !facts.hasClassSpellPicks || (facts.cantripsComplete && facts.spellsComplete),
      step: "spells",
    },
    // The 2024 background ability score increase.
    { key: "bgAsi", met: facts.abilityBonusValid, step: "bg-asi" },
  ];
}

/** The requirements still unmet (empty → the character can be created). */
export function missingCreationRequirements(
  draft: CreationDraft,
  facts: CreationFacts = creationFacts(draft)
): CreationRequirement[] {
  return creationRequirements(draft, facts).filter((r) => !r.met);
}

/** Per-step on-rails gate: `true` when the step's own decisions are unfinished. */
export function creationStepBlocked(
  draft: CreationDraft,
  facts: CreationFacts = creationFacts(draft)
): Record<CreationStep, boolean> {
  return {
    class: !facts.classTable || (facts.subclassDue && !draft.subclassId),
    race:
      !facts.lineageComplete ||
      (facts.isHuman && (!draft.humanFeat || !facts.humanFeatChoicesComplete)),
    background: false,
    languages: !facts.languagesComplete,
    skills: !facts.skillsComplete,
    spells: facts.hasClassSpellPicks && !(facts.cantripsComplete && facts.spellsComplete),
    equipment: false,
    "bg-asi": !facts.abilityBonusValid,
    abilities: draft.usePointBuy && facts.pointsRemaining !== 0,
    review: false,
  };
}

/**
 * The steps this build's journey has — it DERIVES from the class: no spells
 * step for a non-caster (unless an origin feat asks spell picks), no equipment
 * step without a starting-equipment table.
 */
export function activeCreationSteps(facts: CreationFacts): CreationStep[] {
  return CREATION_STEPS.filter((id) => {
    if (id === "spells")
      return facts.hasClassSpellPicks || facts.otherChoiceSlots.spell.length > 0;
    if (id === "equipment") return facts.hasStartingEquipment;
    return true;
  });
}
