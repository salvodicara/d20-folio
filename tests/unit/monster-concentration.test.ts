/**
 * A monster's Concentration (SRD 5.2.1 Rules Glossary, "Concentration"):
 *
 *   "Another Concentration Effect. You lose Concentration on an effect the moment you
 *   start casting a spell that requires Concentration … Damage. If you take damage,
 *   you must succeed on a Constitution saving throw to maintain Concentration. The DC
 *   equals 10 or half the damage taken (round down), whichever number is higher, up to
 *   a maximum DC of 30. Incapacitated or Dead. Your Concentration ends if you have the
 *   Incapacitated condition or you die."
 *
 * Cases come from the bestiary: the Mage (CON 11, no CON save proficiency) casts
 * Detect Magic at will, Invisibility 2/day and Fly 1/day, each "Concentration".
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import type { MonsterStatBlock } from "@/data/types";
import {
  addMonster,
  applyHp,
  parseEncounterState,
  setMonsterCondition,
  setMonsterTempHp,
  startEncounter,
} from "@/features/campaigns/encounter";
import {
  endMonsterConcentration,
  monsterConcentrationSave,
  monsterConcentrationSavesAfter,
  monsterConcentrationSpells,
  resolveMonsterConcentrationSave,
  settleMonsterConcentration,
  startMonsterConcentration,
} from "@/lib/play/monster-concentration";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

let MONSTERS: ReadonlyArray<MonsterStatBlock> = [];
beforeAll(async () => {
  ({ MONSTERS } = await import("@/data/monsters"));
});
const block = (id: string): MonsterStatBlock => {
  const found = MONSTERS.find((m) => m.id === id);
  if (!found) throw new Error(id);
  return found;
};
const lookup = (id: string) => MONSTERS.find((m) => m.id === id);

function fight(): EncounterState {
  const withMage = addMonster(startEncounter({}, [], 1), {
    name: "Mage",
    srdId: "mage",
    ac: 15,
    maxHp: 81,
    count: 1,
    initiative: 12,
  });
  return addMonster(withMage, {
    name: "Goblin",
    ac: 15,
    maxHp: 7,
    count: 1,
    initiative: 10,
  });
}

const monster = (state: EncounterState, id = "monster-1") => {
  const found = state.combatants.find(
    (c): c is EncounterMonster => c.kind === "monster" && c.id === id
  );
  if (!found) throw new Error(id);
  return found;
};

describe("the Concentration spells a stat block casts", () => {
  it("the Mage: Detect Magic, Invisibility, Fly — not Fireball, Mage Armor", () => {
    expect(monsterConcentrationSpells(block("mage"))).toEqual([
      "detect-magic",
      "invisibility",
      "fly",
    ]);
  });

  it("every one listed requires Concentration, and every caster is read", () => {
    const casters = MONSTERS.filter((m) => monsterConcentrationSpells(m).length > 0);
    expect(casters.length).toBeGreaterThan(10);
    for (const caster of casters) {
      for (const spellId of monsterConcentrationSpells(caster)) {
        expect(getSpellById(spellId)?.concentration, `${caster.id}:${spellId}`).toBe(
          true
        );
      }
    }
    expect(monsterConcentrationSpells(block("goblin-warrior"))).toEqual([]);
  });
});

describe("casting a Concentration spell", () => {
  it("starts Concentration on the monster; a second one replaces the first", () => {
    let state = startMonsterConcentration(fight(), "monster-1", "invisibility");
    expect(monster(state).concentration).toBe("invisibility");
    state = startMonsterConcentration(state, "monster-1", "fly");
    expect(monster(state).concentration).toBe("fly");
    expect(endMonsterConcentration(state, "monster-1")).not.toBe(state);
    expect(monster(endMonsterConcentration(state, "monster-1")).concentration).toBe(
      undefined
    );
  });

  it("a PC or an unknown id is untouched", () => {
    const state = fight();
    expect(startMonsterConcentration(state, "monster-9", "fly")).toBe(state);
    expect(endMonsterConcentration(state, "monster-1")).toBe(state);
  });
});

describe("damage asks the DM for a Constitution save", () => {
  it("DC 10 or half the damage (round down), whichever is higher, at most 30", () => {
    const mage = monster(startMonsterConcentration(fight(), "monster-1", "fly"));
    const dc = (damage: number) => monsterConcentrationSave(mage, damage)?.dc;
    expect(dc(1)).toBe(10);
    expect(dc(21)).toBe(10);
    expect(dc(23)).toBe(11);
    expect(dc(80)).toBe(30);
    expect(dc(100)).toBe(30);
  });

  it("names the monster, the spell and the stat block's Constitution save", () => {
    const mage = monster(startMonsterConcentration(fight(), "monster-1", "fly"));
    expect(monsterConcentrationSave(mage, 12, lookup)).toEqual({
      monsterId: "monster-1",
      spell: "fly",
      ability: "CON",
      dc: 10,
      bonus: 0,
    });
    // The Lich prints "Con +10" (+3, proficient, PB 7).
    const lich = { ...mage, srdId: "lich" };
    expect(monsterConcentrationSave(lich, 12, lookup)?.bonus).toBe(10);
    // A custom monster (or no bestiary at hand) has no printed bonus.
    expect(monsterConcentrationSave(mage, 12)).not.toHaveProperty("bonus");
  });

  it("no prompt without Concentration or without damage", () => {
    const mage = monster(fight());
    expect(monsterConcentrationSave(mage, 12)).toBeNull();
    const concentrating = monster(startMonsterConcentration(fight(), "monster-1", "fly"));
    expect(monsterConcentrationSave(concentrating, 0)).toBeNull();
  });

  it("read off the encounter's damage: Temporary Hit Points count as damage taken", () => {
    let before = startMonsterConcentration(fight(), "monster-1", "fly");
    before = setMonsterTempHp(before, "monster-1", 10);
    const hit = setMonsterTempHp(applyHp(before, "monster-1", -14), "monster-1", 0);
    expect(monsterConcentrationSavesAfter(before, hit, lookup)).toEqual([
      { monsterId: "monster-1", spell: "fly", ability: "CON", dc: 12, bonus: 0 },
    ]);
    const healed = applyHp(hit, "monster-1", 5);
    expect(monsterConcentrationSavesAfter(hit, healed)).toEqual([]);
  });
});

describe("the declared save", () => {
  it("a failure ends Concentration, a success keeps it", () => {
    const state = startMonsterConcentration(fight(), "monster-1", "fly");
    expect(resolveMonsterConcentrationSave(state, "monster-1", true)).toBe(state);
    const failed = resolveMonsterConcentrationSave(state, "monster-1", false);
    expect(monster(failed).concentration).toBeUndefined();
  });
});

describe("Incapacitated or dead", () => {
  it("an Incapacitated monster (or Stunned, Paralyzed, …) loses Concentration", () => {
    for (const condition of ["incapacitated", "stunned", "paralyzed", "unconscious"]) {
      const state = setMonsterCondition(
        startMonsterConcentration(fight(), "monster-1", "fly"),
        "monster-1",
        condition,
        true
      );
      const settled = settleMonsterConcentration(state);
      expect(monster(settled.state).concentration, condition).toBeUndefined();
      expect(settled.ended).toEqual([{ monsterId: "monster-1", spell: "fly" }]);
    }
  });

  it("a monster at 0 Hit Points loses it; a standing one keeps it", () => {
    const concentrating = startMonsterConcentration(fight(), "monster-1", "fly");
    expect(settleMonsterConcentration(concentrating)).toEqual({
      state: concentrating,
      ended: [],
    });
    const down = applyHp(concentrating, "monster-1", -81);
    expect(monster(settleMonsterConcentration(down).state).concentration).toBe(undefined);
    expect(monsterConcentrationSavesAfter(concentrating, down)).toEqual([]);
  });
});

describe("the stored encounter", () => {
  it("a monster's Concentration parses; a malformed one rejects the encounter", () => {
    const state = startMonsterConcentration(fight(), "monster-1", "fly");
    expect(parseEncounterState(structuredClone(state))).toEqual(state);
    for (const concentration of ["", "  ", 3, { spell: "fly" }]) {
      const bad = structuredClone(state) as unknown as {
        combatants: Array<Record<string, unknown>>;
      };
      const first = bad.combatants[0];
      if (!first) throw new Error("no combatant");
      first.concentration = concentration;
      expect(() => parseEncounterState(bad), JSON.stringify(concentration)).toThrow();
    }
  });
});
