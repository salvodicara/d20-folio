/**
 * Combat resolution — the locale-free plan shared by SOLO play and encounters.
 *
 * The table supplies facts the app cannot observe (targets, hit/save results and
 * rolled totals). This module derives every deterministic consequence from the
 * action's structured data: target shape, save behaviour, damage components,
 * defenses, healing, condition cures and self-only effects. React/Firebase never
 * participate in the rules math, so every surface consumes the same plan.
 */

import type {
  AbilityCode,
  CombatConditionLifetime,
  CreatureType,
  DamageSource,
} from "@/data/types";
import type { DamageType } from "@/types/damage";
import {
  NO_DEFENSES,
  resolveDamageIntake,
  type DamageDefenses,
  type ResolvedDamageIntake,
} from "@/lib/damage-intake";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import type { LocText } from "@/lib/loc-text";

export type CombatResolutionKind = "attack" | "save" | "attack-save" | "automatic";
export type CombatTargetAffinity = "enemy" | "ally" | "self" | "any";
export type SaveDamageOutcome = "half" | "none";
export type CombatResolutionOwner = "legacy" | "effect-program";

export interface CombatStandingEffectSpec {
  source: ActiveCombatEffect["source"];
  payload: ActiveCombatEffect["payload"];
  /** Encounter IO turns these relative lifetime facts into the stored duration. */
  lifetime: {
    concentration: boolean;
    maxRounds?: number;
    turnBoundary?: { phase: "turn-start" | "turn-end"; turns: number };
  };
  requiresAppliedTempHp?: true;
}

export interface CombatResolutionSpec {
  /** Exclusive mutation route. Effect-program ownership forbids legacy commits. */
  resolutionOwner: CombatResolutionOwner;
  kind: CombatResolutionKind;
  attackMode?: "melee" | "ranged";
  targetCap: number;
  area: boolean;
  hasDamage: boolean;
  damageReduction?: NonNullable<ResolvedAction["summary"]["damageReduction"]>;
  hasHealing: boolean;
  hasTempHp: boolean;
  hasGrantedDie: boolean;
  hasHeroicInspiration: boolean;
  stabilizes: boolean;
  conditionRemoval?: { options: string[]; max?: number };
  /** A variable healing pool paid by the reviewed outcome itself. Dice pools are
   * configured before this resolver; HP pools derive their exact debit here. */
  poolSpend?: {
    remaining: number;
    unit?: string;
    conditionCosts: Readonly<Record<string, number>>;
  };
  healingMode?: "full" | "maximum";
  effectPool?: number;
  sharedAmount: boolean;
  targetAffinity: CombatTargetAffinity;
  excludeSelf: boolean;
  /** Hard legal-target gate. The resolver never lets its show-all affordance
   * bypass an authored creature-type restriction. */
  targetCreatureTypes?: ReadonlyArray<CreatureType>;
  conditionApplication?: {
    options: string[];
    max?: number;
    /** `passed-check` (Hide's Invisible on a passed Stealth check) resolves in
     *  the mechanics engine; this legacy resolver treats it as automatic. */
    on: "hit" | "failed-save" | "automatic" | "passed-check";
    lifetime?: CombatConditionLifetime;
    lifetimes?: Partial<Record<string, CombatConditionLifetime>>;
  };
  standingEffect?: CombatStandingEffectSpec;
  /** What a successful save does to the entered damage. Default is no damage. */
  damageOnSave: SaveDamageOutcome;
}

/**
 * Resolve the exclusive target/effect mutation owner. Either half of the authored
 * route is enough to retain program ownership: a malformed transform therefore
 * fails in the program path instead of silently falling back to legacy mutations.
 */
export function combatResolutionOwner(
  action: Pick<ResolvedAction, "effectProgram" | "effectResolutionOwner">
): CombatResolutionOwner {
  return action.effectProgram !== undefined ||
    action.effectResolutionOwner === "effect-program"
    ? "effect-program"
    : "legacy";
}

