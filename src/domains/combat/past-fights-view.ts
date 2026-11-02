/**
 * «Scontri passati»: every fight of the recorded evenings, newest first, with its
 * evening's number, its foes, its rounds and how it ended. Read from the play logs
 * through the Diario's own blocks, so the two tabs always tell the same fight.
 */
import { diaryBlocks } from "@/domains/chronicle/diary-view";
import type { ReportSection } from "@/lib/session-log";

export interface PastFight {
  encounterId: string;
  /** The evening's play log id and number. */
  logId: string;
  session: number | undefined;
  at: number;
  foes: string[];
  rounds: number;
  outcome?: "victory" | "ended";
}

export function pastFights(
  evenings: readonly { id: string; sections: readonly ReportSection[] }[],
  numbers: Readonly<Record<string, number>>
): PastFight[] {
  const fights: PastFight[] = [];
  for (const evening of evenings) {
    for (const block of diaryBlocks(evening.sections)) {
      if (block.kind !== "fight") continue;
      fights.push({
        encounterId: block.encounterId,
        logId: evening.id,
        session: numbers[evening.id],
        at: block.at,
        foes: block.foes,
        rounds: block.rounds,
        ...(block.outcome ? { outcome: block.outcome } : {}),
      });
    }
  }
  return fights.sort((a, b) => b.at - a.at);
}
