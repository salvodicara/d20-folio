/**
 * saves-checks-view — the SINGLE, LOCALE-FREE home of the save / skill / passive
 * ROW math.
 *
 * The six saving throws, the 18 skill checks, and the three passive scores are
 * derived here ONCE from the character + its session state, and consumed by the
 * identity-side cockpit rail (`LeftHud` — the medallions + edit-mode override
 * rows + the Senses passives), the SOLE surface that shows them.
 *
 * Keeping the D&D math in ONE view builder (not inline in the component) is the
 * REUSE mandate (golden rule 6): the rail reads every save / skill / passive
 * number from this builder, so its display can never drift from the engine.
 *
 * Presenter seam (R2): engine/view-boundary. Every number is engine-computed via
 * `compute.ts`; every breakdown is a raw {@link RawBreakdownPart} list (i18n-free)
 * the edge localizes with `localizeBreakdown`. Row ids are STABLE (AbilityCode /
 * skill id / passive id) + the auto-fail cause is a stable CONDITION id — never a
 * localized label. Override-first: each row exposes the engine `auto` value and
 * the stored `override`, so the rail's inline override editor keeps working and
 * the displayed `bonus` is `override ?? auto`.
 */

import type { AbilityCode } from "@/data/types";
import type { CharacterData } from "@/types/character";
import type { RawBreakdownPart } from "@/lib/value-breakdown";
import {
  ALL_ABILITIES,
  ALL_SKILLS,
  savingThrowBonus,
  skillBonus,
  passiveScore,
  buildSaveBreakdown,
  buildSkillBreakdown,
  buildPassiveBreakdown,
  effectiveAbilityScores,
  resolveAbilityCheckBonus,
  flatSaveBonus,
  type ProficiencyTier,
} from "@/lib/compute";
import { totalLevel } from "@/lib/classes";
import { evaluateGrants } from "@/lib/grants";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { mergeSkillProficiencies, mergeSaveProficiencies } from "@/lib/views/sheet-view";
import { resolveConditionEffects } from "@/lib/condition-effects";

/**
 * The narrow slice of session state the derivation reads — a structural subset
 * that the full `SessionState` satisfies, so the rail passes a memo-narrowed
 * object (its render isolation, §7.2 — it must NOT re-render on an HP/round
 * change).
 */
export interface SavesChecksSession {
  exhaustion: number;
  activeFeatures?: string[];
  conditions?: string[];
  grantBundleChoices?: Record<string, string>;
}

/** One saving-throw row (STR…CHA), engine-computed + override-first. */
export interface SaveCheckSaveRow {
  /** Stable ability id (STR/DEX/…). */
  id: AbilityCode;
  /** Whether the character is proficient in this save (own + granted). */
  proficient: boolean;
  /** The DISPLAYED bonus = `override ?? auto`. */
  bonus: number;
  /** The engine-computed bonus IGNORING any override (drives the override chip + reset). */
  auto: number;
  /** The stored manual override, if any. */
  override: number | null;
  /** Per-source composition (i18n-free); `null` under an override / single-part. */
  breakdownParts: RawBreakdownPart[] | null;
  /** The FIRST active condition id that auto-fails this save (crimson mark). */
  autoFailCause?: string;
}

/** One skill row (all 18), engine-computed + override-first. */
export interface SaveCheckSkillRow {
  /** Stable skill id (kebab). */
  id: string;
  /** The skill's underlying ability (for the short label). */
  ability: AbilityCode;
  /** Merged proficiency tier (own + granted + expertise + JoaT half). */
  proficiency: ProficiencyTier;
  bonus: number;
  auto: number;
  override: number | null;
  breakdownParts: RawBreakdownPart[] | null;
}

/** One passive score row (Perception/Insight/Investigation). */
export interface SaveCheckPassiveRow {
  /** Stable passive id. */
  id: "perception" | "insight" | "investigation";
  /** The underlying ability (WIS/WIS/INT). */
  ability: AbilityCode;
  /** The i18n key for the label (locale-free — resolved at the edge). */
  labelKey: string;
  /** The character field an override writes to (the rail's edit affordance). */
  field:
    | "passivePerceptionOverride"
    | "passiveInsightOverride"
    | "passiveInvestigationOverride";
  /** The engine-computed passive (10 + check modifier), ignoring any override. */
  computed: number;
  /** The stored manual override, if any. */
  override: number | null;
  /** The DISPLAYED value = `override ?? computed`. */
  bonus: number;
  /** Per-source composition (10 + ability + proficiency + bonuses); always present. */
  breakdownParts: RawBreakdownPart[];
}

/** The full read-out for one character + session. */
export interface SavesAndChecks {
  saves: SaveCheckSaveRow[];
  skills: SaveCheckSkillRow[];
  passives: SaveCheckPassiveRow[];
}

/** The three passive rows' stable descriptors — ability + label key + field. */
const PASSIVES: ReadonlyArray<{
  id: SaveCheckPassiveRow["id"];
  ability: AbilityCode;
  labelKey: string;
  field: SaveCheckPassiveRow["field"];
}> = [
  {
    id: "perception",
    ability: "WIS",
    labelKey: "abilities.passivePerceptionLabel",
    field: "passivePerceptionOverride",
  },
  {
    id: "insight",
    ability: "WIS",
    labelKey: "abilities.passiveInsightLabel",
    field: "passiveInsightOverride",
  },
  {
    id: "investigation",
    ability: "INT",
    labelKey: "abilities.passiveInvestigationLabel",
    field: "passiveInvestigationOverride",
  },
];