export interface CombatDamagePartSpec {
  id: string;
  formula: string;
  /** One fixed type, a player choice, or a table-declared type for an irregular effect. */
  damageTypes: ReadonlyArray<DamageType>;
  typeMode: "fixed" | "choice" | "table";
  source?: DamageSource;
  /** Conditional riders are opt-in; the resolver never assumes their trigger fired. */
  optional: boolean;
  /** Optional rider provenance and its once-per-use resource. */
  sourceName?: string;
  sourceLoc?: LocText;
  resourceTrackerId?: string;
  round1?: true;
  requiresRiderTrackerId?: string;
  targetCreatureTypes?: ReadonlyArray<CreatureType>;
  /** The table fact that gates this component. Hybrid actions can therefore
   * resolve an attack component and a save component independently. */
  resolution: "attack" | "save" | "automatic";
  /** Save ability for target-owned response rules such as Evasion. */
  saveAbility?: AbilityCode;
  /** A split-area primary applies only to the first declared target. */
  target: "primary" | "all" | "one-roll";
  /** One entered roll is reused for every target of this component. */
  sharedAmount: boolean;
  damageOnSave: SaveDamageOutcome;
  damageOnMiss: "half" | "none";
  /** Graze and similar deterministic miss effects. Ordinary parts apply on success. */
  appliesOn: "success" | "miss";
  /** Present when no die entry is needed (for example Graze's ability modifier). */
  fixedAmount?: number;
}

/** Human-readable formula for a feature action's rolled Temporary HP. */
export function tempHpRollFormula(
  roll: NonNullable<ResolvedAction["summary"]["tempHpRoll"]>
): string {
  const multiplied =
    roll.multiplier !== undefined && roll.multiplier !== 1
      ? `${roll.multiplier}×(${roll.dice})`
      : roll.dice;
  if (!roll.bonus) return multiplied;
  return `${multiplied}${roll.bonus > 0 ? "+" : ""}${roll.bonus}`;
}

export interface EnteredCombatDamagePart {
  spec: CombatDamagePartSpec;
  amount: number;
  damageType?: DamageType;
  /** Zero-based hit/ray/missile occurrence. Parts without one belong to the
   * first occurrence, which is where once-per-use riders are resolved. */
  instance?: number;
}

export type CombatOutcome = "hit" | "miss" | "failed-save" | "saved" | "automatic";

export interface CombatTargetOutcome {
  attack: "hit" | "miss";
  save: "failed-save" | "saved";
}

function actionHasDamage(action: ResolvedAction): boolean {
  if (
    action.summary.resolveOnCast === false &&
    !action.summary.recurringUse &&
    action.standingEffect
  ) {
    return false;
  }
  const s = action.summary;
  return Boolean(
    s.damage ||
    s.secondaryDamage ||
    (s.extraDamage && s.extraDamage.length > 0) ||
    s.masteryDetail?.grazeDamage
  );
}

/** Stable CONDITION ids this action can apply. The register grows through modeled
 * capabilities, never through spell-name checks or prose parsing. */
export function actionRiderConditions(action: ResolvedAction): string[] {
  return action.summary.masteryDetail?.toppleDc !== undefined ? ["prone"] : [];
}

function actionHasHealing(action: ResolvedAction): boolean {
  const s = action.summary;
  return Boolean(
    s.healingMode !== "consumable" &&
    (s.healing ||
      s.healApply ||
      s.poolSpendEffect === "healing" ||
      s.healingMode === "full" ||
      s.healingPool !== undefined)
  );
}

function actionHasTempHp(action: ResolvedAction): boolean {
  return Boolean(
    action.summary.tempHpApply ||
    action.summary.tempHpRoll ||
    action.summary.tempHpPool !== undefined
  );
}

