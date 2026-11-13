import type { LogItem, PlayEvent, SeenRound } from "./types";

/** One effective line of the session after corrections and retractions, placed in its
 *  encounter by its position in the log, and in the round its device saw (else by
 *  position too). */
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
  /** Taken out of the narrative by a `hide` (only present with `includeHidden`). */
  hidden?: true;
  /** Placed by a `move`, not where it was recorded. */
  moved?: true;
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
/** The lines that give the story its shape: never hidden, never moved, never shown as
 *  a line of their own. */
const MARKER_KINDS: ReadonlySet<PlayEvent["kind"]> = new Set<PlayEvent["kind"]>([
  "encounter-start",
  "round-start",
  "encounter-end",
  "solo-fight",
]);

export function isMarkerEvent(event: PlayEvent): boolean {
  return MARKER_KINDS.has(event.kind);
}

/** A stamp is shared input: only a well-formed one may place a line. */
function validStamp(value: unknown): value is SeenRound {
  if (typeof value !== "object" || value === null) return false;
  const { encounterId, round } = value as Record<string, unknown>;
  return typeof encounterId === "string" && Number.isInteger(round) && Number(round) >= 1;
}

export function foldSession(
  items: readonly LogItem[],
  authority: SessionAuthority,
  options: { includeHidden?: boolean } = {}
): SessionEntry[] {
  const seen = new Set<string>();
  const hidden = new Set<string>();
  const moves: { target: string; after: string | null }[] = [];
  const stamps = new Map<string, SeenRound>();
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
      if (validStamp(item.seen)) stamps.set(item.id, item.seen);
      continue;
    }
    const line = lines.get(item.target);
    if (line === undefined) continue;
    const entitled =
      item.by === line.by ||
      item.by === authority.dmUid ||
      (item.type === "correct" && isOwnAttribution(item.by, line.event, item.event));
    if (!entitled) continue;
    if (item.type === "hide" || item.type === "show" || item.type === "move") {
      if (MARKER_KINDS.has(line.event.kind)) continue;
      if (item.type === "hide") hidden.add(item.target);
      else if (item.type === "show") hidden.delete(item.target);
      else moves.push({ target: item.target, after: item.after });
    } else if (item.type === "retract") lines.delete(item.target);
    else
      lines.set(item.target, {
        ...line,
        event: item.event,
        corrected: true,
        corrections: line.corrections + 1,
      });
  }

  // Moves apply in log order onto the recorded order; one whose anchor is gone (or is
  // the line itself) changes nothing. Encounter and round then follow the position,
  // except that a line keeps the round its device saw in this encounter: the round's
  // marker may have been written later (the DM's page was closed). A moved line goes
  // where the DM put it.
  const order = [...lines.keys()];
  const moved = new Set<string>();
  for (const { target, after } of moves) {
    if (!lines.has(target) || after === target) continue;
    if (after !== null && !lines.has(after)) continue;
    order.splice(order.indexOf(target), 1);
    order.splice(after === null ? 0 : order.indexOf(after) + 1, 0, target);
    moved.add(target);
  }

  // A line stamped with a fight whose start marker comes later in the log joins that
  // fight, right after its start: the roll that starts a fight is written before any page
  // that sees the fight writes the start marker. A line the DM moved stays where it is.
  const startOf = (id: string): string | undefined => {
    const event = lines.get(id)?.event;
    return event?.kind === "encounter-start" ? event.encounterId : undefined;
  };
  const ahead = new Set(order.map(startOf).filter((e): e is string => e !== undefined));
  const waiting = new Map<string, string[]>();
  const placedOrder: string[] = [];
  for (const id of order) {
    const started = startOf(id);
    if (started !== undefined) {
      placedOrder.push(id, ...(waiting.get(started) ?? []));
      waiting.delete(started);
      ahead.delete(started);
      continue;
    }
    const fight = moved.has(id) ? undefined : stamps.get(id)?.encounterId;
    if (fight !== undefined && ahead.has(fight)) {
      waiting.set(fight, [...(waiting.get(fight) ?? []), id]);
      continue;
    }
    placedOrder.push(id);
  }

  const placed = (
    id: string,
    encounterId: string | undefined,
    round: number | undefined
  ): { round?: number } => {
    const stamp = moved.has(id) ? undefined : stamps.get(id);
    if (stamp !== undefined && stamp.encounterId === encounterId)
      return { round: stamp.round };
    return round === undefined ? {} : { round };
  };
  let encounterId: string | undefined;
  let round: number | undefined;
  const entries: SessionEntry[] = [];
  for (const id of placedOrder) {
    const line = lines.get(id);
    if (line === undefined) continue;
    const { event } = line;
    if (event.kind === "encounter-start") {
      encounterId = event.encounterId;
      round = undefined;
    } else if (event.kind === "round-start") {
      round = event.round;
    }
    if (!hidden.has(id) || options.includeHidden) {
      entries.push({
        id,
        ...line,
        ...(encounterId === undefined ? {} : { encounterId }),
        ...placed(id, encounterId, round),
        ...(hidden.has(id) ? { hidden: true as const } : {}),
        ...(moved.has(id) ? { moved: true as const } : {}),
      });
    }
    // Only the running encounter's own end closes it: a stray end (a log written
    // before a fix, another encounter's late beat) leaves it open.
    if (event.kind === "encounter-end" && event.encounterId === encounterId) {
      encounterId = undefined;
      round = undefined;
    }
  }
  return entries;
}
