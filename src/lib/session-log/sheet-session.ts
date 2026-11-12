/**
 * A sheet's own log read as session lines, with the character as `me` (a character in
 * no campaign). Its solo fight is a fight in the report, as a campaign fight is: the
 * sheet's fight lines become the session's markers. «Start combat» opens the fight at
 * round 1, each End Turn starts its next round, «End combat» or a rest closes it. A
 * fight never started by hand (the classic band, where the first End Turn is the first
 * sign) opens at that End Turn. The fight's id is the opening line's, so every reload
 * reads the same fight. Placement in the fight and round is the session fold's.
 */
import type { LogEntry } from "@/types/character";

import { combatEventToPlayEvent } from "./character-events";
import { foldSession, type SessionEntry } from "./fold";
import type { CombatantId, LogItem, PlayEvent } from "./types";

export function sheetSessionEntries(
  log: ReadonlyArray<LogEntry>,
  me: CombatantId
): SessionEntry[] {
  const items: LogItem[] = [];
  const push = (id: string, at: number, event: PlayEvent) =>
    items.push({ type: "event", id, by: me, at, event });
  // The open solo fight's id (an object: the helpers below change it).
  const open: { fight: string | null } = { fight: null };
  const start = (line: LogEntry, round: number) => {
    const fight = `solo:${line.id}`;
    open.fight = fight;
    push(`${fight}:start`, line.ts, { kind: "encounter-start", encounterId: fight });
    push(`${fight}:round:${round}`, line.ts, { kind: "round-start", round });
  };
  const close = (line: LogEntry) => {
    const { fight } = open;
    if (fight === null) return;
    push(`${fight}:end`, line.ts, { kind: "encounter-end", encounterId: fight });
    open.fight = null;
  };

  for (const line of log) {
    const { event } = line;
    if (event.kind === "fight-start") {
      close(line);
      start(line, 1);
      continue;
    }
    if (event.kind === "fight-end") {
      close(line);
      continue;
    }
    if (event.kind === "turn-end" && !event.extraTurn) {
      const { fight } = open;
      if (fight === null) start(line, event.round);
      else
        push(`${fight}:round:${event.round}`, line.ts, {
          kind: "round-start",
          round: event.round,
        });
      continue;
    }
    if (event.kind === "rest") close(line);
    const play = combatEventToPlayEvent(event, me);
    if (play) push(line.id, line.ts, play);
  }
  return foldSession(items, {});
}
