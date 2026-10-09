/** Feature actions (`SrdActionDef`) → Activity. */
import type { HealTerm, SrdActionDef } from "@/data/types";
import type { Grant } from "@/lib/grant-schema";
import { compact, dice, statusEffect, terms, whileActiveGrants } from "./shared";
import type {
  Activity,
  ActivityEffect,
  ActivityGap,
  ActivityRequires,
  ActivityResource,
  ActivitySource,
  ActivityTarget,
  ActivityTranslation,
  DiceTerm,
} from "./types";

/** What the action's owner contributes: its source ids, trackers and grants. */
export interface ActionOwner {
  source: Extract<ActivitySource, { kind: "feature" | "spell-follow-up" }>;
  /** The owner's own primary tracker id (a feature's tracker is keyed by its id). */
  trackerId?: string;
  /** The ids of the owner's extra trackers (`mechanics.extraTrackers`). */
  extraTrackerIds?: ReadonlyArray<string>;
  /** The owner's grants: using an action of a feature with a `while-active`
   *  grant enters that state (Rage, Bladesong). */
  grants?: ReadonlyArray<Grant>;
}

function activityId(owner: ActionOwner): string {
  const { source } = owner;
  if (source.kind === "spell-follow-up") return `spell:${source.spellId}:follow-up`;
  return `${source.owner}:${source.ownerId}:${source.actionId ?? source.index}`;
}

/**
 * The tracker an action spends, with the resolver's precedence: an own extra
 * tracker it names, the owner's primary tracker, then another feature's
 * tracker. Maintaining an active state spends nothing.
 */
function trackerCost(
  action: SrdActionDef,
  owner: ActionOwner
): ActivityResource | undefined {
  if (action.maintainsActiveKey) return undefined;
  const override =
    action.costTrackerOverride !== undefined &&
    owner.extraTrackerIds?.includes(action.costTrackerOverride)
      ? action.costTrackerOverride
      : undefined;
  const trackerId = override ?? owner.trackerId ?? action.costTracker;
  if (!trackerId) return undefined;
  return compact({ kind: "tracker" as const, trackerId, amount: action.trackerCost });
}

function requires(action: SrdActionDef): ActivityRequires | undefined {
  const out = compact({
    actionThisTurn: action.requiresActionThisTurn,
    outcomeThisTurn: action.requiresOutcomeThisTurn,
    categoryThisTurn: action.requiresActionCategoryThisTurn,
    bundleOption: action.requiresBundleOption,
  });
  return Object.keys(out).length > 0 ? out : undefined;
}

function target(action: SrdActionDef): ActivityTarget | undefined {
  const targeting = action.targeting;
  const out = compact({
    affinity: targeting?.affinity,
    area: action.area ? (true as const) : undefined,
    excludeSelf: targeting?.excludeSelf ? (true as const) : undefined,
    creatureTypes: targeting?.creatureTypes,
    count: targeting?.maxTargets,
    countPerUpcast: targeting?.maxTargetsPerUpcast,
    sharedAmount: targeting?.sharedAmount ? (true as const) : undefined,
  });
  return Object.keys(out).length > 0 ? out : undefined;
}

const heal = (term: HealTerm | undefined): DiceTerm | undefined => term;

