/**
 * The Play screen's «Iniziativa» rows (approved prototype x-play, `.ir`): one line per
 * turn, in order, with the initiative and the name, yours marked, the one whose turn it
 * is and the next (wrapping to the top), and on the right your own Hit Points or how the
 * others look. A creature never shows a number (the fight list's rule).
 */
import type { FightRow } from "@/domains/combat/fight-rows-view";
import { hpBand, type HpBandValue } from "@/lib/hp-band";

export interface PlayInitiativeRow {
  key: string;
  ids: string[];
  kind: FightRow["kind"];
  initiative: number | null;
  name: string;
  /** A character's portrait from the fight, when it has one (else its initial). */
  portrait: string | null;
  count: number;
  mine: boolean;
  current: boolean;
  next: boolean;
  mustRoll: boolean;
  state:
    | { kind: "hp"; current: number; max: number }
    | { kind: "band"; band: HpBandValue };
}

export function playInitiativeRows(
  rows: readonly FightRow[],
  myId: string
): PlayInitiativeRow[] {
  const at = rows.findIndex((r) => r.current);
  const nextAt = at < 0 || rows.length < 2 ? -1 : (at + 1) % rows.length;
  return rows.map((r, i) => {
    const mine = r.ids.includes(myId);
    // A group reads as its most hurt member (the bands run from the healthiest).
    const band = r.hp
      ? hpBand(r.hp.current, r.hp.max)
      : (r.bands.at(-1)?.band ?? "healthy");
    return {
      key: r.ids.join("+"),
      ids: r.ids,
      kind: r.kind,
      initiative: r.initiative,
      // A compact list: a character by first name, a creature in full.
      name: r.kind === "pc" ? (r.name.split(/\s+/)[0] ?? r.name) : r.name,
      portrait: r.kind === "pc" && r.art && "url" in r.art ? r.art.url : null,
      count: r.count,
      mine,
      current: r.current,
      next: i === nextAt,
      mustRoll: r.mustRoll,
      state:
        mine && r.hp
          ? { kind: "hp", current: r.hp.current, max: r.hp.max }
          : { kind: "band", band },
    };
  });
}
