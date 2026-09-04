/**
 * The play surface's pure model: the constants and the small derivations its components share.
 *
 * They live beside the components rather than inside them because a module that exports a
 * component AND a value cannot be hot-reloaded as a component, and because these are the pieces
 * a test wants to reach without rendering anything: which tabs exist, what a log filter keeps,
 * which order the DM's "begin turns" commits, whether the table is ready for it.
 */
import type { EntityId } from "@/lib/combat/ids";
import type { ConditionId, Entity, FoldedState } from "@/lib/combat/types";
import type { LogLine } from "@/lib/views/encounter-log-view";

/** Where a person's dice mode lives until settings land at item 8 (design §2 D7). */
export const DICE_MODE_KEY = "d20-dice-mode";

export type DiceMode = "app" | "manual";

/** The hotbar's tabs. `passive` and `mine` have no engine data in this stage and say so. */
export type HotbarTab = "common" | "spells" | "items" | "passive" | "mine";

export const HOTBAR_TABS: readonly HotbarTab[] = [
  "common",
  "spells",
  "items",
  "passive",
  "mine",
];

export type DrawerTab = "log" | "hidden" | "fog" | "scene" | "rules" | "notes";

export const DRAWER_TABS: readonly DrawerTab[] = [
  "log",
  "hidden",
  "fog",
  "scene",
  "rules",
  "notes",
];

export type LogFilter = "all" | "rolls" | "wounds" | "dm" | "rejected";

export const LOG_FILTERS: readonly LogFilter[] = [
  "all",
  "rolls",
  "wounds",
  "dm",
  "rejected",
];

/** Which lines a filter keeps. The DM asks five questions of a log and these are they. */
export function filterLines(
  lines: readonly LogLine[],
  filter: LogFilter
): readonly LogLine[] {
  switch (filter) {
    case "rolls":
      return lines.filter((line) => line.kind === "roll");
    case "wounds":
      return lines.filter((line) => line.verdict !== null);
    case "dm":
      return lines.filter((line) => line.author === "dm" || line.hidden);
    case "rejected":
      return lines.filter((line) => line.kind === "rejected");
    default:
      return lines;
  }
}

export interface SlotPool {
  readonly level: number;
  readonly pool: "standard" | "pact";
  readonly current: number;
  readonly max: number;
}

/**
 * The entity's slot pools, in level order, standard before pact at the same level.
 *
 * The keys are the reducer's own (`slot-<n>` / `pact-<n>`, `combat-projection.ts`): a Pact Magic
 * slot is a separate pool at the same level, so the diamonds show two rows, never one merged
 * one that would let a Sorlock spend a slot they do not have.
 */
export function slotPools(entity: Entity): SlotPool[] {
  const pools: SlotPool[] = [];
  for (const [key, resource] of Object.entries(entity.resources)) {
    const standard = key.startsWith("slot-");
    const pact = key.startsWith("pact-");
    if (!standard && !pact) continue;
    const level = Number(key.slice(key.indexOf("-") + 1));
    if (!Number.isInteger(level)) continue;
    pools.push({
      level,
      pool: standard ? "standard" : "pact",
      current: resource.current,
      max: resource.max,
    });
  }
  return pools.sort((a, b) => a.level - b.level || a.pool.localeCompare(b.pool));
}

/**
 * The order the DM's "begin turns" commits: highest initiative first, ties broken by entity id
 * so every client agrees on the order without a second roll.
 */
export function initiativeOrder(state: FoldedState): EntityId[] {
  return Object.values(state.entities)
    .filter((entity) => state.clock.initiative[entity.id] !== undefined)
    .map((entity) => entity.id)
    .sort(
      (a, b) =>
        (state.clock.initiative[b] ?? 0) - (state.clock.initiative[a] ?? 0) ||
        a.localeCompare(b)
    );
}

/** Everybody seated has rolled — the gate on beginning turns. */
export function readyForTurns(state: FoldedState): boolean {
  const seated = Object.values(state.entities);
  return (
    seated.length > 0 &&
    seated.every((entity) => state.clock.initiative[entity.id] !== undefined)
  );
}

/**
 * One glyph per condition (information code §4: shape AND colour, never colour alone).
 *
 * A condition chip that carried the same warning triangle for every condition would be a
 * colour-only code with extra steps: the whole point of the medallion is that "prone" and
 * "poisoned" are told apart at a glance, across the table, on a phone.
 */
export const CONDITION_ICON: Readonly<Record<ConditionId, string>> = {
  blinded: "i-blinded",
  charmed: "i-charmed",
  deafened: "i-deafened",
  exhaustion: "i-exhaustion",
  frightened: "i-frightened",
  grappled: "i-grappled",
  incapacitated: "i-incapacitated",
  invisible: "i-invisible",
  paralyzed: "i-paralyzed",
  petrified: "i-petrified",
  poisoned: "i-poisoned",
  prone: "i-prone",
  restrained: "i-restrained",
  stunned: "i-stunned",
  unconscious: "i-unconscious",
};
