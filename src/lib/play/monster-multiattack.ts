/**
 * A monster's Multiattack as one sequence of the rows its encounter card already
 * offers: the routine the bestiary declares (`multiattack` on the entry, pinned to
 * the print by `printedMultiattack`) resolved to the stat block's own entries,
 * and each attack or save to the same {@link MonsterAction} its chip opens. The
 * DM can run the whole routine one row after the other; a step that offers
 * several entries ("Scimitar and Pistol in any combination") leaves the pick to
 * the DM, and the printed swap and alternative routine stay choices.
 *
 * Pure and derived: nothing is stored, the plan is recomputed from the block.
 */
import type { MonsterMultiattackStep, MonsterStatBlock } from "@/data/types";
import type { MonsterSection } from "@/lib/activities";

import {
  MONSTER_ACTION_SECTIONS,
  monsterActions,
  type MonsterAction,
} from "./monster-action";

/** One entry a step may use; `action` when it is one tap (an attack or save). */
export interface MultiattackOption {
  section: MonsterSection;
  entryId: string;
  action?: MonsterAction;
}

export interface MultiattackPlanStep {
  count: number;
  /** One entry, or the DM's pick for each of the `count`. */
  options: MultiattackOption[];
  /** "if available", "can use": the routine stands without it. */
  optional?: true;
}

export interface MultiattackPlan {
  /** The Multiattack entry itself. */
  section: MonsterSection;
  entryId: string;
  steps: MultiattackPlanStep[];
  /** A second routine the print offers instead. */
  or?: MultiattackPlanStep[];
  /** `count` attacks ("any" = each) traded for one use of an option; `of` = only that attack. */
  replace?: {
    count: number | "any";
    options: MultiattackOption[];
    of?: MultiattackOption;
  };
}

/** The plan of the block's Multiattack, or null when it declares no routine. */
export function multiattackPlan(block: MonsterStatBlock): MultiattackPlan | null {
  const actions = monsterActions(block);
  const option = (entryId: string): MultiattackOption => {
    const section =
      MONSTER_ACTION_SECTIONS.find((s) =>
        (block[s] ?? []).some((e) => e.id === entryId)
      ) ?? "actions";
    const action = actions.find((a) => a.section === section && a.entryId === entryId);
    return { section, entryId, ...(action ? { action } : {}) };
  };
  const steps = (list: ReadonlyArray<MonsterMultiattackStep>): MultiattackPlanStep[] =>
    list.map(({ count, use, optional }) => ({
      count,
      options: use.map(option),
      ...(optional ? { optional } : {}),
    }));
  for (const section of MONSTER_ACTION_SECTIONS)
    for (const entry of block[section] ?? []) {
      if (entry.kind !== "narrative" || !entry.multiattack) continue;
      const { multiattack } = entry;
      const { replace } = multiattack;
      return {
        section,
        entryId: entry.id,
        steps: steps(multiattack.steps),
        ...(multiattack.or ? { or: steps(multiattack.or) } : {}),
        ...(replace
          ? {
              replace: {
                count: replace.count,
                options: replace.use.map(option),
                ...(replace.of ? { of: option(replace.of) } : {}),
              },
            }
          : {}),
      };
    }
  return null;
}

/** The routine one use per row, print order: "two Rend attacks" is two rows. */
export function multiattackRows(
  steps: ReadonlyArray<MultiattackPlanStep>
): MultiattackOption[][] {
  return steps.flatMap(({ count, options }) =>
    Array.from({ length: count }, () => [...options])
  );
}
