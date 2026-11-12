/**
 * The Diario's automatic report: one played evening as the blocks a table remembers —
 * exploration, each fight (its rounds, its foes, how it ended), each rest with what it
 * restored, and a character's progress (a level-up). Built on `buildReport`, so corrections, hidden and moved lines already apply;
 * notes stay where they were written. Each block carries the time of its first line.
 */
import type { ReportSection, SessionEntry } from "@/lib/session-log";

export type DiaryBlock =
  | { kind: "explore"; at: number; entries: SessionEntry[] }
  | { kind: "rest"; at: number; entries: SessionEntry[] }
  /** A character's progress outside a fight: a level-up (not exploration). */
  | { kind: "progress"; at: number; entries: SessionEntry[] }
  | {
      kind: "fight";
      encounterId: string;
      at: number;
      entries: SessionEntry[];
      rounds: number;
      /** The fight's creatures by name, once each ("Goblin 2" reads as "Goblin"). */
      foes: string[];
      /** Each creature's own name, for its lines. */
      names: Record<string, string>;
      outcome?: "victory" | "ended";
      /** When it ended (its end marker); absent while it runs. */
      endedAt?: number;
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
        encounterId: section.encounterId,
        at: first.at,
        entries,
        rounds: Math.max(0, ...section.rounds.map((r) => r.round ?? 0)),
        names: section.names,
        foes: [
          ...new Set(Object.values(section.names).map((n) => n.replace(/\s+\d+$/, ""))),
        ],
        ...(section.outcome ? { outcome: section.outcome } : {}),
        ...(section.endedAt !== undefined ? { endedAt: section.endedAt } : {}),
      });
      continue;
    }
    for (const entry of section.entries) {
      const last = blocks[blocks.length - 1];
      const kind =
        entry.event.kind === "level-up"
          ? "progress"
          : entry.event.kind === "rest" ||
              (last?.kind === "rest" && RECOVERY.has(entry.event.kind))
            ? "rest"
            : "explore";
      if (last?.kind === kind) last.entries.push(entry);
      else blocks.push({ kind, at: entry.at, entries: [entry] });
    }
  }
  return blocks;
}

/** Each evening's number from its play log id (`2026-10-23`, a second sitting
 *  `2026-10-23-2`): in day order, the oldest is 1. */
export function sessionNumbers(logIds: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    [...logIds]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((id, i) => [id, i + 1])
  );
}

/** An old session page's title, kept only when the table named the evening: its default
 *  "Session 7" / "Sessione 7" would contradict the evening's own number. */
export function oldPageTitle(label: string): string | undefined {
  const title = label.trim();
  return title && !/^sessione?\s*\d+$/i.test(title) ? title : undefined;
}
