/**
 * deriveCharacter — the ONE derivation from a stored character (`CharacterDoc`) to its
 * computed sheet: ability scores and modifiers, saves, the 18 skills, passives, AC,
 * HP, initiative, speeds, senses, spellcasting DC/attack, conditions and defenses.
 * It is the Folio Core entry every read-only surface should call (the DM's party
 * view, the PDF, a future public API) instead of re-assembling the engine helpers,
 * so no two surfaces can disagree (golden rule 6).
 *
 * It composes the SAME seams the player's own sheet reads — `deriveSavesAndChecks`
 * (the cockpit rail's saves/skills/passives, override-first), `effectiveAC` /
 * `effectiveMaxHp`, `computeInitiative`, `deriveSensesAndSpeeds`, the
 * `effectiveSpellSaveDc` / `effectiveSpellAttackBonus` pair — over one full grant
 * aggregate; it adds no formula of its own. Pure: no React, no store, no locale
 * (ids and numbers only; labels are the caller's job).
 */

import type { AbilityCode } from "@/data/types";
import { getEquipment } from "@/data/equipment";
import { totalLevel, primaryClassId } from "@/lib/classes";
import {
  abilityModifier,
  ALL_ABILITIES,
  characterHasFeat,
  computeInitiative,
  effectiveAbilityScores,
  effectiveProficiencyBonus,
  effectiveSpellAttackBonus,
  effectiveSpellSaveDc,
  isHeavyArmorEquipped,
  resolveCastingModifier,
  type ProficiencyTier,
} from "@/lib/compute";
import {
  aggregateCharacterGrants,
  effectiveAC,
  effectiveMaxHp,
} from "@/lib/aggregate-character";
import { effectiveWalkingSpeedFt } from "@/lib/smart-tracker";
import {
  deriveSensesAndSpeeds,
  deriveDamageDefenses,
  deriveDefenseKind,
  type SenseEntry,
  type SpeedEntry,
} from "@/lib/views/sheet-view";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import type { DamageDefenses } from "@/lib/damage-intake";
import type { SourceConditionImmunity } from "@/lib/grants";
import type { ConditionId } from "@/data/types";
import type { CharacterDoc } from "@/types/character";

export interface CharacterSheet {
  level: number;
  proficiencyBonus: number;
  /** Effective scores (item floors/bonuses applied) and their modifiers. */
  abilities: Record<AbilityCode, { score: number; modifier: number }>;
  /** Six saves in canonical ability order (override-first). */
  saves: {
    ability: AbilityCode;
    bonus: number;
    proficient: boolean;
    autoFail?: string;
  }[];
  /** The 18 skills (override-first). */
  skills: {
    id: string;
    ability: AbilityCode;
    proficiency: ProficiencyTier;
    bonus: number;
  }[];
  /** Passive scores (override-first). */
  passives: { perception: number; insight: number; investigation: number };
  ac: number;
  hp: { current: number; max: number; temp: number };
  initiativeBonus: number;
  walkingSpeedFt: number;
  /** Non-walking speeds with a positive range (hand-set ranges win). */
  speeds: SpeedEntry[];
  /** Darkvision and kin with a positive range (hand-set ranges win). */
  senses: SenseEntry[];
  /** The primary caster's DC and attack (override-first), or null for a non-caster. */
  spellcasting: { ability: AbilityCode; saveDc: number; attackBonus: number } | null;
  /** Active condition ids, including those riding concentration and encounter effects. */
  conditions: string[];
  defenses: DamageDefenses;
  conditionImmunities: ReadonlySet<ConditionId>;
  sourceConditionImmunities: readonly SourceConditionImmunity[];
}

