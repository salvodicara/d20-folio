/**
 * What a reader may do with one line of the fight's live feed (the classic Combat
 * Chronicle's rules, on the new screen): the DM's undo on a monster's HP or condition
 * line (through the engine, by its beat); striking a line from the record (its author
 * or the DM); «Chi ha colpito?» on an open hit (the DM on any, a player on their own
 * hero's). The striker choices leave out what the reader must not see.
 */
import { undoableBeatId } from "@/features/campaigns/chronicle-feed";
import {
  mayAttribute,
  mayRetract,
  needsAttribution,
  type FeedLine,
  type FeedViewer,
} from "@/lib/session-log";
import { rankAttackers } from "@/lib/views/combat-chronicle-view";
import type { EncounterState } from "@/types/campaign";

export interface FeedLineActions {
  /** The beat the DM's undo reverses; null when there is none to undo. */
  undo: string | null;
  /** Strike the line from the record (the undo already does it for a monster line). */
  retract: boolean;
  /** «Chi ha colpito?» is open for this reader. */
  ask: boolean;
}

export function feedLineActions(
  line: FeedLine,
  viewer: FeedViewer,
  encounter: EncounterState
): FeedLineActions {
  const undo = viewer.isDm ? undoableBeatId(line, encounter) : null;
  return {
    undo,
    retract: undo === null && mayRetract(line, viewer),
    ask: needsAttribution(line) && mayAttribute(line, viewer),
  };
}

/** Who may have struck: the likely one first, then the target's foes; its own side
 *  behind «Altri». A player is never offered a hidden creature. */
export function strikerChoices(
  line: FeedLine,
  encounter: EncounterState,
  viewer: FeedViewer,
  currentId: string | null
): { primary: string[]; more: string[] } {
  const { event } = line;
  const target = event.kind === "damage" ? (event.target ?? null) : null;
  const preselect = event.kind === "damage" && event.actor ? event.actor : currentId;
  const seen = encounter.combatants.filter(
    (c) => viewer.isDm || c.kind !== "monster" || c.hidden !== true
  );
  const ranked = rankAttackers(seen, target, preselect);
  return {
    primary: ranked.primary.map((c) => c.id),
    more: ranked.more.map((c) => c.id),
  };
}
