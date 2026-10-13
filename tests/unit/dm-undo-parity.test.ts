/**
 * Mechanics-world retirement, slice 7 groundwork: the DM's undo of a monster HP
 * beat through the encounter world (`undoAdversaryChronicleEvent`, journal revert)
 * and through the plain encounter writer (`undoHpEvent`, its fallback) leave the
 * same fight: every monster's HP trio and conditions, and the chronicle lines.
 */
import { describe, expect, it } from "vitest";

import {
  addMonster,
  beginEncounterTurns,
  setMonsterTempHp,
  startEncounter,
} from "@/features/campaigns/encounter";
import {
  applyAdversaryDamage,
  applyAdversaryHeal,
  undoAdversaryChronicleEvent,
} from "@/features/campaigns/encounter-world-command";
import { undoHpEvent } from "@/features/campaigns/combat-chronicle";
import type { EncounterState } from "@/types/campaign";

const CAMPAIGN_ID = "campaign-under-test";

function fight(): EncounterState {
  let state = startEncounter({}, [], 1_000);
  state = addMonster(state, {
    ac: 15,
    count: 2,
    creatureType: "humanoid",
    initiative: 14,
    maxHp: 10,
    name: "Goblin",
    srdId: "goblin-warrior",
  });
  state = addMonster(state, {
    ac: 13,
    count: 1,
    initiative: 3,
    maxHp: 20,
    name: "Bandit Chief",
  });
  return beginEncounterTurns(state, ["monster-1", "monster-2", "monster-3"]);
}

/** The fight as the table sees it: HP trios, conditions and the chronicle lines. */
function table(state: EncounterState) {
  return {
    combatants: state.combatants.map((c) =>
      c.kind === "monster"
        ? { id: c.id, hp: c.hp, conditions: c.conditions }
        : { id: c.id }
    ),
    events: (state.events ?? []).map(({ engineActionId: _id, ...event }) => {
      void _id;
      return event;
    }),
  };
}

const CASES: Array<[string, () => EncounterState]> = [
  [
    "damage absorbed by temp HP first",
    () =>
      applyAdversaryDamage(
        setMonsterTempHp(fight(), "monster-1", 3),
        CAMPAIGN_ID,
        "monster-1",
        5
      ),
  ],
  [
    "damage with no temp HP",
    () => applyAdversaryDamage(fight(), CAMPAIGN_ID, "monster-3", 7),
  ],
  [
    "damage that drops the monster to 0",
    () => applyAdversaryDamage(fight(), CAMPAIGN_ID, "monster-2", 25),
  ],
  [
    "a heal after damage (the heal is undone)",
    () =>
      applyAdversaryHeal(
        applyAdversaryDamage(fight(), CAMPAIGN_ID, "monster-3", 12),
        CAMPAIGN_ID,
        "monster-3",
        5
      ),
  ],
];

describe("the DM's undo leaves the same fight both ways", () => {
  it.each(CASES)("%s", (_name, build) => {
    const after = build();
    const last = after.events
      ?.filter((e) => e.kind === "hp-damage" || e.kind === "hp-heal")
      .at(-1);
    expect(last?.engineActionId).toBeDefined();
    if (!last) return;
    const viaWorld = undoAdversaryChronicleEvent(after, CAMPAIGN_ID, last.id);
    const viaWriter = undoHpEvent(after, last.id);
    expect(table(viaWorld)).toEqual(table(viaWriter));
  });
});
