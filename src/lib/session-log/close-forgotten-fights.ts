/**
 * A fight left open in the app (nobody pressed End) stops swallowing the rest of the
 * evening in the report. Read time only, nothing is written: after a rest (no one
 * rests in a fight) or after {@link IDLE_END_MS} with no line (the app's own idle end,
 * `encounterEndReason`), the following lines leave the fight, until the next fight's
 * start. A fight that goes on, or one that was ended, is untouched. Run it before
 * `inferFights`, so the lines it frees can still fall in a fight the blows reveal.
 */
import { IDLE_END_MS } from "@/lib/play/encounter-lifecycle";

import type { SessionEntry } from "./fold";

export function closeForgottenFights(entries: readonly SessionEntry[]): SessionEntry[] {
  let closed: string | null = null;
  let lastAt: number | null = null;
  return entries.map((entry) => {
    const { event } = entry;
    if (event.kind === "encounter-start") {
      closed = null;
      lastAt = entry.at;
      return entry;
    }
    if (entry.encounterId === undefined || event.kind === "encounter-end") return entry;
    if (closed !== entry.encounterId) {
      const idle = lastAt !== null && entry.at - lastAt > IDLE_END_MS;
      if (event.kind === "rest" || idle) closed = entry.encounterId;
    }
    lastAt = entry.at;
    if (closed !== entry.encounterId) return entry;
    const { encounterId: _fight, round: _round, ...outside } = entry;
    void _fight;
    void _round;
    return outside;
  });
}
