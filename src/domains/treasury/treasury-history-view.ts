/**
 * «Chi ha preso cosa»: every coin movement of the shared chest, newest first, with who
 * did it (the player's name; none when they left the campaign), in or out, how much of
 * which coin, and their note.
 */
import type { CurrencyUnit } from "@/data/types";
import type { TreasuryLogEntry } from "@/types/campaign";

export interface TreasuryLine {
  at: Date;
  who: string | null;
  direction: "in" | "out";
  amount: number;
  currency: CurrencyUnit;
  note: string | null;
}

export function treasuryHistory(
  log: readonly TreasuryLogEntry[],
  players: Readonly<Record<string, string>>
): TreasuryLine[] {
  return log
    .map((entry) => ({
      at: entry.at,
      who: players[entry.by] ?? null,
      direction: entry.type === "add" ? ("in" as const) : ("out" as const),
      amount: entry.amount,
      currency: entry.currency,
      note: entry.note.trim() || null,
    }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}
