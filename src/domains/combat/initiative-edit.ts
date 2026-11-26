/**
 * The DM edits a creature's initiative on the new fight screen (D&D Beyond's combat
 * tracker: type the number, the list re-sorts; Foundry's «update combatant»). Before
 * turns begin the engine re-sorts by itself; once they have begun the order stands, so
 * the edited creatures move to their number's place with the reorder move.
 */
import type { EncounterState } from "@/types/campaign";

/** A whole number from -9 to 99; null for anything else. */
export function parseInitiative(text: string): number | null {
  const s = text.trim();
  return /^-?\d{1,2}$/.test(s) && !/^-0*$/.test(s) ? Number(s) : null;
}

/**
 * Where the edited creatures go in the turn order: before the first other line that
 * now rolls lower (a tie goes after), or null for the end. A line still to roll has no
 * place in the order and is skipped.
 */
export function placeByInitiative(
  order: readonly { id: string; initiative: number | null }[],
  movedIds: readonly string[],
  value: number
): string | null {
  const moved = new Set(movedIds);
  const next = order.find(
    (r) => !moved.has(r.id) && r.initiative !== null && r.initiative < value
  );
  return next?.id ?? null;
}

/**
 * Where an edited line goes, for the move: null before turns begin (the engine re-sorts
 * by itself), else its number's place in the standing order.
 */
export function initiativePlace(
  fight: Pick<EncounterState, "clock" | "order">,
  fighters: readonly { id: string; initiative: number | null }[],
  movedIds: readonly string[],
  value: number
): { beforeId: string | null } | null {
  if (fight.clock && !fight.clock.turnsBegun) return null;
  const order = (fight.order ?? []).flatMap((id) => {
    const f = fighters.find((x) => x.id === id);
    return f ? [{ id, initiative: f.initiative }] : [];
  });
  return { beforeId: placeByInitiative(order, movedIds, value) };
}
