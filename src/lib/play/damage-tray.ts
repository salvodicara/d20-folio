/**
 * The damage tray (owner 2026-10-12): after a cast or use with targets, ONE number the
 * player rolled at the table and one row per target, each with its own multiplier, a
 * "saved" toggle and the failed-save condition. Copied from Foundry VTT dnd5e's damage
 * application tray (one total, ×0 · ×½ · ×1 · ×2 per target, resistance toggles, one
 * Apply) and Roll20 GroupCheck/ApplyDamage's per-target "saved" toggle. An attack's
 * rows also say Hit · Miss · Critical, as Foundry dnd5e's chat card does (2026-10-13).
 *
 * Pure: what the tray asks follows from the action's resolution spec and the targets
 * the "On whom?" step picked (through {@link castFollowUps}); what each row applies is
 * plain arithmetic over the rolled total. The app never rolls.
 */
import {
  combatDamageParts,
  combatResolutionSpec,
  type SaveDamageOutcome,
} from "@/lib/combat-resolution";
import type { DamageDefenses } from "@/lib/damage-intake";
import { compileCombatOutcomeReceipts } from "@/lib/combat-outcomes";
import { castFollowUps } from "@/lib/play/cast-follow-ups";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { AttackOutcome } from "@/types/combat-log";
import type { CombatOutcomeReceipt } from "@/types/combat-outcome";
import type { DamageType } from "@/types/damage";
import type { CreatureType } from "@/data/types";

export type { AttackOutcome } from "@/types/combat-log";
/** Foundry dnd5e's chat card order: Hit · Miss · Critical. */
export const ATTACK_OUTCOMES: readonly AttackOutcome[] = ["hit", "miss", "critical"];

export type TrayEffect = "damage" | "heal" | "temp-hp";
/** The per-target multiplier, on Foundry dnd5e's scale: ¼ is a resistant target that
 *  saved for half (halve, then halve again). */
export type TrayMultiplier = "0" | "0.25" | "0.5" | "1" | "2";
export const TRAY_MULTIPLIERS: readonly TrayMultiplier[] = ["0", "0.25", "0.5", "1", "2"];

export interface DamageTrayPlan {
  /** What the one number is; `null` for a condition-only action (Hold Person). */
  effect: TrayEffect | null;
  /** The one damage type, when the action deals exactly one (for defenses). */
  damageType?: DamageType;
  /** The save the targets make. `onSave` is what a success leaves of the damage. */
  save?: { ability?: string; dc?: number; onSave: SaveDamageOutcome };
  /** The conditions a failed save imposes; `pickOne` when the caster picks one;
   *  `optIn` when a hit-gated rider (Topple) offers it with the chip off; `save`
   *  when the condition rides its own save, not the action's (Topple: CON). */
  conditions?: {
    options: string[];
    pickOne: boolean;
    optIn?: true;
    save?: { ability: string; dc: number };
  };
  /** The action rolls to hit (a weapon, an attack-roll spell): each row says Hit,
   *  Miss or Critical. A miss deals nothing, half the total (Acid Arrow), or the
   *  Graze mastery's fixed damage. */
  attack?: { onMiss: "none" | "half"; graze?: number; onRoll20?: OnRoll20Damage[] };
  /** Each target took its own share of separate instances (Magic Missile's darts,
   *  Scorching Ray's rays): every row has its own rolled total instead of one shared
   *  total. Only when the instances are split across more than one target. */
  perTarget?: true;
  targets: string[];
}

/**
 * Extra damage the weapon deals only when the attack's d20 shows a 20 (Sword of
 * Sharpness: 14 Slashing; Mace of Smiting: 7 Bludgeoning, 14 against a Construct).
 * A fixed `amount` is added only to a row whose entered d20 face is 20
 * ({@link setD20Face}); a Critical with no face offers it as an explicit option
 * ({@link onRoll20Option}), and a Critical on a 19 (Improved Critical) never adds it.
 */