function effects(action: SrdActionDef, owner: ActionOwner): ActivityEffect[] {
  const out: ActivityEffect[] = [];
  const attack = action.attack;
  if (attack) {
    out.push(
      compact({
        kind: "damage" as const,
        dice: dice({
          dice: attack.dice,
          byLevel: attack.diceByLevel,
          count:
            attack.diceCount && attack.dieFace
              ? { of: attack.diceCount, face: attack.dieFace }
              : undefined,
          perUpcast: attack.dicePerUpcast,
          plus: terms(
            attack.addMod ? { kind: "ability-mod", ability: attack.addMod } : undefined,
            attack.addLevel ? { kind: "owner-level" } : undefined
          ),
        }),
        types: attack.damageType ? [attack.damageType] : attack.damageTypeChoices,
        choose:
          !attack.damageType && attack.damageTypeChoices ? (true as const) : undefined,
        chooseByLevel: attack.damageTypeChoicesByLevel,
        fromBundle: attack.damageTypeFromBundle,
        gate: attack.resolution,
        onSave: attack.damageOnSave,
        orHeal: attack.mode === "heal-or-damage" ? (true as const) : undefined,
      })
    );
  }
  if (action.heal) {
    out.push({
      kind: "heal",
      dice: dice({
        dice: action.heal.dice,
        count:
          action.heal.diceCount && action.heal.dieFace
            ? { of: action.heal.diceCount, face: action.heal.dieFace }
            : undefined,
        plus: terms(heal(action.heal.plus)),
      }),
    });
  }
  if (action.poolSpendEffect === "healing") out.push({ kind: "heal", fromPool: true });
  if (action.tempHpRoll) {
    const roll = action.tempHpRoll;
    out.push(
      compact({
        kind: "temp-hp" as const,
        dice: dice({
          dice: roll.die,
          rolls: roll.rolls,
          multiplier: roll.multiplier,
          plus: terms(heal(roll.plus)),
        }),
        fromLevel: roll.fromLevel,
      })
    );
  }
  if (action.conditionApplication) {
    out.push({ kind: "condition", apply: action.conditionApplication });
  }
  if (action.conditionRemoval) {
    out.push(
      compact({
        kind: "end-condition" as const,
        options: action.conditionRemoval.options,
        max: action.conditionRemoval.max,
        fromLevel: action.conditionRemoval.fromLevel,
      })
    );
  }
  for (const cure of action.cureConditions ?? []) {
    out.push(
      compact({
        kind: "end-condition" as const,
        options: [cure.condition],
        costHp: cure.costHp,
        fromLevel: cure.fromLevel,
      })
    );
  }
  if (action.damageReduction) {
    const reduction = action.damageReduction;
    out.push({
      kind: "reduce-damage",
      dice: {
        dice: reduction.dice,
        ...(reduction.addAbility || reduction.addLevel
          ? {
              plus: terms(
                reduction.addAbility
                  ? { kind: "ability-mod", ability: reduction.addAbility }
                  : undefined,
                reduction.addLevel ? { kind: "owner-level" } : undefined
              ),
            }
          : {}),
      },
      typesByLevel: reduction.damageTypesByLevel,
    });
  }
  if (action.targetMark) {
    out.push(
      compact({
        kind: "mark" as const,
        scope: action.targetMark.scope,
        lifetime:
          action.targetMark.maxRounds !== undefined
            ? { kind: "rounds" as const, roundsLeft: action.targetMark.maxRounds }
            : undefined,
      })
    );
  }
  if (action.grantDie) out.push({ kind: "grant-die", die: action.grantDie.die });
  if (action.grantHeroicInspiration) out.push({ kind: "heroic-inspiration" });
  if (action.stabilize) out.push({ kind: "stabilize" });
  if (action.trackerTopUp) {
    out.push({ kind: "restore-resource", ...action.trackerTopUp });
  }
  if (action.checkBonus) {
    out.push(
      compact({
        kind: "check-bonus" as const,
        dice: action.checkBonus.dice,
        refundOnFail: action.checkBonus.refundOnFail ? (true as const) : undefined,
      })
    );
  }
  if (action.grantsNextAttackAdvantage) out.push({ kind: "next-attack-advantage" });
  if (action.locksMovement) out.push({ kind: "speed-zero" });
  if (action.maintainsActiveKey) {
    out.push({ kind: "maintain", key: action.maintainsActiveKey });
  } else {
    // Using an action of a feature that declares a standing state enters it
    // (Rage, Bladesong): the first `while-active` grant is the one it lights.
    const [state] = whileActiveGrants(owner.grants);
    if (state) out.push(statusEffect(state, state.duration, false));
  }
  return out;
}

/** One feature action as an Activity, plus the fields it cannot express yet. */
export function translateAction(
  action: SrdActionDef,
  owner: ActionOwner
): ActivityTranslation {
  const gaps: ActivityGap[] = [];
  if (action.mechanicsProgram) {
    gaps.push({
      field: "mechanicsProgram",
      reason:
        "a hand-written runtime program (a halving or negating reaction) the declarative effects cannot express yet",
    });
  }
  if (action.saveAbility && !action.saveDcAbility) {
    gaps.push({
      field: "saveAbility",
      reason: "the save declares no DC ability, so its DC is known only at the table",
    });
  }
  const tracker = trackerCost(action, owner);
  const alternate = action.alternateCost;
  const sequence = action.attackSequence;
  const activity: Activity = compact({
    id: activityId(owner),
    source: owner.source,
    cost: compact({
      economy: action.type,
      trigger: action.type === "reaction" ? action.trigger : undefined,
      pay: tracker ? [tracker] : undefined,
      orPay: alternate && alternate.kind !== "none" ? alternate : undefined,
      economyCategory: action.economyCategory,
      maxUsesPerTurn: action.maxUsesPerTurn,
    }),
    requires: requires(action),
    target: target(action),
    attack: sequence
      ? {
          mode: "melee" as const,
          bonus: { kind: "weapon" as const, weapon: sequence.attackId },
        }
      : action.attackType
        ? { mode: action.attackType, bonus: { kind: "spell" as const } }
        : undefined,
    save: action.saveAbility
      ? compact({
          ability: action.saveAbility,
          dc: action.saveDcAbility
            ? { kind: "ability" as const, ability: action.saveDcAbility }
            : undefined,
        })
      : undefined,
    skill: action.skillCheck,
    repeats: sequence
      ? compact({ count: sequence.instances, byLevel: sequence.instancesByLevel })
      : undefined,
    effects: effects(action, owner),
  });
  if (action.trigger && action.type !== "reaction") {
    gaps.push({
      field: "trigger",
      reason: "a reaction trigger on a non-reaction action",
    });
  }
  return { activity, gaps };
}

/** One feature action as an Activity. */
export function activityFromAction(action: SrdActionDef, owner: ActionOwner): Activity {
  return translateAction(action, owner).activity;
}