/** Compile the flat action summary into the one capability plan every UI consumes. */
export function combatResolutionSpec(action: ResolvedAction): CombatResolutionSpec {
  const s = action.summary;
  const area = s.area === true || s.secondaryDamage?.area === true;
  const instances = Math.max(1, s.instances ?? 1);
  const hasAttack = s.attackBonus !== undefined || action.source === "weapon";
  const hasSave = Boolean(s.saveAbility || s.saveDC);
  const kind: CombatResolutionKind = hasAttack
    ? hasSave
      ? "attack-save"
      : "attack"
    : hasSave
      ? "save"
      : "automatic";
  const hasDamage = actionHasDamage(action) || s.damageReduction !== undefined;
  const hasHealing = actionHasHealing(action);
  const hasTempHp = actionHasTempHp(action);
  const hasGrantedDie = s.grantedDie !== undefined;
  const hasHeroicInspiration = s.grantsHeroicInspiration === true;
  const stabilizes = s.stabilize === true;
  const poolSpend =
    s.poolSpendEffect === "healing" && action.costTrackerIsPool && s.uses
      ? {
          remaining: s.uses.current,
          ...(action.costTrackerUnit ? { unit: action.costTrackerUnit } : {}),
          conditionCosts: Object.fromEntries(
            (s.cureOptions ?? []).map(({ condition, costHp }) => [condition, costHp])
          ),
        }
      : undefined;
  const masteryRiders = actionRiderConditions(action);
  const conditionApplication =
    s.conditionApplication ??
    (masteryRiders.length > 0
      ? { options: masteryRiders, on: "hit" as const }
      : undefined);
  const conditionRemoval =
    s.conditionRemoval ??
    (s.cureOptions?.length
      ? { options: s.cureOptions.map(({ condition }) => condition) }
      : undefined);
  const standingPayload: ActiveCombatEffect["payload"] | undefined = action.standingEffect
    ? action.standingEffect.markScope
      ? {
          kind: "target-mark",
          activeKey: action.standingEffect.activeKey,
          scope: action.standingEffect.markScope,
        }
      : { kind: "grant-group", activeKey: action.standingEffect.activeKey }
    : undefined;
  const standingEffect =
    action.standingEffect && standingPayload
      ? {
          source: {
            kind: action.standingEffect.sourceKind ?? ("spell" as const),
            id: action.standingEffect.sourceId,
            actionId: action.id,
            ...(action.slotLevel !== undefined ? { castLevel: action.slotLevel } : {}),
          },
          payload: standingPayload,
          lifetime: {
            concentration: action.concentration,
            ...(action.standingEffect.maxRounds !== undefined
              ? { maxRounds: action.standingEffect.maxRounds }
              : {}),
            ...(action.standingEffect.turnBoundary
              ? { turnBoundary: action.standingEffect.turnBoundary }
              : {}),
          },
          ...(action.standingEffect.requiresAppliedTempHp
            ? { requiresAppliedTempHp: true as const }
            : {}),
        }
      : undefined;
  const targetAffinity: CombatTargetAffinity =
    action.standingEffect?.targetAffinity ??
    (s.targeting?.affinity === "self"
      ? "self"
      : s.targeting?.affinity === "ally" ||
          (!s.targeting && (hasHealing || stabilizes || s.conditionRemoval !== undefined))
        ? "ally"
        : hasTempHp && !s.targeting
          ? "self"
          : s.targeting?.affinity === "any"
            ? "any"
            : "enemy");

  return {
    resolutionOwner: combatResolutionOwner(action),
    kind,
    ...(s.attackMode ? { attackMode: s.attackMode } : {}),
    targetCap:
      targetAffinity === "self"
        ? 1
        : (s.targeting?.maxTargets ??
          (s.targeting && !s.targeting.maxTargets
            ? Infinity
            : area
              ? Infinity
              : instances)),
    area,
    hasDamage,
    ...(s.damageReduction ? { damageReduction: s.damageReduction } : {}),
    hasHealing,
    hasTempHp,
    hasGrantedDie,
    hasHeroicInspiration,
    stabilizes,
    ...(s.healingMode === "full" || s.healingMode === "maximum"
      ? { healingMode: s.healingMode }
      : {}),
    ...(s.healingPool !== undefined || s.tempHpPool !== undefined
      ? { effectPool: s.healingPool ?? s.tempHpPool }
      : {}),
    sharedAmount: s.area === true || s.targeting?.sharedAmount === true,
    ...(conditionRemoval ? { conditionRemoval } : {}),
    ...(poolSpend ? { poolSpend } : {}),
    ...(conditionApplication ? { conditionApplication } : {}),
    ...(standingEffect ? { standingEffect } : {}),
    targetAffinity,
    excludeSelf: action.standingEffect?.excludeSelf ?? s.targeting?.excludeSelf === true,
    ...(s.targeting?.creatureTypes
      ? { targetCreatureTypes: s.targeting.creatureTypes }
      : {}),
    damageOnSave: s.damageOnSave ?? "none",
  };
}