export interface OnRoll20Damage {
  dice: string;
  amount?: number;
  damageType: DamageType;
  targetCreatureTypes?: ReadonlyArray<CreatureType>;
  excludeCreatureTypes?: ReadonlyArray<CreatureType>;
  sourceName?: string;
}

/** The action makes an attack roll (a weapon, an attack-roll spell): its tray rows
 *  say Hit, Miss or Critical. */
export function rollsToHit(action: ResolvedAction): boolean {
  const kind = combatResolutionSpec(action).kind;
  return kind === "attack" || kind === "attack-save";
}

/** The tray for a committed use, or `null` when there is nothing to apply. */
export function damageTrayPlan(
  action: ResolvedAction,
  targets: ReadonlyArray<string>,
  selfId: string
): DamageTrayPlan | null {
  const items = castFollowUps(action, targets, selfId);
  const spec = combatResolutionSpec(action);
  const attacks = rollsToHit(action);
  // An attack at a picked target always has its result to say, even with nothing
  // else to apply (Ray of Enfeeblement).
  if (items.length === 0 && !(attacks && targets.length > 0)) return null;
  // A pool spend (Lay on Hands) already chose its amount in its own picker: there is
  // no roll to type, so the tray would only ask the same number twice.
  if (spec.poolSpend) return null;
  const kinds = new Set(items.map((item) => item.kind));
  const effect: TrayEffect | null = kinds.has("damage")
    ? "damage"
    : kinds.has("heal")
      ? "heal"
      : kinds.has("temp-hp")
        ? "temp-hp"
        : null;
  const condition = items.find((item) => item.kind === "condition");
  const s = action.summary;
  const types = new Set(
    effect === "damage"
      ? combatDamageParts(action).flatMap((part) =>
          part.optional ? [] : [...part.damageTypes]
        )
      : []
  );
  const hasSave = Boolean(s.saveAbility || s.saveDC);
  const toppleDc = s.masteryDetail?.toppleDc;
  // A save governs the damage only when the damage itself rides it (Fireball), not
  // when an attack deals it and the save only gates a rider.
  const parts = combatDamageParts(action);
  const saveGovernsDamage =
    effect === "damage" && parts.some((part) => part.resolution === "save");
  const graze = parts.find((part) => part.appliesOn === "miss")?.fixedAmount;
  const halfOnMiss = parts.some(
    (part) => part.id === "primary" && part.damageOnMiss === "half"
  );
  const onRoll20: OnRoll20Damage[] = (s.extraDamage ?? []).flatMap((extra) =>
    extra.onRoll20
      ? [
          {
            dice: extra.dice,
            ...(extra.fixedAmount !== undefined ? { amount: extra.fixedAmount } : {}),
            damageType: extra.damageType as DamageType,
            ...(extra.targetCreatureTypes
              ? { targetCreatureTypes: extra.targetCreatureTypes }
              : {}),
            ...(extra.excludeCreatureTypes
              ? { excludeCreatureTypes: extra.excludeCreatureTypes }
              : {}),
            ...(extra.sourceName ? { sourceName: extra.sourceName } : {}),
          },
        ]
      : []
  );
  const planTargets = [
    ...new Set([...items.map((item) => item.targetId), ...(attacks ? targets : [])]),
  ];
  const split =
    effect !== null && !spec.area && (s.instances ?? 1) > 1 && planTargets.length > 1;
  return {
    effect,
    ...(split ? { perTarget: true as const } : {}),
    ...(types.size === 1 ? { damageType: [...types][0] } : {}),
    ...(hasSave && (saveGovernsDamage || condition)
      ? {
          save: {
            ...(s.saveAbility ? { ability: s.saveAbility } : {}),
            ...(s.saveDC !== undefined ? { dc: s.saveDC } : {}),
            onSave: saveGovernsDamage ? spec.damageOnSave : "none",
          },
        }
      : {}),
    ...(condition?.kind === "condition"
      ? {
          conditions: {
            options: condition.conditionIds,
            pickOne: condition.pickOne,
            ...(condition.optIn ? { optIn: true as const } : {}),
            // SRD 5.2.1 Topple: a Constitution save, DC 8 + the attack's ability
            // modifier + PB (the engine's `masteryNumbers`).
            ...(toppleDc !== undefined && condition.conditionIds.includes("prone")
              ? { save: { ability: "CON", dc: toppleDc } }
              : {}),
          },
        }
      : {}),
    ...(attacks
      ? {
          attack: {
            onMiss: halfOnMiss ? ("half" as const) : ("none" as const),
            ...(graze !== undefined && graze > 0 ? { graze } : {}),
            ...(onRoll20.length > 0 ? { onRoll20 } : {}),
          },
        }
      : {}),
    targets: planTargets,
  };
}

