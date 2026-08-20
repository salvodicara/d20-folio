/**
 * Universal action resolution shared by SOLO play and live encounters.
 *
 * BG3-inspired interaction translated for a physical table: choose an action, target
 * real creatures, enter only the dice facts the app cannot know, review the consequences,
 * then apply once. Cancelling spends nothing. Every modeled value is a default, never a
 * cage: targets, outcomes, allocations, and damage stay editable until Apply.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  CircleDot,
  CircleX,
  Heart,
  HeartPulse,
  ShieldCheck,
  Swords,
  Users,
  X,
} from "lucide-react";
import { ModalShell } from "@/components/shared/ModalShell";
import { Portrait } from "@/components/shared/Portrait";
import { ModalBody, ModalFoot } from "@/components/ui/modal-head";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { NumberStepper } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useCharacterStore } from "@/stores/characterStore";
import {
  aggregateCharacterGrants,
  effectiveAC,
  effectiveMaxHp,
} from "@/lib/aggregate-character";
import { useToastStore } from "@/stores/toastStore";
import { useCombatStore } from "@/stores/combatStore";
import { useLocale } from "@/hooks/useLocale";
import { conditionOptions } from "@/lib/views/tracker-view";
import { monsterPortraitUrl } from "@/data/monster-art";
import {
  appendPersistentCombatEffect,
  applyDeclaredCombatEffects,
  revokePersistentCombatEffect,
  revokePersistentCombatEffectsBySource,
} from "./apply-damage";
import {
  combatDamageParts,
  combatDamagePartApplies,
  combatResolutionSpec,
  resolveCombatDamage,
  tempHpRollFormula,
  type CombatDamagePartSpec,
  type CombatTargetOutcome,
} from "@/lib/combat-resolution";
import {
  composeCombatAttackContext,
  defaultCombatAttackTableFacts,
  evaluateEnteredCombatD20Test,
  type CombatAttackTableFacts,
} from "@/lib/combat-test-context";
import {
  NO_DEFENSES,
  resolveDamageIntake,
  type DamageDefenses,
} from "@/lib/damage-intake";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import { resolveTrackers, type ResolvedAction } from "@/lib/smart-tracker";
import type { PortraitCrop } from "@/types/character";
import type { ConditionId, CreatureType } from "@/data/types";
import type { DamageType } from "@/types/damage";
import type { D20AttackOutcome, D20TestRequest, D20TestResult } from "@/types/d20-test";
import type { DieSides } from "@/types/dice-formula";
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";
import {
  activeRollDieAdjustments,
  activeIncomingAttackModeAdjustments,
  activeRollModeAdjustments,
  damageDefensesByEffects,
  effectsByActorSource,
  effectsForTarget,
  healingBlockedByEffects,
  speedAdjustmentByEffects,
  turnBoundaryAfter,
  type ActiveRollDieAdjustment,
} from "@/lib/combat-effects";
import { maximizeDiceFormula, type SourceConditionImmunity } from "@/lib/grants";
import { localeDistance } from "@/lib/utils";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { deriveDamageDefenses, deriveDefenseKind } from "@/lib/views/sheet-view";
import { effectiveProficiencyBonus, isHeavyArmorEquipped } from "@/lib/compute";
import { totalLevel } from "@/lib/classes";
import { getEquipment } from "@/data/equipment";
import type { PreparedCommit } from "./useTurnEconomy";
import { compileCombatOutcomeReceipts } from "@/lib/combat-outcomes";
import type { CombatAbilityCode } from "@/types/combat-outcome";
import { turnEconomyKey } from "./combat-hydration";
import { EnteredD20Faces } from "../molecules/EnteredD20Faces";
import "./CombatResolver.css";

type TargetOutcome = "hit" | "miss" | "failed-save" | "saved";

const COMBAT_ABILITIES = new Set<CombatAbilityCode>([
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHA",
]);

const OUTCOME_KEY: Record<TargetOutcome, string> = {
  hit: "combat.declareHit",
  miss: "combat.declareMiss",
  "failed-save": "combat.resolveOutcome_failed-save",
  saved: "combat.resolveOutcome_saved",
};

interface TargetChoice {
  key: string;
  targetId: string;
  label: string;
  kind: "pc" | "monster";
  side: "ally" | "enemy";
  memberUid?: string;
  characterId?: string;
  currentHp: number;
  tempHp: number;
  maxHp: number;
  ac: number;
  down: boolean;
  stable: boolean;
  portraitUrl: string | null;
  portraitCrop: PortraitCrop | null;
  conditions: string[];
  bardicInspirationDie?: string;
  heroicInspiration: boolean;
  defenses: DamageDefenses;
  conditionImmunities: ReadonlySet<ConditionId>;
  sourceConditionImmunities: readonly SourceConditionImmunity[];
  qualifiedDefenseCount: number;
  creatureType?: CreatureType;
  healingBlocked: boolean;
  speedAdjustmentFt: number;
  rollDieAdjustments: Array<
    Omit<ActiveRollDieAdjustment, "effect"> & { effect?: ActiveCombatEffect }
  >;
  incomingAttackModes: Array<{
    sourceId: string;
    mode: "advantage" | "disadvantage";
  }>;
  markScopes: Array<"marked" | "cursed" | "vowed">;
}

interface AttackInstanceReview {
  firstFace: number;
  secondFace: number;
  manualOutcome: "success" | "failure" | null;
  adjustmentFaces: Record<string, number[]>;
}

type ResolverAction = ResolvedAction & {
  /** Localized weapon actions carry this render-safe fact from the presenter. */
  readonly weaponFacts?: { readonly heavyDisadvantage: boolean };
};

const DEFAULT_ATTACK_REVIEW: AttackInstanceReview = {
  firstFace: 10,
  secondFace: 10,
  manualOutcome: null,
  adjustmentFaces: {},
};

const ADJUSTMENT_DIE_SIDES = new Set<DieSides>([4, 6, 8, 10, 12, 20, 100]);

function physicalAdjustmentFormula(
  formula: string
): { count: number; sides: DieSides } | null {
  const match = /^(\d*)d(4|6|8|10|12|20|100)$/i.exec(formula.trim());
  if (!match) return null;
  const count = match[1] ? Number(match[1]) : 1;
  const sides = Number(match[2]);
  return Number.isInteger(count) &&
    count > 0 &&
    count <= 20 &&
    ADJUSTMENT_DIE_SIDES.has(sides as DieSides)
    ? { count, sides: sides as DieSides }
    : null;
}

/** The attack-shaped outcome of one result, or `undefined` for other kinds. */
function attackOutcomeOf(
  result: D20TestResult | undefined
): D20AttackOutcome | undefined {
  return result && result.outcome.kind === "attack" ? result.outcome : undefined;
}

function encounterTargets(combat: GlobalCombat): TargetChoice[] {
  const position = {
    round: combat.round,
    currentCombatantId: combat.encounter.currentCombatantId,
    phase: "turn-start" as const,
    order: combat.encounter.order ?? combat.view.turnOrderIds,
  };
  const effectStateFor = (
    targetId: string,
    baseDefenses: DamageDefenses = NO_DEFENSES
  ) => {
    const effects = effectsForTarget(combat.encounter.effectOps, targetId, position);
    return {
      defenses: damageDefensesByEffects(baseDefenses, effects),
      healingBlocked: healingBlockedByEffects(effects),
      speedAdjustmentFt: speedAdjustmentByEffects(effects),
      rollDieAdjustments: activeRollDieAdjustments(effects),
      incomingAttackModes: activeIncomingAttackModeAdjustments(effects).map(
        ({ effect, mode, sourceId }) => ({
          sourceId: `${sourceId}:${effect.id}`,
          mode,
        })
      ),
      markScopes: effects.flatMap((effect) =>
        effect.actor.combatantId === combat.myId && effect.payload.kind === "target-mark"
          ? [effect.payload.scope]
          : []
      ),
    };
  };
  return combat.view.rows.map((row) => ({
    key: row.id,
    targetId: row.id,
    label: row.name,
    kind: row.kind,
    side: row.side ?? (row.kind === "pc" ? "ally" : "enemy"),
    ...(row.kind === "pc" && row.memberUid && row.characterId
      ? { memberUid: row.memberUid, characterId: row.characterId }
      : {}),
    currentHp: row.currentHp,
    tempHp: row.tempHp,
    maxHp: row.maxHp,
    ac: row.ac,
    down: row.down,
    stable: row.kind === "pc" && row.deathSaves?.successes === 3,
    portraitUrl:
      row.kind === "monster" && row.srdId
        ? monsterPortraitUrl(row.srdId)
        : (row.portraitUrl ?? null),
    portraitCrop: row.kind === "monster" && row.srdId ? null : (row.portraitCrop ?? null),
    conditions: row.conditions,
    bardicInspirationDie: row.bardicInspirationDie,
    heroicInspiration: row.heroicInspiration ?? false,
    conditionImmunities: row.conditionImmunities ?? new Set(),
    sourceConditionImmunities: row.sourceConditionImmunities ?? [],
    qualifiedDefenseCount: row.qualifiedDefenseCount ?? 0,
    creatureType: row.creatureType,
    ...effectStateFor(row.id, row.defenses ?? NO_DEFENSES),
  }));
}

