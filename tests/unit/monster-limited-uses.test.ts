import { beforeAll, describe, expect, it } from "vitest";
import type { MonsterStatBlock } from "@/data/types";
import {
  addMonster,
  advanceTurn,
  beginEncounterTurns,
  monsterLimitedUses,
  parseEncounterState,
  restoreMonsterUse,
  rollMonsterRecharge,
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
      // Each spell of an "N/Day Each" tier has its own N uses.
      if (entry.kind === "spellcasting") {
        for (const tier of entry.perDay ?? []) {
          for (const spellId of tier.spellIds) {
            out.push({ key: `${section}:${entry.id}:${spellId}`, max: tier.count });
          }
        }
      }
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

  it("every entry whose prose opens with an N/Day limit declares those uses", async () => {
    // The 2024 prints carry the limit in the entry prose ("(3/Day, or 4/Day in
    // Lair) If the dragon fails a saving throw…"); the counter needs it as data.
    const en = (await import("@/i18n/en/srd/monsters.json")).default as Record<
      string,
      { text?: string }
    >;
    let printed = 0;
    for (const block of MONSTERS) {
      for (const section of SECTIONS) {
        for (const entry of block[section] ?? []) {
          const text = en[`${block.id}.${section}.${entry.id}`]?.text ?? "";
          const match = /^\((\d+)\/Day\b/.exec(text);
          if (!match) continue;
          printed++;
          expect(entry.uses, `${block.id}.${section}.${entry.id}`).toEqual({
            count: Number(match[1]),
            per: "day",
          });
        }
      }
    }
    // Every Legendary Resistance in the bestiary prints its limit this way.
    expect(printed).toBeGreaterThanOrEqual(32);
  });

  it("an Adult Red Dragon: Legendary Resistance 3/Day, Fire Breath Recharge 5–6, Fireball 1/Day, 3 legendary actions", () => {
    const dragon = MONSTERS.find((block) => block.id === "adult-red-dragon");
    expect(dragon && monsterLimitedUses(dragon)).toEqual([
      { key: "traits:legendary-resistance", max: 3, kind: "uses" },
      { key: "actions:fire-breath", max: 1, kind: "recharge", recharge: 5 },
      {
        key: "actions:spellcasting:fireball",
        max: 1,
        kind: "spell",
        spellId: "fireball",
      },
      { key: "legendary", max: 3, kind: "legendary" },
    ]);
  });

  it("a Mage's 2/Day Each and 1/Day Each spells are one counter per spell", () => {
    const mage = MONSTERS.find((block) => block.id === "mage");
    expect(mage && monsterLimitedUses(mage)).toEqual([
      {
        key: "actions:spellcasting:fireball",
        max: 2,
        kind: "spell",
        spellId: "fireball",
      },
      {
        key: "actions:spellcasting:invisibility",
        max: 2,
        kind: "spell",
        spellId: "invisibility",
      },
      {
        key: "actions:spellcasting:cone-of-cold",
        max: 1,
        kind: "spell",
        spellId: "cone-of-cold",
      },
      { key: "actions:spellcasting:fly", max: 1, kind: "spell", spellId: "fly" },
      // Misty Step (3/Day) and Protective Magic (3/Day) are plain N/Day entries.
      { key: "bonusActions:misty-step", max: 3, kind: "uses" },
      { key: "reactions:protective-magic", max: 3, kind: "uses" },
    ]);
    // Two Fireballs, then the third is refused; Cone of Cold is its own count.
    const fireball = { key: "actions:spellcasting:fireball", max: 2 };
    let state = encounterWith();
    state = spendMonsterUse(state, "monster-1", fireball.key, fireball.max);
    state = spendMonsterUse(state, "monster-1", fireball.key, fireball.max);
    expect(spendMonsterUse(state, "monster-1", fireball.key, fireball.max)).toBe(state);
    state = spendMonsterUse(state, "monster-1", "actions:spellcasting:cone-of-cold", 1);
    expect(monster(state, "monster-1")?.spent).toEqual({
      "actions:spellcasting:fireball": 2,
      "actions:spellcasting:cone-of-cold": 1,
    });
  });

  it("a failed save spends Legendary Resistance, which the turn start never refills", () => {
    const resistance = { key: "traits:legendary-resistance", max: 3 };
    let state = beginEncounterTurns(encounterWith(), ["monster-1", "monster-2"]);
    for (let i = 0; i < 4; i++) {
      state = spendMonsterUse(state, "monster-1", resistance.key, resistance.max);
    }
    expect(monster(state, "monster-1")?.spent).toEqual({ [resistance.key]: 3 });
    state = advanceTurn(advanceTurn(state));
    expect(state.currentCombatantId).toBe("monster-1");
    expect(monster(state, "monster-1")?.spent).toEqual({ [resistance.key]: 3 });
  });

  it("a Hell Hound's Fire Breath (Recharge 5–6) comes back on the DM's 5 or 6, not on a 4", () => {
    const hound = MONSTERS.find((block) => block.id === "hell-hound");
    const breath = hound && monsterLimitedUses(hound)[0];
    expect(breath).toEqual({
      key: "actions:fire-breath",
      max: 1,
      kind: "recharge",
      recharge: 5,
    });
    if (!breath) return;
    const ready = encounterWith();
    // Not spent: nothing to recharge, whatever the roll.
    expect(rollMonsterRecharge(ready, "monster-1", breath, 6)).toBe(ready);
    const used = spendMonsterUse(ready, "monster-1", breath.key, breath.max);
    for (const d6 of [1, 4]) {
      expect(rollMonsterRecharge(used, "monster-1", breath, d6), String(d6)).toBe(used);
    }
    for (const d6 of [5, 6]) {
      expect(
        monster(rollMonsterRecharge(used, "monster-1", breath, d6), "monster-1")?.spent,
        String(d6)
      ).toBeUndefined();
    }
    // Not a d6 face, or not a Recharge entry: refused.
    for (const d6 of [0, 7, 5.5, Number.NaN]) {
      expect(rollMonsterRecharge(used, "monster-1", breath, d6), String(d6)).toBe(used);
    }
    expect(rollMonsterRecharge(used, "monster-1", { ...breath, kind: "uses" }, 6)).toBe(
      used
    );
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
