/**
 * The DM's limited uses on a monster card (headless): each counter the stat block
 * prints (Recharge, N/Day, a per-day spell, the legendary pool) with what is left,
 * and the spent Recharge entries to roll for at the start of the monster's turn
 * (SRD 5.2.1). The moves are the encounter's own: `spendMonsterUse`,
 * `restoreMonsterUse`, `rollMonsterRecharge`.
 */
import type { MonsterStatBlock } from "@/data/types";
import {
  monsterLimitedUses,
  type MonsterLimitedUse,
} from "@/features/campaigns/encounter";
import type { EncounterMonster } from "@/types/campaign";

export {
  restoreMonsterUse,
  rollMonsterRecharge,
  spendMonsterUse,
} from "@/features/campaigns/encounter";

export interface MonsterUseRow extends MonsterLimitedUse {
  left: number;
  /** The stat-block entry it belongs to (its name on the card); absent for the pool. */
  entryId?: string;
}

export function monsterUsesView(
  monster: Pick<EncounterMonster, "spent">,
  block: MonsterStatBlock
): MonsterUseRow[] {
  return monsterLimitedUses(block).map((use) => {
    const entryId = use.kind === "legendary" ? undefined : use.key.split(":")[1];
    return {
      ...use,
      left: Math.max(0, use.max - (monster.spent?.[use.key] ?? 0)),
      ...(entryId ? { entryId } : {}),
    };
  });
}

/** The spent Recharge entries the DM rolls a d6 for at the start of its turn. */
export function rechargesDue(
  monster: Pick<EncounterMonster, "spent">,
  block: MonsterStatBlock
): MonsterUseRow[] {
  return monsterUsesView(monster, block).filter(
    (use) => use.kind === "recharge" && use.left === 0
  );
}
