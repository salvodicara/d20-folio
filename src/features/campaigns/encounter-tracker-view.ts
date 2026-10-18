/**
 * The campaign Scontro tracker's view model: one row per visible combatant, in the
 * encounter view's order, with whether it acts now, whether it is defeated and its HP
 * as the viewer may see it, plus the round and the current turn's place in the order.
 *
 * HP visibility is the monster card's rule, read here once: the DM, an ally and a
 * monster the DM revealed read numbers; a player reads a concealed enemy's band only
 * (`hpBand`, never a number). A PC's numbers are always shared with the table.
 */
import { hpBand, type HpBandValue } from "@/lib/hp-band";
import type { EncounterState } from "@/types/campaign";
import type { EncounterView } from "./encounter-view";

export type TrackerHp =
  | { kind: "numbers"; current: number; max: number; temp: number }
  | { kind: "band"; band: HpBandValue };

export interface TrackerRow {
  id: string;
  kind: "pc" | "monster";
  name: string;
  portraitUrl: string | null;
  initiative: number | null;
  isCurrent: boolean;
  defeated: boolean;
  hp: TrackerHp;
}

export interface EncounterTracker {
  rows: TrackerRow[];
  round: number;
  /** The current turn's index in the turn order; -1 before turns begin. */
  turnIndex: number;
}

export function encounterTrackerView(
  encounter: EncounterState,
  view: EncounterView,
  viewerIsDm: boolean
): EncounterTracker {
  const revealed = new Set(
    encounter.combatants.flatMap((c) =>
      c.kind === "monster" && c.revealed ? [c.id] : []
    )
  );
  const rows = view.rows.map((row): TrackerRow => {
    const exact =
      viewerIsDm || row.kind === "pc" || row.side === "ally" || revealed.has(row.id);
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      portraitUrl: row.portraitUrl ?? null,
      initiative: row.initiative,
      isCurrent: row.id === view.currentId,
      defeated: row.down,
      hp: exact
        ? { kind: "numbers", current: row.currentHp, max: row.maxHp, temp: row.tempHp }
        : { kind: "band", band: hpBand(row.currentHp, row.maxHp) },
    };
  });
  return {
    rows,
    round: encounter.round,
    turnIndex: view.currentId === null ? -1 : view.turnOrderIds.indexOf(view.currentId),
  };
}