/** Open a resolver whenever an action has a target-facing or self-applied consequence. */
export function shouldResolveCombatAction(action: ResolvedAction): boolean {
  // Program ownership is sufficient even when the legacy summary has no scalar
  // consequence. The interpreter, not this compatibility planner, owns its phases.
  if (combatResolutionOwner(action) === "effect-program") return true;
  if (
    action.summary.resolveOnCast === false &&
    !action.summary.recurringUse &&
    !action.standingEffect
  )
    return false;
  const spec = combatResolutionSpec(action);
  return Boolean(
    spec.hasDamage ||
    spec.hasHealing ||
    spec.hasTempHp ||
    spec.hasGrantedDie ||
    spec.hasHeroicInspiration ||
    spec.stabilizes ||
    spec.conditionRemoval ||
    spec.conditionApplication ||
    spec.standingEffect ||
    spec.kind !== "automatic"
  );
}

/** SOLO has no modeled opponents. Resolve only consequences the app can apply to the
 * current hero; enemy damage/save declarations remain at the physical table. */
export function shouldResolveSoloAction(action: ResolvedAction): boolean {
  // A program-owned action must never fall through to the one-tap legacy commit.
  // The program resolver may still reject an unavailable external target safely.
  if (combatResolutionOwner(action) === "effect-program") return true;
  if (action.summary.resolveOnCast === false && !action.summary.recurringUse)
    return false;
  const spec = combatResolutionSpec(action);
  return (
    spec.targetAffinity !== "enemy" &&
    !(spec.excludeSelf && spec.targetAffinity === "ally") &&
    (spec.hasHealing ||
      spec.hasTempHp ||
      spec.hasGrantedDie ||
      spec.hasHeroicInspiration ||
      spec.stabilizes ||
      spec.damageReduction !== undefined ||
      spec.conditionRemoval !== undefined ||
      spec.conditionApplication !== undefined)
  );
}

function damageTypeShape(
  action: ResolvedAction
): Pick<CombatDamagePartSpec, "damageTypes" | "typeMode"> {
  const s = action.summary;
  if (s.damageTypes && s.damageTypes.length > 0) {
    return {
      damageTypes: s.damageTypes as DamageType[],
      typeMode: s.multiDamageTypeFlavor === "choice" ? "choice" : "table",
    };
  }
  return {
    damageTypes: s.damageType ? [s.damageType as DamageType] : [],
    typeMode: "fixed",
  };
}

/** The damage entry rows for an action. Every typed component remains separate so
 * resistance/immunity/vulnerability math is applied per component, never to a sum. */
