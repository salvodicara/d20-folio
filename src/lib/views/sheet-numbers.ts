/**
 * The sheet's numbers, each with where it comes from: AC, initiative, walking speed,
 * Proficiency Bonus, max HP, the six saves, the 18 skills, the three passives, the
 * spell save DC and attack, the six effective ability scores, carrying capacity and
 * the two jump distances, every one as `{ total, parts }` (re-foundation phase 2:
 * every number explained).
 *
 * The total is the number the sheet shows, read from {@link deriveCharacter} (the one
 * derivation). The parts are the existing breakdown builders', which sum to it by
 * construction. A hand-set value (an override, a rolled or pinned max HP) keeps the
 * computed parts and adds ONE manual-adjustment part for the difference
 * ({@link withOverride}), so it stays explained and still sums to the total. Parts are
 * null only when the engine has no composition to vouch for (a homebrew class's max
 * HP). Locale-free (the public core exports it); `sheetNumbersView` in
 * ./sheet-numbers-view serves the parts as display lines.
 */
import type { AbilityCode } from "@/data/types";
import { getEquipment } from "@/data/equipment";
import {
  abilityScoreBreakdown,
  aggregateCharacterGrants,
  computeCharacterAcBreakdown,
  computeCharacterMaxHp,
  computedInitiativeBreakdown,
  effectiveMaxHpBreakdown,
} from "@/lib/aggregate-character";
import {
  aggregateAbilityScores,
  buildSpellAttackBreakdown,
  buildSpellSaveDcBreakdown,
  carryingCapacity,
  carryingCapacityBreakdown,
  jumpBreakdown,
  jumpDistance,
  proficiencyBonusBreakdown,
  resolveCastingModifier,
} from "@/lib/compute";
import { primaryClassId, totalLevel } from "@/lib/classes";
import { effectiveWalkingSpeedBreakdown } from "@/lib/smart-tracker";
import { withOverride, type RawBreakdownPart } from "@/lib/value-breakdown";
import { deriveCharacter } from "@/lib/views/derive-character";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import type { CharacterDoc } from "@/types/character";

/** A number and its parts; `parts` is null when there is no composition to explain. */
export interface Explained<Part> {
  total: number;
  parts: Part[] | null;
}

type PassiveId = "perception" | "investigation" | "insight";

export interface SheetNumbers<Part> {
  ac: Explained<Part>;
  initiative: Explained<Part>;
  /** Walking speed in feet. */
  speed: Explained<Part>;
  proficiencyBonus: Explained<Part>;
  maxHp: Explained<Part>;
  /** Six saves in canonical ability order. */
  saves: (Explained<Part> & { ability: AbilityCode })[];
  /** The 18 skills, in the sheet's order. */
  skills: (Explained<Part> & { id: string })[];
  passives: Record<PassiveId, Explained<Part>>;
  /** The primary caster's spell save DC and attack, or null for a non-caster. */
  spellcasting: { saveDc: Explained<Part>; attackBonus: Explained<Part> } | null;
  /** The six EFFECTIVE ability scores (item floors and bonuses, then a pin). */
  abilities: Record<AbilityCode, Explained<Part>>;
  /** Carrying capacity in pounds (push/drag/lift is twice it). */
  carryingCapacity: Explained<Part>;
  /** Running long and high jump in feet. */
  jump: { long: Explained<Part>; high: Explained<Part> };
}

const nonEmpty = (parts: RawBreakdownPart[] | null): RawBreakdownPart[] | null =>
  parts && parts.length > 0 ? parts : null;

/** The computed parts, plus the manual adjustment when the number is hand-set. */
const explained = (
  total: number,
  computed: RawBreakdownPart[],
  overridden: boolean
): Explained<RawBreakdownPart> => ({
  total,
  parts: overridden ? withOverride(computed, total) : nonEmpty(computed),
});

