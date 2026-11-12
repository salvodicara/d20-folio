/**
 * A character in no campaign still has «Resoconto» on the Play screen's right column:
 * its own sheet log, read as session lines with the character as `me`, so the one report
 * builder every surface uses (`sessionReportSections`) tells it as it tells a campaign
 * evening. A line the session cannot express (a turn ending) is left out, as the
 * campaign mirror leaves it out.
 */
import { combatEventToPlayEvent } from "@/lib/session-log/character-events";
import type { SessionEntry } from "@/lib/session-log";
import type { CombatantId } from "@/lib/session-log";
import type { LogEntry } from "@/types/character";

export function ownSessionEntries(
  log: ReadonlyArray<LogEntry>,
  me: CombatantId
): SessionEntry[] {
  return log.flatMap((line) => {
    const event = combatEventToPlayEvent(line.event, me);
    return event
      ? [{ id: line.id, by: me, at: line.ts, event, corrected: false, corrections: 0 }]
      : [];
  });
}
