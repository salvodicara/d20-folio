/**
 * Putting coins in or taking them out of the shared chest: the ledger row that
 * `applyTreasuryDelta` records. Whole coins only; a take never takes more than the chest
 * holds (golden rule 20: the amount can never be invalid); nothing to move is no move.
 */
import type { CurrencyUnit } from "@/data/types";
import type { CampaignDoc, TreasuryLogEntry } from "@/types/campaign";

export function coinMove(
  treasury: CampaignDoc["treasury"],
  move: {
    mode: "in" | "out";
    amount: number;
    currency: CurrencyUnit;
    note: string;
    by: string;
    at: Date;
  }
): TreasuryLogEntry | null {
  const whole = Math.floor(move.amount);
  const amount = move.mode === "out" ? Math.min(whole, treasury[move.currency]) : whole;
  if (!(amount > 0)) return null;
  return {
    amount,
    currency: move.currency,
    type: move.mode === "in" ? "add" : "remove",
    note: move.note.trim(),
    by: move.by,
    at: move.at,
  };
}
