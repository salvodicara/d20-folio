/**
 * The Diario's automatic report: one played evening as the blocks a table remembers —
 * exploration, each fight (its rounds, its foes, how it ended) and each rest with what it
 * restored. Built on `buildReport`, so corrections, hidden and moved lines already apply;
 * notes stay where they were written. Each block carries the time of its first line.
 */
import type { ReportSection, SessionEntry } from "@/lib/session-log";

export type DiaryBlock =
  | { kind: "explore"; at: number; entries: SessionEntry[] }
  | { kind: "rest"; at: number; entries: SessionEntry[] }
  | {
      kind: "fight";
      at: number;
      entries: SessionEntry[];
      rounds: number;
      /** The fight's creatures by name, once each ("Goblin 2" reads as "Goblin"). */
      foes: string[];
      outcome?: "victory" | "ended";
    };

/** What a rest gives back: these lines right after a rest belong to it. */
const RECOVERY = new Set<SessionEntry["event"]["kind"]>([
  "rest",
  "heal",
  "temp-hp",
  "max-hp",
  "spell-slot",
  "resource-grant",
  "inspiration",
  "exhaustion",
]);

export function diaryBlocks(sections: readonly ReportSection[]): DiaryBlock[] {
  const blocks: DiaryBlock[] = [];
  for (const section of sections) {
    if (section.kind === "encounter") {
      const entries = section.rounds.flatMap((r) => r.entries);
      const first = entries[0];
      if (!first) continue;
      blocks.push({
        kind: "fight",
        at: first.at,
        entries,
        rounds: Math.max(0, ...section.rounds.map((r) => r.round ?? 0)),
        foes: [
          ...new Set(Object.values(section.names).map((n) => n.replace(/\s+\d+$/, ""))),
        ],
        ...(section.outcome ? { outcome: section.outcome } : {}),
      });
      continue;
    }
    for (const entry of section.entries) {
      const last = blocks[blocks.length - 1];
      const kind =
        entry.event.kind === "rest" ||
        (last?.kind === "rest" && RECOVERY.has(entry.event.kind))
          ? "rest"
          : "explore";
      if (last?.kind === kind) last.entries.push(entry);
      else blocks.push({ kind, at: entry.at, entries: [entry] });
    }
  }
  return blocks;
}

/** Each session's number: by date, the oldest is 1. */
export function sessionNumbers(
  sessions: readonly { id: string; date: Date }[]
): Record<string, number> {
  return Object.fromEntries(
    [...sessions]
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((s, i) => [s.id, i + 1])
  );
}