/**
 * The rolled total as typed: a number or a sum of numbers ("8+6+3" → 17). Empty or
 * anything else is `null` — the field never guesses.
 */
export function parseRolledTotal(text: string): number | null {
  const parts = text.replace(/\s+/g, "").split("+");
  if (parts.some((part) => !/^\d+$/.test(part))) return null;
  const total = parts.reduce((sum, part) => sum + Number(part), 0);
  return Number.isSafeInteger(total) ? total : null;
}

export type TargetDefense = "immune" | "resistant" | "vulnerable";

/** The target's own known defense against this damage type (immunity wins). */
export function targetDefense(
  defenses: DamageDefenses | undefined,
  type: DamageType | undefined
): TargetDefense | null {
  if (!defenses || !type) return null;
  if (defenses.immunities.has(type)) return "immune";
  const resistant = defenses.allDamageResistance || defenses.resistances.has(type);
  const vulnerable = defenses.vulnerabilities.has(type);
  // SRD: both apply (halve, then double) — a net ×1, so nothing to pre-set.
  if (resistant && vulnerable) return null;
  return resistant ? "resistant" : vulnerable ? "vulnerable" : null;
}

const FACTOR: Record<TrayMultiplier, number> = {
  "0": 0,
  "0.25": 0.25,
  "0.5": 0.5,
  "1": 1,
  "2": 2,
};

export function defenseMultiplier(defense: TargetDefense): TrayMultiplier {
  return defense === "immune" ? "0" : defense === "resistant" ? "0.5" : "2";
}

export interface TrayRow {
  targetId: string;
  /** THE multiplier this row applies — what the segmented control shows. "Saved"
   *  and the defense chip only set it; a hand-picked segment wins. */
  multiplier: TrayMultiplier;
  saved: boolean;
  /** The known defense that pre-set the multiplier, shown as a chip. */
  defense: TargetDefense | null;
  /** Whether the defense chip is on (it counts in the multiplier it sets). */
  defenseOn: boolean;
  /** The failed-save conditions this row will apply. */
  conditions: string[];
  /** The attack's result on this target, when the action rolls to hit. */
  attack?: AttackOutcome;
  /** The target's creature type, when known (an on-a-20 rider may hinge on it). */
  creatureType?: CreatureType;
  /** Whether the attack's d20 showed a natural 20: `true` for a 20, `false` for
   *  any other entered face (a Champion's Critical on a 19), absent when no face was
   *  entered. Only `true` adds an on-a-20 rider; a Critical alone never does. */
  natural20?: boolean;
  /** The target's own defense against each on-a-20 rider type that differs from
   *  the primary damage type (Sword of Life Stealing's Necrotic on a Slashing hit). */
  onRoll20Defense?: Partial<Record<DamageType, TargetDefense>>;
}

/** Whether an on-a-20 rider reaches a target of this type. An unknown type meets
 *  no "only against" list and no "not against" list. */
