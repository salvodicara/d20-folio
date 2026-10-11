import { beforeAll, describe, expect, it } from "vitest";
import type { MonsterStatBlock } from "@/data/types";
import {
  addMonster,
  advanceTurn,
  beginEncounterTurns,
  monsterLimitedUses,
  parseEncounterState,
  restoreMonsterUse,
  spendMonsterUse,
  startEncounter,
} from "@/features/campaigns/encounter";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

/**
 * A stat block's limited uses (Recharge X–6, N/Day, the legendary action pool)
 * are counters the DM spends on the monster card; the legendary pool comes back
 * at the start of the monster's turn (docs/RULES_COVERAGE.md). Cases come from
 * the bestiary itself.
 */
let MONSTERS: ReadonlyArray<MonsterStatBlock> = [];
beforeAll(async () => {
  ({ MONSTERS } = await import("@/data/monsters"));
});

const SECTIONS = [
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
] as const;

function expectedUses(block: MonsterStatBlock) {
  const out: Array<{ key: string; max: number }> = [];
  for (const section of SECTIONS) {
    for (const entry of block[section] ?? []) {
      if (entry.recharge) out.push({ key: `${section}:${entry.id}`, max: 1 });
      else if (entry.uses)
        out.push({ key: `${section}:${entry.id}`, max: entry.uses.count });
    }
  }
  if (block.legendary) out.push({ key: "legendary", max: block.legendary.uses });
  return out;
}

function encounterWith(): EncounterState {
  const state = addMonster(startEncounter({}, [], 1), {
    name: "Dragon",
    ac: 18,
    maxHp: 200,
    count: 1,
    initiative: 20,
  });
  return addMonster(state, {
    name: "Goblin",
    ac: 15,
    maxHp: 7,
    count: 1,
    initiative: 10,
  });
}

const monster = (state: EncounterState, id: string) =>
  state.combatants.find(
    (c): c is EncounterMonster => c.kind === "monster" && c.id === id
  );

describe("monster limited uses", () => {
  it("every recharge, N/Day and legendary pool in the bestiary is a counter", () => {
    expect(MONSTERS.length).toBeGreaterThan(300);
    for (const block of MONSTERS) {
      expect(
        monsterLimitedUses(block).map(({ key, max }) => ({ key, max })),
        block.id
      ).toEqual(expectedUses(block));
    }
    expect(MONSTERS.some((block) => expectedUses(block).length > 0)).toBe(true);
  });

  it("spends up to the limit and restores down to zero", () => {
    let state = encounterWith();
    state = spendMonsterUse(state, "monster-1", "legendary", 3);
    state = spendMonsterUse(state, "monster-1", "legendary", 3);
    state = spendMonsterUse(state, "monster-1", "legendary", 3);
    expect(spendMonsterUse(state, "monster-1", "legendary", 3)).toBe(state);
    expect(monster(state, "monster-1")?.spent).toEqual({ legendary: 3 });
    state = restoreMonsterUse(state, "monster-1", "legendary");
    expect(monster(state, "monster-1")?.spent).toEqual({ legendary: 2 });
    state = restoreMonsterUse(
      restoreMonsterUse(state, "monster-1", "legendary"),
      "monster-1",
      "legendary"
    );
    expect(monster(state, "monster-1")?.spent).toBeUndefined();
    expect(restoreMonsterUse(state, "monster-1", "legendary")).toBe(state);
  });

  it("the legendary pool comes back when the monster's turn starts, other uses stay spent", () => {
    let state = beginEncounterTurns(encounterWith(), ["monster-1", "monster-2"]);
    expect(state.currentCombatantId).toBe("monster-1");
    state = spendMonsterUse(state, "monster-1", "legendary", 3);
    state = spendMonsterUse(state, "monster-1", "actions:fire-breath", 1);
    state = advanceTurn(state);
    expect(state.currentCombatantId).toBe("monster-2");
    expect(monster(state, "monster-1")?.spent).toEqual({
      legendary: 1,
      "actions:fire-breath": 1,
    });
    state = advanceTurn(state);
    expect(state.currentCombatantId).toBe("monster-1");
    expect(monster(state, "monster-1")?.spent).toEqual({ "actions:fire-breath": 1 });
  });

  it("a stored encounter with spent counters parses; a malformed one does not", () => {
    const state = spendMonsterUse(encounterWith(), "monster-1", "legendary", 3);
    expect(parseEncounterState(structuredClone(state))).toEqual(state);
    for (const spent of [
      { legendary: 0 },
      { legendary: -1 },
      { legendary: 1.5 },
      { "": 1 },
      [],
    ]) {
      const bad = structuredClone(state) as unknown as {
        combatants: Array<Record<string, unknown>>;
      };
      const first = bad.combatants[0];
      if (first) first.spent = spent;
      expect(() => parseEncounterState(bad), JSON.stringify(spent)).toThrow();
    }
  });
});