export function CombatResolver({
  action,
  sheetCombat,
  onCommit,
  onDone,
}: {
  action: ResolverAction;
  sheetCombat: GlobalCombat | null;
  /** Commits action economy/resources only after the resolution is complete. */
  onCommit: PreparedCommit;
  /** Cancel or successful apply. Cancel deliberately commits nothing. */
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const declareAttack = useCharacterStore((s) => s.declareAttack);
  const character = useCharacterStore((s) => s.character);
  const applyResolvedCombatEffects = useCharacterStore(
    (s) => s.applyResolvedCombatEffects
  );
  const applySoloCombatEffects = useCharacterStore((s) => s.applySoloCombatEffects);
  const showToast = useToastStore((s) => s.showToast);
  const soloRound = useCombatStore((s) => s.round);
  const nextAttackAdvantage = useCombatStore((s) => s.nextAttackAdvantage);
  const allocateOutcomeOccurrenceId = useCombatStore(
    (s) => s.allocateOutcomeOccurrenceId
  );
  const spec = useMemo(() => combatResolutionSpec(action), [action]);
  const conditionLifetimeFor = (conditionId: string) =>
    spec.conditionApplication?.lifetimes?.[conditionId] ??
    spec.conditionApplication?.lifetime;
  const actionSourceId = action.spellId ?? action.standingEffect?.sourceId ?? action.id;
  const conditionSourceId =
    spec.conditionApplication?.lifetime || spec.conditionApplication?.lifetimes
      ? actionSourceId
      : null;
  type EffectMode = "damage" | "healing" | "temp-hp";
  const effectModes = useMemo<EffectMode[]>(
    () => [
      ...(spec.hasDamage ? (["damage"] as const) : []),
      ...(spec.hasHealing ? (["healing"] as const) : []),
      ...(spec.hasTempHp ? (["temp-hp"] as const) : []),
    ],
    [spec.hasDamage, spec.hasHealing, spec.hasTempHp]
  );
  const mixedEffects = effectModes.length > 1;
  const effectMode: EffectMode = spec.hasDamage
    ? "damage"
    : spec.hasHealing
      ? "healing"
      : "temp-hp";
  const ownAggregate = character
    ? aggregateCharacterGrants(character.character, character.session)
    : null;
  const ownDefenses =
    character && ownAggregate
      ? deriveDamageDefenses(
          ownAggregate,
          {
            resistance: character.character.damageResistanceOverrides,
            immunity: character.character.damageImmunityOverrides,
            vulnerability: character.character.damageVulnerabilityOverrides,
          },
          character.session.sessionDefenses,
          effectiveProficiencyBonus(
            totalLevel(character.character),
            character.character.proficiencyBonusOverride
          ),
          isHeavyArmorEquipped(character.character.equipment, getEquipment)
        )
      : NO_DEFENSES;
  const targets: TargetChoice[] = sheetCombat
    ? encounterTargets(sheetCombat)
    : character
      ? [
          {
            key: "self",
            targetId: "self",
            label: character.character.name,
            kind: "pc",
            side: "ally",
            currentHp: character.session.hp.current,
            tempHp: character.session.hp.temp,
            maxHp: effectiveMaxHp(character.character, character.session),
            ac: effectiveAC(character.character, character.session),
            down: character.session.hp.current <= 0,
            stable: character.session.deathSucc >= 3,
            portraitUrl: character.portraitUrl,
            portraitCrop: character.portraitCrop,
            conditions: effectiveSessionConditions(character.session),
            heroicInspiration: character.session.inspiration,
            defenses: ownDefenses,
            conditionImmunities: new Set(
              deriveDefenseKind(
                ownAggregate?.conditionImmunities ?? new Set(),
                character.character.conditionImmunityOverrides,
                character.session.sessionDefenses?.conditionImmunity
              ).effective as ConditionId[]
            ),
            sourceConditionImmunities: ownAggregate?.sourceConditionImmunities ?? [],
            qualifiedDefenseCount: 0,
            healingBlocked: ownAggregate?.healingBlocked ?? false,
            speedAdjustmentFt: speedAdjustmentByEffects(
              character.session.encounterEffects ?? []
            ),
            rollDieAdjustments: (ownAggregate?.rollDieAdjustments ?? []).map(
              (adjustment) => ({
                ...adjustment,
              })
            ),
            incomingAttackModes: [],
            markScopes: (character.session.encounterEffects ?? []).flatMap((effect) =>
              effect.actor.combatantId === "self" && effect.payload.kind === "target-mark"
                ? [effect.payload.scope]
                : []
            ),
          },
        ]
      : [];
  const actorEffects = sheetCombat
    ? effectsForTarget(sheetCombat.encounter.effectOps, sheetCombat.myId, {
        round: sheetCombat.round,
        currentCombatantId: sheetCombat.encounter.currentCombatantId,
        phase: "turn-start",
        order: sheetCombat.encounter.order ?? sheetCombat.view.turnOrderIds,
      })
    : (character?.session.encounterEffects ?? []);
  const actorRollDieAdjustments = sheetCombat
    ? activeRollDieAdjustments(actorEffects)
    : (ownAggregate?.rollDieAdjustments ?? []);
  const actorEffectAttackModeAdjustments = activeRollModeAdjustments(
    actorEffects,
    "attack"
  ).map(({ effect, mode, sourceId, consume }) => ({
    sourceId: `${sourceId}:${effect.id}`,
    mode,
    consume,
  }));
  const actorAttackDieAdjustments = actorRollDieAdjustments.flatMap(
    (adjustment, index) => {
      if (adjustment.rollType !== "attack") return [];
      const formula = physicalAdjustmentFormula(adjustment.dice);
      return formula
        ? [
            {
              ...adjustment,
              key: `${adjustment.sourceId}:${index}`,
              formula,
            },
          ]
        : [];
    }
  );
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => {
    if (!spec.damageReduction) return [];
    const selfId = sheetCombat?.myId ?? "self";
    const self = targets.find((target) => target.targetId === selfId);
    return self ? [self.key] : [];
  });
  const [attackReviews, setAttackReviews] = useState<
    Record<string, AttackInstanceReview[]>
  >({});
  const [attackTables, setAttackTables] = useState<
    Record<string, CombatAttackTableFacts>
  >({});
  const [saveOutcomes, setSaveOutcomes] = useState<
    Record<string, "failed-save" | "saved">
  >({});
  const [damage, setDamage] = useState<Record<string, number>>({});
  const [reductionRolls, setReductionRolls] = useState<Record<string, number>>({});
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [conditions, setConditions] = useState<Record<string, string[]>>({});
  const [conditionRemovals, setConditionRemovals] = useState<Record<string, string[]>>(
    {}
  );
  const [areaDamage, setAreaDamage] = useState(0);
  const [partAmounts, setPartAmounts] = useState<Record<string, number>>({});
  const [partTypes, setPartTypes] = useState<Record<string, DamageType>>({});
  const [targetModes, setTargetModes] = useState<Record<string, EffectMode>>({});
  const [oneRollBonusTarget, setOneRollBonusTarget] = useState<string | null>(null);
  const conditionChoices = useMemo(() => conditionOptions(locale), [locale]);
  const damageParts = useMemo(() => combatDamageParts(action), [action]);
  const trackerUses = useMemo(
    () =>
      new Map(
        (character ? resolveTrackers(character) : []).map((tracker) => [
          tracker.id,
          tracker.total - tracker.used,
        ])
      ),
    [character]
  );
  const appliesDamage = spec.hasDamage && effectMode === "damage";
  const appliesHealing = spec.hasHealing && effectMode === "healing";
  const appliesTempHp = spec.hasTempHp && effectMode === "temp-hp";
  const activeAffinity = mixedEffects
    ? "any"
    : appliesDamage && !spec.damageReduction
      ? "enemy"
      : spec.targetAffinity;
  const attackMode = spec.attackMode ?? "melee";

  const persistentTargetEffects =
    action.persistentTargetSourceId && sheetCombat
      ? effectsByActorSource(
          sheetCombat.encounter.effectOps,
          sheetCombat.myId,
          action.persistentTargetSourceId
        )
      : [];
  const creatureTypes = spec.targetCreatureTypes;
  const typeEligibleTargets = creatureTypes
    ? targets.filter(
        (target) =>
          target.creatureType !== undefined && creatureTypes.includes(target.creatureType)
      )
    : targets;
  const eligibleTargets = spec.stabilizes
    ? typeEligibleTargets.filter(
        (target) => target.kind === "pc" && target.down && !target.stable
      )
    : typeEligibleTargets;
  const actionTargets =
    !showAll && persistentTargetEffects.length > 0
      ? eligibleTargets.filter((target) =>
          persistentTargetEffects.some(
            (effect) => effect.target.combatantId === target.targetId
          )
        )
      : eligibleTargets;

  const affinityTargets =
    showAll || activeAffinity === "any"
      ? actionTargets
      : actionTargets.filter((target) =>
          activeAffinity === "self"
            ? target.targetId === (sheetCombat?.myId ?? "self")
            : activeAffinity === "ally"
              ? target.side === "ally"
              : target.side === "enemy"
        );
  const visibleTargets =
    spec.excludeSelf && !showAll
      ? affinityTargets.filter(
          (target) => target.targetId !== (sheetCombat?.myId ?? "self")
        )
      : affinityTargets;
  const byKey = new Map(targets.map((target) => [target.key, target]));
  const allocationTotal = selected.reduce((sum, key) => sum + (allocations[key] ?? 1), 0);
  const atCap = Number.isFinite(spec.targetCap) && allocationTotal >= spec.targetCap;

  const modeForTarget = (key: string): EffectMode => {
    const explicit = targetModes[key];
    if (explicit) return explicit;
    const target = byKey.get(key);
    if (target?.side === "ally" && spec.hasHealing) return "healing";
    if (target?.side === "ally" && spec.hasTempHp) return "temp-hp";
    return effectMode;
  };
  const oneRollEligibleTargets = selected.filter(
    (key) => modeForTarget(key) === "damage"
  );
  const activeOneRollBonusTarget = oneRollEligibleTargets.includes(
    oneRollBonusTarget ?? ""
  )
    ? oneRollBonusTarget
    : oneRollEligibleTargets[0];

  const conditionIsImmune = (target: TargetChoice, conditionId: string): boolean =>
    target.conditionImmunities.has(conditionId as ConditionId) ||
    target.sourceConditionImmunities.some(
      (immunity) =>
        immunity.condition === conditionId && immunity.sourceId === actionSourceId
    );

  const syncModeledConditions = (target: TargetChoice, applies: boolean): void => {
    const modeled = spec.conditionApplication?.options ?? [];
    if (modeled.length === 0) return;
    setConditions((current) => {
      const manual = (current[target.key] ?? []).filter(
        (conditionId) => !modeled.includes(conditionId)
      );
      const defaults =
        applies && !spec.conditionApplication?.max
          ? modeled.filter((conditionId) => !conditionIsImmune(target, conditionId))
          : [];
      return { ...current, [target.key]: [...new Set([...manual, ...defaults])] };
    });
  };

  const toggleTarget = (target: TargetChoice): void => {
    setSelected((current) => {
      if (current.includes(target.key))
        return current.filter((key) => key !== target.key);
      if (spec.targetCap === 1) return [target.key];
      if (atCap) return current;
      return [...current, target.key];
    });
    setAttackReviews((current) => ({
      ...current,
      [target.key]: current[target.key] ?? [{ ...DEFAULT_ATTACK_REVIEW }],
    }));
    setAttackTables((current) => ({
      ...current,
      [target.key]: current[target.key] ?? defaultCombatAttackTableFacts(attackMode),
    }));
    setSaveOutcomes((current) => ({
      ...current,
      [target.key]: current[target.key] ?? "failed-save",
    }));
    setAllocations((current) => ({ ...current, [target.key]: current[target.key] ?? 1 }));
    if (mixedEffects) {
      setTargetModes((current) => ({
        ...current,
        [target.key]:
          current[target.key] ??
          (target.side === "ally" && spec.hasHealing ? "healing" : "damage"),
      }));
    }
    setConditions((current) => ({
      ...current,
      [target.key]:
        current[target.key] ??
        (spec.conditionApplication?.max
          ? []
          : (spec.conditionApplication?.options ?? []).filter(
              (conditionId) => !conditionIsImmune(target, conditionId)
            )),
    }));
    setConditionRemovals((current) => {
      if (current[target.key]) return current;
      const eligible = target.conditions.filter((condition) =>
        spec.conditionRemoval?.options.includes(condition)
      );
      const defaults = spec.poolSpend
        ? []
        : spec.conditionRemoval?.max
          ? eligible.slice(0, spec.conditionRemoval.max)
          : eligible;
      return { ...current, [target.key]: defaults };
    });
  };

  const setAllocation = (key: string, amount: number): void => {
    const others = selected.reduce(
      (sum, selectedKey) =>
        sum + (selectedKey === key ? 0 : (allocations[selectedKey] ?? 1)),
      0
    );
    const available = Number.isFinite(spec.targetCap)
      ? Math.max(1, spec.targetCap - others)
      : 99;
    const next = Math.min(amount, available);
    setAllocations((current) => ({ ...current, [key]: next }));
    setAttackReviews((current) => {
      const previous = current[key] ?? [];
      return {
        ...current,
        [key]: Array.from(
          { length: next },
          (_, index) => previous[index] ?? { ...DEFAULT_ATTACK_REVIEW }
        ),
      };
    });
  };

  const attackInstanceCount = (key: string): number =>
    Number.isFinite(spec.targetCap) && spec.targetCap > 1 && !spec.area
      ? Math.max(1, allocations[key] ?? 1)
      : 1;

  const attackReviewFor = (
    key: string,
    instance: number,
    explicit?: AttackInstanceReview
  ): AttackInstanceReview =>
    explicit ?? attackReviews[key]?.[instance] ?? DEFAULT_ATTACK_REVIEW;

  const attackTableFor = (
    key: string,
    explicit?: CombatAttackTableFacts
  ): CombatAttackTableFacts =>
    explicit ?? attackTables[key] ?? defaultCombatAttackTableFacts(attackMode);

  const actorId = sheetCombat?.myId ?? "self";
  const actorConditions =
    targets.find((target) => target.targetId === actorId)?.conditions ?? [];

  const isFirstAttackInstance = (key: string, instance: number): boolean =>
    (selected[0] ?? key) === key && instance === 0;

  const actorGrantAttackModeAdjustmentsFor = (
    target: TargetChoice,
    key: string,
    instance: number
  ) => {
    const round = sheetCombat?.round ?? soloRound;
    const scopedToTarget = (scope: string | undefined): boolean =>
      scope === undefined ||
      scope === "all" ||
      ((scope === "marked" || scope === "cursed" || scope === "vowed") &&
        target.markScopes.includes(scope));
    return [
      ...(ownAggregate?.advantages ?? []).map((clause) => ({
        clause,
        mode: "advantage" as const,
      })),
      ...(ownAggregate?.disadvantages ?? []).map((clause) => ({
        clause,
        mode: "disadvantage" as const,
      })),
    ].flatMap(({ clause, mode }, index) =>
      clause.rollType === "attack" &&
      !clause.sourceId.startsWith("combat-effect:") &&
      (!clause.round1 || round === 1) &&
      (clause.consume !== "next" || isFirstAttackInstance(key, instance)) &&
      scopedToTarget(clause.scope)
        ? [
            {
              sourceId: `grant:${index}:${clause.sourceId}`,
              mode,
            },
          ]
        : []
    );
  };

  const actorAttackDieAdjustmentsFor = (key: string, instance: number) =>
    actorAttackDieAdjustments.filter(
      (adjustment) =>
        adjustment.consume === "each" || isFirstAttackInstance(key, instance)
    );

  const attackContextFor = (
    key: string,
    instance: number,
    table?: CombatAttackTableFacts
  ) => {
    const target = byKey.get(key);
    if (!target) return null;
    return composeCombatAttackContext({
      testId: `${action.id}:${key}:${instance}`,
      actorId,
      targetId: target.targetId,
      attackBonus: action.summary.attackBonus ?? 0,
      criticalThreshold: action.summary.critRange ?? 20,
      baseArmorClass: target.ac,
      attackMode,
      actorConditions,
      targetConditions: target.conditions,
      table: attackTableFor(key, table),
      externalModeAdjustments: [
        ...(nextAttackAdvantage && isFirstAttackInstance(key, instance)
          ? [{ sourceId: "turn:next-attack-advantage", mode: "advantage" as const }]
          : []),
        ...(action.weaponFacts?.heavyDisadvantage
          ? [
              {
                sourceId: `action:${action.id}:heavy-property`,
                mode: "disadvantage" as const,
              },
            ]
          : []),
        ...actorGrantAttackModeAdjustmentsFor(target, key, instance),
        ...actorEffectAttackModeAdjustments.filter(
          (adjustment) =>
            adjustment.consume === "each" || isFirstAttackInstance(key, instance)
        ),
        ...target.incomingAttackModes,
      ],
    });
  };

  const attackResultFor = (
    key: string,
    instance: number,
    explicitReview?: AttackInstanceReview,
    explicitTable?: CombatAttackTableFacts
  ): D20TestResult | null => {
    const composition = attackContextFor(key, instance, explicitTable);
    if (!composition) return null;
    const review = attackReviewFor(key, instance, explicitReview);
    const { context } = composition;
    const rolled = context.resolution.kind === "rolled";
    const rolls = !rolled
      ? 0
      : context.rollRules.advantageSourceIds.length > 0 &&
          context.rollRules.disadvantageSourceIds.length === 0
        ? 2
        : context.rollRules.disadvantageSourceIds.length > 0 &&
            context.rollRules.advantageSourceIds.length === 0
          ? 2
          : 1;
    const adjustments = rolled ? actorAttackDieAdjustmentsFor(key, instance) : [];
    const request: D20TestRequest = {
      ...context,
      enteredModifiers: adjustments.map((adjustment, index) => ({
        formula: {
          terms: [
            {
              count: { kind: "fixed" as const, value: adjustment.formula.count },
              kind: "dice" as const,
              operation: adjustment.operation,
              sides: adjustment.formula.sides,
              termId: `adjustment-${index}`,
            },
          ],
        },
        kind: "dice-formula" as const,
        required: true,
        sourceId: `effect:${adjustment.key}:attack-die:${index}`,
      })),
    };
    return evaluateEnteredCombatD20Test(request, {
      faces:
        rolls === 0
          ? []
          : [review.firstFace, ...(rolls === 2 ? [review.secondFace] : [])],
      enteredModifierFaces: Object.fromEntries(
        adjustments.map((adjustment, index) => [
          `effect:${adjustment.key}:attack-die:${index}`,
          review.adjustmentFaces[adjustment.key] ??
            Array.from({ length: adjustment.formula.count }, () => 1),
        ])
      ),
      manualOutcome: rolled ? review.manualOutcome : null,
      manualOutcomeSourceId: `${context.testId}:review:table-ruling`,
    });
  };

  const attackResultsFor = (key: string): D20TestResult[] =>
    spec.kind === "attack" || spec.kind === "attack-save"
      ? Array.from({ length: attackInstanceCount(key) }, (_, instance) =>
          attackResultFor(key, instance)
        ).flatMap((result) => (result ? [result] : []))
      : [];

  const attackHitCount = (key: string): number =>
    attackResultsFor(key).filter((result) => result.outcome.status === "success").length;

  const outcomeFor = (key: string): CombatTargetOutcome => ({
    attack:
      spec.kind === "attack" || spec.kind === "attack-save"
        ? attackHitCount(key) > 0
          ? "hit"
          : "miss"
        : "hit",
    save: saveOutcomes[key] ?? "failed-save",
  });

  const updateAttackReview = (
    target: TargetChoice,
    instance: number,
    update: Partial<AttackInstanceReview>
  ): void => {
    const previous = attackReviewFor(target.key, instance);
    const next = { ...previous, ...update };
    setAttackReviews((current) => {
      const reviews = Array.from(
        { length: attackInstanceCount(target.key) },
        (_, index) => current[target.key]?.[index] ?? { ...DEFAULT_ATTACK_REVIEW }
      );
      reviews[instance] = next;
      return { ...current, [target.key]: reviews };
    });
    if (spec.conditionApplication?.on === "hit") {
      const results = Array.from(
        { length: attackInstanceCount(target.key) },
        (_, index) =>
          attackResultFor(target.key, index, index === instance ? next : undefined)
      );
      syncModeledConditions(
        target,
        results.some((result) => result?.outcome.status === "success")
      );
    }
  };

  const updateAttackTable = (
    target: TargetChoice,
    update: Partial<CombatAttackTableFacts>
  ): void => {
    const next = { ...attackTableFor(target.key), ...update };
    setAttackTables((current) => ({ ...current, [target.key]: next }));
    if (spec.conditionApplication?.on === "hit") {
      syncModeledConditions(
        target,
        Array.from({ length: attackInstanceCount(target.key) }, (_, instance) =>
          attackResultFor(target.key, instance, undefined, next)
        ).some((result) => result?.outcome.status === "success")
      );
    }
  };

  const damageValueKey = (
    targetKey: string,
    part: CombatDamagePartSpec,
    instance = 0
  ): string => `${part.sharedAmount ? "shared" : targetKey}:${part.id}:${instance}`;

  const damagePartInstances = (
    targetKey: string,
    part: CombatDamagePartSpec
  ): number[] => {
    if (part.sharedAmount) return [0];
    if (part.resolution === "attack") {
      const matching = attackResultsFor(targetKey).flatMap((result, instance) => {
        const attack =
          result.outcome.status === "success" ? ("hit" as const) : ("miss" as const);
        const applies = combatDamagePartApplies(
          part,
          { attack, save: saveOutcomes[targetKey] ?? "failed-save" },
          spec.damageOnSave
        );
        return applies && result.outcome.status !== "ineligible" ? [instance] : [];
      });
      if (part.id === "primary" || part.appliesOn === "miss") return matching;
      return matching.slice(0, 1);
    }
    if (
      part.id === "primary" &&
      Number.isFinite(spec.targetCap) &&
      spec.targetCap > 1 &&
      !spec.area
    ) {
      return Array.from({ length: allocations[targetKey] ?? 1 }, (_, index) => index);
    }
    return combatDamagePartApplies(part, outcomeFor(targetKey), spec.damageOnSave)
      ? [0]
      : [];
  };

  const damageTypeFor = (
    targetKey: string,
    part: CombatDamagePartSpec
  ): DamageType | undefined => {
    if (part.id === "one-roll-bonus") {
      const primary = damageParts.find((candidate) => candidate.id === "primary");
      if (primary) return damageTypeFor(targetKey, primary);
    }
    return part.typeMode === "fixed"
      ? part.damageTypes[0]
      : partTypes[`${part.sharedAmount ? "shared" : targetKey}:${part.id}`];
  };

  const partTargets = (key: string, part: CombatDamagePartSpec): boolean =>
    part.target === "all" ||
    (part.target === "primary" && selected[0] === key) ||
    (part.target === "one-roll" && activeOneRollBonusTarget === key);

  const requiredRiderApplied = (key: string, trackerId: string): boolean =>
    damageParts.some(
      (candidate) =>
        candidate.resourceTrackerId === trackerId &&
        partTargets(key, candidate) &&
        damagePartInstances(key, candidate).length > 0 &&
        damagePartInstances(key, candidate)
          .map((instance) =>
            candidate.fixedAmount !== undefined
              ? candidate.fixedAmount
              : (partAmounts[damageValueKey(key, candidate, instance)] ?? 0)
          )
          .some((amount) => amount > 0)
    );

  const damagePartsForTarget = (key: string): CombatDamagePartSpec[] => {
    const creatureType = byKey.get(key)?.creatureType;
    return damageParts.filter(
      (part) =>
        partTargets(key, part) &&
        (!part.round1 || (sheetCombat?.round ?? soloRound) === 1) &&
        (!part.targetCreatureTypes ||
          (creatureType !== undefined &&
            part.targetCreatureTypes.includes(creatureType))) &&
        (!part.requiresRiderTrackerId ||
          requiredRiderApplied(key, part.requiresRiderTrackerId))
    );
  };

  const damageReductionFor = (key: string) => {
    const target = byKey.get(key);
    const reduction = spec.damageReduction;
    if (!target || !reduction) return null;
    const incoming = Math.max(0, damage[key] ?? 0);
    const rolled = Math.max(0, reductionRolls[key] ?? 0);
    const remainingBeforeDefenses = Math.max(0, incoming - rolled - reduction.bonus);
    const type = partTypes[`${key}:damage-reduction`];
    return {
      incoming,
      rolled,
      remainingBeforeDefenses,
      resolved: resolveDamageIntake(
        remainingBeforeDefenses > 0
          ? [
              {
                amount: remainingBeforeDefenses,
                delivery: "attack" as const,
                ...(type ? { type } : {}),
              },
            ]
          : [],
        target.defenses
      ),
    };
  };

  const damageResolutionPacketsFor = (key: string) => {
    const target = byKey.get(key);
    if (!target) return [];
    const reduced = damageReductionFor(key);
    if (reduced)
      return [
        {
          ...reduced.resolved,
          instance: 0,
          attackHit: false,
          critical: false,
        },
      ];
    const entered = damagePartsForTarget(key).flatMap((part) =>
      damagePartInstances(key, part).map((instance) => ({
        spec: part,
        amount: part.fixedAmount ?? partAmounts[damageValueKey(key, part, instance)] ?? 0,
        ...(damageTypeFor(key, part) ? { damageType: damageTypeFor(key, part) } : {}),
        instance,
      }))
    );
    const byInstance = new Map<number, typeof entered>();
    for (const part of entered) {
      const group = byInstance.get(part.instance) ?? [];
      group.push(part);
      byInstance.set(part.instance, group);
    }
    const attackResults = attackResultsFor(key);
    return [...byInstance.entries()]
      .sort(([left], [right]) => left - right)
      .map(([instance, group]) => {
        const attack = attackOutcomeOf(attackResults[instance]);
        const attackHit =
          attack?.hit === true && group.some((part) => part.spec.resolution === "attack");
        return {
          ...resolveCombatDamage(
            group,
            {
              attack: attack?.hit ? "hit" : "miss",
              save: saveOutcomes[key] ?? "failed-save",
            },
            spec.damageOnSave,
            target.defenses
          ),
          instance,
          attackHit,
          critical: attackHit && attack.critical,
        };
      });
  };

  const damageResolutionFor = (key: string) => {
    const packets = damageResolutionPacketsFor(key);
    if (packets.length === 0) return null;
    return {
      parts: packets.flatMap(({ parts }) => parts),
      rawTotal: packets.reduce((total, packet) => total + packet.rawTotal, 0),
      netTotal: packets.reduce((total, packet) => total + packet.netTotal, 0),
    };
  };

  const amountFor = (key: string): number => {
    const target = byKey.get(key);
    const mode = modeForTarget(key);
    if (spec.healingMode === "full" && target)
      return Math.max(0, target.maxHp - target.currentHp);
    if (spec.healingMode === "maximum" && action.summary.healing)
      return maximizeDiceFormula(action.summary.healing);
    const rolled = spec.sharedAmount ? areaDamage : (damage[key] ?? 0);
    if (mode === "temp-hp") {
      const apply = action.summary.tempHpApply;
      if (apply) return apply.bonus + (apply.dice ? rolled : 0);
      const featureRoll = action.summary.tempHpRoll;
      if (featureRoll)
        return rolled * (featureRoll.multiplier ?? 1) + (featureRoll.bonus ?? 0);
      return rolled;
    }
    if (mode === "healing" && action.summary.healApply) {
      return action.summary.healApply.bonus + rolled;
    }
    if (mode === "damage" && target) {
      return damageResolutionFor(key)?.netTotal ?? 0;
    }
    return rolled;
  };

  const dynamicHpPool = spec.poolSpend?.unit === "hp" && action.trackerCost == null;
  const removalCostFor = (key: string, removals = conditionRemovals[key] ?? []): number =>
    removals.reduce(
      (sum, conditionId) => sum + (spec.poolSpend?.conditionCosts[conditionId] ?? 0),
      0
    );
  const totalRemovalCost = selected.reduce((sum, key) => sum + removalCostFor(key), 0);
  const totalPoolCost = dynamicHpPool
    ? selected.reduce(
        (sum, key) => sum + (modeForTarget(key) === "healing" ? amountFor(key) : 0),
        totalRemovalCost
      )
    : 0;
  const healingCostExcept = (key: string): number =>
    selected.reduce(
      (sum, selectedKey) =>
        sum +
        (selectedKey !== key && modeForTarget(selectedKey) === "healing"
          ? amountFor(selectedKey)
          : 0),
      0
    );
  const poolHealingMaxFor = (key: string): number | undefined => {
    if (!dynamicHpPool || !spec.poolSpend) return undefined;
    return Math.max(
      0,
      spec.poolSpend.remaining - totalRemovalCost - healingCostExcept(key)
    );
  };
  const toggleConditionRemoval = (key: string, conditionId: string): void => {
    const current = conditionRemovals[key] ?? [];
    if (current.includes(conditionId)) {
      setConditionRemovals((all) => ({
        ...all,
        [key]: current.filter((value) => value !== conditionId),
      }));
      return;
    }
    const max = spec.conditionRemoval?.max;
    const next = max ? [...current, conditionId].slice(-max) : [...current, conditionId];
    if (dynamicHpPool && spec.poolSpend) {
      const nextRemovalTotal = selected.reduce(
        (sum, selectedKey) =>
          sum + removalCostFor(selectedKey, selectedKey === key ? next : undefined),
        0
      );
      const availableForThisTarget = Math.max(
        0,
        spec.poolSpend.remaining - nextRemovalTotal - healingCostExcept(key)
      );
      setDamage((all) => ({
        ...all,
        [key]: Math.min(all[key] ?? 0, availableForThisTarget),
      }));
    }
    setConditionRemovals((all) => ({ ...all, [key]: next }));
  };

  const relevantDamageParts = (key: string): CombatDamagePartSpec[] =>
    damagePartsForTarget(key).filter((part) => damagePartInstances(key, part).length > 0);

  const renderDamageEntry = (key: string, part: CombatDamagePartSpec, instance = 0) => {
    const valueKey = damageValueKey(key, part, instance);
    const damageType = damageTypeFor(key, part);
    // Per-instance labels whenever THIS part renders more than one entry for
    // this target — attack parts with several hitting swings AND non-attack
    // multi-instance parts alike (Magic Missile's darts resolve "automatic",
    // yet two darts on one goblin must never carry two IDENTICAL accessible
    // names — the pre-gate `damagePartCount` contract).
    const perInstance = damagePartInstances(key, part).length > 1;
    const critical =
      part.fixedAmount === undefined &&
      part.resolution === "attack" &&
      part.appliesOn !== "miss" &&
      attackOutcomeOf(attackResultsFor(key)[instance])?.critical === true;
    return (
      <div key={`${part.id}:${instance}`} className="combat-damage-entry">
        <span>
          {part.sourceName ? <small>{part.sourceName} · </small> : null}
          <strong>{part.formula}</strong>
          {perInstance
            ? ` · ${t("combat.resolveInstanceNumber", { n: instance + 1 })}`
            : null}
          {part.typeMode === "fixed" && damageType
            ? ` ${t(`srd.damage_${damageType}`)}`
            : null}
          {critical ? <small> · {t("combat.resolveCriticalDamageHint")}</small> : null}
        </span>
        {part.typeMode !== "fixed" && (
          <select
            value={damageType ?? ""}
            aria-label={t("combat.resolveDamageTypeAria", {
              name: byKey.get(key)?.label ?? action.name,
            })}
            onChange={(event) =>
              setPartTypes((current) => ({
                ...current,
                [`${part.sharedAmount ? "shared" : key}:${part.id}`]: event.target
                  .value as DamageType,
              }))
            }
          >
            <option value="">{t("combat.resolveChooseDamageType")}</option>
            {part.damageTypes.map((type) => (
              <option key={type} value={type}>
                {t(`srd.damage_${type}`)}
              </option>
            ))}
          </select>
        )}
        {part.fixedAmount === undefined ? (
          <NumberStepper
            compact
            digits={3}
            min={0}
            value={partAmounts[valueKey] ?? 0}
            onChange={(value) =>
              setPartAmounts((current) => ({ ...current, [valueKey]: value }))
            }
            ariaLabel={
              part.sharedAmount
                ? t("combat.declareDamageAria")
                : perInstance
                  ? t("combat.resolveDamageInstanceForAria", {
                      name: byKey.get(key)?.label ?? action.name,
                      n: instance + 1,
                    })
                  : t("combat.declareDamageForAria", {
                      name: byKey.get(key)?.label ?? action.name,
                    })
            }
            decrementLabel={t("common.decrease")}
            incrementLabel={t("common.increase")}
          />
        ) : (
          <Badge variant="muted" size="sm">
            {part.fixedAmount}
          </Badge>
        )}
      </div>
    );
  };

  const renderAttackResolution = (target: TargetChoice) => {
    const key = target.key;
    const table = attackTableFor(key);
    const composition = attackContextFor(key, 0);
    const results = attackResultsFor(key);
    if (!composition || results.length === 0) return null;
    const firstResult = results[0];
    const composedResolution = composition.context.resolution;
    const forcedCritical = composition.context.automaticCriticalSourceIds.length > 0;
    return (
      <div
        className="combat-attack-resolution"
        role="group"
        aria-label={t("combat.resolveAttackOutcomeFor", { name: target.label })}
      >
        <details className="combat-attack-facts">
          <summary>
            <span>{t("combat.resolveAttackFacts")}</span>
            <Badge variant="muted" size="sm">
              {composition.coverBonus > 0
                ? t("combat.resolveArmorClassWithCover", {
                    base: composition.baseArmorClass,
                    total: composition.effectiveArmorClass,
                  })
                : t("combat.resolveArmorClass", {
                    value: composition.effectiveArmorClass,
                  })}
            </Badge>
            <Badge variant="muted" size="sm">
              {firstResult?.review.mode === "advantage"
                ? t("combat.rollMode.advantage")
                : firstResult?.review.mode === "disadvantage"
                  ? t("combat.rollMode.disadvantage")
                  : t("abilities.straightRoll")}
            </Badge>
            {forcedCritical && (
              <Badge color="var(--semantic-warning)" size="sm">
                {t("combat.resolveForcedCritical")}
              </Badge>
            )}
            {composedResolution.kind === "ineligible" && (
              <Badge color="var(--semantic-danger)" size="sm">
                {t(
                  composedResolution.reasonId === "total-cover"
                    ? "combat.resolveIneligibleTotalCover"
                    : composedResolution.reasonId === "beyond-range"
                      ? "combat.resolveIneligibleBeyondRange"
                      : "combat.resolveIneligibleActor"
                )}
              </Badge>
            )}
          </summary>
          <div className="combat-attack-fact-grid">
            <label>
              <span>{t("spells.range")}</span>
              <select
                aria-label={t("combat.resolveRangeBandFor", { name: target.label })}
                value={table.rangeBand}
                onChange={(event) =>
                  updateAttackTable(target, {
                    rangeBand: event.target.value as CombatAttackTableFacts["rangeBand"],
                  })
                }
              >
                <option value="normal">{t("combat.resolveRangeNormal")}</option>
                <option value="long">{t("combat.resolveRangeLong")}</option>
                <option value="beyond">{t("combat.resolveRangeBeyond")}</option>
              </select>
            </label>
            <label>
              <span>{t("combat.rulesReference.cover")}</span>
              <select
                aria-label={t("combat.resolveCoverFor", { name: target.label })}
                value={table.cover}
                onChange={(event) => {
                  const cover = event.target.value as CombatAttackTableFacts["cover"];
                  updateAttackTable(target, {
                    cover,
                    ...(cover === "none" ? { coverIgnoredBySourceId: undefined } : {}),
                  });
                }}
              >
                <option value="none">{t("combat.resolveCoverNone")}</option>
                <option value="half">{t("combat.resolveCoverHalf")}</option>
                <option value="three-quarters">
                  {t("combat.resolveCoverThreeQuarters")}
                </option>
                <option value="total">{t("combat.resolveCoverTotal")}</option>
              </select>
            </label>
            <label>
              <span>{t("combat.resolveDistance")}</span>
              <select
                aria-label={t("combat.resolveDistanceFor", { name: target.label })}
                value={table.targetWithinFiveFeet ? "near" : "far"}
                onChange={(event) =>
                  updateAttackTable(target, {
                    targetWithinFiveFeet: event.target.value === "near",
                  })
                }
              >
                <option value="near">{t("combat.resolveWithinFiveFeet")}</option>
                <option value="far">{t("combat.resolveBeyondFiveFeet")}</option>
              </select>
            </label>
            <button
              type="button"
              aria-pressed={table.attackerCanSeeTarget}
              onClick={() =>
                updateAttackTable(target, {
                  attackerCanSeeTarget: !table.attackerCanSeeTarget,
                })
              }
            >
              {t("combat.resolveAttackerSeesTarget")}
            </button>
            <button
              type="button"
              aria-pressed={table.targetCanSeeAttacker}
              onClick={() =>
                updateAttackTable(target, {
                  targetCanSeeAttacker: !table.targetCanSeeAttacker,
                })
              }
            >
              {t("combat.resolveTargetSeesAttacker")}
            </button>
            {table.cover !== "none" && (
              <button
                type="button"
                aria-pressed={table.coverIgnoredBySourceId !== undefined}
                onClick={() =>
                  updateAttackTable(target, {
                    coverIgnoredBySourceId: table.coverIgnoredBySourceId
                      ? undefined
                      : `review:${action.id}:ignores-cover`,
                  })
                }
              >
                {t("combat.resolveIgnoreCover")}
              </button>
            )}
            {attackMode === "ranged" && (
              <button
                type="button"
                aria-pressed={table.rangedThreatenedWithinFiveFeet}
                onClick={() =>
                  updateAttackTable(target, {
                    rangedThreatenedWithinFiveFeet: !table.rangedThreatenedWithinFiveFeet,
                  })
                }
              >
                {t("combat.resolveRangedThreatened")}
              </button>
            )}
            {actorConditions.includes("grappled") && (
              <button
                type="button"
                aria-pressed={table.targetIsGrappler}
                onClick={() =>
                  updateAttackTable(target, {
                    targetIsGrappler: !table.targetIsGrappler,
                  })
                }
              >
                {t("combat.resolveTargetIsGrappler")}
              </button>
            )}
            {actorConditions.includes("frightened") && (
              <button
                type="button"
                aria-pressed={table.frighteningSourceInSight}
                onClick={() =>
                  updateAttackTable(target, {
                    frighteningSourceInSight: !table.frighteningSourceInSight,
                  })
                }
              >
                {t("combat.resolveFearSourceVisible")}
              </button>
            )}
          </div>
        </details>

        <div className="combat-attack-test-list">
          {results.map((result, instance) => {
            const review = attackReviewFor(key, instance);
            const mode = result.review.mode;
            const faceCount = mode === "advantage" || mode === "disadvantage" ? 2 : 1;
            const attack = attackOutcomeOf(result);
            const verdict =
              result.outcome.status === "ineligible"
                ? "ineligible"
                : attack?.critical
                  ? "critical"
                  : attack?.hit
                    ? "hit"
                    : "miss";
            return (
              <div key={instance} className="combat-attack-test">
                <span className="combat-attack-test-label">
                  {results.length > 1
                    ? t("combat.resolveAttackNumber", { n: instance + 1 })
                    : t("combat.resolveAttackRoll")}
                </span>
                {mode !== "not-rolled" && (
                  <EnteredD20Faces
                    faceCount={faceCount}
                    first={review.firstFace}
                    second={review.secondFace}
                    onFirstChange={(firstFace) =>
                      updateAttackReview(target, instance, { firstFace })
                    }
                    onSecondChange={(secondFace) =>
                      updateAttackReview(target, instance, { secondFace })
                    }
                    singleAriaLabel={t("combat.resolveAttackD20For", {
                      name: target.label,
                      n: instance + 1,
                    })}
                    firstAriaLabel={t("combat.resolveAttackFirstD20For", {
                      name: target.label,
                      n: instance + 1,
                    })}
                    secondAriaLabel={t("combat.resolveAttackSecondD20For", {
                      name: target.label,
                      n: instance + 1,
                    })}
                    decrementLabel={t("common.decrease")}
                    incrementLabel={t("common.increase")}
                  />
                )}
                {mode !== "not-rolled" &&
                  actorAttackDieAdjustmentsFor(key, instance).flatMap((adjustment) => {
                    const faces =
                      review.adjustmentFaces[adjustment.key] ??
                      Array.from({ length: adjustment.formula.count }, () => 1);
                    return faces.map((face, adjustmentIndex) => (
                      <div
                        key={`${adjustment.key}:${adjustmentIndex}`}
                        className="combat-attack-adjustment"
                      >
                        <span>
                          {adjustment.operation === "add" ? "+" : "−"}
                          {adjustment.dice}
                        </span>
                        <NumberStepper
                          compact
                          digits={3}
                          min={1}
                          max={adjustment.formula.sides}
                          value={face}
                          onChange={(value) => {
                            const nextFaces = [...faces];
                            nextFaces[adjustmentIndex] = value;
                            updateAttackReview(target, instance, {
                              adjustmentFaces: {
                                ...review.adjustmentFaces,
                                [adjustment.key]: nextFaces,
                              },
                            });
                          }}
                          ariaLabel={t("combat.resolveAttackAdjustmentFor", {
                            dice: adjustment.dice,
                            name: target.label,
                            n: instance + 1,
                          })}
                          decrementLabel={t("common.decrease")}
                          incrementLabel={t("common.increase")}
                        />
                      </div>
                    ));
                  })}
                <Badge
                  className="combat-attack-verdict"
                  color={
                    verdict === "hit"
                      ? "var(--semantic-success)"
                      : verdict === "critical"
                        ? "var(--semantic-warning)"
                        : "var(--semantic-danger)"
                  }
                  size="sm"
                >
                  <Icon as={verdict === "miss" ? CircleX : Swords} size="xs" decorative />
                  {t(`combat.resolveAttackVerdict_${verdict}`, {
                    total: result.total,
                    ac: result.review.targetNumber?.value,
                  })}
                </Badge>
                {mode !== "not-rolled" && (
                  <details className="combat-attack-override">
                    <summary>{t("combat.resolveOverrideResult")}</summary>
                    <div
                      className="combat-outcome-toggle"
                      role="group"
                      aria-label={t("combat.resolveOverrideAttackFor", {
                        name: target.label,
                        n: instance + 1,
                      })}
                    >
                      {(
                        [
                          [null, "combat.resolveAutomaticResult"],
                          ["success", "combat.declareHit"],
                          ["failure", "combat.declareMiss"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value ?? "automatic"}
                          type="button"
                          aria-pressed={review.manualOutcome === value}
                          onClick={() =>
                            updateAttackReview(target, instance, {
                              manualOutcome: value,
                            })
                          }
                        >
                          {t(label)}
                        </button>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const missingDamageType = selected.some(
    (key) =>
      modeForTarget(key) === "damage" &&
      ((spec.damageReduction !== undefined &&
        (damage[key] ?? 0) > 0 &&
        partTypes[`${key}:damage-reduction`] === undefined) ||
        relevantDamageParts(key).some((part) => {
          const hasPositiveAmount = damagePartInstances(key, part)
            .map(
              (instance) =>
                part.fixedAmount ?? partAmounts[damageValueKey(key, part, instance)] ?? 0
            )
            .some((amount) => amount > 0);
          return (
            part.typeMode !== "fixed" &&
            hasPositiveAmount &&
            damageTypeFor(key, part) === undefined
          );
        }))
  );
  const missingReductionFacts = Boolean(
    spec.damageReduction &&
    selected.some((key) => (damage[key] ?? 0) <= 0 || (reductionRolls[key] ?? 0) <= 0)
  );
  const hasIneligibleAttack = selected.some((key) =>
    attackResultsFor(key).some((result) => result.outcome.status === "ineligible")
  );
  // A consumable on-hit rider is selected by entering a positive rolled amount.
  // Its resource is spent exactly once even on a multi-target/multi-instance
  // action, and only when the declared outcome actually applies that part.
  const appliedResourceRiders = [
    ...new Map(
      selected.flatMap((key) =>
        modeForTarget(key) !== "damage"
          ? []
          : relevantDamageParts(key).flatMap((part) => {
              if (!part.resourceTrackerId) return [];
              const used = damagePartInstances(key, part)
                .map(
                  (instance) =>
                    part.fixedAmount ??
                    partAmounts[damageValueKey(key, part, instance)] ??
                    0
                )
                .some((amount) => amount > 0);
              return used ? ([[part.resourceTrackerId, part]] as const) : [];
            })
      )
    ).entries(),
  ];
  const missingRiderResource = appliedResourceRiders.some(
    ([trackerId]) => (trackerUses.get(trackerId) ?? 0) <= 0
  );

  const apply = (): void => {
    if (selected.length === 0) return;
    const choices = selected.flatMap((key) => {
      const target = byKey.get(key);
      return target
        ? [
            {
              key,
              target,
              outcomes: outcomeFor(key),
              amount: amountFor(key),
              damagePackets:
                modeForTarget(key) === "damage"
                  ? damageResolutionPacketsFor(key).map(
                      ({ netTotal, instance, attackHit, critical }) => ({
                        amount: netTotal,
                        instance,
                        attackHit,
                        critical,
                      })
                    )
                  : [],
              mode: modeForTarget(key),
            },
          ]
        : [];
    });
    const successful = choices.filter(
      ({ outcomes, mode }) =>
        mode !== "damage" ||
        spec.kind === "automatic" ||
        outcomes.attack === "hit" ||
        outcomes.save === "failed-save"
    );
    const damageLinkedSelfHealing = action.summary.selfHealingFromDamage
      ? Math.floor(
          choices
            .filter(({ mode }) => mode === "damage")
            .reduce((total, { amount }) => total + amount, 0) *
            action.summary.selfHealingFromDamage.fraction
        )
      : 0;
    const otherTargetSelfHealing =
      action.summary.selfHealingOnOther &&
      choices.some(
        ({ target, mode, amount }) =>
          mode === "healing" &&
          amount > 0 &&
          target.currentHp < target.maxHp &&
          Boolean(sheetCombat) &&
          target.targetId !== sheetCombat?.myId
      )
        ? action.summary.selfHealingOnOther.amount
        : 0;
    const linkedSelfHealing = damageLinkedSelfHealing + otherTargetSelfHealing;
    // The economy owner calls this only after every slot/upcast/payment/concentration
    // choice truly commits. Cancelling any nested picker leaves both resources and
    // target state untouched.
    let sharedEffectsApplied = false;
    let closed = false;
    const markTransferEffect =
      sheetCombat && action.standingEffect?.markScope
        ? effectsByActorSource(
            sheetCombat.encounter.effectOps,
            sheetCombat.myId,
            action.standingEffect.sourceId
          ).find((effect) => {
            if (
              effect.payload.kind !== "target-mark" ||
              effect.payload.scope !== action.standingEffect?.markScope
            ) {
              return false;
            }
            return targets.some(
              (target) => target.targetId === effect.target.combatantId && target.down
            );
          })
        : undefined;
    const outcomeOccurrenceId = allocateOutcomeOccurrenceId(
      turnEconomyKey(
        sheetCombat,
        sheetCombat?.characterId ?? character?.id ?? "unknown-character",
        soloRound
      ),
      action.id
    );
    const saveAbility = COMBAT_ABILITIES.has(
      action.summary.saveAbility as CombatAbilityCode
    )
      ? (action.summary.saveAbility as CombatAbilityCode)
      : null;
    const outcomeReceipts = compileCombatOutcomeReceipts({
      occurrenceId: outcomeOccurrenceId,
      actionId: action.id,
      targets: choices.flatMap(({ key, target, outcomes, mode }) => {
        const targetResolvesOutcome = effectModes.length === 0 || mode === "damage";
        const targetParts = damagePartsForTarget(key);
        const needsAttack =
          targetResolvesOutcome &&
          (targetParts.some((part) => part.resolution === "attack") ||
            spec.conditionApplication?.on === "hit");
        const needsSave =
          targetResolvesOutcome &&
          Boolean(saveAbility) &&
          (targetParts.some((part) => part.resolution === "save") ||
            spec.conditionApplication?.on === "failed-save" ||
            spec.kind === "save" ||
            spec.kind === "attack-save");
        const instances =
          Number.isFinite(spec.targetCap) && spec.targetCap > 1 && !spec.area
            ? Math.max(1, allocations[key] ?? 1)
            : 1;
        const reduction = damageReductionFor(key);
        return needsAttack || needsSave || reduction
          ? [
              {
                target: {
                  combatantId: target.targetId,
                },
                ...(needsAttack
                  ? {
                      attack: {
                        results: attackResultsFor(key).flatMap((result) => {
                          if (result.outcome.status === "ineligible") return [];
                          const attack = attackOutcomeOf(result);
                          return [
                            attack?.critical
                              ? ("critical-hit" as const)
                              : attack?.hit
                                ? ("hit" as const)
                                : ("miss" as const),
                          ];
                        }),
                      },
                    }
                  : {}),
                ...(needsSave && saveAbility
                  ? {
                      save: {
                        ability: saveAbility,
                        result: outcomes.save === "saved" ? "success" : "failure",
                        instances,
                      },
                    }
                  : {}),
                ...(reduction
                  ? {
                      damageReduction: {
                        incoming: reduction.incoming,
                        remaining: reduction.remainingBeforeDefenses,
                      },
                    }
                  : {}),
              },
            ]
          : [];
      }),
    });
    const committedAction: ResolvedAction = {
      ...action,
      ...(dynamicHpPool ? { trackerCost: totalPoolCost } : {}),
      ...(markTransferEffect
        ? {
            costTracker: undefined,
            trackerCost: undefined,
            costTrackerIsPool: undefined,
            costTrackerUnit: undefined,
          }
        : {}),
    };
    const consumableActorAttackEffects =
      spec.kind === "attack" || spec.kind === "attack-save"
        ? [
            ...activeRollModeAdjustments(actorEffects, "attack"),
            ...activeRollDieAdjustments(actorEffects, "attack"),
          ].flatMap((adjustment) =>
            adjustment.consume === "next" ? [adjustment.effect] : []
          )
        : [];
    let consumableRollEffects = [
      ...new Map([
        ...(spec.kind === "save" || spec.kind === "attack-save"
          ? choices.flatMap(({ target }) =>
              target.rollDieAdjustments.flatMap((adjustment) =>
                adjustment.rollType === "save" &&
                adjustment.consume === "next" &&
                adjustment.effect
                  ? [[adjustment.effect.id, adjustment.effect] as const]
                  : []
              )
            )
          : []),
        ...consumableActorAttackEffects.map((effect) => [effect.id, effect] as const),
      ]).values(),
    ];
    onCommit(
      () => {
        const consumedRollEffects = consumableRollEffects;
        const endingActiveKey = action.endsActiveKeyOnSuccessfulSave;
        const endsOnSave =
          Boolean(endingActiveKey && action.spellId) &&
          selected.some((key) => outcomeFor(key).save === "saved");
        const endedEffects =
          endsOnSave && sheetCombat && action.spellId
            ? effectsByActorSource(
                sheetCombat.encounter.effectOps,
                sheetCombat.myId,
                action.spellId
              )
            : [];
        const previousCastLevel = endingActiveKey
          ? useCharacterStore.getState().character?.session.activeSpellCastLevels?.[
              endingActiveKey
            ]
          : undefined;
        let endApplied = endsOnSave;
        const endPromise =
          endsOnSave && endingActiveKey
            ? (() => {
                const store = useCharacterStore.getState();
                store.setActiveFeature(endingActiveKey, false);
                store.setActiveSpellCastLevel(endingActiveKey, undefined);
                return (
                  sheetCombat && action.spellId
                    ? revokePersistentCombatEffectsBySource(sheetCombat.campaignId, {
                        actorId: sheetCombat.myId,
                        sourceId: action.spellId,
                      })
                    : Promise.resolve()
                ).catch((error: unknown) => {
                  endApplied = false;
                  const current = useCharacterStore.getState();
                  current.setActiveFeature(endingActiveKey, true);
                  current.setActiveSpellCastLevel(endingActiveKey, previousCastLevel);
                  showToast({ message: t("combat.declareApplyFailed"), duration: 6000 });
                  throw error;
                });
              })()
            : null;
        const riderUndo = appliedResourceRiders.flatMap(([trackerId, part]) => {
          const cs = useCharacterStore.getState();
          cs.useTracker(trackerId, 1);
          const logId = part.sourceLoc
            ? cs.logEvent({
                kind: "rider-use",
                action: action.nameLoc,
                rider: part.sourceLoc,
                effect: "damage",
              })
            : null;
          return [
            () => {
              const current = useCharacterStore.getState();
              current.restoreTracker(trackerId, 1);
              if (logId) current.removeLogEntry(logId);
            },
          ];
        });
        const effects = choices.flatMap(({ target, amount, damagePackets, mode }) => {
          if (!sheetCombat || target.targetId === sheetCombat.myId) return [];
          const shared = {
            targetId: target.targetId,
          };
          const hpEffect =
            amount <= 0
              ? []
              : mode === "healing"
                ? [{ ...shared, kind: "healing" as const, amount }]
                : mode === "temp-hp"
                  ? [{ ...shared, kind: "temp-hp" as const, amount }]
                  : damagePackets
                      .filter((packet) => packet.amount > 0)
                      .map((packet) => ({
                        ...shared,
                        kind: "damage" as const,
                        intake: "resolved" as const,
                        amount: packet.amount,
                        ...(packet.attackHit && damagePackets.length > 1
                          ? { hit: true as const }
                          : {}),
                        ...(packet.critical ? { crit: true } : {}),
                      }));
          const conditionEffects = (conditions[target.key] ?? [])
            .filter((conditionId) => !conditionLifetimeFor(conditionId))
            .map((conditionId) => ({
              kind: "condition" as const,
              targetId: target.targetId,
              conditionId,
              active: true,
            }));
          const removalEffects = (conditionRemovals[target.key] ?? []).map(
            (conditionId) => ({
              kind: "condition" as const,
              targetId: target.targetId,
              conditionId,
              active: false,
            })
          );
          const resourceEffects = action.summary.grantedDie
            ? [
                {
                  kind: "resource" as const,
                  targetId: target.targetId,
                  resource: {
                    kind: "bardic-inspiration-die" as const,
                    value: action.summary.grantedDie.die,
                  },
                },
              ]
            : action.summary.grantsHeroicInspiration
              ? [
                  {
                    kind: "resource" as const,
                    targetId: target.targetId,
                    resource: { kind: "heroic-inspiration" as const },
                  },
                ]
              : [];
          const stabilizationEffects = action.summary.stabilize
            ? [
                {
                  kind: "stabilize" as const,
                  targetId: target.targetId,
                },
              ]
            : [];
          return [
            ...hpEffect,
            ...conditionEffects,
            ...removalEffects,
            ...resourceEffects,
            ...stabilizationEffects,
          ];
        });
        const hitTargetIds = successful.flatMap(({ target, outcomes, mode }) =>
          mode === "damage" &&
          (spec.kind === "attack" || spec.kind === "attack-save") &&
          outcomes.attack === "hit"
            ? [target.targetId]
            : []
        );
        let consumeSaveAdjustments: Promise<void> | null = null;
        if (
          sheetCombat &&
          (effects.length > 0 ||
            hitTargetIds.length > 0 ||
            consumedRollEffects.length > 0) &&
          !sharedEffectsApplied
        ) {
          sharedEffectsApplied = true;
          const pcTargets = targets.flatMap((target) =>
            target.kind === "pc" && target.memberUid && target.characterId
              ? [
                  {
                    targetId: target.targetId,
                    memberUid: target.memberUid,
                    characterId: target.characterId,
                    currentHp: target.currentHp,
                    tempHp: target.tempHp,
                    maxHp: target.maxHp,
                    conditions: target.conditions,
                    bardicInspirationDie: target.bardicInspirationDie,
                    heroicInspiration: target.heroicInspiration,
                    ...(target.stable
                      ? { deathSaves: { successes: 3, failures: 0 } }
                      : {}),
                    defenses: target.defenses,
                  },
                ]
              : []
          );
          const sharedEffectsApply = applyDeclaredCombatEffects(
            sheetCombat.campaignId,
            effects,
            {
              actorId: sheetCombat.myId,
              action: action.nameLoc,
              round: sheetCombat.round,
              outcomeOccurrenceId,
              pcTargets,
              ...(consumedRollEffects.length > 0
                ? { consumeEffectIds: consumedRollEffects.map(({ id }) => id) }
                : {}),
              ...(hitTargetIds.length > 0 ? { hitTargetIds } : {}),
              ...(spec.kind === "attack" || spec.kind === "attack-save"
                ? { attackMode }
                : {}),
            }
          );
          void sharedEffectsApply.catch(() => {
            sharedEffectsApplied = false;
            showToast({ message: t("combat.declareApplyFailed"), duration: 6000 });
          });
          consumeSaveAdjustments =
            consumedRollEffects.length > 0 ? sharedEffectsApply : null;
        }
        const actor = sheetCombat
          ? targets.find((target) => target.targetId === sheetCombat.myId)
          : undefined;
        const actorRef: CombatantRef | null =
          actor?.kind === "pc" && actor.memberUid && actor.characterId
            ? {
                kind: "pc",
                combatantId: actor.targetId,
                memberUid: actor.memberUid,
                characterId: actor.characterId,
              }
            : !sheetCombat && character
              ? {
                  kind: "pc",
                  combatantId: "self",
                  memberUid: "self",
                  characterId: character.id,
                }
              : null;
        const effectPosition = sheetCombat
          ? {
              round: sheetCombat.round,
              currentCombatantId: sheetCombat.encounter.currentCombatantId,
              phase: "turn-start" as const,
              order: sheetCombat.encounter.order ?? sheetCombat.view.turnOrderIds,
            }
          : {
              round: soloRound,
              currentCombatantId: "self",
              phase: "turn-start" as const,
              order: ["self"],
            };
        const standingEffect = spec.standingEffect;
        const persistentEffects: ActiveCombatEffect[] =
          actorRef && (standingEffect || conditionSourceId)
            ? successful.flatMap(({ target, mode, amount }) => {
                if (
                  standingEffect?.requiresAppliedTempHp &&
                  (mode !== "temp-hp" || amount <= target.tempHp)
                ) {
                  return [];
                }
                const targetRef: CombatantRef | null = !sheetCombat
                  ? actorRef
                  : target.kind === "monster"
                    ? {
                        kind: "monster",
                        combatantId: target.targetId,
                      }
                    : target.memberUid && target.characterId
                      ? {
                          kind: "pc",
                          combatantId: target.targetId,
                          memberUid: target.memberUid,
                          characterId: target.characterId,
                        }
                      : null;
                if (!targetRef) return [];
                const relativeBoundary = standingEffect?.lifetime.turnBoundary
                  ? turnBoundaryAfter(
                      actorRef.combatantId,
                      standingEffect.lifetime.turnBoundary.turns,
                      standingEffect.lifetime.turnBoundary.phase,
                      effectPosition
                    )
                  : null;
                const standingDuration: ActiveCombatEffect["duration"] =
                  markTransferEffect
                    ? markTransferEffect.duration
                    : standingEffect?.lifetime.concentration
                      ? {
                          kind: "concentration",
                          actorId: actorRef.combatantId,
                          sourceId: standingEffect.source.id,
                        }
                      : relativeBoundary
                        ? relativeBoundary
                        : standingEffect?.lifetime.maxRounds !== undefined
                          ? {
                              kind: "turn-boundary",
                              combatantId: actorRef.combatantId,
                              round:
                                effectPosition.round + standingEffect.lifetime.maxRounds,
                              phase: "turn-end",
                            }
                          : { kind: "encounter" };
                const standing = standingEffect
                  ? [
                      {
                        id: crypto.randomUUID(),
                        actor: actorRef,
                        target: targetRef,
                        source: standingEffect.source,
                        payload: standingEffect.payload,
                        duration: standingDuration,
                      } satisfies ActiveCombatEffect,
                    ]
                  : [];
                const sourceConditions = conditionSourceId
                  ? (conditions[target.key] ?? []).flatMap((conditionId) => {
                      const conditionLifetime = conditionLifetimeFor(conditionId);
                      if (!conditionLifetime) return [];
                      const conditionBoundary =
                        conditionLifetime.kind === "turn-boundary"
                          ? turnBoundaryAfter(
                              conditionLifetime.anchor === "target"
                                ? targetRef.combatantId
                                : actorRef.combatantId,
                              conditionLifetime.turns,
                              conditionLifetime.phase,
                              effectPosition
                            )
                          : null;
                      return [
                        {
                          id: crypto.randomUUID(),
                          actor: actorRef,
                          target: targetRef,
                          source: {
                            kind: action.source === "spell" ? "spell" : "feature",
                            id: conditionSourceId,
                            actionId: action.id,
                            ...(action.slotLevel !== undefined
                              ? { castLevel: action.slotLevel }
                              : {}),
                          },
                          payload: { kind: "condition", conditionId },
                          duration:
                            conditionLifetime.kind === "source" && action.concentration
                              ? {
                                  kind: "concentration",
                                  actorId: actorRef.combatantId,
                                  sourceId: conditionSourceId,
                                }
                              : conditionLifetime.kind === "manual"
                                ? { kind: "encounter" }
                                : conditionBoundary
                                  ? conditionBoundary
                                  : {
                                      kind: "turn-boundary",
                                      combatantId: actorRef.combatantId,
                                      round:
                                        effectPosition.round +
                                        (conditionLifetime.kind === "timed"
                                          ? conditionLifetime.maxRounds
                                          : 0),
                                      phase: "turn-end",
                                    },
                        } satisfies ActiveCombatEffect,
                      ];
                    })
                  : [];
                return [...standing, ...sourceConditions];
              })
            : [];
        const persistentApply =
          sheetCombat && persistentEffects.length > 0
            ? (async () => {
                try {
                  // Sequential by design: if one target fails, no later append can race
                  // the compensation and land after it. Revoking the whole intended batch
                  // is safe because a missing occurrence is an idempotent no-op.
                  for (const effect of persistentEffects) {
                    await appendPersistentCombatEffect(sheetCombat.campaignId, effect);
                  }
                } catch (error) {
                  await Promise.allSettled(
                    persistentEffects.map((effect) =>
                      revokePersistentCombatEffect(sheetCombat.campaignId, effect.id)
                    )
                  );
                  throw error;
                }
              })()
            : null;
        if (persistentApply) {
          void persistentApply.catch(() => {
            showToast({ message: t("combat.declareApplyFailed"), duration: 6000 });
          });
        }
        const undoSoloEffects =
          !sheetCombat && persistentEffects.length > 0
            ? applySoloCombatEffects(persistentEffects)
            : null;
        // Own-sheet effects apply locally for immediate solo feedback. In an encounter the
        // shared batch above writes table-mates' narrow combat slices transactionally, so a
        // target need not be online; the local branch only avoids applying the actor twice.
        const own = choices.find(
          ({ target }) => !sheetCombat || target.targetId === sheetCombat.myId
        );
        const ownConditions = own ? (conditions[own.target.key] ?? []) : [];
        const ownDirectConditions = ownConditions.filter(
          (conditionId) => !conditionLifetimeFor(conditionId)
        );
        const undoOwn =
          own || linkedSelfHealing > 0
            ? applyResolvedCombatEffects({
                ...((own?.amount ?? 0) > 0 && own?.mode === "temp-hp"
                  ? { tempHp: own.amount }
                  : {}),
                ...((own?.amount ?? 0) > 0 && own?.mode === "healing"
                  ? { healing: own.amount + linkedSelfHealing }
                  : linkedSelfHealing > 0
                    ? { healing: linkedSelfHealing }
                    : {}),
                ...(own?.mode === "damage" && own.damagePackets.length > 0
                  ? {
                      damagePackets: own.damagePackets.map((packet) => ({
                        amount: packet.amount,
                        ...(packet.critical ? { crit: true } : {}),
                        ...(packet.attackHit && actorRef
                          ? {
                              hit: {
                                attacker: actorRef,
                                attackMode,
                              },
                            }
                          : {}),
                      })),
                    }
                  : {}),
                ...(ownDirectConditions.length
                  ? { addConditions: ownDirectConditions }
                  : {}),
                ...(own && conditionRemovals[own.target.key]?.length
                  ? { removeConditions: conditionRemovals[own.target.key] }
                  : {}),
                ...(own && action.summary.grantedDie
                  ? { bardicInspirationDie: action.summary.grantedDie.die }
                  : {}),
                ...(own && action.summary.grantsHeroicInspiration
                  ? { heroicInspiration: true }
                  : {}),
                ...(own && action.summary.stabilize ? { stabilize: true } : {}),
              })
            : null;
        const appliedRiders = [
          ...new Set(choices.flatMap(({ target }) => conditions[target.key] ?? [])),
        ];
        if (
          sheetCombat &&
          ((!spec.damageReduction && spec.hasDamage) || appliedRiders.length > 0)
        ) {
          declareAttack({
            action: action.nameLoc,
            outcome: successful.length > 0 ? "hit" : "miss",
            targetIds: choices.map(({ target }) => target.targetId),
            round: sheetCombat.round,
            ...(spec.targetCap > 1 && Number.isFinite(spec.targetCap)
              ? { instances: spec.targetCap }
              : {}),
            ...(spec.kind === "save" || spec.kind === "attack-save"
              ? { save: true }
              : {}),
            ...(appliedRiders.length > 0 ? { riders: appliedRiders } : {}),
          });
        }
        if (!closed) {
          closed = true;
          onDone();
        }
        const undoPersistent =
          sheetCombat && persistentApply
            ? () => {
                void persistentApply
                  .catch(() => undefined)
                  .then(() =>
                    Promise.all(
                      persistentEffects.map((effect) =>
                        revokePersistentCombatEffect(sheetCombat.campaignId, effect.id)
                      )
                    )
                  )
                  .catch(() => {
                    showToast({
                      message: t("combat.declareApplyFailed"),
                      duration: 6000,
                    });
                  });
              }
            : null;
        const undoConsumedSaveAdjustments =
          sheetCombat && consumeSaveAdjustments
            ? () => {
                void consumeSaveAdjustments
                  .then(async () => {
                    const restored = consumedRollEffects.map((effect) => ({
                      ...effect,
                      id: crypto.randomUUID(),
                    }));
                    for (const effect of restored) {
                      await appendPersistentCombatEffect(sheetCombat.campaignId, effect);
                    }
                    consumableRollEffects = restored;
                  })
                  .catch(() => {
                    showToast({
                      message: t("combat.declareApplyFailed"),
                      duration: 6000,
                    });
                  });
              }
            : null;
        const undoEndedRecurringEffect =
          endPromise && endingActiveKey
            ? () => {
                void endPromise
                  .then(async () => {
                    if (!endApplied) return;
                    const current = useCharacterStore.getState();
                    current.setActiveFeature(endingActiveKey, true);
                    current.setActiveSpellCastLevel(endingActiveKey, previousCastLevel);
                    if (!sheetCombat) return;
                    for (const effect of endedEffects) {
                      await appendPersistentCombatEffect(sheetCombat.campaignId, {
                        ...effect,
                        id: crypto.randomUUID(),
                      });
                    }
                  })
                  .catch(() => undefined);
              }
            : null;
        return undoOwn ||
          undoSoloEffects ||
          undoPersistent ||
          undoConsumedSaveAdjustments ||
          undoEndedRecurringEffect ||
          riderUndo.length
          ? () => {
              undoPersistent?.();
              undoConsumedSaveAdjustments?.();
              undoEndedRecurringEffect?.();
              undoOwn?.();
              undoSoloEffects?.();
              for (const undo of riderUndo) undo();
            }
          : undefined;
      },
      {
        action: committedAction,
        outcomeOccurrenceId,
        outcomes: outcomeReceipts,
      }
    );
  };

  const summary = [
    action.summary.attackBonus !== undefined
      ? t("combat.resolveAttackBonus", { bonus: action.summary.attackBonus })
      : null,
    action.summary.saveAbility && action.summary.saveDC
      ? t("combat.resolveSave", {
          ability: action.summary.saveAbility,
          dc: action.summary.saveDC,
        })
      : null,
    action.summary.damage
      ? t("combat.resolveDamageFormula", { formula: action.summary.damage })
      : null,
    action.summary.damageReduction
      ? t("combat.resolveDamageReductionFormula", {
          dice: action.summary.damageReduction.dice,
          bonus: action.summary.damageReduction.bonus,
        })
      : null,
    action.summary.oneRollDamageBonus
      ? t("combat.resolveOneRollBonus", {
          bonus: action.summary.oneRollDamageBonus,
        })
      : null,
    action.summary.healing
      ? t("combat.resolveHealingFormula", { formula: action.summary.healing })
      : null,
    action.summary.grantedDie
      ? t("combat.resolveGrantDie", { die: action.summary.grantedDie.die })
      : null,
    action.summary.grantsHeroicInspiration
      ? t("combat.resolveGrantHeroicInspiration")
      : null,
    action.summary.stabilize ? t("combat.resolveStabilize") : null,
    action.summary.effect ?? null,
    action.summary.range ?? null,
  ].filter(Boolean);

  return (
    <ModalShell
      open
      onClose={onDone}
      title={action.name}
      subtitle={summary.join(" · ")}
      rubric={t("combat.resolveRubric")}
      size="lg"
      compact
    >
      <ModalBody data-testid="combat-resolver" className="combat-resolver">
        <section className="combat-resolver-step" aria-labelledby="combat-target-heading">
          <div className="combat-resolver-heading">
            <span className="combat-resolver-number">1</span>
            <div>
              <h3 id="combat-target-heading">{t("combat.resolveChooseTargets")}</h3>
              <p>
                {Number.isFinite(spec.targetCap)
                  ? t("combat.resolveTargetCount", {
                      selected: allocationTotal,
                      total: spec.targetCap,
                    })
                  : t("combat.resolveAreaTargets", { selected: selected.length })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAll((value) => !value)}
            >
              <Icon as={Users} size="sm" decorative />
              {t(
                showAll
                  ? activeAffinity === "ally"
                    ? "combat.resolveAlliesOnly"
                    : "combat.resolveEnemiesOnly"
                  : "combat.resolveAnyCreature"
              )}
            </Button>
          </div>

          {visibleTargets.length === 0 ? (
            <p className="combat-resolver-empty">{t("combat.declareNoTargets")}</p>
          ) : (
            <div className="combat-target-grid">
              {visibleTargets.map((target) => {
                const chosen = selected.includes(target.key);
                return (
                  <button
                    key={target.key}
                    type="button"
                    className="combat-target-card"
                    data-selected={chosen || undefined}
                    data-down={target.down || undefined}
                    aria-pressed={chosen}
                    disabled={!chosen && atCap}
                    onClick={() => toggleTarget(target)}
                  >
                    <span className="combat-target-seal">
                      <Portrait
                        src={target.portraitUrl}
                        crop={target.portraitCrop}
                        name={target.label}
                        seed={target.key}
                        className="h-full w-full"
                      />
                    </span>
                    <span className="combat-target-copy">
                      <strong>{target.label}</strong>
                      <span>
                        {target.kind === "monster"
                          ? t("combat.resolveHp", {
                              current: target.currentHp,
                              max: target.maxHp,
                            })
                          : t("combat.resolvePlayerCharacter")}
                      </span>
                      {target.bardicInspirationDie && (
                        <small>
                          {t("combat.resolveHeldBardicDie", {
                            die: target.bardicInspirationDie,
                          })}
                        </small>
                      )}
                      {target.heroicInspiration && (
                        <small>{t("combat.resolveHeldHeroicInspiration")}</small>
                      )}
                      {target.markScopes.map((scope) => (
                        <small key={scope}>
                          {t(`combat.resolveTargetMark_${scope}`)}
                        </small>
                      ))}
                      {target.conditions.length > 0 && (
                        <small>
                          {target.conditions
                            .map(
                              (id) =>
                                conditionChoices.find((option) => option.id === id)
                                  ?.label ?? id
                            )
                            .join(" · ")}
                        </small>
                      )}
                      {target.healingBlocked && (
                        <small>{t("combat.resolveHealingBlocked")}</small>
                      )}
                      {target.speedAdjustmentFt !== 0 && (
                        <small>
                          {t("combat.resolveSpeedAdjustment", {
                            distance: localeDistance(target.speedAdjustmentFt, locale),
                          })}
                        </small>
                      )}
                      {target.rollDieAdjustments.map((adjustment, index) => (
                        <small key={`${adjustment.sourceId}-${index}`}>
                          {t(
                            adjustment.consume === "next"
                              ? "combat.resolveNextRollAdjustment"
                              : "combat.resolveEachRollAdjustment",
                            {
                              roll: t(`combat.resolveRoll_${adjustment.rollType}`),
                              sign: adjustment.operation === "add" ? "+" : "−",
                              dice: adjustment.dice,
                            }
                          )}
                        </small>
                      ))}
                    </span>
                    <span className="combat-target-check" aria-hidden>
                      {chosen ? <Check /> : <CircleDot />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selected.length > 0 && (
          <section
            className="combat-resolver-step"
            aria-labelledby="combat-result-heading"
          >
            <div className="combat-resolver-heading">
              <span className="combat-resolver-number">2</span>
              <h3 id="combat-result-heading">{t("combat.resolveResults")}</h3>
            </div>

            {spec.sharedAmount &&
              spec.healingMode !== "maximum" &&
              (appliesHealing || appliesTempHp) && (
                <div className="combat-area-roll">
                  <span>
                    <strong>{t("combat.resolveHealingRolled")}</strong>
                    <small>
                      {appliesTempHp
                        ? (action.summary.tempHpApply?.dice ??
                          (action.summary.tempHpRoll
                            ? tempHpRollFormula(action.summary.tempHpRoll)
                            : undefined))
                        : (action.summary.healApply?.dice ?? action.summary.healing)}
                    </small>
                  </span>
                  <NumberStepper
                    compact
                    digits={3}
                    min={0}
                    value={areaDamage}
                    onChange={setAreaDamage}
                    ariaLabel={t("combat.resolveHealingAria")}
                    decrementLabel={t("common.decrease")}
                    incrementLabel={t("common.increase")}
                  />
                </div>
              )}

            <div className="combat-result-list">
              {selected.map((key) => {
                const target = byKey.get(key);
                if (!target) return null;
                const targetMode = modeForTarget(key);
                const targetAppliesDamage = targetMode === "damage";
                const targetAppliesHealing = targetMode === "healing";
                const targetAppliesTempHp = targetMode === "temp-hp";
                const targetResolvesOutcome =
                  effectModes.length === 0 || targetAppliesDamage;
                const outcomes = outcomeFor(key);
                const damageResolution = targetAppliesDamage
                  ? damageResolutionFor(key)
                  : null;
                const targetDamageParts = damagePartsForTarget(key);
                const needsAttackOutcome =
                  targetDamageParts.some((part) => part.resolution === "attack") ||
                  spec.conditionApplication?.on === "hit";
                const needsSaveOutcome =
                  targetDamageParts.some((part) => part.resolution === "save") ||
                  spec.conditionApplication?.on === "failed-save" ||
                  spec.kind === "save" ||
                  spec.kind === "attack-save";
                return (
                  <div key={key} className="combat-result-row">
                    <div className="combat-result-target">
                      <strong>{target.label}</strong>
                      {damageParts.some((part) => part.target === "primary") &&
                        selected[0] === key && (
                          <small>{t("combat.resolvePrimaryTarget")}</small>
                        )}
                      {target.qualifiedDefenseCount > 0 && targetAppliesDamage && (
                        <small>{t("combat.resolveConditionalDefense")}</small>
                      )}
                      {needsAttackOutcome &&
                        target.incomingAttackModes.map(({ mode, sourceId }) => (
                          <Badge
                            key={`${sourceId}:${mode}`}
                            color="var(--semantic-warning)"
                            size="sm"
                          >
                            {t(`combat.resolveAttackMode_${mode}`)}
                          </Badge>
                        ))}
                      {needsAttackOutcome &&
                        actorRollDieAdjustments
                          .filter((adjustment) => adjustment.rollType === "attack")
                          .map((adjustment, index) => (
                            <Badge
                              key={`${adjustment.sourceId}-attack-${index}`}
                              color="var(--semantic-warning)"
                              size="sm"
                            >
                              {t(
                                adjustment.consume === "next"
                                  ? "combat.resolveNextRollAdjustment"
                                  : "combat.resolveEachRollAdjustment",
                                {
                                  roll: t("combat.resolveRoll_attack"),
                                  sign: adjustment.operation === "add" ? "+" : "−",
                                  dice: adjustment.dice,
                                }
                              )}
                            </Badge>
                          ))}
                      {needsSaveOutcome &&
                        target.rollDieAdjustments
                          .filter((adjustment) => adjustment.rollType === "save")
                          .map((adjustment, index) => (
                            <Badge
                              key={`${adjustment.sourceId}-save-${index}`}
                              color="var(--semantic-warning)"
                              size="sm"
                            >
                              {t(
                                adjustment.consume === "next"
                                  ? "combat.resolveNextRollAdjustment"
                                  : "combat.resolveEachRollAdjustment",
                                {
                                  roll: t("combat.resolveRoll_save"),
                                  sign: adjustment.operation === "add" ? "+" : "−",
                                  dice: adjustment.dice,
                                }
                              )}
                            </Badge>
                          ))}
                      {action.summary.oneRollDamageBonus && targetAppliesDamage && (
                        <button
                          type="button"
                          className="combat-one-roll-bonus"
                          aria-pressed={activeOneRollBonusTarget === key}
                          aria-label={t("combat.resolveOneRollBonusFor", {
                            bonus: action.summary.oneRollDamageBonus,
                            name: target.label,
                          })}
                          onClick={() => setOneRollBonusTarget(key)}
                        >
                          {t("combat.resolveOneRollBonus", {
                            bonus: action.summary.oneRollDamageBonus,
                          })}
                          {activeOneRollBonusTarget === key && (
                            <Icon as={Check} size="xs" decorative />
                          )}
                        </button>
                      )}
                      {Number.isFinite(spec.targetCap) && spec.targetCap > 1 && (
                        <div className="combat-allocation">
                          <span>{t("combat.resolveInstances")}</span>
                          <NumberStepper
                            compact
                            digits={2}
                            min={1}
                            value={allocations[key] ?? 1}
                            onChange={(value) => setAllocation(key, value)}
                            ariaLabel={t("combat.resolveInstancesFor", {
                              name: target.label,
                            })}
                            decrementLabel={t("common.decrease")}
                            incrementLabel={t("common.increase")}
                          />
                        </div>
                      )}
                    </div>

                    {mixedEffects && (
                      <div
                        className="combat-outcome-toggle combat-effect-mode"
                        role="group"
                        aria-label={t("combat.resolveEffectForAria", {
                          name: target.label,
                        })}
                      >
                        {effectModes.map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            aria-pressed={targetMode === mode}
                            onClick={() =>
                              setTargetModes((current) => ({
                                ...current,
                                [key]: mode,
                              }))
                            }
                          >
                            {t(
                              mode === "damage"
                                ? "combat.damage"
                                : mode === "healing"
                                  ? "combat.heal"
                                  : "combat.tempHpRollLabel"
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {targetResolvesOutcome && (needsAttackOutcome || needsSaveOutcome) ? (
                      <div className="combat-outcome-stack">
                        {needsAttackOutcome && renderAttackResolution(target)}
                        {needsSaveOutcome && (
                          <div
                            className="combat-outcome-toggle"
                            role="group"
                            aria-label={t("combat.resolveSaveOutcomeFor", {
                              name: target.label,
                            })}
                          >
                            {(["failed-save", "saved"] as const).map((value) => (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={outcomes.save === value}
                                onClick={() => {
                                  setSaveOutcomes((current) => ({
                                    ...current,
                                    [key]: value,
                                  }));
                                  if (spec.conditionApplication?.on === "failed-save")
                                    syncModeledConditions(
                                      target,
                                      value === "failed-save"
                                    );
                                }}
                              >
                                <Icon
                                  as={value === "saved" ? ShieldCheck : Swords}
                                  size="sm"
                                  decorative
                                />
                                {t(OUTCOME_KEY[value])}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}

                    {targetAppliesDamage && relevantDamageParts(key).length > 0 && (
                      <div className="combat-damage-parts">
                        {relevantDamageParts(key)
                          .filter((part) => part.id !== "one-roll-bonus")
                          .filter((part) => !part.sharedAmount || selected[0] === key)
                          .flatMap((part) =>
                            damagePartInstances(key, part).map((instance) =>
                              renderDamageEntry(key, part, instance)
                            )
                          )}
                      </div>
                    )}

                    {targetAppliesDamage && spec.damageReduction && (
                      <div className="combat-damage-parts">
                        <div className="combat-damage-entry">
                          <span>{t("combat.resolveIncomingDamage")}</span>
                          <NumberStepper
                            compact
                            digits={3}
                            min={0}
                            value={damage[key] ?? 0}
                            onChange={(value) =>
                              setDamage((current) => ({ ...current, [key]: value }))
                            }
                            ariaLabel={t("combat.resolveIncomingDamageForAria", {
                              name: target.label,
                            })}
                            decrementLabel={t("common.decrease")}
                            incrementLabel={t("common.increase")}
                          />
                        </div>
                        <div className="combat-damage-entry">
                          <span>{t("familiar.damageConversion")}</span>
                          <select
                            value={partTypes[`${key}:damage-reduction`] ?? ""}
                            aria-label={t("combat.resolveDamageTypeAria", {
                              name: target.label,
                            })}
                            onChange={(event) =>
                              setPartTypes((current) => ({
                                ...current,
                                [`${key}:damage-reduction`]: event.target
                                  .value as DamageType,
                              }))
                            }
                          >
                            <option value="">
                              {t("combat.resolveChooseDamageType")}
                            </option>
                            {spec.damageReduction.damageTypes.map((type) => (
                              <option key={type} value={type}>
                                {t(`srd.damage_${type}`)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="combat-damage-entry">
                          <span>
                            {t("combat.resolveReductionRoll")}
                            <small>
                              {t("combat.resolveDamageReductionFormula", {
                                dice: spec.damageReduction.dice,
                                bonus: spec.damageReduction.bonus,
                              })}
                            </small>
                          </span>
                          <NumberStepper
                            compact
                            digits={3}
                            min={0}
                            value={reductionRolls[key] ?? 0}
                            onChange={(value) =>
                              setReductionRolls((current) => ({
                                ...current,
                                [key]: value,
                              }))
                            }
                            ariaLabel={t("combat.resolveReductionRollForAria", {
                              name: target.label,
                            })}
                            decrementLabel={t("common.decrease")}
                            incrementLabel={t("common.increase")}
                          />
                        </div>
                      </div>
                    )}

                    {!spec.sharedAmount &&
                      (targetAppliesHealing || targetAppliesTempHp) &&
                      spec.healingMode !== "full" &&
                      spec.healingMode !== "maximum" && (
                        <div className="combat-damage-entry">
                          <span>
                            {t(
                              targetAppliesTempHp
                                ? "combat.tempHpRollLabel"
                                : "combat.heal"
                            )}
                          </span>
                          <NumberStepper
                            compact
                            digits={3}
                            min={0}
                            max={
                              poolHealingMaxFor(key) ??
                              (spec.effectPool !== undefined
                                ? Math.max(
                                    0,
                                    spec.effectPool -
                                      selected.reduce(
                                        (sum, selectedKey) =>
                                          sum +
                                          (selectedKey === key
                                            ? 0
                                            : (damage[selectedKey] ?? 0)),
                                        0
                                      )
                                  )
                                : undefined)
                            }
                            value={damage[key] ?? 0}
                            onChange={(value) =>
                              setDamage((current) => ({ ...current, [key]: value }))
                            }
                            ariaLabel={t(
                              targetMode === "temp-hp"
                                ? "combat.resolveTempHpForAria"
                                : "combat.resolveHealingForAria",
                              { name: target.label }
                            )}
                            decrementLabel={t("common.decrease")}
                            incrementLabel={t("common.increase")}
                          />
                        </div>
                      )}

                    {targetAppliesDamage &&
                      action.summary.selfHealingFromDamage &&
                      amountFor(key) > 0 && (
                        <Badge
                          color="var(--semantic-success)"
                          size="sm"
                          glyph={<Icon as={Heart} size="xs" decorative />}
                        >
                          {t("combat.resolveLinkedSelfHeal", {
                            amount: Math.floor(
                              amountFor(key) *
                                action.summary.selfHealingFromDamage.fraction
                            ),
                          })}
                        </Badge>
                      )}

                    {targetAppliesHealing &&
                      action.summary.selfHealingOnOther &&
                      sheetCombat &&
                      target.targetId !== sheetCombat.myId &&
                      selected.find(
                        (selectedKey) =>
                          modeForTarget(selectedKey) === "healing" &&
                          byKey.get(selectedKey)?.targetId !== sheetCombat.myId
                      ) === key && (
                        <Badge
                          color="var(--semantic-success)"
                          size="sm"
                          glyph={<Icon as={Heart} size="xs" decorative />}
                        >
                          {t("combat.resolveLinkedSelfHeal", {
                            amount: action.summary.selfHealingOnOther.amount,
                          })}
                        </Badge>
                      )}

                    <div className="combat-condition-picker">
                      {spec.conditionRemoval &&
                        target.conditions
                          .filter((conditionId) =>
                            spec.conditionRemoval?.options.includes(conditionId)
                          )
                          .map((conditionId) => {
                            const selectedForRemoval = (
                              conditionRemovals[key] ?? []
                            ).includes(conditionId);
                            const label =
                              conditionChoices.find((option) => option.id === conditionId)
                                ?.label ?? conditionId;
                            return (
                              <button
                                key={`remove-${conditionId}`}
                                type="button"
                                className="combat-condition-chip"
                                data-selected={selectedForRemoval || undefined}
                                aria-pressed={selectedForRemoval}
                                onClick={() => toggleConditionRemoval(key, conditionId)}
                              >
                                {t("combat.resolveCureCondition", { condition: label })}
                                {selectedForRemoval && (
                                  <Icon as={Check} size="xs" decorative />
                                )}
                              </button>
                            );
                          })}
                      <select
                        value=""
                        aria-label={t("combat.resolveAddConditionFor", {
                          name: target.label,
                        })}
                        onChange={(event) => {
                          const conditionId = event.target.value;
                          if (!conditionId) return;
                          setConditions((current) => ({
                            ...current,
                            [key]: spec.conditionApplication?.max
                              ? [
                                  ...new Set([
                                    ...(current[key] ?? []).filter(
                                      (value) =>
                                        !spec.conditionApplication?.options.includes(
                                          value
                                        )
                                    ),
                                    conditionId,
                                  ]),
                                ].slice(-spec.conditionApplication.max)
                              : [...new Set([...(current[key] ?? []), conditionId])],
                          }));
                        }}
                      >
                        <option value="">{t("combat.resolveAddCondition")}</option>
                        {conditionChoices.map((condition) => (
                          <option key={condition.id} value={condition.id}>
                            {condition.label}
                            {conditionIsImmune(target, condition.id)
                              ? ` — ${t("combat.resolveConditionImmune")}`
                              : ""}
                          </option>
                        ))}
                      </select>
                      {(conditions[key] ?? []).map((conditionId) => {
                        const label =
                          conditionChoices.find((option) => option.id === conditionId)
                            ?.label ?? conditionId;
                        return (
                          <button
                            key={conditionId}
                            type="button"
                            className="combat-condition-chip"
                            data-immune={
                              conditionIsImmune(target, conditionId) || undefined
                            }
                            aria-label={t("combat.resolveRemoveCondition", {
                              condition: label,
                              name: target.label,
                            })}
                            onClick={() =>
                              setConditions((current) => ({
                                ...current,
                                [key]: (current[key] ?? []).filter(
                                  (value) => value !== conditionId
                                ),
                              }))
                            }
                          >
                            {label}
                            <Icon as={X} size="xs" decorative />
                          </button>
                        );
                      })}
                    </div>

                    {(targetAppliesDamage ||
                      targetAppliesHealing ||
                      targetAppliesTempHp) && (
                      <Badge
                        className="combat-result-amount"
                        variant="muted"
                        size="sm"
                        glyph={
                          targetAppliesHealing || targetAppliesTempHp ? (
                            <Heart width={12} height={12} />
                          ) : (
                            <HeartPulse width={12} height={12} />
                          )
                        }
                      >
                        {damageResolution &&
                        damageResolution.rawTotal !== damageResolution.netTotal
                          ? t("combat.damageTotalPreview", {
                              raw: damageResolution.rawTotal,
                              net: damageResolution.netTotal,
                            })
                          : t(
                              targetAppliesHealing || targetAppliesTempHp
                                ? "combat.resolveAppliedHealing"
                                : "combat.resolveAppliedDamage",
                              { amount: amountFor(key) }
                            )}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </ModalBody>
      <ModalFoot>
        <Button variant="secondary" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button
          onClick={apply}
          disabled={
            selected.length === 0 ||
            hasIneligibleAttack ||
            missingDamageType ||
            missingReductionFacts ||
            missingRiderResource ||
            (dynamicHpPool &&
              (totalPoolCost <= 0 || totalPoolCost > (spec.poolSpend?.remaining ?? 0)))
          }
        >
          <Icon as={Swords} size="sm" decorative />
          {t("combat.resolveApply")}
        </Button>
      </ModalFoot>
    </ModalShell>
  );
}
