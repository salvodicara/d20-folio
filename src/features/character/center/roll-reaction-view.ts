/**
 * The Play dialog for a use on another creature's roll (Cutting Words): «Su chi?»
 * lists the living creatures in the fight, enemies first, never the user; «Su quale
 * tiro?» lists the rolls the use can touch, and the line says the die to roll and
 * what it does. Out of a fight, or on the user's own roll, it asks only the roll.
 */
import { fightSideOf } from "@/features/character/center/outcome-offer";
import {
  isDead,
  type TargetCandidate,
  type TargetRosterRow,
} from "@/features/character/center/target-step";
import type { ReactableRoll } from "@/data/types";
import type { RollReaction } from "@/lib/play/roll-reactions";

export interface RollReactionView {
  /** The living others, enemies first, as the «Su chi?» rows draw them. */
  targets: TargetCandidate[];
  rolls: ReadonlyArray<ReactableRoll>;
  operations: ReadonlyArray<"add" | "subtract">;
  die: string;
}

/** The dialog's choices; null for a use with no die to show (a reroll). */
export function rollReactionView(
  reaction: RollReaction,
  fight: { myId: string; rows: ReadonlyArray<TargetRosterRow> } | null
): RollReactionView | null {
  if (reaction.kind !== "die") return null;
  const targets =
    fight && reaction.whose !== "self"
      ? (() => {
          const sideOf = fightSideOf(fight.rows);
          const mine = sideOf(fight.myId);
          const others = fight.rows.filter(
            (row) => row.id !== fight.myId && !isDead(row)
          );
          const enemies = others.filter((row) => sideOf(row.id) !== mine);
          const allies = others.filter((row) => sideOf(row.id) === mine);
          const candidate =
            (side: "ally" | "enemy") =>
            (row: TargetRosterRow): TargetCandidate => ({
              id: row.id,
              name: row.name,
              side,
              self: false,
              ...(row.portraitUrl ? { portraitUrl: row.portraitUrl } : {}),
              ...(row.portraitUrl && row.portraitCrop
                ? { portraitCrop: row.portraitCrop }
                : {}),
            });
          return [...enemies.map(candidate("enemy")), ...allies.map(candidate("ally"))];
        })()
      : [];
  return {
    targets,
    rolls: reaction.rolls,
    operations: reaction.operations,
    die: reaction.die,
  };
}