export function combatDamageParts(action: ResolvedAction): CombatDamagePartSpec[] {
  if (
    action.summary.resolveOnCast === false &&
    !action.summary.recurringUse &&
    action.standingEffect
  )
    return [];
  const s = action.summary;
  const source: DamageSource | undefined =
    action.source === "spell" ? "spell" : undefined;
  const primaryTypes = damageTypeShape(action);
  const hasAttack = s.attackBonus !== undefined || action.source === "weapon";
  const hasSave = Boolean(s.saveAbility || s.saveDC);
  const primaryResolution =
    s.damageResolution ?? (hasAttack ? "attack" : hasSave ? "save" : "automatic");
  const splitArea =
    s.primaryTargetOnly === true || (s.secondaryDamage?.area === true && s.area !== true);
  const parts: CombatDamagePartSpec[] = [];
  if (s.damage) {
    parts.push({
      id: "primary",
      formula: s.damage,
      ...primaryTypes,
      ...(source ? { source } : {}),
      optional: false,
      resolution: primaryResolution,
      ...(primaryResolution === "save" && s.saveAbility
        ? { saveAbility: s.saveAbility as AbilityCode }
        : {}),
      target: splitArea ? "primary" : "all",
      sharedAmount: s.area === true || s.targeting?.sharedAmount === true,
      damageOnSave: s.damageOnSave ?? "none",
      damageOnMiss: s.damageOnMiss ?? "none",
      appliesOn: "success",
    });
  }
  if (s.oneRollDamageBonus && s.oneRollDamageBonus > 0) {
    parts.push({
      id: "one-roll-bonus",
      formula: `+${s.oneRollDamageBonus}`,
      ...primaryTypes,
      ...(source ? { source } : {}),
      optional: false,
      resolution: primaryResolution,
      target: "one-roll",
      sharedAmount: false,
      damageOnSave: s.damageOnSave ?? "none",
      damageOnMiss: s.damageOnMiss ?? "none",
      appliesOn: "success",
      fixedAmount: s.oneRollDamageBonus,
    });
  }
  if (s.secondaryDamage) {
    parts.push({
      id: "secondary",
      formula: s.secondaryDamage.dice,
      damageTypes: [s.secondaryDamage.damageType as DamageType],
      typeMode: "fixed",
      ...(source ? { source } : {}),
      optional: false,
      resolution:
        s.secondaryDamage.resolution ??
        (hasAttack && hasSave ? "save" : primaryResolution),
      ...(s.saveAbility ? { saveAbility: s.saveAbility as AbilityCode } : {}),
      target: "all",
      sharedAmount: s.secondaryDamage.area === true,
      damageOnSave: s.secondaryDamage.damageOnSave ?? s.damageOnSave ?? "none",
      damageOnMiss: s.secondaryDamage.damageOnMiss ?? "none",
      appliesOn: "success",
    });
  }
  for (const [index, extra] of (s.extraDamage ?? []).entries()) {
    const riderTypes = extra.damageTypeChoices?.length
      ? [...extra.damageTypeChoices]
      : [extra.damageType as DamageType];
    parts.push({
      id: `extra-${index}`,
      formula: extra.dice,
      damageTypes: riderTypes,
      typeMode: extra.damageTypeChoices?.length ? "choice" : "fixed",
      ...(source ? { source } : {}),
      optional: true,
      ...(extra.sourceName ? { sourceName: extra.sourceName } : {}),
      ...(extra.sourceLoc ? { sourceLoc: extra.sourceLoc } : {}),
      ...(extra.resourceTrackerId ? { resourceTrackerId: extra.resourceTrackerId } : {}),
      ...(extra.round1 ? { round1: true as const } : {}),
      ...(extra.requiresRiderTrackerId
        ? { requiresRiderTrackerId: extra.requiresRiderTrackerId }
        : {}),
      ...(extra.targetCreatureTypes
        ? { targetCreatureTypes: extra.targetCreatureTypes }
        : {}),
      resolution: primaryResolution,
      ...(primaryResolution === "save" && s.saveAbility
        ? { saveAbility: s.saveAbility as AbilityCode }
        : {}),
      target: "all",
      sharedAmount: false,
      damageOnSave: s.damageOnSave ?? "none",
      damageOnMiss: s.damageOnMiss ?? "none",
      appliesOn: "success",
      ...(extra.fixedAmount !== undefined ? { fixedAmount: extra.fixedAmount } : {}),
    });
  }
  const graze = s.masteryDetail?.grazeDamage;
  if (graze !== undefined && graze > 0) {
    parts.push({
      id: "graze",
      formula: String(graze),
      ...primaryTypes,
      optional: false,
      resolution: "attack",
      target: "all",
      sharedAmount: false,
      damageOnSave: "none",
      damageOnMiss: "none",
      appliesOn: "miss",
      fixedAmount: graze,
    });
  }
  return parts;
}

