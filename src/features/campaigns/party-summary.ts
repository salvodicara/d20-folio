/**
 * party-summary — the DM's whole-party table (owner I-152: a party summary, with the
 * individual sheets kept). One row per attached hero, sorted by name, built from the
 * same {@link PartyMemberStats} the party cards use; the best value of each comparable
 * column is marked (every hero tied for it), so the DM sees at a glance who notices
 * most, who is hardest to hit, who acts first. A column where everyone is equal — or
 * a party of one — marks nobody. Pure: no React, no store.
 */

import type { PartyMemberStats } from "@/features/campaigns/party-stats";

/** The columns where "higher is better" is meaningful at the table. */
export const SUMMARY_COLUMNS = [
  "ac",
  "maxHp",
  "initiativeBonus",
  "passivePerception",
  "passiveInsight",
  "passiveInvestigation",
  "walkingSpeedFt",
] as const;
export type SummaryColumn = (typeof SUMMARY_COLUMNS)[number];

export interface PartySummaryMember {
  uid: string;
  name: string;
  stats: PartyMemberStats;
}

export interface PartySummary {
  rows: PartySummaryMember[];
  /** Per column, the uids holding the strictly-best value (empty when nobody stands out). */
  best: Record<SummaryColumn, Set<string>>;
}

export function partySummary(members: readonly PartySummaryMember[]): PartySummary {
  const rows = [...members].sort((a, b) => a.name.localeCompare(b.name));
  const best = {} as Record<SummaryColumn, Set<string>>;
  for (const column of SUMMARY_COLUMNS) {
    const values = rows.map((r) => r.stats[column]);
    const top = Math.max(...values);
    const leaders = rows.filter((r) => r.stats[column] === top);
    best[column] = new Set(
      rows.length > 1 && leaders.length < rows.length ? leaders.map((r) => r.uid) : []
    );
  }
  return { rows, best };
}
