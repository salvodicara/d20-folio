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
import { aggregateCharacterGrants, effectiveMaxHp } from "@/lib/aggregate-character";
import { useToastStore } from "@/stores/toastStore";
import { useCombatStore } from "@/stores/combatStore";
import { useLocale } from "@/hooks/useLocale";
import { conditionOptions } from "@/lib/views/tracker-view";
import { monsterPortraitUrl } from "@/data/monster-art";
import {
  appendPersistentCombatEffect,
  applyDeclaredCombatEffects,
  revokePersistentCombatEffect,
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
import { NO_DEFENSES, type DamageDefenses } from "@/lib/damage-intake";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import { resolveTrackers, type ResolvedAction } from "@/lib/smart-tracker";
import type { PortraitCrop } from "@/types/character";
import type { ConditionId, DamageType } from "@/data/types";
import type { ActiveCombatEffect, CombatantRef } from "@/types/combat-effect";
import {
  activeRollDieAdjustments,
  effectsForTarget,
  healingBlockedByEffects,
  speedAdjustmentByEffects,
  turnBoundaryAfter,
  type ActiveRollDieAdjustment,
} from "@/lib/combat-effects";
import { maximizeDiceFormula } from "@/lib/grants";
import { localeDistance } from "@/lib/utils";
import type { PreparedCommit } from "./useTurnEconomy";
import "./CombatResolver.css";

type TargetOutcome = "hit" | "miss" | "failed-save" | "saved";

const OUTCOME_KEY: Record<TargetOutcome, string> = {
  hit: "combat.declareHit",
  miss: "combat.declareMiss",
  "failed-save": "combat.resolveOutcome_failed-save",
  saved: "combat.resolveOutcome_saved",
};

interface TargetChoice {
  key: string;
  targetId: string;
  tokenIndex?: number;
  label: string;
  kind: "pc" | "monster";
  side: "ally" | "enemy";
  memberUid?: string;
  characterId?: string;
  currentHp: number;
  tempHp: number;
  maxHp: number;
  down: boolean;
  portraitUrl: string | null;
  portraitCrop: PortraitCrop | null;
  conditions: string[];
  bardicInspirationDie?: string;
  defenses: DamageDefenses;
  conditionImmunities: ReadonlySet<ConditionId>;
  qualifiedDefenseCount: number;
  healingBlocked: boolean;
  speedAdjustmentFt: number;
  rollDieAdjustments: Array<
    Omit<ActiveRollDieAdjustment, "effect"> & { effect?: ActiveCombatEffect }
  >;
}

function encounterTargets(combat: GlobalCombat): TargetChoice[] {
  const position = {
    round: combat.round,
    currentCombatantId: combat.encounter.currentCombatantId,
    phase: "turn-start" as const,
    order: combat.encounter.order ?? combat.view.turnOrderIds,
  };
  const effectStateFor = (targetId: string, tokenIndex?: number) => {
    const effects = effectsForTarget(
      combat.encounter.effectOps,
      targetId,
      position,
      tokenIndex
    );
    return {
      healingBlocked: healingBlockedByEffects(effects),
      speedAdjustmentFt: speedAdjustmentByEffects(effects),
      rollDieAdjustments: activeRollDieAdjustments(effects),
    };
  };
  return combat.view.rows.flatMap((row) => {
    // Read-side compatibility for a dev/legacy group that has not crossed the campaign
    // conform boundary yet. Current persisted encounters have one row per creature.
    if (row.kind === "monster" && row.tokens && row.tokens.length > 1) {
      const tokens = row.tokens;
      return tokens.map((hp, index) => ({
        key: `${row.id}:${index}`,
        targetId: row.id,
        tokenIndex: index,
        label: `${row.name} ${index + 1}`,
        kind: row.kind,
        side: row.side ?? (row.kind === "pc" ? "ally" : "enemy"),
        ...(row.kind === "pc" && row.memberUid && row.characterId
          ? { memberUid: row.memberUid, characterId: row.characterId }
          : {}),
        currentHp: hp,
        tempHp: row.tempHp,
        maxHp: row.maxHp / tokens.length,
        down: hp <= 0,
        portraitUrl: row.srdId
          ? monsterPortraitUrl(row.srdId)
          : (row.portraitUrl ?? null),
        portraitCrop: row.srdId ? null : (row.portraitCrop ?? null),
        conditions: row.conditions,
        bardicInspirationDie: row.bardicInspirationDie,
        defenses: row.defenses ?? NO_DEFENSES,
        conditionImmunities: row.conditionImmunities ?? new Set(),
        qualifiedDefenseCount: row.qualifiedDefenseCount ?? 0,
        ...effectStateFor(row.id, index),
      }));
    }
    return [
      {
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
        down: row.down,
        portraitUrl:
          row.kind === "monster" && row.srdId
            ? monsterPortraitUrl(row.srdId)
            : (row.portraitUrl ?? null),
        portraitCrop:
          row.kind === "monster" && row.srdId ? null : (row.portraitCrop ?? null),
        conditions: row.conditions,
        bardicInspirationDie: row.bardicInspirationDie,
        defenses: row.defenses ?? NO_DEFENSES,
        conditionImmunities: row.conditionImmunities ?? new Set(),
        qualifiedDefenseCount: row.qualifiedDefenseCount ?? 0,
        ...effectStateFor(row.id),
      },
    ];
  });
}

export function CombatResolver({
  action,
  sheetCombat,
  onCommit,
  onDone,
}: {
  action: ResolvedAction;
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
  const showToast = useToastStore((s) => s.showToast);
  const soloRound = useCombatStore((s) => s.round);
  const spec = useMemo(() => combatResolutionSpec(action), [action]);
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
            down: character.session.hp.current <= 0,
            portraitUrl: character.portraitUrl,
            portraitCrop: character.portraitCrop,
            conditions: character.session.conditions,
            defenses: NO_DEFENSES,
            conditionImmunities: new Set(),
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
          },
        ]
      : [];
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [attackOutcomes, setAttackOutcomes] = useState<Record<string, "hit" | "miss">>(
    {}
  );
  const [saveOutcomes, setSaveOutcomes] = useState<
    Record<string, "failed-save" | "saved">
  >({});
  const [damage, setDamage] = useState<Record<string, number>>({});
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [hitCounts, setHitCounts] = useState<Record<string, number>>({});
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
    : appliesDamage
      ? "enemy"
      : spec.targetAffinity;

  const affinityTargets =
    showAll || activeAffinity === "any"
      ? targets
      : targets.filter((target) =>
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

  const syncModeledConditions = (target: TargetChoice, applies: boolean): void => {
    const modeled = spec.conditionApplication?.options ?? [];
    if (modeled.length === 0) return;
    setConditions((current) => {
      const manual = (current[target.key] ?? []).filter(
        (conditionId) => !modeled.includes(conditionId)
      );
      const defaults =
        applies && !spec.conditionApplication?.max
          ? modeled.filter(
              (conditionId) => !target.conditionImmunities.has(conditionId as ConditionId)
            )
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
    setAttackOutcomes((current) => ({
      ...current,
      [target.key]: current[target.key] ?? "hit",
    }));
    setSaveOutcomes((current) => ({
      ...current,
      [target.key]: current[target.key] ?? "failed-save",
    }));
    setAllocations((current) => ({ ...current, [target.key]: current[target.key] ?? 1 }));
    setHitCounts((current) => ({ ...current, [target.key]: current[target.key] ?? 1 }));
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
              (conditionId) => !target.conditionImmunities.has(conditionId as ConditionId)
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
    setHitCounts((current) => ({
      ...current,
      [key]: Math.min(current[key] ?? next, next),
    }));
  };

  const outcomeFor = (key: string): CombatTargetOutcome => ({
    attack: attackOutcomes[key] ?? "hit",
    save: saveOutcomes[key] ?? "failed-save",
  });

  const damageValueKey = (
    targetKey: string,
    part: CombatDamagePartSpec,
    instance = 0
  ): string => `${part.sharedAmount ? "shared" : targetKey}:${part.id}:${instance}`;

  const damagePartCount = (targetKey: string, part: CombatDamagePartSpec): number => {
    if (part.sharedAmount || part.id !== "primary" || spec.targetCap <= 1) return 1;
    if (part.resolution === "attack") return hitCounts[targetKey] ?? 1;
    return allocations[targetKey] ?? 1;
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
        combatDamagePartApplies(candidate, outcomeFor(key), spec.damageOnSave) &&
        Array.from({ length: damagePartCount(key, candidate) }, (_, instance) =>
          candidate.fixedAmount !== undefined
            ? candidate.fixedAmount
            : (partAmounts[damageValueKey(key, candidate, instance)] ?? 0)
        ).some((amount) => amount > 0)
    );

  const damagePartsForTarget = (key: string): CombatDamagePartSpec[] =>
    damageParts.filter(
      (part) =>
        partTargets(key, part) &&
        (!part.round1 || (sheetCombat?.round ?? soloRound) === 1) &&
        (!part.requiresRiderTrackerId ||
          requiredRiderApplied(key, part.requiresRiderTrackerId))
    );

  const damageResolutionFor = (key: string) => {
    const target = byKey.get(key);
    if (!target) return null;
    return resolveCombatDamage(
      damagePartsForTarget(key).flatMap((part) =>
        Array.from({ length: damagePartCount(key, part) }, (_, instance) => ({
          spec: part,
          amount:
            part.fixedAmount ?? partAmounts[damageValueKey(key, part, instance)] ?? 0,
          ...(damageTypeFor(key, part) ? { damageType: damageTypeFor(key, part) } : {}),
        }))
      ),
      outcomeFor(key),
      spec.damageOnSave,
      target.defenses
    );
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
    damagePartsForTarget(key).filter((part) =>
      combatDamagePartApplies(part, outcomeFor(key), spec.damageOnSave)
    );

  const renderDamageEntry = (key: string, part: CombatDamagePartSpec, instance = 0) => {
    const valueKey = damageValueKey(key, part, instance);
    const damageType = damageTypeFor(key, part);
    return (
      <div key={`${part.id}:${instance}`} className="combat-damage-entry">
        <span>
          {part.sourceName ? <small>{part.sourceName} · </small> : null}
          <strong>{part.formula}</strong>
          {damagePartCount(key, part) > 1
            ? ` · ${t("combat.resolveInstanceNumber", { n: instance + 1 })}`
            : null}
          {part.typeMode === "fixed" && damageType
            ? ` ${t(`srd.damage_${damageType}`)}`
            : null}
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
                : damagePartCount(key, part) > 1
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

  const missingDamageType = selected.some(
    (key) =>
      modeForTarget(key) === "damage" &&
      relevantDamageParts(key).some((part) => {
        const hasPositiveAmount = Array.from(
          { length: damagePartCount(key, part) },
          (_, instance) =>
            part.fixedAmount ?? partAmounts[damageValueKey(key, part, instance)] ?? 0
        ).some((amount) => amount > 0);
        return (
          part.typeMode !== "fixed" &&
          hasPositiveAmount &&
          damageTypeFor(key, part) === undefined
        );
      })
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
              const used = Array.from(
                { length: damagePartCount(key, part) },
                (_, instance) =>
                  part.fixedAmount ??
                  partAmounts[damageValueKey(key, part, instance)] ??
                  0
              ).some((amount) => amount > 0);
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
              mode: modeForTarget(key),
            },
          ]
        : [];
    });
    const successful = choices.filter(
      ({ key, outcomes, mode }) =>
        (mode !== "damage" ||
          spec.kind === "automatic" ||
          outcomes.attack === "hit" ||
          outcomes.save === "failed-save") &&
        !(spec.kind === "attack" && spec.targetCap > 1 && (hitCounts[key] ?? 0) === 0)
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
    const committedAction = dynamicHpPool
      ? { ...action, trackerCost: totalPoolCost }
      : action;
    let consumableSaveEffects = [
      ...new Map(
        spec.kind === "save" || spec.kind === "attack-save"
          ? choices.flatMap(({ target }) =>
              target.rollDieAdjustments.flatMap((adjustment) =>
                adjustment.rollType === "save" && adjustment.effect
                  ? [[adjustment.effect.id, adjustment.effect] as const]
                  : []
              )
            )
          : []
      ).values(),
    ];
    onCommit(() => {
      const consumedSaveEffects = consumableSaveEffects;
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
      const effects = choices.flatMap(({ target, amount, mode }) => {
        if (!sheetCombat || target.targetId === sheetCombat.myId) return [];
        const shared = {
          targetId: target.targetId,
          ...(target.kind === "monster" && target.tokenIndex !== undefined
            ? { tokenIndex: target.tokenIndex }
            : {}),
        };
        const hpEffect =
          amount > 0
            ? [
                {
                  ...shared,
                  kind:
                    mode === "healing"
                      ? ("healing" as const)
                      : mode === "temp-hp"
                        ? ("temp-hp" as const)
                        : ("damage" as const),
                  amount,
                },
              ]
            : [];
        const conditionEffects = (conditions[target.key] ?? []).map((conditionId) => ({
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
        const grantedDieEffects = action.summary.grantedDie
          ? [
              {
                kind: "granted-die" as const,
                targetId: target.targetId,
                dieKind: action.summary.grantedDie.kind,
                die: action.summary.grantedDie.die,
              },
            ]
          : [];
        return [
          ...hpEffect,
          ...conditionEffects,
          ...removalEffects,
          ...grantedDieEffects,
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
          consumedSaveEffects.length > 0) &&
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
            pcTargets,
            ...(consumedSaveEffects.length > 0
              ? { consumeEffectIds: consumedSaveEffects.map(({ id }) => id) }
              : {}),
            ...(hitTargetIds.length > 0 ? { hitTargetIds } : {}),
            ...(spec.attackMode ? { attackMode: spec.attackMode } : {}),
          }
        );
        void sharedEffectsApply.catch(() => {
          sharedEffectsApplied = false;
          showToast({ message: t("combat.declareApplyFailed"), duration: 6000 });
        });
        consumeSaveAdjustments =
          consumedSaveEffects.length > 0 ? sharedEffectsApply : null;
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
          : null;
      const standingEffect = spec.standingEffect;
      const persistentEffects: ActiveCombatEffect[] =
        sheetCombat && actorRef && standingEffect
          ? successful.flatMap(({ target, mode, amount }) => {
              if (
                standingEffect.requiresAppliedTempHp &&
                (mode !== "temp-hp" || amount <= target.tempHp)
              ) {
                return [];
              }
              const targetRef: CombatantRef | null =
                target.kind === "monster"
                  ? {
                      kind: "monster",
                      combatantId: target.targetId,
                      ...(target.tokenIndex !== undefined
                        ? { tokenIndex: target.tokenIndex }
                        : {}),
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
              const id = crypto.randomUUID();
              const relativeBoundary = standingEffect.lifetime.turnBoundary
                ? turnBoundaryAfter(
                    actorRef.combatantId,
                    standingEffect.lifetime.turnBoundary.turns,
                    standingEffect.lifetime.turnBoundary.phase,
                    {
                      round: sheetCombat.round,
                      currentCombatantId: sheetCombat.encounter.currentCombatantId,
                      phase: "turn-start",
                      order: sheetCombat.encounter.order ?? sheetCombat.view.turnOrderIds,
                    }
                  )
                : null;
              const duration: ActiveCombatEffect["duration"] = standingEffect.lifetime
                .concentration
                ? {
                    kind: "concentration",
                    actorId: actorRef.combatantId,
                    sourceId: standingEffect.source.id,
                  }
                : relativeBoundary
                  ? relativeBoundary
                  : standingEffect.lifetime.maxRounds !== undefined
                    ? {
                        kind: "turn-boundary",
                        combatantId: actorRef.combatantId,
                        round: sheetCombat.round + standingEffect.lifetime.maxRounds,
                        phase: "turn-end",
                      }
                    : { kind: "encounter" };
              return [
                {
                  id,
                  actor: actorRef,
                  target: targetRef,
                  source: standingEffect.source,
                  payload: standingEffect.payload,
                  duration,
                },
              ];
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
      // Own-sheet effects apply locally for immediate solo feedback. In an encounter the
      // shared batch above writes table-mates' narrow combat slices transactionally, so a
      // target need not be online; the local branch only avoids applying the actor twice.
      const own = choices.find(
        ({ target }) => !sheetCombat || target.targetId === sheetCombat.myId
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
              ...((own?.amount ?? 0) > 0 && own?.mode === "damage"
                ? { damage: own.amount }
                : {}),
              ...(own && conditions[own.target.key]?.length
                ? { addConditions: conditions[own.target.key] }
                : {}),
              ...(own && conditionRemovals[own.target.key]?.length
                ? { removeConditions: conditionRemovals[own.target.key] }
                : {}),
              ...(own && action.summary.grantedDie
                ? { bardicInspirationDie: action.summary.grantedDie.die }
                : {}),
            })
          : null;
      const appliedRiders = [
        ...new Set(choices.flatMap(({ target }) => conditions[target.key] ?? [])),
      ];
      if (sheetCombat && (spec.hasDamage || appliedRiders.length > 0)) {
        declareAttack({
          action: action.nameLoc,
          outcome: successful.length > 0 ? "hit" : "miss",
          targetIds: choices.map(({ target }) => target.targetId),
          round: sheetCombat.round,
          ...(spec.targetCap > 1 && Number.isFinite(spec.targetCap)
            ? { instances: spec.targetCap }
            : {}),
          ...(spec.kind === "save" || spec.kind === "attack-save" ? { save: true } : {}),
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
                  showToast({ message: t("combat.declareApplyFailed"), duration: 6000 });
                });
            }
          : null;
      const undoConsumedSaveAdjustments =
        sheetCombat && consumeSaveAdjustments
          ? () => {
              void consumeSaveAdjustments
                .then(async () => {
                  const restored = consumedSaveEffects.map((effect) => ({
                    ...effect,
                    id: crypto.randomUUID(),
                  }));
                  for (const effect of restored) {
                    await appendPersistentCombatEffect(sheetCombat.campaignId, effect);
                  }
                  consumableSaveEffects = restored;
                })
                .catch(() => {
                  showToast({
                    message: t("combat.declareApplyFailed"),
                    duration: 6000,
                  });
                });
            }
          : null;
      return undoOwn || undoPersistent || undoConsumedSaveAdjustments || riderUndo.length
        ? () => {
            undoPersistent?.();
            undoConsumedSaveAdjustments?.();
            undoOwn?.();
            for (const undo of riderUndo) undo();
          }
        : undefined;
    }, committedAction);
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
                          {t("combat.resolveNextRollAdjustment", {
                            roll: t(`combat.resolveRoll_${adjustment.rollType}`),
                            sign: adjustment.operation === "add" ? "+" : "−",
                            dice: adjustment.dice,
                          })}
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
                      {needsSaveOutcome &&
                        target.rollDieAdjustments
                          .filter((adjustment) => adjustment.rollType === "save")
                          .map((adjustment, index) => (
                            <Badge
                              key={`${adjustment.sourceId}-save-${index}`}
                              color="var(--semantic-warning)"
                              size="sm"
                            >
                              {t("combat.resolveNextRollAdjustment", {
                                roll: t("combat.resolveRoll_save"),
                                sign: adjustment.operation === "add" ? "+" : "−",
                                dice: adjustment.dice,
                              })}
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

                    {targetResolvesOutcome &&
                    needsAttackOutcome &&
                    spec.targetCap > 1 &&
                    !spec.area ? (
                      <div className="combat-allocation">
                        <span>{t("combat.resolveHits")}</span>
                        <NumberStepper
                          compact
                          digits={2}
                          min={0}
                          max={allocations[key] ?? 1}
                          value={hitCounts[key] ?? 1}
                          onChange={(value) => {
                            setHitCounts((current) => ({ ...current, [key]: value }));
                            if (spec.conditionApplication?.on === "hit")
                              syncModeledConditions(target, value > 0);
                          }}
                          ariaLabel={t("combat.resolveHitsFor", {
                            name: target.label,
                          })}
                          decrementLabel={t("common.decrease")}
                          incrementLabel={t("common.increase")}
                        />
                      </div>
                    ) : targetResolvesOutcome &&
                      (needsAttackOutcome || needsSaveOutcome) ? (
                      <div className="combat-outcome-stack">
                        {needsAttackOutcome && (
                          <div
                            className="combat-outcome-toggle"
                            role="group"
                            aria-label={t("combat.resolveAttackOutcomeFor", {
                              name: target.label,
                            })}
                          >
                            {(["hit", "miss"] as const).map((value) => (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={outcomes.attack === value}
                                onClick={() => {
                                  setAttackOutcomes((current) => ({
                                    ...current,
                                    [key]: value,
                                  }));
                                  if (spec.conditionApplication?.on === "hit")
                                    syncModeledConditions(target, value === "hit");
                                }}
                              >
                                <Icon
                                  as={value === "miss" ? CircleDot : Swords}
                                  size="sm"
                                  decorative
                                />
                                {t(OUTCOME_KEY[value])}
                              </button>
                            ))}
                          </div>
                        )}
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
                            Array.from({ length: damagePartCount(key, part) }, (_, i) =>
                              renderDamageEntry(key, part, i)
                            )
                          )}
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
                            {target.conditionImmunities.has(condition.id as ConditionId)
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
                              target.conditionImmunities.has(
                                conditionId as ConditionId
                              ) || undefined
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
            missingDamageType ||
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
