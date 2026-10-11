/**
 * Per-cast Metamagic effects the cast commit applies, read from the catalogue
 * (`src/data/metamagic.ts`) so a new option is wired by data alone.
 */
import { METAMAGIC_BY_ID } from "@/data/metamagic";
import type { ActionType } from "@/data/types";

function options(metamagicIds: ReadonlyArray<string>) {
  return metamagicIds.flatMap((id) => METAMAGIC_BY_ID.get(id) ?? []);
}

/** The slot a cast is taken with: an Action cast becomes the option's slot. */
export function castEconomySlot(
  slot: ActionType,
  metamagicIds: ReadonlyArray<string>
): ActionType {
  if (slot !== "action") return slot;
  return options(metamagicIds).find((m) => m.castsAs)?.castsAs ?? slot;
}

/** The status countdown armed on cast, after any duration-changing option. */
export function extendedDurationRounds(
  rounds: number | undefined,
  metamagicIds: ReadonlyArray<string>
): number | undefined {
  if (rounds === undefined) return undefined;
  return options(metamagicIds).reduce((current, { extendsDuration: ext }) => {
    if (!ext || current < ext.minRounds) return current;
    return Math.min(current * ext.factor, Math.max(current, ext.maxRounds));
  }, rounds);
}

/** The cast action with its armed countdown changed by the chosen options. */
export function withMetamagicDuration<T extends { activeDurationRounds?: number }>(
  action: T,
  metamagicIds: ReadonlyArray<string>
): T {
  const rounds = extendedDurationRounds(action.activeDurationRounds, metamagicIds);
  return rounds === action.activeDurationRounds
    ? action
    : { ...action, activeDurationRounds: rounds };
}
