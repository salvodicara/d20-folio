/**
 * The damage tray (owner 2026-10-12): after a cast or use with targets, ONE number the
 * player rolled at the table and one row per target, each with its own multiplier, a
 * "saved" toggle and the failed-save condition. Copied from Foundry VTT dnd5e's damage
 * application tray (one total, ×0 · ×½ · ×1 · ×2 per target, resistance toggles, one
 * Apply) and Roll20 GroupCheck/ApplyDamage's per-target "saved" toggle.
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
import { castFollowUps } from "@/lib/play/cast-follow-ups";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { DamageType } from "@/types/damage";

export type TrayEffect = "damage" | "heal" | "temp-hp";
export type TrayMultiplier = "0" | "0.5" | "1" | "2";
export const TRAY_MULTIPLIERS: readonly TrayMultiplier[] = ["0", "0.5", "1", "2"];

export interface DamageTrayPlan {
  /** What the one number is; `null` for a condition-only action (Hold Person). */
  effect: TrayEffect | null;
  /** The one damage type, when the action deals exactly one (for defenses). */
  damageType?: DamageType;
  /** The save the targets make. `onSave` is what a success leaves of the damage. */
  save?: { ability?: string; dc?: number; onSave: SaveDamageOutcome };
  /** The conditions a failed save imposes; `pickOne` when the caster picks one. */
  conditions?: { options: string[]; pickOne: boolean };
  targets: string[];
}

/** The tray for a committed use, or `null` when there is nothing to apply. */
export function damageTrayPlan(
  action: ResolvedAction,
  targets: ReadonlyArray<string>,
  selfId: string
): DamageTrayPlan | null {
  const items = castFollowUps(action, targets, selfId);
  if (items.length === 0) return null;
  const spec = combatResolutionSpec(action);
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
  // A save governs the damage only when the damage itself rides it (Fireball), not
  // when an attack deals it and the save only gates a rider.
  const saveGovernsDamage =
    effect === "damage" &&
    combatDamageParts(action).some((part) => part.resolution === "save");
  return {
    effect,
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
          },
        }
      : {}),
    targets: [...new Set(items.map((item) => item.targetId))],
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

export function defenseMultiplier(defense: TargetDefense): TrayMultiplier {
  return defense === "immune" ? "0" : defense === "resistant" ? "0.5" : "2";
}

export interface TrayRow {
  targetId: string;
  multiplier: TrayMultiplier;
  saved: boolean;
  /** The known defense that pre-set the multiplier, shown as a chip. */
  defense: TargetDefense | null;
  /** The failed-save conditions this row will apply. */
  conditions: string[];
}

export function initialTrayRow(
  plan: DamageTrayPlan,
  targetId: string,
  defenses?: DamageDefenses
): TrayRow {
  const defense =
    plan.effect === "damage" ? targetDefense(defenses, plan.damageType) : null;
  return {
    targetId,
    multiplier: defense ? defenseMultiplier(defense) : "1",
    saved: false,
    defense,
    conditions: plan.conditions
      ? plan.conditions.pickOne
        ? plan.conditions.options.slice(0, 1)
        : [...plan.conditions.options]
      : [],
  };
}

/**
 * What this row applies from the rolled total. SRD order: a successful save halves
 * (or cancels) the damage first, then the target's multiplier (resistance halves,
 * vulnerability doubles); every halving rounds down.
 */
export function rowAmount(total: number, row: TrayRow, plan: DamageTrayPlan): number {
  let amount = Math.max(0, Math.floor(total));
  if (row.saved && plan.save && plan.effect === "damage")
    amount = plan.save.onSave === "half" ? Math.floor(amount / 2) : 0;
  switch (row.multiplier) {
    case "0":
      return 0;
    case "0.5":
      return Math.floor(amount / 2);
    case "2":
      return amount * 2;
    default:
      return amount;
  }
}

/** The conditions this row lands: none once the target saved. */
export function rowConditions(row: TrayRow): string[] {
  return row.saved ? [] : row.conditions;
}

/** Toggle the defense chip: off falls back to ×1, on restores the pre-set. */
export function toggleDefense(row: TrayRow): TrayRow {
  if (!row.defense) return row;
  const preset = defenseMultiplier(row.defense);
  return { ...row, multiplier: row.multiplier === preset ? "1" : preset };
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
