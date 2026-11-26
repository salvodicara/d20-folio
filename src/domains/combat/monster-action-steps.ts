/**
 * A monster's printed action, applied from the new fight screen (the classic
 * `applyMonsterAction`): the tray's rows become steps, one per target and one per
 * failed-save condition, in the order the rows were picked. A monster takes its damage
 * on its encounter HP; a hero through their own sheet, with the monster as the attacker
 * when it hit (Armor of Agathys answers a melee hit there). The tray already applied
 * the target's defense and the row's multiplier, so the amount travels untyped.
 */
import type { DmTarget } from "@/domains/combat/dm-hit-plan";
import type { MonsterHpChange } from "@/features/campaigns/combat-lifecycle";
import type { DamageInstance } from "@/lib/damage-intake";
import type { DamageTrayPlan, TrayRow } from "@/lib/play/damage-tray";
import { monsterLandingHit, monsterTrayLandings } from "@/lib/play/monster-action";

export type MonsterActionStep =
  | { kind: "monster"; monsterId: string; change: MonsterHpChange }
  | {
      kind: "pc";
      memberUid: string;
      characterId: string;
      maxHp: number;
      parts: DamageInstance[];
      attacker?: { id: string; melee: boolean };
    }
  | { kind: "condition"; target: DmTarget; conditionId: string };

export function monsterActionSteps(
  monsterId: string,
  plan: DamageTrayPlan,
  rows: ReadonlyArray<TrayRow>,
  total: number,
  targets: ReadonlyArray<DmTarget>
): MonsterActionStep[] {
  const byId = new Map(targets.map((target) => [target.id, target]));
  return monsterTrayLandings(plan, rows, total).flatMap((landing) => {
    const target = byId.get(landing.targetId);
    if (!target) return [];
    const steps: MonsterActionStep[] = [];
    if (landing.amount > 0) {
      const parts = [{ amount: landing.amount }];
      if (target.kind === "monster") {
        steps.push({
          kind: "monster",
          monsterId: target.id,
          change: { kind: "damage", parts, attackerId: monsterId },
        });
      } else if (target.memberUid && target.characterId) {
        const hit = monsterLandingHit(plan, monsterId, landing);
        steps.push({
          kind: "pc",
          memberUid: target.memberUid,
          characterId: target.characterId,
          maxHp: target.hp.max,
          parts,
          ...(hit
            ? { attacker: { id: monsterId, melee: hit.attackMode === "melee" } }
            : {}),
        });
      }
    }
    for (const conditionId of landing.conditions) {
      if (!target.conditions.includes(conditionId))
        steps.push({ kind: "condition", target, conditionId });
    }
    return steps;
  });
}
