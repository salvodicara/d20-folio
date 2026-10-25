/**
 * Swarms (SRD 5.2.1 bestiary): a "Medium Swarm of Tiny Beasts" prints the Swarm
 * trait — it can occupy another creature's space and vice versa, move through any
 * opening large enough for one of its members, and it can't regain Hit Points or gain
 * Temporary Hit Points. Its attacks deal a smaller amount while it is Bloodied
 * (`bloodiedDamage`, read from the print). Resistance to Bludgeoning, Piercing and
 * Slashing is the block's own defense line, which the encounter's intake applies.
 *
 * Pure facts over the stat block: the encounter's heal and Temporary HP writes and
 * the DM tray's dice read them.
 */
import type {
  CreatureSize,
  MonsterAttackEntry,
  MonsterDamage,
  MonsterStatBlock,
} from "@/data/types";
import { bloodiedFromHp } from "@/lib/hp-band";

export interface SwarmFacts {
  /** The size of one member: the openings the swarm moves through. */
  memberSize: CreatureSize;
  /** It can occupy another creature's space and vice versa. */
  sharesSpaces: true;
  regainsHp: false;
  gainsTempHp: false;
}

type SwarmBlock = Pick<MonsterStatBlock, "swarmOf">;

/** The swarm's facts, or null for a creature that is no swarm. */
export function swarmFacts(block: SwarmBlock): SwarmFacts | null {
  if (!block.swarmOf) return null;
  return {
    memberSize: block.swarmOf,
    sharesSpaces: true,
    regainsHp: false,
    gainsTempHp: false,
  };
}

/** The Hit Points a heal of `amount` restores: none on a swarm. */
export function swarmHealing(block: SwarmBlock, amount: number): number {
  return block.swarmOf ? 0 : amount;
}

/** The Temporary Hit Points a grant of `amount` gives: none on a swarm. */
export function swarmTempHp(block: SwarmBlock, amount: number): number {
  return block.swarmOf ? 0 : amount;
}

/** The damage clauses the attack deals at these Hit Points: the primary clause
 *  becomes its Bloodied amount once the attacker is Bloodied; "plus" clauses stay. */
export function swarmAttackDamage(
  entry: Pick<MonsterAttackEntry, "damage" | "bloodiedDamage">,
  hp: { current: number; max: number }
): ReadonlyArray<MonsterDamage> {
  const smaller = entry.bloodiedDamage;
  if (!smaller || !bloodiedFromHp(hp.current, hp.max)) return entry.damage;
  return [smaller, ...entry.damage.slice(1)];
}