function reachesTarget(rider: OnRoll20Damage, creatureType?: CreatureType): boolean {
  if (rider.targetCreatureTypes)
    return creatureType !== undefined && rider.targetCreatureTypes.includes(creatureType);
  if (rider.excludeCreatureTypes && creatureType !== undefined)
    return !rider.excludeCreatureTypes.includes(creatureType);
  return true;
}

/** The fixed on-a-20 riders that reach this row's target, before any face check. */
function reachingRiders(
  row: Pick<TrayRow, "creatureType">,
  plan: DamageTrayPlan
): OnRoll20Damage[] {
  if (plan.effect !== "damage") return [];
  return (plan.attack?.onRoll20 ?? []).filter(
    (rider) => rider.amount !== undefined && reachesTarget(rider, row.creatureType)
  );
}

const riderSum = (riders: ReadonlyArray<OnRoll20Damage>): number =>
  riders.reduce((sum, rider) => sum + (rider.amount ?? 0), 0);

/** Enter the attack's d20 face. A natural 20 is a Critical Hit (SRD 5.2.1); any
 *  other face keeps the row's outcome (a Champion's 19 is still marked Critical). */
export function setD20Face(row: TrayRow, face: number, plan: DamageTrayPlan): TrayRow {
  const next = { ...row, natural20: face === 20 };
  return face === 20 ? setAttackOutcome(next, "critical", plan) : next;
}

/**
 * A Critical row whose d20 face is unknown: the on-a-20 damage it WOULD add, as an
 * explicit "if it was a natural 20" option to confirm (by entering the face with
 * {@link setD20Face}). Never added silently. `null` when nothing is pending.
 */
export function onRoll20Option(
  row: Pick<TrayRow, "attack" | "creatureType" | "natural20">,
  plan: DamageTrayPlan
): { amount: number; riders: OnRoll20Damage[] } | null {
  if (row.attack !== "critical" || row.natural20 !== undefined) return null;
  const riders = reachingRiders(row, plan);
  const amount = riderSum(riders);
  return amount === 0 ? null : { amount, riders };
}

function onRoll20Landed(
  row: Pick<TrayRow, "attack" | "natural20">,
  plan: DamageTrayPlan
): boolean {
  return row.natural20 === true && row.attack !== "miss" && plan.effect === "damage";
}

/** The fixed on-a-20 damage of the primary damage type (Sword of Sharpness's 14
 *  Slashing on a Longsword): added to the rolled total before the row's multiplier.
 *  Only on a natural 20, never on a Critical alone. */
export function onRoll20Amount(
  row: Pick<TrayRow, "attack" | "creatureType" | "natural20">,
  plan: DamageTrayPlan
): number {
  if (!onRoll20Landed(row, plan)) return 0;
  return riderSum(
    reachingRiders(row, plan).filter((rider) => rider.damageType === plan.damageType)
  );
}

/** One on-a-20 amount of another type than the primary, with its own multiplier. */
export interface OnRoll20Line {
  amount: number;
  damageType: DamageType;
  multiplier: TrayMultiplier;
  sourceName?: string;
}

/** The fixed on-a-20 damage of another type than the primary (Sword of Life
 *  Stealing's 15 Necrotic on a Slashing hit): each its own line, multiplied by the
 *  target's own defense against that type, the way a dice rider is its own part. */
export function onRoll20Lines(
  row: Pick<TrayRow, "attack" | "creatureType" | "natural20" | "onRoll20Defense">,
  plan: DamageTrayPlan
): OnRoll20Line[] {
  if (!onRoll20Landed(row, plan)) return [];
  return reachingRiders(row, plan)
    .filter((rider) => rider.damageType !== plan.damageType)
    .map((rider) => {
      const defense = row.onRoll20Defense?.[rider.damageType];
      return {
        amount: rider.amount ?? 0,
        damageType: rider.damageType,
        multiplier: defense ? defenseMultiplier(defense) : ("1" as const),
        ...(rider.sourceName ? { sourceName: rider.sourceName } : {}),
      };
    });
}

