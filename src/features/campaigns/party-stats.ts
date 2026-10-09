/**
 * party-stats — derive a DM-dashboard statblock for ONE party member, LIVE from
 * their real character document.
 *
 * Single source of truth (golden rule 6): every number is a projection of
 * {@link deriveCharacter} over the member's `CharacterDoc` — the same derivation the
 * hero's own sheet agrees with. NOTHING is read from a denormalized campaign-doc copy
 * (those drift), so the DM's party overview and the hero's sheet can never disagree.
 *
 * i18n-free + React-free (golden rule 7): it returns stable ids (sense/speed
 * kinds, ability codes, condition ids) + numbers; the localized labels are
 * resolved at the React render edge by the card. Pure — no store, no Firebase.
 */

import { effectiveMaxHp } from "@/lib/aggregate-character";
import { applyCombatToSession } from "@/lib/combat-state";
import { deriveCharacter } from "@/lib/views/derive-character";
import type { CombatState } from "@/types/combat-state";
import type { PcLive } from "@/features/campaigns/encounter-view";
import type { SenseEntry, SpeedEntry } from "@/lib/views/sheet-view";
import type { CharacterDoc } from "@/types/character";
import type { AbilityCode, ConditionId } from "@/data/types";
import type { DamageDefenses } from "@/lib/damage-intake";
import type { SourceConditionImmunity } from "@/lib/grants";

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
  defenses: DamageDefenses;
  conditionImmunities: ReadonlySet<ConditionId>;
  sourceConditionImmunities: readonly SourceConditionImmunity[];
}

/**
 * Derive the live statblock for `doc` — a projection of {@link deriveCharacter}, the
 * one derivation the player's own sheet agrees with (saves, skills and passives
 * override-first, proficiencies from features as the rail reads them), so the DM's
 * party view can never show a different number than the hero's sheet.
 */
export function derivePartyMemberStats(doc: CharacterDoc): PartyMemberStats {
  const sheet = deriveCharacter(doc);
  return {
    level: sheet.level,
    ac: sheet.ac,
    currentHp: sheet.hp.current,
    maxHp: sheet.hp.max,
    tempHp: sheet.hp.temp,
    passivePerception: sheet.passives.perception,
    passiveInsight: sheet.passives.insight,
    passiveInvestigation: sheet.passives.investigation,
    saves: sheet.saves.map((s) => ({
      code: s.ability,
      bonus: s.bonus,
      proficient: s.proficient,
    })),
    senses: sheet.senses,
    speeds: sheet.speeds,
    walkingSpeedFt: sheet.walkingSpeedFt,
    initiativeBonus: sheet.initiativeBonus,
    conditions: sheet.conditions,
    defenses: sheet.defenses,
    conditionImmunities: sheet.conditionImmunities,
    sourceConditionImmunities: sheet.sourceConditionImmunities,
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
  combat: CombatState | null | undefined
): CharacterDoc | null {
  if (combat === undefined) return null;
  const max = effectiveMaxHp(doc.character, {
    activeFeatures: doc.session.activeFeatures,
    grantBundleChoices: doc.session.grantBundleChoices,
  });
  const hydrated = applyCombatToSession(doc.session, combat, max);
  return hydrated.ok ? { ...doc, session: hydrated.session } : null;
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
  combat: CombatState | null | undefined,
  roll: number | null
): PcLive | null {
  const hydrated = hydrateMemberDoc(doc, combat);
  if (!hydrated) return null;
  const stats = derivePartyMemberStats(hydrated);
  return {
    name: doc.character.name,
    ac: stats.ac,
    maxHp: stats.maxHp,
    currentHp: stats.currentHp,
    tempHp: stats.tempHp,
    conditions: stats.conditions,
    bardicInspirationDie: hydrated.session.bardicInspirationDie,
    heroicInspiration: hydrated.session.inspiration,
    deathSaves: {
      successes: hydrated.session.deathSucc,
      failures: hydrated.session.deathFail,
    },
    initiative: roll === null ? null : roll + stats.initiativeBonus,
    // The roll widget needs the bonus + the RAW roll separately from the total.
    initiativeBonus: stats.initiativeBonus,
    initiativeRoll: roll,
    raceId: doc.character.race,
    classes: doc.character.classes,
    portraitUrl: doc.portraitUrl,
    portraitCrop: doc.portraitCrop,
    defenses: stats.defenses,
    conditionImmunities: stats.conditionImmunities,
    sourceConditionImmunities: stats.sourceConditionImmunities,
  };
}

/** Re-export the presenter kinds so the card imports them from one place. */
export type { SenseEntry, SpeedEntry };