export function sheetNumbers(doc: CharacterDoc): SheetNumbers<RawBreakdownPart> {
  const { character, session } = doc;
  const sheet = deriveCharacter(doc);
  // The same aggregation session deriveCharacter and the sheet's header read.
  const aggSession = {
    activeFeatures: session.activeFeatures,
    grantBundleChoices: session.grantBundleChoices,
    itemResources: session.itemResources,
    fadingPenalties: session.fadingPenalties,
    hpMaxReduction: session.hpMaxReduction,
  };
  const aggregate = aggregateCharacterGrants(character, aggSession);
  const rail = deriveSavesAndChecks(character, session);
  const level = totalLevel(character);

  const passive = (id: PassiveId): Explained<RawBreakdownPart> => {
    const row = rail.passives.find((p) => p.id === id);
    return explained(
      sheet.passives[id],
      row?.breakdownParts ?? [],
      row?.override != null
    );
  };

  // Only a known class has a by-the-book max HP; a stored max off it is hand-set.
  const maxHpParts = effectiveMaxHpBreakdown(character, aggSession);

  // The same inputs deriveCharacter feeds the spell save DC and attack.
  const sc = character.spellcasting;
  const scores = aggregateAbilityScores(
    character.abilityScores,
    aggregate,
    character.abilityScoreOverrides
  );
  const abilities = Object.fromEntries(
    (Object.keys(scores) as AbilityCode[]).map((ability) => [
      ability,
      {
        total: scores[ability],
        parts: abilityScoreBreakdown(
          character.abilityScores,
          aggregate,
          ability,
          character.abilityScoreOverrides?.[ability]
        ),
      },
    ])
  ) as Record<AbilityCode, Explained<RawBreakdownPart>>;
  const carryOptions = {
    asLargerSize: aggregate.carryAsLargerSize,
    pin: character.carryingCapacityOverride,
  };
  const jump = jumpDistance(scores.STR, character.jumpOverrides);
  const jumpParts = jumpBreakdown(scores.STR, character.jumpOverrides);
  const casterClass = primaryClassId(character);
  const spellcasting =
    sc && sheet.spellcasting
      ? {
          saveDc: {
            total: sheet.spellcasting.saveDc,
            parts: buildSpellSaveDcBreakdown({
              level,
              abilityScore: scores[sc.ability],
              ability: sc.ability,
              pbOverride: character.proficiencyBonusOverride,
              override: sc.saveDCOverride,
              castingModifier: resolveCastingModifier(
                aggregate.spellSaveDcBonus,
                casterClass
              ),
            }),
          },
          attackBonus: {
            total: sheet.spellcasting.attackBonus,
            parts: buildSpellAttackBreakdown({
              level,
              abilityScore: scores[sc.ability],
              ability: sc.ability,
              pbOverride: character.proficiencyBonusOverride,
              override: sc.attackBonusOverride,
              castingModifier: resolveCastingModifier(
                aggregate.spellAttackBonus,
                casterClass
              ),
              exhaustion: session.exhaustion,
            }),
          },
        }
      : null;

  return {
    ac: explained(
      sheet.ac,
      computeCharacterAcBreakdown(character, aggregate, session.itemResources),
      character.acOverride != null
    ),
    initiative: explained(
      sheet.initiativeBonus,
      computedInitiativeBreakdown(character, aggregate, session.exhaustion),
      character.initiativeBonusOverride != null
    ),
    speed: explained(
      sheet.walkingSpeedFt,
      effectiveWalkingSpeedBreakdown(doc, getEquipment),
      character.speedOverride != null
    ),
    proficiencyBonus: {
      total: sheet.proficiencyBonus,
      parts: proficiencyBonusBreakdown(level, character.proficiencyBonusOverride),
    },
    maxHp:
      maxHpParts.length === 0
        ? { total: sheet.hp.max, parts: null }
        : explained(
            sheet.hp.max,
            maxHpParts,
            character.hp.max !== computeCharacterMaxHp(character)
          ),
    saves: rail.saves.map((row) => ({
      ability: row.id,
      total: row.bonus,
      parts: row.breakdownParts,
    })),
    skills: rail.skills.map((row) => ({
      id: row.id,
      total: row.bonus,
      parts: row.breakdownParts,
    })),
    passives: {
      perception: passive("perception"),
      investigation: passive("investigation"),
      insight: passive("insight"),
    },
    spellcasting,
    abilities,
    carryingCapacity: {
      total: carryingCapacity(scores.STR, carryOptions).carry,
      parts: carryingCapacityBreakdown(scores.STR, carryOptions),
    },
    jump: {
      long: { total: jump.long, parts: jumpParts.long },
      high: { total: jump.high, parts: jumpParts.high },
    },
  };
}
