/**
 * A creature the DM keeps between fights joins an encounter by its roster id, never
 * as a copy (edge-case M19, docs/architecture/2026-11-dm-state-and-roster.md): it
 * enters with the Hit Points it has now, and the damage it takes in the fight goes
 * back to its roster entry afterwards. The same entry can't be in the fight twice.
 */
import { describe, expect, it } from "vitest";

import {
  addRosterCombatant,
  applyHp,
  parseEncounterState,
  rosterHpWriteBack,
} from "@/features/campaigns/encounter";
import type { RosterEntry } from "@/lib/play/campaign-roster";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

const empty = (): EncounterState => ({
  combatants: [],
  nextMonsterOrdinal: 1,
  round: 1,
  currentCombatantId: null,
  epoch: 7,
  status: "active",
});

// A hireling, hurt in the last fight: 9 of 16 HP.
const bren: RosterEntry = {
  name: "Bren the guard",
  monsterId: "guard",
  creatureType: "humanoid",
  hp: { current: 9, max: 16 },
};

const only = (state: EncounterState): EncounterMonster => {
  const [m] = state.combatants.filter((c): c is EncounterMonster => c.kind === "monster");
  if (!m) throw new Error("no monster");
  return m;
};

describe("a roster creature in the encounter", () => {
  it("joins by id, with the Hit Points it has now", () => {
    const state = addRosterCombatant(empty(), {
      rosterId: "bren",
      entry: bren,
      ac: 16,
      side: "ally",
    });
    expect(only(state)).toMatchObject({
      kind: "monster",
      rosterId: "bren",
      name: "Bren the guard",
      srdId: "guard",
      creatureType: "humanoid",
      side: "ally",
      ac: 16,
      hp: { current: 9, temp: 0, max: 16 },
    });
    // The stored encounter reads back (the reader knows the field).
    expect(parseEncounterState(state).combatants).toHaveLength(1);
  });

  it("can't be in the same fight twice", () => {
    const once = addRosterCombatant(empty(), { rosterId: "bren", entry: bren, ac: 16 });
    expect(addRosterCombatant(once, { rosterId: "bren", entry: bren, ac: 16 })).toBe(
      once
    );
  });

  it("an entry with no Hit Points yet enters at the max the DM gives", () => {
    const state = addRosterCombatant(empty(), {
      rosterId: "x",
      entry: { name: "Villain" },
      ac: 12,
      maxHp: 30,
    });
    expect(only(state).hp).toEqual({ current: 30, temp: 0, max: 30 });
  });

  it("its Hit Points after the fight go back to its entry", () => {
    const joined = addRosterCombatant(empty(), { rosterId: "bren", entry: bren, ac: 16 });
    expect(rosterHpWriteBack(joined, { bren })).toEqual([]);
    const hurt = applyHp(joined, "monster-1", -5);
    expect(rosterHpWriteBack(hurt, { bren })).toEqual([
      { rosterId: "bren", hp: { current: 4, max: 16 } },
    ]);
  });
});
