/**
 * M1 — Metamagic choice modelling (Sorcerer).
 *
 * Per the 2024 PHB (verified against http://dnd2024.wikidot.com/sorcerer):
 * - Level 2: gain 2 Metamagic options.
 * - Level 10: gain 2 more.
 * - Level 17: gain 2 more.
 * - Each level-up may swap one chosen option for another.
 *
 * The placeholder `sorcerer-metamagic` feature signals the slot opens; the
 * specific options live as data in `src/data/metamagic.ts`.
 */

import { SRD_METAMAGIC } from "@/data/metamagic";
import type { SrdMetamagicOption } from "@/data/metamagic";

const METAMAGIC_FEATURE_ID = "sorcerer-metamagic";

/** True when the feature id is the metamagic placeholder. */
export function isMetamagicPlaceholder(featureId: string): boolean {
  return featureId === METAMAGIC_FEATURE_ID;
}

/**
 * How many NEW metamagic picks the Sorcerer gains at the given level.
 * Returns 0 for any non-grant level.
 */
export function metamagicPicksAtLevel(level: number): number {
  if (level === 2) return 2;
  if (level === 10) return 2;
  if (level === 17) return 2;
  return 0;
}

/**
 * Total Metamagic options a Sorcerer knows after gaining the given level
 * (cumulative — the re-picker's cap). 2024: +2 at L2, L10, L17 → L2-9: 2,
 * L10-16: 4, L17+: 6. Returns 0 below level 2.
 */
export function metamagicKnownAt(level: number): number {
  let total = 0;
  for (let l = 1; l <= level; l += 1) total += metamagicPicksAtLevel(l);
  return total;
}

/** All 10 SRD 2024 Metamagic options, sorted by id. */
export function listMetamagicOptions(): SrdMetamagicOption[] {
  return [...SRD_METAMAGIC].sort((a, b) => a.id.localeCompare(b.id));
}
