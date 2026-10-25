/**
 * Summoned creatures in the Initiative order, as each source's SRD 5.2.1 text says
 * ({@link SummonTurn}): a creature that shares its caster's Initiative count takes its
 * turn right after the caster (Summon Dragon, Giant Insect, Staff of the Python); one
 * with no turn of its own gets no row (Arcane Hand); any other rolls its own
 * Initiative, typed at the table (Animate Dead, Planar Ally, Horn of Valhalla).
 *
 * Who summoned whom lives on the encounter (`EncounterState.summons`), never on a
 * monster, and is always read through {@link summonLinks}, which drops a link to a
 * removed creature or a malformed one (an older client may remove a combatant without
 * knowing it). READER FIRST: nothing writes it until the encounter UI wires
 * {@link linkSummon}.
 */
import { getMagicItem } from "@/data/magic-items";
import { getSpellById } from "@/data/spells";
import type { SummonTurn } from "@/data/types";
import { summonInstanceKey } from "@/lib/summon-count";
import type { EncounterState } from "@/types/campaign";
import { isLink, summonLinks, summonedTurnOrder, type SummonLink } from "./summon-links";

export { summonLinks, summonedTurnOrder, type SummonLink };

/** Where a source's creature acts: its text's rule, or `own` when it says none. */
export type SummonPlacement = SummonTurn | "own";

/**
 * What summoned the creatures: a spell, or a magic item's physical copy. A source
 * that carries its own `summonTurn` (a homebrew item's group, whose id is its copy's
 * and is in no catalogue) is placed by it; any other is looked up by its id.
 */
export type SummonSourceRef = ({ spellId: string } | { itemId: string }) & {
  summonTurn?: SummonTurn;
};

/**
 * One group of summoned creatures, as the Companions rail resolves it (a spell's
 * `SummonedMonsterGroup`, an item's `ItemSummonGroup`, or a companion spell with
 * `count: 1`). `groupId` keys the creatures' HP; a spell's group is keyed by its id.
 */
export type SummonGroupInput = SummonSourceRef & {
  groupId?: string;
  monsterId?: string;
  count: number;
};

/** One creature's row for the Initiative order. */
export interface SummonInitiativeEntry {
  /** `<groupId>#<n>`, the key of the creature's Hit Points. */
  key: string;
  groupId: string;
  n: number;
  monsterId?: string;
  turn: Exclude<SummonPlacement, "caster-turn">;
  /** The caster's count for `after-caster` (null until the caster rolls); null for
   *  `own`, which the table types. */
  initiative: number | null;
  /** The combatant the creature acts right after (`after-caster` only). */
  afterId?: string;
}

/** The rule a source's text gives its creature. */
export function summonTurnOf(source: SummonSourceRef): SummonPlacement {
  const turn =
    source.summonTurn ??
    ("spellId" in source
      ? getSpellById(source.spellId)?.summonTurn
      : getMagicItem(source.itemId)?.summonTurn);
  return turn ?? "own";
}

/**
 * The Initiative rows the caster's summoned creatures bring: one per creature, except
 * for a creature with no turn of its own. The caller adds them to the encounter and
 * links each `after-caster` one with {@link linkSummon}.
 */
export function summonInitiativeEntries(
  groups: ReadonlyArray<SummonGroupInput>,
  caster: { id: string; initiative: number | null }
): SummonInitiativeEntry[] {
  const rows: SummonInitiativeEntry[] = [];
  for (const group of groups) {
    const turn = summonTurnOf(group);
    if (turn === "caster-turn") continue;
    const groupId = group.groupId ?? ("spellId" in group ? group.spellId : group.itemId);
    for (let n = 1; n <= group.count; n += 1) {
      rows.push({
        key: summonInstanceKey(groupId, n),
        groupId,
        n,
        ...(group.monsterId ? { monsterId: group.monsterId } : {}),
        turn,
        ...(turn === "after-caster"
          ? { initiative: caster.initiative, afterId: caster.id }
          : { initiative: null }),
      });
    }
  }
  return rows;
}

type SummonState = Pick<EncounterState, "combatants" | "summons" | "order">;

function withLinks<T extends SummonState>(state: T, links: SummonLink[]): T {
  const next = { ...state };
  if (links.length > 0) next.summons = links;
  else delete next.summons;
  return next;
}

/** The summon is tied to its caster: the link is stored and, once turns run, the
 *  summon's slot moves right after the caster. Null when either creature is missing,
 *  the same one, or the summon already has a caster. */
export function linkSummon<T extends SummonState>(state: T, link: SummonLink): T | null {
  if (!isLink(link)) return null;
  const ids = new Set(state.combatants.map((c) => c.id));
  if (!ids.has(link.summonId) || !ids.has(link.casterId)) return null;
  const links = summonLinks(state);
  if (links.some((l) => l.summonId === link.summonId)) return null;
  const next = withLinks(state, [...links, { ...link }]);
  if (next.order && next.order.length > 0)
    next.order = summonedTurnOrder(next.order, [link]);
  return next;
}

/** The summon leaves its caster's control: its link goes, its slot stays. Null when it
 *  has no caster. */
export function unlinkSummon<T extends SummonState>(
  state: T,
  summonId: string
): T | null {
  const links = summonLinks(state);
  if (!links.some((link) => link.summonId === summonId)) return null;
  return withLinks(
    state,
    links.filter((link) => link.summonId !== summonId)
  );
}
