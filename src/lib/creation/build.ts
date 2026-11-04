/**
 * The BUILD — a finished {@link CreationDraft} turned into the document a new
 * character is stored as. The one place that assembles `CharacterData` +
 * `SessionState` for creation; the caller only writes it
 * (`createCharacter(uid, payload)`).
 *
 * Pure module — no React, no Firebase, no locale reads.
 */
import { getBackgroundEquipmentOptions } from "@/data/backgrounds";
import {
  resolveStartingEquipment,
  type ToolChoiceContext,
} from "@/data/background-equipment";
import { getEquipment } from "@/data/equipment";
import { asRaceId, backgroundNameById } from "@/data/srd-names";
import type { BackgroundEquipmentOption } from "@/data/types";
import {
  getAlwaysPreparedFromGrants,
  getExpandedSpellsThroughLevel,
  injectExpandedSpells,
} from "@/lib/expanded-spells";
import { applyChoicePicks, type ChoicePicks } from "@/lib/feature-choices";
import { applyLanguagePicks } from "@/lib/feat-language-choices";
import { asAlignmentId } from "@/lib/lore-utils";
import { deriveSpellSlots, highestSpellSlotLevel } from "@/lib/multiclass-slots";
import { nonEmptyString } from "@/lib/non-empty-string";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { subclassSpellcastingState } from "@/lib/subclass-spellcasting";
import type {
  CharacterData,
  CharacterDoc,
  ClassEntry,
  CustomEquipment,
  CustomSpell,
  SessionState,
  SrdEquipmentRef,
  SrdSpellRef,
  SrdWeaponRef,
} from "@/types/character";
import {
  creationFacts,
  draftGrantedFeatures,
  type CreationDraft,
  type CreationFacts,
} from "./draft";

/** What a new character is created with (the fields `createCharacter` stores). */
export type NewCharacterPayload = Pick<
  CharacterDoc,
  "portraitUrl" | "portraitCrop" | "shared" | "status" | "character" | "session"
>;

/** Why a draft cannot be built yet (the UI words each one). */
export type CreationBuildError = "name" | "class" | "subclass";

export type CreationBuildResult =
  | { ok: true; payload: NewCharacterPayload }
  | { ok: false; error: CreationBuildError };

/** Facts about the player that are not part of the draft. */
export interface CreationBuildContext {
  /** The account's display name — its first word prefills the player name. */
  displayName: string | null | undefined;
}

/**
 * Mark an equipment ref as WORN if it's an armor/shield row, so the new
 * character's AC is right immediately (matching the inventory add-item picker).
 * SRD-backed refs only — name-only / custom rows are always carried.
 */
function withArmorEquipped(
  ref: SrdEquipmentRef | CustomEquipment
): SrdEquipmentRef | CustomEquipment {
  if ("custom" in ref) return ref;
  const srd = getEquipment(ref.srdId);
  if (srd?.category === "armor" || srd?.category === "shield") {
    return { ...ref, equipped: true };
  }
  return ref;
}

/**
 * Resolve + MERGE the chosen class and background starting-equipment packages
 * into weapons / equipment / starting gold. The source-agnostic resolver does
 * the item routing and the gold; each source's tool-choice context resolves its
 * own chosen-tool pack member — the SAME context the preview uses, so each tool
 * lands exactly once and matches what the preview showed.
 */
export function mergeStartingEquipment(
  classOptions: ReadonlyArray<BackgroundEquipmentOption>,
  classLabel: string,
  bgOptions: ReadonlyArray<BackgroundEquipmentOption>,
  bgLabel: string,
  classToolChoice: ToolChoiceContext | undefined,
  bgToolChoice: ToolChoiceContext | undefined
): {
  weapons: SrdWeaponRef[];
  equipment: (SrdEquipmentRef | CustomEquipment)[];
  gold: number;
} {
  const cls = resolveStartingEquipment(classOptions, classLabel, classToolChoice);
  const bg = resolveStartingEquipment(bgOptions, bgLabel, bgToolChoice);
  return {
    weapons: [...cls.weapons, ...bg.weapons],
    equipment: [...cls.equipment, ...bg.equipment].map(withArmorEquipped),
    gold: cls.gold + bg.gold,
  };
}

