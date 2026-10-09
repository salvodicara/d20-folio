/**
 * The Combat Chronicle as a view of the session log: the folded lines of one encounter,
 * with auto-attribution applied at read time. Pure: nothing here writes, so every device
 * derives the same feed from the same log.
 *
 * Auto-attribution: a player's declared action that landed (`hit`, `failed`, `saved`)
 * on a creature claims that creature's unattributed damage in the same round, one drop
 * per declared target, in log order. The amount is always the recorded one. When more
 * than one player could own a drop the line is marked uncertain and still asks "Who
 * struck?". A claimed declaration folds into the damage line; an unclaimed one (a miss,
 * or a hit whose damage has not been booked yet) stays its own line.
 */

import type { SessionEntry } from "./fold";
import type { CombatantId, PlayEvent } from "./types";

export interface FeedLine {
  /** The log line's id: corrections and retractions target it. */
  id: string;
  /** Who recorded the line. */
  by: string;
  round?: number;
  /** The event as shown, auto-attribution applied. */
  event: PlayEvent;
  /** The event as the log holds it (after corrections): what a correction builds on. */
  logged: PlayEvent;
  /** The attacker was derived from a player's declaration, not recorded. */
  auto?: true;
  /** More than one player could own this drop. */
  uncertain?: true;
}

export interface FeedViewer {
  uid: string | undefined;
  isDm: boolean;
}

const MARKERS = new Set<PlayEvent["kind"]>([
  "encounter-start",
  "round-start",
  "encounter-end",
]);
const LANDED = new Set(["hit", "failed", "saved"]);

// The damage, heal and temp-hp variant (one member of the union shares the three kinds).
type Damage = Extract<PlayEvent, { amount: number }>;
type Action = Extract<PlayEvent, { kind: "action" }>;

function isPending(event: PlayEvent): event is Damage & { target: CombatantId } {
  return (
    event.kind === "damage" &&
    event.target !== undefined &&
    event.actor === undefined &&
    event.unattributed !== true
  );
}

function isClaim(event: PlayEvent): event is Action & { actor: CombatantId } {
  return (
    event.kind === "action" &&
    event.actor !== undefined &&
    (event.targets?.length ?? 0) > 0 &&
    event.outcome !== undefined &&
    LANDED.has(event.outcome)
  );
}

export function encounterFeed(
  entries: readonly SessionEntry[],
  encounterId: string
): FeedLine[] {
  const scoped = entries.filter(
    (entry) => entry.encounterId === encounterId && !MARKERS.has(entry.event.kind)
  );

  // Pair, per (target, round), the i-th pending drop with the i-th declaration that
  // named that target, both in log order.
  const key = (target: string, round: number | undefined) => `${target}::${round ?? 0}`;
  const drops = new Map<string, SessionEntry[]>();
  const claims = new Map<string, SessionEntry[]>();
  for (const entry of scoped) {
    const { event } = entry;
    if (isPending(event)) {
      const k = key(event.target, entry.round);
      drops.set(k, [...(drops.get(k) ?? []), entry]);
    } else if (isClaim(event)) {
      for (const target of new Set(event.targets)) {
        const k = key(target, entry.round);
        claims.set(k, [...(claims.get(k) ?? []), entry]);
      }
    }
  }
  const attributed = new Map<
    string,
    { claim: Action & { actor: string }; uncertain: boolean }
  >();
  const consumed = new Set<string>();
  for (const [k, pending] of drops) {
    const declared = claims.get(k) ?? [];
    const actors = new Set(declared.map((d) => (d.event as Action).actor));
    const pairs = Math.min(pending.length, declared.length);
    for (let i = 0; i < pairs; i++) {
      const drop = pending[i];
      const claim = declared[i];
      if (!drop || !claim || !isClaim(claim.event)) continue;
      attributed.set(drop.id, { claim: claim.event, uncertain: actors.size > 1 });
      consumed.add(claim.id);
    }
  }

  const lines: FeedLine[] = [];
  for (const entry of scoped) {
    if (consumed.has(entry.id)) continue;
    const base = {
      id: entry.id,
      by: entry.by,
      ...(entry.round === undefined ? {} : { round: entry.round }),
      logged: entry.event,
    };
    const match = attributed.get(entry.id);
    if (match && entry.event.kind === "damage") {
      const { claim, uncertain } = match;
      lines.push({
        ...base,
        event: {
          ...entry.event,
          actor: claim.actor,
          ...(claim.source && !entry.event.source ? { source: claim.source } : {}),
        },
        auto: true,
        ...(uncertain ? { uncertain: true as const } : {}),
      });
    } else {
      lines.push({ ...base, event: entry.event });
    }
  }
  return lines;
}

/** "Who struck?" is still open: unattributed damage, or an ambiguous derived guess. */
export function needsAttribution(line: FeedLine): boolean {
  return isPending(line.logged) && (line.auto !== true || line.uncertain === true);
}

/** The DM answers "Who struck?" on any line; a player only on a hit their character took
 *  (the fold enforces the same rule). */
export function mayAttribute(line: FeedLine, viewer: FeedViewer): boolean {
  if (line.logged.kind !== "damage") return false;
  if (viewer.isDm) return true;
  return viewer.uid !== undefined && line.logged.target === `pc-${viewer.uid}`;
}

/** A line is retracted by whoever recorded it, or by the DM. */
export function mayRetract(line: FeedLine, viewer: FeedViewer): boolean {
  return viewer.isDm || (viewer.uid !== undefined && line.by === viewer.uid);
}

/** Strike a line from the record. Its id is derived from the line, so a double tap
 *  writes it once, and it differs from the mirrors' `<line>:x`, which means "the beat
 *  itself is gone" to the DM mirror. */
export function strikeDraft(line: FeedLine): {
  type: "retract";
  id: string;
  target: string;
} {
  return { type: "retract", id: `${line.id}:struck`, target: line.id };
}

/** The correction that answers "Who struck?": the logged event with the attacker set, or
 *  marked as deliberately unknown (`null`). */
export function attributionCorrection(
  line: FeedLine,
  actor: CombatantId | null
): PlayEvent {
  if (line.logged.kind !== "damage") return line.logged;
  const next: Damage = { ...line.logged };
  delete next.actor;
  delete next.unattributed;
  return actor === null ? { ...next, unattributed: true } : { ...next, actor };
}

function mentions(event: PlayEvent): CombatantId[] {
  const ids: CombatantId[] = [];
  if ("actor" in event && event.actor) ids.push(event.actor);
  if ("target" in event && event.target) ids.push(event.target);
  if (event.kind === "action") ids.push(...(event.targets ?? []));
  return ids;
}

/** Drop every line naming a creature the viewer must not see (a hidden ambush). */
export function hideCombatants(
  lines: readonly FeedLine[],
  hidden: ReadonlySet<CombatantId>
): FeedLine[] {
  if (hidden.size === 0) return [...lines];
  return lines.filter((line) => !mentions(line.event).some((id) => hidden.has(id)));
}
