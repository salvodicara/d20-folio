/**
 * party-stats — derive a DM-dashboard statblock for ONE party member, LIVE from
 * their real character document.
 *
 * Single source of truth (golden rule 6): every number here is recomputed from
 * the member's `CharacterDoc` through the SAME engine helpers the cockpit rail
 * ({@link "@/features/character/hud/LeftHud"}) assembles — `aggregateCharacterGrants`
 * + `compute.ts` scalars + the `lib/views/sheet-view` presenters. NOTHING is read
 * from a denormalized campaign-doc copy (those drift). This is the pure assembly
 * the cockpit does inline, lifted into a reusable, testable function so the DM's
 * party overview and the hero's own sheet can never disagree.
 *
 * i18n-free + React-free (golden rule 7): it returns stable ids (sense/speed
 * kinds, ability codes, condition ids) + numbers; the localized labels are
 * resolved at the React render edge by the card. Pure — no store, no Firebase.
 */

import { totalLevel } from "@/lib/classes";
import {
  abilityModifier,
  ALL_ABILITIES,
  characterHasFeat,
  computeInitiative,
  effectiveAbilityScores,
  effectiveProficiencyBonus,
  flatSaveBonus,
  passiveScore,
  resolveAbilityCheckBonus,
  savingThrowBonus,
} from "@/lib/compute";
import {
  aggregateCharacterGrants,
  effectiveAC,
  effectiveMaxHp,
} from "@/lib/aggregate-character";
import { applyCombatToSession } from "@/lib/combat-state";
import type { CombatState } from "@/types/combat-state";
import type { PcLive } from "@/features/campaigns/encounter-view";
import {
  deriveSensesAndSpeeds,
  mergeSaveProficiencies,
  mergeSkillProficiencies,
  type SenseEntry,
  type SpeedEntry,
} from "@/lib/views/sheet-view";
import { effectiveWalkingSpeedFt } from "@/lib/smart-tracker";
import { getEquipment } from "@/data/equipment";
import type { CharacterDoc } from "@/types/character";
import type { AbilityCode } from "@/data/types";

/** One saving throw, ready for the dashboard's expanded detail. */
export interface PartyMemberSave {
  /** Stable ability code (the `abilities.<code>` i18n key + sort anchor). */
  code: AbilityCode;
  /** The effective bonus (override-first, grant-aware, exhaustion-folded). */
  bonus: number;
  /** Whether the character is proficient in this save (drives the dot/emphasis). */
  proficient: boolean;
}

/**
 * The full DM-glance statblock for a party member — at-a-glance vitals plus the
 * on-demand detail (saves, all passives, all senses/speeds). All localized labels
 * are derived by the consumer from these ids/kinds.
 */
export interface PartyMemberStats {
  level: number;
  ac: number;
  currentHp: number;
  maxHp: number;
  tempHp: number;
  passivePerception: number;
  passiveInsight: number;
  passiveInvestigation: number;
  /** Six saves in canonical ability order. */
  saves: PartyMemberSave[];
  /** Darkvision/blindsight/… with positive range (kind + feet). */
  senses: SenseEntry[];
  /** Non-walking speeds (fly/swim/climb) with positive range. */
  speeds: SpeedEntry[];
  /** Effective walking speed in feet (override-first, grant + armor aware). */
  walkingSpeedFt: number;
  /**
   * The effective initiative BONUS the engine would add to a d20 roll (override-first:
   * `initiativeBonusOverride` wins; else DEX mod + Alert's PB + grant bonuses −
   * exhaustion). The encounter's roll-to-total widget adds this to the player's typed
   * d20 to store the total (the app never rolls). Same chokepoint the cockpit uses
   * (`computeInitiative` over the aggregate — golden rule 6, no forked formula).
   */
  initiativeBonus: number;
  /** Active condition ids (localized to chips at the render edge). */
  conditions: string[];
}

/**
 * Derive the live statblock for `doc`. Mirrors the cockpit rail's exact engine
 * calls; uses the FULL aggregate throughout (the read-only dashboard needs no
 * feature-scoped split — equivalent for display).
 */