/**
 * The multiplier the row's facts give: a successful save halves (or cancels) the
 * damage, then the target's defense halves, doubles or cancels it (SRD order). Saved
 * and resistant is ¼; saved and vulnerable is ×1.
 */
export function factsMultiplier(
  row: Pick<TrayRow, "saved" | "defense" | "defenseOn" | "attack">,
  plan: DamageTrayPlan
): TrayMultiplier {
  // A miss: nothing, half (Acid Arrow), or the whole Graze damage (its own base).
  const miss =
    row.attack === "miss" && plan.attack && plan.attack.graze === undefined
      ? plan.attack.onMiss === "half"
        ? 0.5
        : 0
      : 1;
  const save =
    row.saved && plan.save && plan.effect === "damage"
      ? plan.save.onSave === "half"
        ? 0.5
        : 0
      : 1;
  const defense =
    row.defense && row.defenseOn ? FACTOR[defenseMultiplier(row.defense)] : 1;
  const product = miss * save * defense;
  return TRAY_MULTIPLIERS.find((m) => FACTOR[m] === product) ?? "1";
}

export function initialTrayRow(
  plan: DamageTrayPlan,
  targetId: string,
  defenses?: DamageDefenses,
  creatureType?: CreatureType
): TrayRow {
  const defense =
    plan.effect === "damage" ? targetDefense(defenses, plan.damageType) : null;
  const facts = {
    saved: false,
    defense,
    defenseOn: defense !== null,
    ...(plan.attack ? { attack: "hit" as const } : {}),
  };
  const onRoll20Defense: Partial<Record<DamageType, TargetDefense>> = {};
  for (const rider of plan.attack?.onRoll20 ?? []) {
    if (rider.damageType === plan.damageType) continue;
    const own = targetDefense(defenses, rider.damageType);
    if (own) onRoll20Defense[rider.damageType] = own;
  }
  return {
    targetId,
    ...facts,
    ...(creatureType ? { creatureType } : {}),
    ...(Object.keys(onRoll20Defense).length > 0 ? { onRoll20Defense } : {}),
    multiplier: factsMultiplier(facts, plan),
    conditions:
      plan.conditions && !plan.conditions.optIn
        ? plan.conditions.pickOne
          ? plan.conditions.options.slice(0, 1)
          : [...plan.conditions.options]
        : [],
  };
}

/** A grazing miss deals the mastery's fixed damage, not the rolled total. */
function grazes(row: TrayRow, plan: DamageTrayPlan): boolean {
  return row.attack === "miss" && plan.attack?.graze !== undefined;
}

/** Whether the row's amount needs the rolled total: a plain miss and a graze do not,
 *  so a tray of misses applies without a number. */
export function rowNeedsTotal(row: TrayRow, plan: DamageTrayPlan): boolean {
  if (plan.effect === null) return false;
  if (plan.effect !== "damage") return true;
  return !grazes(row, plan) && row.multiplier !== "0";
}

function applyMultiplier(amount: number, multiplier: TrayMultiplier): number {
  switch (multiplier) {
    case "0":
      return 0;
    case "0.25":
      return Math.floor(amount / 4);
    case "0.5":
      return Math.floor(amount / 2);
    case "2":
      return amount * 2;
    default:
      return amount;
  }
}

/** What this row applies from the rolled total: the total × its multiplier, every
 *  halving rounded down (¼ = halve twice, the same as ⌊total / 4⌋). A grazing miss
 *  multiplies the Graze damage instead. A natural-20 row adds the weapon's fixed
 *  on-a-20 damage: of the primary type before the multiplier ({@link onRoll20Amount}),
 *  of another type as its own line with its own multiplier ({@link onRoll20Lines}). */
