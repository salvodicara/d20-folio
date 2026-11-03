import type { SessionEntry } from "./fold";

export interface ReportRound {
  /** `null` for lines recorded in an encounter before its first round marker. */
  round: number | null;
  entries: SessionEntry[];
}

/** The deterministic chronicle of a session: play outside fights, and each encounter
 *  round by round. Markers (start, end, new round) shape the sections and are not lines. */
export type ReportSection =
  | { kind: "outside"; entries: SessionEntry[] }
  | {
      kind: "encounter";
      encounterId: string;
      /** Names of the fight's non-PC creatures, from its start line. */
      names: Record<string, string>;
      outcome?: "victory" | "ended";
      rounds: ReportRound[];
    };

export function buildReport(entries: readonly SessionEntry[]): ReportSection[] {
  const sections: ReportSection[] = [];
  const current = (): ReportSection | undefined => sections[sections.length - 1];

  for (const entry of entries) {
    const { event } = entry;
    if (event.kind === "encounter-start") {
      sections.push({
        kind: "encounter",
        encounterId: event.encounterId,
        names: event.names ?? {},
        rounds: [],
      });
      continue;
    }
    if (event.kind === "round-start") continue;
    const section = current();
    if (event.kind === "encounter-end") {
      if (
        section?.kind === "encounter" &&
        section.encounterId === event.encounterId &&
        event.outcome
      )
        section.outcome = event.outcome;
      continue;
    }
    if (entry.encounterId !== undefined && section?.kind === "encounter") {
      // By number, not by position: a line recorded before its round's marker (or a
      // beat the DM's page caught up on later) still joins its own round.
      const round = entry.round ?? null;
      const existing = section.rounds.find((r) => r.round === round);
      if (existing) existing.entries.push(entry);
      else {
        section.rounds.push({ round, entries: [entry] });
        section.rounds.sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
      }
    } else if (section?.kind === "outside") {
      section.entries.push(entry);
    } else {
      sections.push({ kind: "outside", entries: [entry] });
    }
  }
  return sections;
}
