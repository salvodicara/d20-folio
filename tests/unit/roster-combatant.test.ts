/**
 * A creature the DM keeps between fights joins an encounter by its roster id, never
 * as a copy (edge-case M19, docs/architecture/2026-11-dm-state-and-roster.md): it
 * enters with the Hit Points it has now, and the damage it takes in the fight goes
 * back to its roster entry afterwards. The same entry can't be in the fight twice.
 *
 * The link lives on the encounter (`rosterLinks`: monster id → roster id), never on
 * the monster: the v0.25 reader in production (9bb9a60c) rejects a monster with a key
 * it doesn't know, but passes unknown encounter keys through. So an old client reading
 * a fight with a roster creature still reads the fight.
 */
import { describe, expect, it } from "vitest";

import {
  addRosterCombatant,
  applyHp,
  parseEncounterState,
  removeCombatant,
  rosterHpWriteBack,
} from "@/lib/play/encounter";
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
    expect(state.rosterLinks).toEqual({ "monster-1": "bren" });
    expect(only(state)).toMatchObject({
      kind: "monster",
      name: "Bren the guard",
      srdId: "guard",
      creatureType: "humanoid",
      side: "ally",
      ac: 16,
      hp: { current: 9, temp: 0, max: 16 },
    });
    // The stored encounter reads back with its link.
    expect(parseEncounterState(state).rosterLinks).toEqual({ "monster-1": "bren" });
  });

  it("the monster carries only keys the v0.25 reader in production accepts", () => {
    // MONSTER_COMBATANT_KEYS at 9bb9a60c (the deployed v0.25.0), pinned.
    const V025_MONSTER_KEYS = new Set([
      "kind",
      "id",
      "hidden",
      "side",
      "name",
      "srdId",
      "ac",
      "speed",
      "initiative",
      "conditions",
      "hp",
      "groupId",
      "groupIndex",
      "groupSize",
      "revealed",
      "notes",
      "xp",
      "creatureType",
      "portraitUrl",
      "portraitCrop",
      "defenses",
      "bardicInspirationDie",
      "heroicInspiration",
      "spent",
    ]);
    const state = addRosterCombatant(empty(), { rosterId: "bren", entry: bren, ac: 16 });
    expect(Object.keys(only(state)).filter((key) => !V025_MONSTER_KEYS.has(key))).toEqual(
      []
    );
  });

  it("a malformed link reads as absent; a link to a creature that left is dropped", () => {
    const joined = addRosterCombatant(empty(), { rosterId: "bren", entry: bren, ac: 16 });
    expect(
      parseEncounterState({ ...joined, rosterLinks: { "monster-1": 7 } }).rosterLinks
    ).toBeUndefined();
    expect(
      parseEncounterState({ ...joined, rosterLinks: { "monster-9": "x" } }).rosterLinks
    ).toBeUndefined();
    expect(removeCombatant(joined, "monster-1").rosterLinks).toBeUndefined();
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