export function rowAmount(total: number, row: TrayRow, plan: DamageTrayPlan): number {
  const base = grazes(row, plan)
    ? (plan.attack?.graze ?? 0)
    : total + onRoll20Amount(row, plan);
  const amount = Math.max(0, Math.floor(base));
  if (plan.effect !== "damage") return amount;
  return (
    applyMultiplier(amount, row.multiplier) +
    onRoll20Lines(row, plan).reduce(
      (sum, line) => sum + applyMultiplier(line.amount, line.multiplier),
      0
    )
  );
}

/** The conditions this row lands: none once the target saved or the attack missed. */
export function rowConditions(row: TrayRow): string[] {
  return row.saved || row.attack === "miss" ? [] : row.conditions;
}

/** Pick Hit, Miss or Critical: the multiplier follows (a miss cancels or halves the
 *  damage; a critical keeps it — the player types the doubled dice themselves). */
export function setAttackOutcome(
  row: TrayRow,
  outcome: AttackOutcome,
  plan: DamageTrayPlan
): TrayRow {
  if (!plan.attack) return row;
  const next = { ...row, attack: outcome };
  return { ...next, multiplier: factsMultiplier(next, plan) };
}

/** The one result every row shares (the action's own log line says it), else none. */
export function sharedAttackOutcome(
  rows: ReadonlyArray<Pick<TrayRow, "attack">>
): AttackOutcome | undefined {
  const first = rows[0]?.attack;
  return first && rows.every((row) => row.attack === first) ? first : undefined;
}

/** The rows' declared results as outcome receipts of this use's occurrence. */
export function trayOutcomeReceipts(
  occurrenceId: string,
  actionId: string,
  rows: ReadonlyArray<Pick<TrayRow, "targetId" | "attack">>
): CombatOutcomeReceipt[] {
  return compileCombatOutcomeReceipts({
    occurrenceId,
    actionId,
    targets: rows.flatMap((row) =>
      row.attack
        ? [
            {
              target: { combatantId: row.targetId },
              attack: {
                results: [row.attack === "critical" ? "critical-hit" : row.attack],
              },
            },
          ]
        : []
    ),
  });
}

/** Toggle "Saved": it selects the multiplier its facts give (½, 0, ¼…). */
export function toggleSaved(row: TrayRow, plan: DamageTrayPlan): TrayRow {
  const next = { ...row, saved: !row.saved };
  return { ...next, multiplier: factsMultiplier(next, plan) };
}

/** Toggle the defense chip: on, it counts in the multiplier; off, it does not. */
export function toggleDefense(row: TrayRow, plan: DamageTrayPlan): TrayRow {
  if (!row.defense) return row;
  const next = { ...row, defenseOn: !row.defenseOn };
  return { ...next, multiplier: factsMultiplier(next, plan) };
}

/** A hand-picked segment IS the multiplier (Saved and the chip keep their state). */
export function setMultiplier(row: TrayRow, multiplier: TrayMultiplier): TrayRow {
  return { ...row, multiplier };
}

/** Toggle a condition chip; a pick-one action keeps exactly the tapped one. */
export function toggleCondition(
  row: TrayRow,
  conditionId: string,
  plan: DamageTrayPlan
): TrayRow {
  const on = row.conditions.includes(conditionId);
  if (plan.conditions?.pickOne) return { ...row, conditions: on ? [] : [conditionId] };
  return {
    ...row,
    conditions: on
      ? row.conditions.filter((id) => id !== conditionId)
      : [...row.conditions, conditionId],
  };
}

/** The resulting HP for a preview ("−14 → 8/22"); temp HP absorb damage first. */
export function previewHp(
  effect: TrayEffect,
  amount: number,
  hp: { current: number; max: number; temp: number }
): { current: number; max: number; temp: number } {
  if (effect === "heal") return { ...hp, current: Math.min(hp.max, hp.current + amount) };
  if (effect === "temp-hp") return { ...hp, temp: Math.max(hp.temp, amount) };
  const absorbed = Math.min(hp.temp, amount);
  return {
    ...hp,
    temp: hp.temp - absorbed,
    current: Math.max(0, hp.current - (amount - absorbed)),
  };
}
