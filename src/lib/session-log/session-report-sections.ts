/**
 * The session report's sections, the one way every surface builds them (the classic
 * recap, the new Diario, the new Play rail): a fight nobody ended closes after a rest or
 * an idle hour, a fight nobody started is inferred from the players' blows (attacks read
 * from the catalogue), then the report is built. Read time only, nothing is written.
 * Kept out of the session-log index: it reaches the catalogues and the fight engine.
 */
import { isAttackSource } from "./attack-source";
import { closeForgottenFights } from "./close-forgotten-fights";
import type { SessionEntry } from "./fold";
import { inferFights } from "./infer-fights";
import { buildReport, type ReportSection } from "./report";

export function sessionReportSections(entries: readonly SessionEntry[]): ReportSection[] {
  return buildReport(
    inferFights(closeForgottenFights(entries), { isAttack: isAttackSource })
  ).map(lastInitiativeOnly);
}

/**
 * A hero has one initiative per fight: when two rolls land for the same hero (the
 * player's own from the sheet and the DM's typed one, racing), the fight keeps the
 * last, as its order does, so the report shows that one line (D&D Beyond Maps: the
 * last value wins).
 */
function lastInitiativeOnly(section: ReportSection): ReportSection {
  if (section.kind !== "encounter") return section;
  const lastId = new Map<string, string>();
  for (const round of section.rounds)
    for (const entry of round.entries)
      if (entry.event.kind === "initiative") lastId.set(entry.event.actor, entry.id);
  const keep = (entry: SessionEntry) =>
    entry.event.kind !== "initiative" || lastId.get(entry.event.actor) === entry.id;
  return {
    ...section,
    rounds: section.rounds.map((round) => ({
      ...round,
      entries: round.entries.filter(keep),
    })),
  };
}
