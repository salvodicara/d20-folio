/**
 * End Turn's own decisions, pure (moved out of the turn-economy provider so any
 * screen can End Turn the same way):
 *
 * - which "maintained" states (Rage) surface the keep/end prompt: still lit, not
 *   kept going this round by one of their declared events (an attack-roll or
 *   target-save action, or the dedicated Bonus Action that extends it), and not just
 *   expired outright (a hard drop supersedes the soft prompt). Merely occupying the
 *   Action slot (Dash, Help) keeps nothing going. Recomputed from scratch every End
 *   Turn, so a "Keep" clears only the current round.
 * - which ended effects to announce, in the order they ended.
 */
import { resolveActiveMaintainedEffects } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";

type ActiveMaintainedEffect = ReturnType<typeof resolveActiveMaintainedEffects>[number];
type MaintainingEvent = "attack" | "bonus-extend";

/** The turn's committed actions, by slot, as the turn economy keeps them. */
export type TurnSelections = Readonly<
  Record<string, ReadonlyArray<{ triggerEvents?: ReadonlyArray<MaintainingEvent> }>>
>;

/** The maintained states that need the keep/end prompt at this End Turn. */
export function unmaintainedStates(
  doc: CharacterDoc | null,
  selected: TurnSelections,
  expiredKeys: ReadonlySet<string>
): ActiveMaintainedEffect[] {
  if (!doc) return [];
  const maintainedThisRound: ReadonlySet<string> = new Set(
    Object.values(selected)
      .flat()
      .flatMap((entry) => entry.triggerEvents ?? [])
  );
  return resolveActiveMaintainedEffects(doc).filter(
    (effect) =>
      !expiredKeys.has(effect.activeKey) &&
      !effect.maintainedBy.some((event) => maintainedThisRound.has(event))
  );
}

/** The sources of every effect this End Turn ended, to announce in order: the timed
 *  ones, those that ended at the turn's end, then those at the next turn's start
 *  (none in a shared fight, whose next turn is someone else's). */
export function expiryNoticeSources(
  timed: ReadonlyArray<{ sourceId: string }>,
  atTurnEnd: ReadonlyArray<{ sourceId: string }>,
  atNextTurnStart: ReadonlyArray<{ sourceId: string }> = []
): string[] {
  return [...timed, ...atTurnEnd, ...atNextTurnStart].map((effect) => effect.sourceId);
}