/**
 * Map each auto-failed ability to the FIRST active condition that gates it, so a
 * save row can name the cause ("STR saves auto-fail (Stunned)"). The resolver is
 * i18n-free — the returned value is a stable CONDITION id, localized at the edge.
 * Walks conditions in listed order (first-listed condition wins attribution).
 */
function autoFailByAbility(
  conditions: ReadonlyArray<string>
): ReadonlyMap<AbilityCode, string> {
  if (conditions.length === 0) return new Map();
  const out = new Map<AbilityCode, string>();
  for (const id of conditions) {
    for (const code of resolveConditionEffects([id]).autoFailSaves) {
      if (!out.has(code)) out.set(code, id);
    }
  }
  return out;
}

/**
 * Derive the six saves, the 18 skills, and the three passives for a character +
 * session. Pure + locale-free. Mirrors the exact `compute.ts` calls the cockpit
 * rail uses — the ONE home of this math (golden rule 6).
 */
export function deriveSavesAndChecks(
  charData: CharacterData,
  session: SavesChecksSession
): SavesAndChecks {
  const { exhaustion } = session;
  const activeFeatures = session.activeFeatures;
  const conditions = session.conditions ?? [];
  const pbOverride = charData.proficiencyBonusOverride;
  const level = totalLevel(charData);

  // Feature-scoped aggregate → granted skill/save proficiencies; full aggregate →
  // ability-score floors/bonuses + expertise + JoaT + check bonuses. The SAME two
  // aggregates LeftHud threads (mirrored exactly so the numbers can't diverge).
  const aggregate = evaluateGrants(
    resolveGrantSourcesForFeatures(charData.features),
    new Set(activeFeatures ?? [])
  );
  const fullAggregate = aggregateCharacterGrants(charData, {
    activeFeatures,
    grantBundleChoices: session.grantBundleChoices,
  });

  const effectiveScores = effectiveAbilityScores(
    charData.abilityScores,
    fullAggregate.abilityScoreFloors,
    fullAggregate.itemAbilityScoreBonus,
    fullAggregate.itemAbilityScoreCap
  );
  const displayedSaves = mergeSaveProficiencies(
    charData.savingThrows,
    aggregate.saveProficiencies
  );
  const saveBonusFlat = flatSaveBonus(aggregate, effectiveScores);
  const displayedSkills = mergeSkillProficiencies(
    charData.skills,
    aggregate.skillProficiencies,
    fullAggregate.expertiseSkills,
    fullAggregate.halfProficiencyAllSkills
  );
  const checkBonusFor = (skillId: string, ability: AbilityCode): number =>
    resolveAbilityCheckBonus(
      fullAggregate.abilityCheckBonuses,
      skillId,
      ability,
      effectiveScores
    );
  const autoFail = autoFailByAbility(conditions);

  const saves: SaveCheckSaveRow[] = ALL_ABILITIES.map(({ code }) => {
    const proficient = displayedSaves.includes(code);
    const override = charData.savingThrowBonusOverrides?.[code] ?? null;
    // `auto` ignores the override (drives the override chip + reset); `bonus` is
    // the DISPLAYED save = `savingThrowBonus` WITH the override (the medallion's
    // at-rest number — an override still takes the exhaustion penalty, exactly as
    // the rail renders it, so the refactor is byte-identical).
    const auto = savingThrowBonus(
      effectiveScores[code],
      level,
      proficient,
      null,
      exhaustion,
      pbOverride,
      saveBonusFlat
    );
    const bonus = savingThrowBonus(
      effectiveScores[code],
      level,
      proficient,
      override,
      exhaustion,
      pbOverride,
      saveBonusFlat
    );
    const cause = autoFail.get(code);
    return {
      id: code,
      proficient,
      bonus,
      auto,
      override,
      breakdownParts: buildSaveBreakdown({
        ability: code,
        abilityScore: effectiveScores[code],
        level,
        isProficient: proficient,
        override,
        exhaustion,
        pbOverride,
        saveBonus: saveBonusFlat,
      }),
      ...(cause ? { autoFailCause: cause } : {}),
    };
  });

  const skills: SaveCheckSkillRow[] = ALL_SKILLS.map((skill) => {
    const proficiency: ProficiencyTier = displayedSkills[skill.id] ?? null;
    const override = charData.skillBonusOverrides?.[skill.id] ?? null;
    const checkBonus = checkBonusFor(skill.id, skill.ability);
    const auto = skillBonus(
      effectiveScores[skill.ability],
      level,
      proficiency,
      null,
      exhaustion,
      pbOverride,
      checkBonus
    );
    return {
      id: skill.id,
      ability: skill.ability,
      proficiency,
      bonus: override ?? auto,
      auto,
      override,
      breakdownParts: buildSkillBreakdown({
        ability: skill.ability,
        abilityScore: effectiveScores[skill.ability],
        level,
        proficiency,
        override,
        exhaustion,
        pbOverride,
        checkBonus,
      }),
    };
  });

  const passives: SaveCheckPassiveRow[] = PASSIVES.map((p) => {
    const proficiency: ProficiencyTier = displayedSkills[p.id] ?? null;
    const checkBonus = checkBonusFor(p.id, p.ability);
    const computed = passiveScore(
      effectiveScores[p.ability],
      level,
      proficiency,
      exhaustion,
      pbOverride,
      checkBonus
    );
    const overrideField = charData[p.field];
    const override = overrideField ?? null;
    return {
      id: p.id,
      ability: p.ability,
      labelKey: p.labelKey,
      field: p.field,
      computed,
      override,
      bonus: override ?? computed,
      breakdownParts: buildPassiveBreakdown(
        p.ability,
        effectiveScores[p.ability],
        level,
        proficiency,
        exhaustion,
        pbOverride,
        checkBonus
      ),
    };
  });

  return { saves, skills, passives };
}
