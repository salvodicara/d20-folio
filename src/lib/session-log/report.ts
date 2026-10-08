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
      outcome?: "victory" | "retreat" | "defeat";
      rounds: ReportRound[];
    };

export function buildReport(entries: readonly SessionEntry[]): ReportSection[] {
  const sections: ReportSection[] = [];
  const current = (): ReportSection | undefined => sections[sections.length - 1];

  for (const entry of entries) {
    const { event } = entry;
    if (event.kind === "encounter-start") {
      sections.push({ kind: "encounter", encounterId: event.encounterId, rounds: [] });
      continue;
    }
    if (event.kind === "round-start") continue;
    const section = current();
    if (event.kind === "encounter-end") {
      if (section?.kind === "encounter" && event.outcome) section.outcome = event.outcome;
      continue;
    }
    if (entry.encounterId !== undefined && section?.kind === "encounter") {
      const round = entry.round ?? null;
      const last = section.rounds[section.rounds.length - 1];
      if (last?.round === round) last.entries.push(entry);
      else section.rounds.push({ round, entries: [entry] });
    } else if (section?.kind === "outside") {
      section.entries.push(entry);
    } else {
      sections.push({ kind: "outside", entries: [entry] });
    }
  }
  return sections;
}