/** Build the stored character for a draft, or say what still blocks it. */
export function buildNewCharacter(
  draft: CreationDraft,
  context: CreationBuildContext
): CreationBuildResult {
  // The branded non-empty name is minted ONCE here — the gate that makes an
  // empty/whitespace name impossible to create.
  const name = nonEmptyString(draft.name);
  if (name === null) return { ok: false, error: "name" };
  const facts = creationFacts(draft);
  const classTable = facts.classTable;
  if (!classTable) return { ok: false, error: "class" };
  if (facts.subclassDue && !draft.subclassId) return { ok: false, error: "subclass" };

  const { level, subclassId } = draft;
  const raceId = facts.raceData?.id ?? draft.raceId;
  const classEntry: ClassEntry = {
    classId: draft.classId,
    ...(subclassId ? { subclassId } : {}),
    level,
  };

  const startingKit = mergeStartingEquipment(
    classTable.startingEquipment,
    facts.classEquipLabel,
    getBackgroundEquipmentOptions(draft.backgroundId),
    facts.bgEquipLabel,
    facts.classToolChoice,
    facts.bgToolChoice
  );

  // Eldritch Knight / Arcane Trickster grant their own (third-caster)
  // spellcasting when the class doesn't cast.
  const subSpell = subclassSpellcastingState(classTable.id, subclassId, level);

  // Class-selected cantrips + spells (prepared), then the subclass's expanded
  // spells, then the always-prepared spells of feature/feat grants.
  let spells: (SrdSpellRef | CustomSpell)[] = [
    ...draft.cantrips.map((id) => ({ srdId: id, prepared: true })),
    ...draft.spells.map((id) => ({ srdId: id, prepared: true })),
  ];
  spells = injectExpandedSpells(
    spells,
    getExpandedSpellsThroughLevel(draft.classId, subclassId, level)
  );
  spells = injectExpandedSpells(
    spells,
    getAlwaysPreparedFromGrants(
      resolveGrantSourcesForFeatures(draftGrantedFeatures(draft, raceId)),
      { level, maxSlotLevel: highestSpellSlotLevel([classEntry]) }
    )
  );

  const character: CharacterData = {
    name,
    quote: "",
    // The stable, branded race ID; display derives from it.
    race: asRaceId(raceId),
    classes: [classEntry],
    background: facts.backgroundData
      ? backgroundNameById(draft.backgroundId)
      : draft.backgroundId,
    alignment: asAlignmentId(draft.alignment),
    // Prefill the player's FIRST name from their account.
    playerName: context.displayName?.trim().split(/\s+/)[0] ?? "",
    speed: String(facts.raceData?.speed ?? 30),
    ac: facts.armorClass,
    acOverride: null,
    armorNote: "Unarmored",
    hp: { max: facts.maxHp },
    hitDieType: classTable.hitDie,
    initiativeBonusOverride: null,
    // Common is seeded; the origin picks append their ids below.
    languageIds: ["common"],
    customLanguages: [],
    // Tool proficiencies are DERIVED from grants and choice picks; these manual
    // lists hold only later hand-added picks.
    toolProficiencyIds: [],
    customToolProficiencies: [],
    abilityBudget: 27,
    proficiencyBonusOverride: null,
    levelUpChecklist: null,
    backgroundAsi: Object.fromEntries(Object.entries(draft.bgAsiChoices)),
    humanOriginFeat: draft.humanFeat,
    bgFeat: facts.backgroundFeat,
    // The INT/WIS/CHA the lineage spells use; absent reads the default (CHA).
    ...(draft.speciesSpellAbility
      ? { speciesSpellAbility: draft.speciesSpellAbility }
      : {}),
    // The species trait picks, recorded per slot (so the sheet never asks them again).
    ...speciesChoiceRecord(facts),
    lore: {
      traits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      backstory: "",
      age: "",
      height: "",
      weight: "",
      eyes: "",
      hair: "",
      skin: "",
    },
    abilityScores: facts.effectiveScores,
    savingThrows: classTable.savingThrows,
    skills: Object.fromEntries(
      [...facts.backgroundSkillIds, ...draft.classSkills].map(
        (id) => [id, "proficient"] as const
      )
    ),
    spellcasting: classTable.spellcasting
      ? {
          ability: classTable.spellcasting.ability,
          preparedCaster: classTable.spellcasting.preparedCaster,
          preparedMax: facts.spellsNeeded,
          saveDCOverride: null,
          attackBonusOverride: null,
        }
      : subSpell
        ? {
            ability: subSpell.ability,
            preparedCaster: true,
            preparedMax: subSpell.preparedMax,
            saveDCOverride: null,
            attackBonusOverride: null,
          }
        : null,
    spellSlots: deriveSpellSlots([classEntry]),
    spells,
    weapons: startingKit.weapons,
    equipment: startingKit.equipment,
    // Only what CLASS grants is stored: species traits resolve from `race`, and
    // origin feats re-derive from the build choices (`raceId: ""` keeps the
    // traits out so they are never double-surfaced).
    features: draftGrantedFeatures(draft, ""),
    combatAlgorithm: [],
    customConditions: [],
    sidebar: [],
  };

  const session: SessionState = {
    hp: { current: facts.maxHp, temp: 0 },
    hitDice: { used: 0 },
    trackers: {},
    spellSlots: {},
    // Starting gold = the chosen class option's GP + the background option's GP.
    currency: { pp: 0, gp: startingKit.gold, ep: 0, sp: 0, cp: 0 },
    concentration: "",
    initiative: "",
    conditions: [],
    deathSucc: 0,
    deathFail: 0,
    inspiration: false,
    exhaustion: 0,
    pinnedActions: [],
    unpinnedActions: [],
    notes: "",
    logEntries: [],
    // The creation-time lineage choices, so the lineage grants start active.
    grantBundleChoices: { ...draft.lineageChoices },
  };

  // Every origin/feature choice (skills, tools, languages, spells, …) in one
  // pass, then the origin languages.
  const finalCharacter = applyLanguagePicks(
    applyChoicePicks(character, facts.choiceSlots, facts.choicePicks),
    draft.languagePicks
  );

  return {
    ok: true,
    payload: {
      portraitUrl: null,
      portraitCrop: null,
      shared: false,
      status: "active",
      character: finalCharacter,
      session,
    },
  };
}

/** `{ speciesChoices }` for the draft's answered species slots (nothing when none). */
function speciesChoiceRecord(facts: CreationFacts): {
  speciesChoices?: Record<string, string[]>;
} {
  const ids = new Set(
    Object.values(facts.speciesChoiceSlots).flatMap((list: { slotId: string }[]) =>
      list.map((slot) => slot.slotId)
    )
  );
  const record: Record<string, string[]> = {};
  const kinds = Object.values(facts.choicePicks) as ChoicePicks["skill"][];
  for (const byId of kinds) {
    for (const [slotId, picked] of Object.entries(byId)) {
      if (ids.has(slotId) && picked.length > 0) record[slotId] = [...picked];
    }
  }
  return Object.keys(record).length > 0 ? { speciesChoices: record } : {};
}