export function combatDamagePartApplies(
  part: CombatDamagePartSpec,
  outcome: CombatTargetOutcome,
  damageOnSave: SaveDamageOutcome
): boolean {
  const resolved: CombatOutcome =
    part.resolution === "attack"
      ? outcome.attack
      : part.resolution === "save"
        ? outcome.save
        : "automatic";
  if (resolved === "miss")
    return part.appliesOn === "miss" || part.damageOnMiss === "half";
  if (part.appliesOn === "miss") return false;
  return resolved !== "saved" || part.damageOnSave === "half" || damageOnSave === "half";
}

/** Resolve the entered damage against an outcome and the target's live defenses. Save
 * halving happens before defense math; each typed component is then resolved separately. */
export function resolveCombatDamage(
  parts: ReadonlyArray<EnteredCombatDamagePart>,
  outcome: CombatTargetOutcome,
  damageOnSave: SaveDamageOutcome,
  defenses: DamageDefenses = NO_DEFENSES
): ResolvedDamageIntake {
  const entered = parts.flatMap(({ spec, amount, damageType }) => {
    const resolved: CombatOutcome =
      spec.resolution === "attack"
        ? outcome.attack
        : spec.resolution === "save"
          ? outcome.save
          : "automatic";
    const applies = combatDamagePartApplies(spec, outcome, damageOnSave);
    if (!applies && resolved !== "saved") return [];
    const saveHalf = spec.damageOnSave === "half" || damageOnSave === "half";
    const saveDamageRule =
      spec.resolution === "save" && spec.saveAbility && saveHalf
        ? defenses.saveDamageRules.find((rule) => rule.ability === spec.saveAbility)
        : undefined;
    if (resolved === "saved" && saveDamageRule?.onSuccess === "none") return [];
    if (resolved === "saved" && !saveHalf) return [];
    const adjusted =
      (resolved === "failed-save" && saveDamageRule?.onFailure === "half") ||
      (resolved === "saved" && saveHalf) ||
      (resolved === "miss" && spec.damageOnMiss === "half")
        ? Math.floor(Math.max(0, amount) / 2)
        : amount;
    return [
      {
        amount: adjusted,
        ...(damageType ? { type: damageType } : {}),
        ...(spec.source ? { source: spec.source } : {}),
        ...(spec.resolution === "attack" && resolved === "hit"
          ? { delivery: "attack" as const }
          : spec.resolution === "save"
            ? { delivery: "save" as const }
            : spec.resolution === "automatic"
              ? { delivery: "automatic" as const }
              : {}),
      },
    ];
  });
  return resolveDamageIntake(entered, defenses);
}

/** Resolve ordered hit/ray/missile occurrences independently. Defenses and
 * zero-HP consequences apply per occurrence; summing these packets before the
 * HP transition would make Death Ward, damage at 0 HP, and retaliation wrong. */
export function resolveCombatDamagePackets(
  parts: ReadonlyArray<EnteredCombatDamagePart>,
  outcome: CombatTargetOutcome,
  damageOnSave: SaveDamageOutcome,
  defenses: DamageDefenses = NO_DEFENSES
): ResolvedDamageIntake[] {
  const byInstance = new Map<number, EnteredCombatDamagePart[]>();
  for (const part of parts) {
    const instance =
      part.instance === undefined || !Number.isFinite(part.instance)
        ? 0
        : Math.max(0, Math.floor(part.instance));
    const group = byInstance.get(instance) ?? [];
    group.push(part);
    byInstance.set(instance, group);
  }
  return [...byInstance.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, group]) => resolveCombatDamage(group, outcome, damageOnSave, defenses));
}
