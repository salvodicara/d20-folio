import type { LogItem, PlayEvent } from "./types";

/** One effective line of the session after corrections and retractions, placed in its
 *  encounter and round by its position in the log. */
export interface SessionEntry {
  id: string;
  by: string;
  at: number;
  event: PlayEvent;
  /** True when a later correction replaced the originally recorded event. */
  corrected: boolean;
  /** How many corrections have been applied to this line. */
  corrections: number;
  encounterId?: string;
  round?: number;
}

export interface SessionAuthority {
  /** The DM may correct or retract any line; everyone else only their own. */
  dmUid?: string;
}

/**
 * Fold the raw log into its effective lines. Pure and total: the same items always
 * yield the same entries, so every device derives the same session. Items that cannot
 * apply — a duplicate id, a correction of an unknown line, a player touching someone
 * else's line — are ignored rather than thrown, because the log is shared input.
 */
export function foldSession(
  items: readonly LogItem[],
  authority: SessionAuthority
): SessionEntry[] {
  const seen = new Set<string>();
  const lines = new Map<
    string,
    { by: string; at: number; event: PlayEvent; corrected: boolean; corrections: number }
  >();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (item.type === "event") {
      lines.set(item.id, {
        by: item.by,
        at: item.at,
        event: item.event,
        corrected: false,
        corrections: 0,
      });
      continue;
    }
    const line = lines.get(item.target);
    if (line === undefined || (item.by !== line.by && item.by !== authority.dmUid))
      continue;
    if (item.type === "retract") lines.delete(item.target);
    else
      lines.set(item.target, {
        ...line,
        event: item.event,
        corrected: true,
        corrections: line.corrections + 1,
      });
  }

  let encounterId: string | undefined;
  let round: number | undefined;
  const entries: SessionEntry[] = [];
  for (const [id, line] of lines) {
    const { event } = line;
    if (event.kind === "encounter-start") {
      encounterId = event.encounterId;
      round = undefined;
    } else if (event.kind === "round-start") {
      round = event.round;
    }
    entries.push({
      id,
      ...line,
      ...(encounterId === undefined ? {} : { encounterId }),
      ...(round === undefined ? {} : { round }),
    });
    if (event.kind === "encounter-end") {
      encounterId = undefined;
      round = undefined;
    }
  }
  return entries;
}
