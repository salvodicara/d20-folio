/**
 * The sheet's numbers, each with where it comes from: AC, initiative, walking speed,
 * Proficiency Bonus, max HP, the six saves, the 18 skills and the three passives, every
 * one as `{ total, parts }` (re-foundation phase 2: every number explained).
 *
 * The total is the number the sheet shows, read from {@link deriveCharacter} (the one
 * derivation). The parts are the existing breakdown builders', which sum to it by
 * construction. A hand-set value (an override, a rolled or pinned max HP) has no
 * composition to explain, so its parts are null. Locale-free (the public core exports
 * it); `sheetNumbersView` in ./sheet-numbers-view serves the parts as display lines.
 */
import type { AbilityCode } from "@/data/types";
import { getEquipment } from "@/data/equipment";
import {
  aggregateCharacterGrants,
  computeCharacterAcBreakdown,
  computeCharacterMaxHp,
  computedInitiativeBreakdown,
  effectiveMaxHpBreakdown,
} from "@/lib/aggregate-character";
import { proficiencyBonusBreakdown } from "@/lib/compute";
import { totalLevel } from "@/lib/classes";
import { effectiveWalkingSpeedBreakdown } from "@/lib/smart-tracker";
import type { RawBreakdownPart } from "@/lib/value-breakdown";
import { deriveCharacter } from "@/lib/views/derive-character";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import type { CharacterDoc } from "@/types/character";

/** A number and its parts; `parts` is null when the value was set by hand. */
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
}

const nonEmpty = (parts: RawBreakdownPart[] | null): RawBreakdownPart[] | null =>
  parts && parts.length > 0 ? parts : null;

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

  const passive = (id: PassiveId): Explained<RawBreakdownPart> => {
    const row = rail.passives.find((p) => p.id === id);
    return {
      total: sheet.passives[id],
      parts: row && row.override == null ? nonEmpty(row.breakdownParts) : null,
    };
  };

  return {
    ac: {
      total: sheet.ac,
      parts:
        character.acOverride == null
          ? nonEmpty(
              computeCharacterAcBreakdown(character, aggregate, session.itemResources)
            )
          : null,
    },
    initiative: {
      total: sheet.initiativeBonus,
      parts:
        character.initiativeBonusOverride == null
          ? nonEmpty(
              computedInitiativeBreakdown(character, aggregate, session.exhaustion)
            )
          : null,
    },
    speed: {
      total: sheet.walkingSpeedFt,
      parts:
        character.speedOverride == null
          ? nonEmpty(effectiveWalkingSpeedBreakdown(doc, getEquipment))
          : null,
    },
    proficiencyBonus: {
      total: sheet.proficiencyBonus,
      parts: proficiencyBonusBreakdown(
        totalLevel(character),
        character.proficiencyBonusOverride
      ),
    },
    maxHp: {
      total: sheet.hp.max,
      // Only a by-the-book stored max has a composition (as the header's tip gates it).
      parts:
        character.hp.max === computeCharacterMaxHp(character)
          ? nonEmpty(effectiveMaxHpBreakdown(character, aggSession))
          : null,
    },
    saves: rail.saves.map((row) => ({
      ability: row.id,
      total: row.bonus,
      parts: row.override == null ? nonEmpty(row.breakdownParts) : null,
    })),
    skills: rail.skills.map((row) => ({
      id: row.id,
      total: row.bonus,
      parts: row.override == null ? nonEmpty(row.breakdownParts) : null,
    })),
    passives: {
      perception: passive("perception"),
      investigation: passive("investigation"),
      insight: passive("insight"),
    },
  };
}
