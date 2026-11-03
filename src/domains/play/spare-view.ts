/**
 * «Chi risparmi?» before a zone that spares the creatures its caster designates
 * (Spirit Guardians): in a fight, every creature the zone could catch but the caster
 * (the living only), allies first; the allies start ticked (`defaultSpared`). A zone that
 * spares no one by choice, a spell with no zone, or a cast outside a fight asks nothing.
 */
import { getSpellById } from "@/data/spells";
import { isDead, type TargetRosterRow } from "@/features/character/center/target-step";
import { defaultSpared } from "@/lib/zones";

export interface SpareChoice {
  id: string;
  name: string;
  side: "ally" | "enemy";
}

export interface SpareView {
  choices: SpareChoice[];
  spared: string[];
}

export function spareView(
  spellId: string,
  fight: { myId: string; rows: ReadonlyArray<TargetRosterRow> } | null
): SpareView | null {
  const zone = getSpellById(spellId)?.zone;
  if (!zone || zone.spares !== "chosen" || !fight) return null;
  const choices = fight.rows
    .filter((row) => row.id !== fight.myId && !isDead(row))
    .map((row) => ({
      id: row.id,
      name: row.name,
      side: row.side ?? (row.kind === "pc" ? ("ally" as const) : ("enemy" as const)),
    }));
  if (choices.length === 0) return null;
  return {
    choices: [
      ...choices.filter((c) => c.side === "ally"),
      ...choices.filter((c) => c.side === "enemy"),
    ],
    spared: defaultSpared(zone, fight.rows, fight.myId),
  };
}