export function derivePartyMemberStats(doc: CharacterDoc): PartyMemberStats {
  const charData = doc.character;
  const session = doc.session;
  const aggSession = {
    activeFeatures: session.activeFeatures,
    grantBundleChoices: session.grantBundleChoices,
  };
  const aggregate = aggregateCharacterGrants(charData, aggSession);

  const level = totalLevel(charData);
  const exhaustion = session.exhaustion;
  const pbOverride = charData.proficiencyBonusOverride;
  const effectiveScores = effectiveAbilityScores(
    charData.abilityScores,
    aggregate.abilityScoreFloors,
    aggregate.itemAbilityScoreBonus,
    aggregate.itemAbilityScoreCap
  );

  const displayedSaves = mergeSaveProficiencies(
    charData.savingThrows,
    aggregate.saveProficiencies
  );
  const saveBonusFlat = flatSaveBonus(aggregate, effectiveScores);
  const saves: PartyMemberSave[] = ALL_ABILITIES.map(({ code }) => {
    const proficient = displayedSaves.includes(code);
    const override = charData.savingThrowBonusOverrides?.[code] ?? null;
    const auto = savingThrowBonus(
      effectiveScores[code],
      level,
      proficient,
      null,
      exhaustion,
      pbOverride,
      saveBonusFlat
    );
    return { code, proficient, bonus: override ?? auto };
  });

  const displayedSkills = mergeSkillProficiencies(
    charData.skills,
    aggregate.skillProficiencies,
    aggregate.expertiseSkills,
    aggregate.halfProficiencyAllSkills
  );
  const checkBonusFor = (skillId: string, ability: AbilityCode): number =>
    resolveAbilityCheckBonus(
      aggregate.abilityCheckBonuses,
      skillId,
      ability,
      effectiveScores
    );
  const passive = (
    ability: AbilityCode,
    skill: "perception" | "insight" | "investigation"
  ): number =>
    passiveScore(
      effectiveScores[ability],
      level,
      displayedSkills[skill] ?? null,
      exhaustion,
      pbOverride,
      checkBonusFor(skill, ability)
    );

  const walkingSpeedFt =
    charData.speedOverride ?? effectiveWalkingSpeedFt(doc, getEquipment);
  const { senses, speeds } = deriveSensesAndSpeeds(aggregate, walkingSpeedFt);

  // Initiative BONUS — override-first, else the engine's `computeInitiative` over the
  // ALREADY-built `aggregate` + `effectiveScores` (no second aggregate pass). The same
  // composition the cockpit's CombatHeader/ThisTurnTracker assemble (golden rule 6):
  // DEX mod + Alert's PB + flat/ability grant bonuses, exhaustion folded in.
  const initiativeBonus =
    charData.initiativeBonusOverride ??
    computeInitiative(
      effectiveScores.DEX,
      effectiveProficiencyBonus(level, pbOverride),
      characterHasFeat("alert", {
        humanOriginFeat: charData.humanOriginFeat,
        bgFeat: charData.bgFeat,
        features: charData.features,
      }),
      exhaustion,
      aggregate.initiativeBonusFlat +
        aggregate.initiativeBonusAbilities.reduce(
          (sum, a) => sum + abilityModifier(effectiveScores[a]),
          0
        )
    );

  return {
    level,
    ac: effectiveAC(charData, aggSession),
    currentHp: session.hp.current,
    maxHp: effectiveMaxHp(charData, aggSession),
    tempHp: session.hp.temp,
    passivePerception: passive("WIS", "perception"),
    passiveInsight: passive("WIS", "insight"),
    passiveInvestigation: passive("INT", "investigation"),
    saves,
    senses,
    speeds,
    walkingSpeedFt,
    initiativeBonus,
    conditions: session.conditions,
  };
}

/**
 * Hydrate a member's character doc with their LIVE combat state before any derive —
 * the ONE merge seam (golden rule 6) for the party/encounter live read. The combat
 * trio (current/temp HP · conditions · initiative · death saves) lives in the
 * `combat/state` subdoc, not the parent doc; this folds it back onto an in-memory
 * session so `derivePartyMemberStats` reads the live values. An ABSENT subdoc
 * (`combat === null`) hydrates the full-HP default (a genuinely fresh/undamaged member).
 */
export function hydrateMemberDoc(
  doc: CharacterDoc,
  combat: CombatState | null
): CharacterDoc {
  const max = effectiveMaxHp(doc.character, {
    activeFeatures: doc.session.activeFeatures,
    grantBundleChoices: doc.session.grantBundleChoices,
  });
  return { ...doc, session: applyCombatToSession(doc.session, combat, max) };
}

/**
 * Assemble the LIVE per-PC facts the encounter view consumes — identity (name · race ·
 * classes · portrait) from the parent doc, the moment-to-moment HP / conditions from the
 * `combat/state` subdoc, AC/max HP derived live, and the INITIATIVE ROLL from the
 * campaign's `encounterInit` table (the initiative SSOT — the caller resolves it through
 * `encounterRollFor` and passes the raw d20 here). NEVER a copy off the encounter doc
 * (which holds only the reference). Pure.
 *
 * `initiative` is the TOTAL for turn order — `roll + initiativeBonus` (the table stores
 * only the raw d20; the bonus is engine-derived, override-first, never persisted).
 * `roll === null` = not rolled THIS fight (a fresh encounter starts with an empty table,
 * so stale prior-fight rolls are structurally impossible — no epoch gate needed).
 */
export function derivePcLive(
  doc: CharacterDoc,
  combat: CombatState | null,
  roll: number | null
): PcLive {
  const hydrated = hydrateMemberDoc(doc, combat);
  const stats = derivePartyMemberStats(hydrated);
  return {
    name: doc.character.name,
    ac: stats.ac,
    maxHp: stats.maxHp,
    currentHp: stats.currentHp,
    tempHp: stats.tempHp,
    conditions: stats.conditions,
    initiative: roll === null ? null : roll + stats.initiativeBonus,
    // The roll widget needs the bonus + the RAW roll separately from the total.
    initiativeBonus: stats.initiativeBonus,
    initiativeRoll: roll,
    raceId: doc.character.race,
    classes: doc.character.classes,
    portraitUrl: doc.portraitUrl,
    portraitCrop: doc.portraitCrop,
  };
}

/** Re-export the presenter kinds so the card imports them from one place. */
export type { SenseEntry, SpeedEntry };
