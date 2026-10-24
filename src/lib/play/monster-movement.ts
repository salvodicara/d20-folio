/**
 * A monster's move entries (Teleport, Leap, Charge, Spider Climb) and how far
 * each takes it, in feet: the printed distance, or the share of the block's own
 * Speed the move uses. A presenter renders the feet per locale with
 * `localeDistance`. Pure and derived from the block; nothing is stored.
 */
import type { MonsterMovement, MonsterStatBlock } from "@/data/types";
import type { MonsterSection } from "@/lib/activities";

/** Stat-block print order. */
const PRINT_ORDER: readonly MonsterSection[] = [
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
];

export interface MonsterMove {
  section: MonsterSection;
  entryId: string;
  movement: MonsterMovement;
}

/** Every entry of the block that moves it, print order. */
export function monsterMovements(block: MonsterStatBlock): MonsterMove[] {
  return PRINT_ORDER.flatMap((section) =>
    (block[section] ?? []).flatMap((entry) =>
      entry.kind === "narrative" && entry.movement
        ? [{ section, entryId: entry.id, movement: entry.movement }]
        : []
    )
  );
}

/**
 * How far the move takes the monster, in feet: a teleport or jump's printed
 * distance, or (half) the block's Speed in the farthest of the speeds it may use.
 * Undefined when the move states no distance (Spider Climb, Dash) or the block
 * has none of the speeds.
 */
export function monsterMovementFeet(
  block: MonsterStatBlock,
  movement: MonsterMovement
): number | undefined {
  const share = (feet: number | undefined, half?: true) =>
    feet === undefined ? undefined : half ? Math.floor(feet / 2) : feet;
  switch (movement.kind) {
    case "teleport":
    case "leap":
    case "long-jump":
      return movement.feet;
    case "move": {
      if (movement.feet !== undefined) return movement.feet;
      const feet = movement.speeds.flatMap((speed) => {
        const value = block.speeds[speed];
        return value === undefined ? [] : [value];
      });
      return feet.length > 0 ? share(Math.max(...feet), movement.half) : undefined;
    }
    case "burrow-through":
      return share(block.speeds.burrow, movement.half);
    case "take-action":
    case "spider-climb":
      return undefined;
  }
}
