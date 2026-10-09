/**
 * What the live encounter adds to a Combat Chronicle line read from the session log.
 * The DM mirror records each Chronicle beat as `enc:<epoch>:ev:<beatId>`, so a line
 * finds its beat while the fight runs:
 *   • the HP readout — the log carries no HP totals, the beat does. It follows the
 *     monster card's `showExact` rule (`MonsterHpStat`): the DM always; a player only
 *     for an ally, a revealed monster or a PC.
 *   • the DM's undo on a monster's HP or condition line, which restores the monster
 *     through the engine (`undoAdversaryChronicleEvent`); the mirror then retracts the
 *     line because its beat is gone.
 */

import type { FeedLine } from "@/lib/session-log";
import type { EncounterState } from "@/types/campaign";
import type { CombatChronicleEvent } from "@/types/combat-chronicle";

function beatOf(line: FeedLine, encounter: EncounterState): CombatChronicleEvent | null {
  const prefix = `enc:${encounter.epoch}:ev:`;
  if (!line.id.startsWith(prefix)) return null;
  // A later generation (`…:g2`) is the same beat id, reused after an undo.
  const beatId = line.id.slice(prefix.length).replace(/:g\d+$/, "");
  return encounter.events?.find((beat) => beat.id === beatId) ?? null;
}

export function feedHp(
  line: FeedLine,
  encounter: EncounterState,
  viewerIsDm: boolean
): { current: number; max: number } | null {
  const beat = beatOf(line, encounter);
  if (!beat || (beat.kind !== "hp-damage" && beat.kind !== "hp-heal")) return null;
  const target = encounter.combatants.find((c) => c.id === beat.targetId);
  const visible =
    viewerIsDm ||
    target?.kind !== "monster" ||
    target.side === "ally" ||
    target.revealed === true;
  return visible ? { current: beat.current, max: beat.max } : null;
}

/** The beat id the DM's engine undo reverses, for a monster HP or condition line. */
export function undoableBeatId(line: FeedLine, encounter: EncounterState): string | null {
  const beat = beatOf(line, encounter);
  if (!beat) return null;
  const undoable =
    beat.kind === "hp-damage" ||
    beat.kind === "hp-heal" ||
    beat.kind === "condition-gain" ||
    beat.kind === "condition-loss";
  if (!undoable) return null;
  const target = encounter.combatants.find((c) => c.id === beat.targetId);
  return target?.kind === "monster" ? beat.id : null;
}
