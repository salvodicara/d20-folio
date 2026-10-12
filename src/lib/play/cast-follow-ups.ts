/**
 * What a used spell or feature can still do to whom (owner 2026-10-11, the damage tray
 * since 2026-10-12): heal Aria, damage the goblin, the goblin failed the save →
 * Paralyzed, temp HP on me. {@link "./damage-tray".damageTrayPlan} turns it into a tray.
 *
 * Pure: what it offers follows from the action's resolution spec and the
 * targets picked in the "On whom?" step. No pick means "me" only for a heal or temp HP
 * that can land on the caster; anything aimed elsewhere needs a pick.
 */
import { combatResolutionSpec, shouldResolveCombatAction } from "@/lib/combat-resolution";
import type { ResolvedAction } from "@/lib/smart-tracker";

export type CastFollowUp =
  | { kind: "heal" | "temp-hp" | "damage"; targetId: string }
  | {
      kind: "condition";
      targetId: string;
      /** The conditions a failed save imposes. */
      conditionIds: string[];
      /** The spell imposes one of them (Blindness/Deafness): the player picks. */
      pickOne: boolean;
      /** A hit-gated rider (Topple's Prone): offered, never assumed — the chip
       *  starts off until the player says the attack hit and the save failed. */
      optIn?: true;
    };

export function castFollowUps(
  action: ResolvedAction,
  targets: ReadonlyArray<string>,
  selfId: string
): CastFollowUp[] {
  if (!shouldResolveCombatAction(action)) return [];
  const spec = combatResolutionSpec(action);
  const reachesMe = spec.targetAffinity !== "enemy" && !spec.excludeSelf;
  // Temp HP the engine already applied on use (Adrenaline Rush) need no line.
  const tempHp = spec.hasTempHp && !(action.useEffects ?? []).length;
  const recipients =
    targets.length > 0
      ? targets
      : reachesMe && (spec.hasHealing || tempHp)
        ? [selfId]
        : [];
  const application =
    spec.conditionApplication?.on === "failed-save" ||
    spec.conditionApplication?.on === "hit"
      ? spec.conditionApplication
      : undefined;

  return recipients.flatMap((targetId): CastFollowUp[] => [
    ...(spec.hasHealing ? [{ kind: "heal" as const, targetId }] : []),
    ...(tempHp ? [{ kind: "temp-hp" as const, targetId }] : []),
    ...(spec.hasDamage && targets.length > 0
      ? [{ kind: "damage" as const, targetId }]
      : []),
    ...(application && targets.length > 0
      ? [
          {
            kind: "condition" as const,
            targetId,
            conditionIds: [...application.options],
            pickOne:
              application.max !== undefined &&
              application.max < application.options.length,
            ...(application.on === "hit" ? { optIn: true as const } : {}),
          },
        ]
      : []),
  ]);
}
