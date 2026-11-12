/**
 * A fight nobody started, found by reading the session (owner, 2026-11-12: the app
 * works out by itself whether a fight is on from what the players tap). Production
 * showed two sessions of three with no fight marker at all, because markers come only
 * from the DM's open campaign page and only once someone starts an encounter.
 *
 * Read-time only, nothing is written. Among the lines outside every real fight, a run of
 * combat lines (an attack or a damaging spell, even with no target, damage, a creature
 * down, a death save),
 * each within {@link INFERRED_FIGHT_IDLE_MS} of the one before and with no rest between,
 * at least {@link INFERRED_FIGHT_MIN_BLOWS} of them, recorded by two players or more, is
 * one fight. Every line inside the run's span joins
 * it (the heal between two blows belongs to the fight). A real fight's markers always
 * win: its lines are never re-placed and never join a run.
 *
 * A member's solo fight (their «Start combat», a `solo-fight` line) is a strong signal:
 * it opens a run with no blow or writer threshold, the other members' starts, ends and
 * blows extend it, and it ends at the last solo end once every member who started has
 * ended (else when the blows stop). So several players starting the same fight on their
 * own sheets read as one fight, from the earliest start to the latest end. A run a real
 * fight's start cuts keeps no section of its own unless it met the usual threshold:
 * the real fight wins.
 *
 * The model is BG3's (combat starts with the first blow and ends when the blows stop);
 * the report marks the fight as inferred ({@link isInferredFight}).
 */

import { isMarkerEvent, type SessionEntry } from "./fold";
import type { ReportSection } from "./report";
import type { LocText } from "@/lib/loc-text";

import type { PlayEvent } from "./types";

export interface InferFightsOptions {
  /** Whether an action line's name is a blow (a weapon attack, a damaging, attacking or
   *  saving-throw spell), from the catalogue: `isAttackSource` in `attack-source.ts`.
   *  Without it only an action with a target or a result counts. */
  isAttack?: (source: LocText | undefined) => boolean;
}

/** Combat lines further apart than this belong to two fights (or none). From the
 *  production survey (2026-11-12, 92 gaps between combat lines): 79% under 5 minutes,
 *  14% 5–15 (a slow round at a full table), 7% beyond 15 (a scene change). */
export const INFERRED_FIGHT_IDLE_MS = 15 * 60 * 1000;

/** The fewest blows a fight has. Two players each striking once, minutes apart, may be
 *  two scenes (a trap, a barrel smashed); a real fight, however short, gives at least
 *  one blow per player plus the damage someone takes. */
export const INFERRED_FIGHT_MIN_BLOWS = 3;

const PREFIX = "inferred-";

function isCombatLine(event: PlayEvent, options: InferFightsOptions): boolean {
  switch (event.kind) {
    case "damage":
    case "down":
    case "death-save":
      return true;
    case "action":
      return (
        (event.targets?.length ?? 0) > 0 ||
        event.outcome !== undefined ||
        options.isAttack?.(event.source) === true
      );
    default:
      return false;
  }
}

/** True for a fight section the report inferred rather than one the table started. */
export function isInferredFight(section: ReportSection): boolean {
  return section.kind === "encounter" && section.encounterId.startsWith(PREFIX);
}

/**
 * The session's entries with each inferred fight wrapped in a start and an end marker
 * and its lines placed in it, ready for `buildReport`. Entries in a real fight, and
 * every entry when no fight is inferred, come back unchanged.
 */
export function inferFights(
  entries: readonly SessionEntry[],
  options: InferFightsOptions = {}
): SessionEntry[] {
  // Runs of combat lines outside real fights, as index spans into `entries`.
  interface Run {
    from: number;
    to: number;
    writers: Set<string>;
    blows: number;
    /** Members whose solo fight is open in this run; `null`: no solo start seen. */
    solo: Set<string> | null;
  }
  const runs: Run[] = [];
  let run: Run | null = null;
  let lastAt = 0;
  const close = (cutByRealFight = false) => {
    const met = run && run.blows >= INFERRED_FIGHT_MIN_BLOWS && run.writers.size >= 2;
    const signalled =
      run?.solo != null &&
      !cutByRealFight &&
      entries.slice(run.from, run.to + 1).some((entry) => !isMarkerEvent(entry.event));
    if (run && (met || signalled)) runs.push(run);
    run = null;
  };
  const extend = (index: number, at: number): Run => {
    if (run && at - lastAt > INFERRED_FIGHT_IDLE_MS) close();
    run ??= { from: index, to: index, writers: new Set(), blows: 0, solo: null };
    run.to = index;
    lastAt = at;
    return run;
  };
  entries.forEach((entry, index) => {
    const { event } = entry;
    if (entry.encounterId !== undefined || event.kind === "encounter-start") {
      close(true);
      return;
    }
    if (event.kind === "rest") {
      close();
      return;
    }
    if (event.kind === "solo-fight") {
      if (event.started) {
        const span = extend(index, entry.at);
        span.solo ??= new Set();
        span.solo.add(event.actor);
      } else if (
        run?.solo?.has(event.actor) &&
        entry.at - lastAt <= INFERRED_FIGHT_IDLE_MS
      ) {
        const span = extend(index, entry.at);
        span.solo?.delete(event.actor);
        if (span.solo?.size === 0) close();
      }
      return;
    }
    if (!isCombatLine(event, options)) return;
    const span = extend(index, entry.at);
    span.writers.add(entry.by);
    span.blows += 1;
  });
  close();
  if (runs.length === 0) return [...entries];

  const out: SessionEntry[] = [];
  let next = 0;
  runs.forEach((span, n) => {
    const encounterId = `${PREFIX}${n + 1}`;
    out.push(...entries.slice(next, span.from));
    const first = entries[span.from];
    const last = entries[span.to];
    if (!first || !last) return;
    const marker = (
      kind: "encounter-start" | "encounter-end",
      at: number
    ): SessionEntry => ({
      id: `${encounterId}:${kind === "encounter-start" ? "start" : "end"}`,
      by: first.by,
      at,
      event: { kind, encounterId },
      corrected: false,
      corrections: 0,
    });
    out.push(marker("encounter-start", first.at));
    for (const entry of entries.slice(span.from, span.to + 1))
      out.push(entry.event.kind === "encounter-end" ? entry : { ...entry, encounterId });
    out.push(marker("encounter-end", last.at));
    next = span.to + 1;
  });
  out.push(...entries.slice(next));
  return out;
}
