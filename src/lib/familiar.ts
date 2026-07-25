/**
 * Find Familiar — the LAZY-side eligible-form resolver (joins the monster corpus).
 *
 * This module imports `@/data/monsters`, so it is **lazy-only**: the eager startup
 * closure can never reach it (pinned by the eager-partition sweep,
 * `tests/unit/eager-partition.guard.test.ts`). The eager side reads
 * {@link import("./familiar-ids")} instead. Only the form picker + the familiar
 * statblock leaf (both lazy) consume this.
 *
 * The eligible pool is DERIVED from the corpus (guard doctrine, golden rule 13) —
 * never hand-listed: every CR-0 Beast (the spell's named 11 are all CR-0 Beasts,
 * and the clause "or another Beast that has a Challenge Rating of 0" covers the
 * rest) ∪ the special forms an aggregate widens the pool with (Pact of the Chain).
 */
import type { MonsterStatBlock } from "@/data/types";
import { filterMonsters, getMonster } from "@/data/monsters";

/**
 * The 2024 Find Familiar eligible-form pool: every CR-0 Beast, plus the special
 * forms in `familiarFormIds` (from `AggregatedGrants.familiarFormIds` — Pact of
 * the Chain's Imp/Pseudodragon/…). An id with no corpus entry (a pack-only form in
 * an SRD-only build) drops quietly — the encounter stale-`srdId` precedent. Corpus
 * order (cr, id) for the beasts; the specials append in aggregate iteration order.
 */
export function resolveFamiliarForms(
  familiarFormIds: ReadonlySet<string>
): ReadonlyArray<MonsterStatBlock> {
  const base = filterMonsters({ crMax: 0, type: "beast" }); // crMin 0 implied (no negative CR)
  const beastIds = new Set(base.map((m) => m.id));
  const special = [...familiarFormIds]
    .filter((id) => !beastIds.has(id)) // a CR-0 Beast granted as a "special" isn't listed twice
    .map((id) => getMonster(id))
    .filter((m): m is MonsterStatBlock => m !== undefined);
  return [...base, ...special];
}
