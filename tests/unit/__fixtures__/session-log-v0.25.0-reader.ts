/**
 * FROZEN copy of the session-log reader shipped in v0.25.0 (live 9bb9a60c):
 * `isLogItem` from src/lib/session-log-io.ts and `foldSession` from
 * src/lib/session-log/fold.ts, verbatim except for the exports and the inlined types.
 * Never edit it to match today's code: it exists so a test can prove what a client
 * still running v0.25.0 does with a line written by a newer one.
 */

type PlayEvent = {
  kind: string;
  encounterId?: string;
  round?: number;
  [key: string]: unknown;
};
type LogItem =
  | { type: "event"; id: string; by: string; at: number; event: PlayEvent }
  | {
      type: "correct";
      id: string;
      by: string;
      at: number;
      target: string;
      event: PlayEvent;
    }
  | { type: "retract"; id: string; by: string; at: number; target: string };

/** Shared input: keep only items with the envelope the fold relies on. */
export function isLogItem(value: unknown): value is LogItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.by !== "string") return false;
  if (typeof item.at !== "number") return false;
  const hasEvent = typeof item.event === "object" && item.event !== null;
  if (item.type === "event") return hasEvent;
  if (item.type === "correct") return hasEvent && typeof item.target === "string";
  return item.type === "retract" && typeof item.target === "string";
}
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

/** JSON with sorted keys, so a value read back from Firestore compares equal. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The event without who struck it: two events that differ only here are the same fact
 *  with a different attribution. */
function withoutAttribution(event: PlayEvent): PlayEvent {
  if (event.kind !== "damage") return event;
  const rest = { ...event };
  delete rest.actor;
  delete rest.unattributed;
  return rest;
}

/** A player may name who struck their own character (`pc-<uid>`) on anyone's line, and
 *  change nothing else about it. */
function isOwnAttribution(by: string, line: PlayEvent, next: PlayEvent): boolean {
  if (line.kind !== "damage" || line.target !== `pc-${by}`) return false;
  return stableJson(withoutAttribution(line)) === stableJson(withoutAttribution(next));
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
    if (line === undefined) continue;
    const entitled =
      item.by === line.by ||
      item.by === authority.dmUid ||
      (item.type === "correct" && isOwnAttribution(item.by, line.event, item.event));
    if (!entitled) continue;
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

/** The v0.25.0 head read (`recent()` in session-log-io.ts on 9bb9a60c): only `lastAt` and
 *  `log` are read from a session document. */
export function readHead(id: string, data: Record<string, unknown>) {
  const log: unknown = data.log;
  return {
    id,
    lastAt: Number(data.lastAt),
    items: Array.isArray(log) ? log.filter(isLogItem) : [],
  };
}
