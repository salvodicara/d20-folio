/**
 * The Help action in a fight (SRD 5.2.1 Help, attack: "the next attack roll by one of
 * your allies against that enemy has Advantage" before the start of your next turn):
 * «Su chi?» lists the living enemies; whichever ally attacks it first gets the
 * Advantage. Outside a fight, or with no enemy standing, it asks nothing (the action
 * is just used).
 */
import { fightSideOf } from "@/features/character/center/outcome-offer";
import { isDead, type TargetRosterRow } from "@/features/character/center/target-step";

export interface HelpChoice {
  id: string;
  name: string;
}

export interface HelpView {
  enemies: HelpChoice[];
}

export function helpView(
  fight: { myId: string; rows: ReadonlyArray<TargetRosterRow> } | null
): HelpView | null {
  if (!fight) return null;
  const sideOf = fightSideOf(fight.rows);
  const mine = sideOf(fight.myId);
  const enemies = fight.rows
    .filter((row) => row.id !== fight.myId && !isDead(row) && sideOf(row.id) !== mine)
    .map((row) => ({ id: row.id, name: row.name }));
  return enemies.length > 0 ? { enemies } : null;
}
