/**
 * The forward-compat GATE (coordinator, 2026-11-13): every value of a closed list this
 * tree's writers can store in a combat/play state must be one the client live today
 * reads, or a stale tab, a player's second device and the DM's member view refuse the
 * whole document after the deploy. The live client's accepted shape is frozen in
 * `__fixtures__/forward-compat-v0.26.1.json`, made with the release's own parser
 * (`survey-forward-compat.ts --write-fixture`); the coordinator re-runs the real-release
 * check before the deploy. The next release regenerates the fixture from its own tag.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { snapshotTurnEconomy } from "@/features/character/center/combat-hydration";
import { useCombatStore } from "@/stores/combatStore";
import { CREATURE_SIZE_ORDER } from "@/data/types";
import { FAMILIAR_CREATURE_TYPES } from "@/lib/familiar-ids";
import { CONDITION_IDS } from "@/types/condition";
import { DAMAGE_TYPES } from "@/types/damage";
import type { AcceptedShape } from "../../scripts/survey-forward-compat";
import { ECONOMY_CATEGORIES, TRIGGER_EVENTS } from "../../scripts/survey-forward-compat";

const live = JSON.parse(
  readFileSync("tests/unit/__fixtures__/forward-compat-v0.26.1.json", "utf8")
) as AcceptedShape;
const accepted = (list: string) => live.lists[list] ?? [];

/** What the real writer stores for an Action of this category (the row a cast has is a
 *  spell row; the others a feature row). */
function storedCategory(category: string): string | undefined {
  useCombatStore.getState().endCombat();
  const id = category === "magic" ? "spell-fire-bolt" : `base-${category}`;
  useCombatStore.getState().selectAction({
    id,
    name: id,
    nameLoc: { custom: id },
    slot: "action",
    economyCategory: category as keyof typeof ECONOMY_CATEGORIES,
  });
  return snapshotTurnEconomy(useCombatStore.getState(), "3:pc-x").selected.action[0]
    ?.economyCategory;
}

describe(`what this tree writes, the live client (${live.release}) reads`, () => {
  it("every economy category the turn writer stores", () => {
    const stored = Object.keys(ECONOMY_CATEGORIES)
      .map(storedCategory)
      .filter((v): v is string => v !== undefined);
    expect(
      stored.filter((v) => !accepted("turnEconomy.action.economyCategory").includes(v))
    ).toEqual([]);
  });

  it("every trigger event", () => {
    expect(
      Object.keys(TRIGGER_EVENTS).filter(
        (v) => !accepted("turnEconomy.action.triggerEvents").includes(v)
      )
    ).toEqual([]);
  });

  it.each([
    ["damage types", DAMAGE_TYPES],
    ["conditions", CONDITION_IDS],
    ["creature sizes", CREATURE_SIZE_ORDER],
    ["familiar creature types", FAMILIAR_CREATURE_TYPES],
  ] as const)("every %s the play-state codec keeps", (list, values) => {
    expect([...values].filter((v) => !accepted(list).includes(v))).toEqual([]);
  });
});
