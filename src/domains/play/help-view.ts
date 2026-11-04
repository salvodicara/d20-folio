/**
 * The Help action in a fight (SRD 5.2.1 Help): «Su chi?» lists the living enemies
 * ("the next attack roll by one of your allies against that enemy has Advantage")
 * and the living allies ("its next ability check has Advantage"), both before the
 * start of your next turn. Outside a fight, or with nobody to help, it asks nothing
 * (the action is just used).
 */
import { fightSideOf } from "@/features/character/center/outcome-offer";
import { isDead, type TargetRosterRow } from "@/features/character/center/target-step";

export interface HelpChoice {
  id: string;
  name: string;
}

export interface HelpView {
  enemies: HelpChoice[];
  allies: HelpChoice[];
}

export function helpView(
  fight: { myId: string; rows: ReadonlyArray<TargetRosterRow> } | null
): HelpView | null {
  if (!fight) return null;
  const sideOf = fightSideOf(fight.rows);
  const mine = sideOf(fight.myId);
  const others = fight.rows.filter((row) => row.id !== fight.myId && !isDead(row));
  const choice = (row: TargetRosterRow) => ({ id: row.id, name: row.name });
  const enemies = others.filter((row) => sideOf(row.id) !== mine).map(choice);
  const allies = others.filter((row) => sideOf(row.id) === mine).map(choice);
  return enemies.length + allies.length > 0 ? { enemies, allies } : null;
}
