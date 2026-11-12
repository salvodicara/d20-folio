/**
 * A fight nobody started, found by reading the session (owner, 2026-11-12: the app
 * works out by itself whether a fight is on from what the players tap). Production
 * showed two sessions of three with no fight marker at all, because markers come only
 * from the DM's open campaign page and only once someone starts an encounter.
 *
 * Read-time only, nothing is written. Among the lines outside every real fight, a run of
 * combat lines (an attack or spell on a target, damage, a creature down, a death save),
 * each within {@link INFERRED_FIGHT_IDLE_MS} of the one before and with no rest between,
 * recorded by two players or more, is one fight. Every line inside the run's span joins
 * it (the heal between two blows belongs to the fight). A real fight's markers always
 * win: its lines are never re-placed and never join a run.
 *
 * The model is BG3's (combat starts with the first blow and ends when the blows stop);
 * the report marks the fight as inferred ({@link isInferredFight}).
 */

import type { SessionEntry } from "./fold";
import type { ReportSection } from "./report";
import type { PlayEvent } from "./types";

/** Combat lines further apart than this belong to two fights (or none). From the
 *  production survey (2026-11-12, 92 gaps between combat lines): 79% under 5 minutes,
 *  14% 5–15 (a slow round at a full table), 7% beyond 15 (a scene change). */
export const INFERRED_FIGHT_IDLE_MS = 15 * 60 * 1000;

const PREFIX = "inferred-";

function isCombatLine(event: PlayEvent): boolean {
  switch (event.kind) {
    case "damage":
    case "down":
    case "death-save":
      return true;
    case "action":
      return (event.targets?.length ?? 0) > 0 || event.outcome !== undefined;
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
export function inferFights(entries: readonly SessionEntry[]): SessionEntry[] {
  // Runs of combat lines outside real fights, as index spans into `entries`.
  const runs: { from: number; to: number; writers: Set<string>; blows: number }[] = [];
  let run: (typeof runs)[number] | null = null;
  let lastAt = 0;
  const close = () => {
    if (run && run.blows >= 2 && run.writers.size >= 2) runs.push(run);
    run = null;
  };
  entries.forEach((entry, index) => {
    const { event } = entry;
    if (entry.encounterId !== undefined || event.kind === "encounter-start") {
      close();
      return;
    }
    if (event.kind === "rest") {
      close();
      return;
    }
    if (!isCombatLine(event)) return;
    if (run && entry.at - lastAt > INFERRED_FIGHT_IDLE_MS) close();
    run ??= { from: index, to: index, writers: new Set(), blows: 0 };
    run.to = index;
    run.writers.add(entry.by);
    run.blows += 1;
    lastAt = entry.at;
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