export function deriveCharacter(doc: CharacterDoc): CharacterSheet {
  const { character, session } = doc;
  const aggSession = {
    activeFeatures: session.activeFeatures,
    grantBundleChoices: session.grantBundleChoices,
    itemResources: session.itemResources,
  };
  const aggregate = aggregateCharacterGrants(character, aggSession);
  const level = totalLevel(character);
  const pbOverride = character.proficiencyBonusOverride;
  const pb = effectiveProficiencyBonus(level, pbOverride);
  const scores = effectiveAbilityScores(
    character.abilityScores,
    aggregate.abilityScoreFloors,
    aggregate.itemAbilityScoreBonus,
    aggregate.itemAbilityScoreCap
  );
  const abilities = Object.fromEntries(
    ALL_ABILITIES.map(({ code }) => [
      code,
      { score: scores[code], modifier: abilityModifier(scores[code]) },
    ])
  ) as CharacterSheet["abilities"];

  // The player's own rail: saves, skills and passives, override-first.
  const rail = deriveSavesAndChecks(character, session);
  const passive = (id: "perception" | "insight" | "investigation"): number => {
    const row = rail.passives.find((p) => p.id === id);
    return row ? (row.override ?? row.computed) : 10;
  };

  const walkingSpeedFt =
    character.speedOverride ?? effectiveWalkingSpeedFt(doc, getEquipment);
  const derived = deriveSensesAndSpeeds(aggregate, walkingSpeedFt);
  // A hand-set range wins (override-first), exactly as the sheet's rail shows it.
  const senses = derived.senses.map((sense) => ({
    ...sense,
    rangeFt: character.senseRangeOverrides?.[sense.kind] ?? sense.rangeFt,
  }));
  const speeds = derived.speeds.map((speed) => ({
    ...speed,
    rangeFt: character.speedOverrides?.[speed.kind] ?? speed.rangeFt,
  }));

  const initiativeBonus =
    character.initiativeBonusOverride ??
    computeInitiative(
      scores.DEX,
      pb,
      characterHasFeat("alert", {
        humanOriginFeat: character.humanOriginFeat,
        bgFeat: character.bgFeat,
        features: character.features,
      }),
      session.exhaustion,
      aggregate.initiativeBonusFlat +
        aggregate.initiativeBonusAbilities.reduce(
          (sum, a) => sum + abilityModifier(scores[a]),
          0
        )
    );

  const sc = character.spellcasting;
  const casterClass = primaryClassId(character);
  const spellcasting = sc
    ? {
        ability: sc.ability,
        saveDc: effectiveSpellSaveDc(
          level,
          scores[sc.ability],
          resolveCastingModifier(aggregate.spellSaveDcBonus, casterClass),
          sc.saveDCOverride,
          pbOverride
        ),
        attackBonus: effectiveSpellAttackBonus(
          level,
          scores[sc.ability],
          resolveCastingModifier(aggregate.spellAttackBonus, casterClass),
          sc.attackBonusOverride,
          session.exhaustion,
          pbOverride
        ),
      }
    : null;

  const defenses = deriveDamageDefenses(
    aggregate,
    {
      resistance: character.damageResistanceOverrides,
      immunity: character.damageImmunityOverrides,
      vulnerability: character.damageVulnerabilityOverrides,
    },
    session.sessionDefenses,
    pb,
    isHeavyArmorEquipped(character.equipment, getEquipment)
  );
  const conditionImmunities = new Set(
    deriveDefenseKind(
      aggregate.conditionImmunities,
      character.conditionImmunityOverrides,
      session.sessionDefenses?.conditionImmunity
    ).effective as ConditionId[]
  );

  return {
    level,
    proficiencyBonus: pb,
    abilities,
    saves: rail.saves.map((s) => ({
      ability: s.id,
      bonus: s.bonus,
      proficient: s.proficient,
      ...(s.autoFailCause ? { autoFail: s.autoFailCause } : {}),
    })),
    skills: rail.skills.map((s) => ({
      id: s.id,
      ability: s.ability,
      proficiency: s.proficiency,
      bonus: s.bonus,
    })),
    passives: {
      perception: passive("perception"),
      insight: passive("insight"),
      investigation: passive("investigation"),
    },
    ac: effectiveAC(character, aggSession),
    hp: {
      current: session.hp.current,
      max: effectiveMaxHp(character, aggSession),
      temp: session.hp.temp,
    },
    initiativeBonus,
    walkingSpeedFt,
    speeds,
    senses,
    spellcasting,
    conditions: effectiveSessionConditions(session),
    defenses,
    conditionImmunities,
    sourceConditionImmunities: aggregate.sourceConditionImmunities,
  };
}
