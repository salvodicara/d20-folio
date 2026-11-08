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
import { locationOf, type CreatureLocation } from "@/lib/familiar-ids";
import type { SessionState } from "@/types/character";

export type { CreatureLocation };

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

/**
 * Whether two creatures share a plane (the familiar's link, a planar check). Inside
 * an extradimensional space, only with one in the same space; an untagged creature
 * shares the other's plane (today's behaviour, where nothing is tagged).
 */
export function sharesPlane(
  a: CreatureLocation | undefined,
  b: CreatureLocation | undefined
): boolean {
  if (a?.inside || b?.inside) return a?.inside !== undefined && a.inside === b?.inside;
  if (!a?.plane || !b?.plane) return true;
  return a.plane === b.plane;
}

/** The pocket dimension a dismissed familiar waits in (Find Familiar: «you can
 *  dismiss it … into a pocket dimension»), as a location id. */
export const FAMILIAR_POCKET_DIMENSION = "find-familiar:pocket-dimension";

/**
 * Where the familiar is: inside its pocket dimension while dismissed, else beside its
 * owner (it has no stored place of its own). Undefined with no familiar.
 */
export function familiarLocation(
  session: Pick<SessionState, "familiar" | "location">
): CreatureLocation | undefined {
  if (!session.familiar) return undefined;
  if (session.familiar.dismissed) return { inside: FAMILIAR_POCKET_DIMENSION };
  return locationOf(session);
}

/**
 * Whether the familiar's link to its owner holds: the two share a plane (and an
 * extradimensional space only with one in the same space). Engine-ready: the Play
 * screen reads it once a creature's location can be set (edge-case M19, owner-gated).
 */
export function familiarLinkHolds(
  session: Pick<SessionState, "familiar" | "location">
): boolean {
  if (!session.familiar) return false;
  return sharesPlane(locationOf(session), familiarLocation(session));
}
