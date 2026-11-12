/**
 * Hit Point Dice (2024): one die per character level, at each class's own size,
 * so a Fighter 5 / Wizard 1 has five d10s and one d6. Pure reads of the build;
 * the session still stores only how many dice are spent, so which ones were
 * spent is the table's call and an entered total is checked against the
 * largest dice the pool holds.
 */
import { getClassTable } from "@/data/classes";
import { resolveClassId } from "@/data/srd-names";
import { getClasses } from "@/lib/classes";
import type { AggregatedGrants } from "@/lib/grants";
import { ruleFlag } from "@/lib/rules";
import type { CharacterData } from "@/types/character";

export type HitDieSize = CharacterData["hitDieType"];

/** One die size and how many of it the character has. */
export interface HitDiceEntry {
  die: HitDieSize;
  count: number;
}

type HitDiceBearer = Pick<CharacterData, "classes" | "hitDieType"> &
  Partial<Pick<CharacterData, "hitDiceTotalOverride">>;

/**
 * The character's Hit Point Dice, largest die first. A single class, a manual
 * total override, or a class with no catalogue table (homebrew) counts in the
 * stored die.
 */
export function hitDicePool(character: HitDiceBearer): HitDiceEntry[] {
  const override = character.hitDiceTotalOverride;
  const classes = getClasses(character);
  if (override !== undefined && override !== null) {
    return [{ die: character.hitDieType, count: override }];
  }
  if (classes.length === 1) {
    return [{ die: character.hitDieType, count: classes[0]?.level ?? 0 }];
  }
  const counts = new Map<HitDieSize, number>();
  for (const entry of classes) {
    const die =
      getClassTable(resolveClassId(entry.classId))?.hitDie ?? character.hitDieType;
    counts.set(die, (counts.get(die) ?? 0) + entry.level);
  }
  return [...counts]
    .map(([die, count]) => ({ die, count }))
    .sort((a, b) => b.die - a.die);
}

/** How many Hit Point Dice the character has: one per level, or the manual total. */
export function hitDiceTotal(character: HitDiceBearer): number {
  return hitDicePool(character).reduce((sum, entry) => sum + entry.count, 0);
}

/** The Hit Point Dice left to spend (never below 0). */
export function hitDiceLeft(
  character: HitDiceBearer,
  session: { hitDice: { used: number } }
): number {
  return Math.max(0, hitDiceTotal(character) - session.hitDice.used);
}

/** The lowest and highest total `count` spent dice can roll: the largest dice the pool holds. */
export function hitDiceTotalRange(
  pool: ReadonlyArray<HitDiceEntry>,
  count: number
): { min: number; max: number } {
  let left = count;
  let max = 0;
  for (const entry of pool) {
    const taken = Math.min(left, entry.count);
    max += taken * entry.die;
    left -= taken;
  }
  return { min: count, max };
}

/** The dice as a player reads them: "2d8" for one size, "d10/d6" sizes for a mixed pool. */
export function hitDiceLabel(
  pool: ReadonlyArray<HitDiceEntry>,
  count?: number
): { sizes: string; dice: string | null } {
  const sizes = pool.map((entry) => `d${entry.die}`).join("/");
  const [only] = pool;
  return {
    sizes,
    dice:
      pool.length === 1 && only && count !== undefined ? `${count}d${only.die}` : null,
  };
}

/**
 * The HP that spent Hit Point Dice restore: the rolled total plus the Constitution
 * modifier per die (at least 1 per die). A `hit-dice-healing` `maximum` grant
 * (Potion of Vitality) restores each die's maximum instead, with no roll needed;
 * `double` (Periapt of Wound Closure) doubles the HP restored. `null` while a
 * needed roll is missing.
 */
export function hitDiceHealing(input: {
  pool: ReadonlyArray<HitDiceEntry>;
  count: number;
  rolled: number | null;
  conMod: number;
  aggregate: Pick<AggregatedGrants, "values">;
}): number | null {
  const { pool, count, conMod, aggregate } = input;
  if (count <= 0) return 0;
  const maximum = ruleFlag(aggregate.values, "hit-dice:maximum");
  const rolled = maximum ? hitDiceTotalRange(pool, count).max : input.rolled;
  if (rolled === null) return null;
  const restored = Math.max(count, rolled + count * conMod);
  return ruleFlag(aggregate.values, "hit-dice:double") ? restored * 2 : restored;
}

/**
 * The Hit Point Dice roll as typed. Plain: the total of the dice. With a floor on the
 * faces (a feature that counts a 1 or 2 as a 3) the faces are typed one per die
 * ("1+5+2") and each low one counts as the floor; the total is their sum. Null when
 * the text doesn't read, or the faces don't match the dice spent.
 */
export function readHitDiceRoll(
  text: string,
  count: number,
  floor?: { floorBelow: number; floorTo: number }
): { total: number; faces?: number[] } | null {
  const trimmed = text.trim();
  if (trimmed === "" || count <= 0) return null;
  if (!floor) {
    const total = Number(trimmed);
    return Number.isInteger(total) && total >= 0 ? { total } : null;
  }
  if (!/^\d+(\s*\+\s*\d+)*$/.test(trimmed)) return null;
  const faces = trimmed.split("+").map((part) => Number(part.trim()));
  if (faces.length !== count || faces.some((face) => face < 1)) return null;
  const counted = faces.map((face) => (face <= floor.floorBelow ? floor.floorTo : face));
  return { total: counted.reduce((sum, face) => sum + face, 0), faces: counted };
}
