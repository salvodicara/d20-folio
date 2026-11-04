/**
 * The Help action in a fight (SRD 5.2.1 Help, attack: "the next attack roll by one of
 * your allies against that enemy has Advantage"): «Su chi?» lists the living enemies,
 * «Per chi?» the living allies but the helper. Outside a fight, or with nobody to help
 * or help against, it asks nothing (the action is just used).
 */
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
  const living = fight.rows.filter((row) => row.id !== fight.myId && !isDead(row));
  const sideOf = (row: TargetRosterRow) =>
    row.side ?? (row.kind === "pc" ? "ally" : "enemy");
  const pick = (side: "ally" | "enemy") =>
    living
      .filter((row) => sideOf(row) === side)
      .map((row) => ({ id: row.id, name: row.name }));
  const enemies = pick("enemy");
  const allies = pick("ally");
  return enemies.length > 0 && allies.length > 0 ? { enemies, allies } : null;
}
