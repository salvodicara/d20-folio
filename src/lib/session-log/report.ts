import type { SessionEntry } from "./fold";

export interface ReportRound {
  /** `null` for lines recorded in an encounter before its first round marker. */
  round: number | null;
  entries: SessionEntry[];
}

/** The deterministic chronicle of a session: play outside fights, and each encounter
 *  round by round. Markers (start, end, new round) shape the sections and are not lines. */
export type ReportSection =
  | {
      kind: "outside";
      /** Numbered through the session: play outside fights is grouped into scenes. */
      scene: number;
      title?: string;
      /** When its first line was recorded (the device's clock: display only). */
      startedAt: number;
      entries: SessionEntry[];
    }
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
  // Outside fights, a scene starts at the first line, after an explicit `scene-start`
  // (whose title it takes), after a rest and after a fight.
  let scenes = 0;
  let newScene = true;
  let title: string | undefined;

  for (const entry of entries) {
    const { event } = entry;
    if (event.kind === "scene-start") {
      newScene = true;
      title = event.title?.trim() || undefined;
      continue;
    }
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
      if (section?.kind === "encounter" && event.outcome) section.outcome = event.outcome;
      newScene = true;
      continue;
    }
    if (entry.encounterId !== undefined && section?.kind === "encounter") {
      const round = entry.round ?? null;
      const last = section.rounds[section.rounds.length - 1];
      if (last?.round === round) last.entries.push(entry);
      else section.rounds.push({ round, entries: [entry] });
      continue;
    }
    if (section?.kind === "outside" && !newScene) {
      section.entries.push(entry);
    } else {
      scenes += 1;
      sections.push({
        kind: "outside",
        scene: scenes,
        ...(title === undefined ? {} : { title }),
        startedAt: entry.at,
        entries: [entry],
      });
      newScene = false;
      title = undefined;
    }
    if (event.kind === "rest") newScene = true;
  }
  return sections;
}
