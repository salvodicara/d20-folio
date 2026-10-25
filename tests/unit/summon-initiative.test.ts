/**
 * Summoned creatures in the Initiative order. The cases come from each source's SRD
 * 5.2.1 text:
 *
 *   Summon Dragon / Giant Insect: "In combat, the creature shares your Initiative
 *   count, but it takes its turn immediately after yours."
 *   Animate Objects: "it shares your Initiative count and takes its turn immediately
 *   after yours."
 *   Find Steed: "In combat, it shares your Initiative count".
 *   Staff of the Python: "shares your Initiative count, taking its turn immediately
 *   after yours." Figurine of Wondrous Power: "takes its turn immediately after you
 *   on your Initiative count."
 *   Arcane Hand: "as a Bonus Action on your later turns, you can move the hand" — it
 *   has no turn of its own.
 *   Animate Dead, Planar Ally, Horn of Valhalla: the text says nothing, so the
 *   creature rolls its own Initiative.
 *
 * The caster link lives on the encounter (`summons`), never on a monster: older
 * readers reject unknown monster keys but keep unknown encounter keys.
 */
import { describe, expect, it } from "vitest";
import {
  addMonster,
  beginEncounterTurns,
  parseEncounterState,
  removeCombatant,
  startEncounter,
} from "@/features/campaigns/encounter";
import {
  linkSummon,
  summonedTurnOrder,
  summonInitiativeEntries,
  summonLinks,
  summonTurnOf,
  unlinkSummon,
} from "@/lib/play/summon-initiative";
import type { EncounterState } from "@/types/campaign";

const ana = { id: "pc-ana", initiative: 15 };

describe("where a summoned creature acts", () => {
  it("reads each source's text", () => {
    expect(summonTurnOf({ spellId: "summon-dragon" })).toBe("after-caster");
    expect(summonTurnOf({ spellId: "giant-insect" })).toBe("after-caster");
    expect(summonTurnOf({ spellId: "animate-objects" })).toBe("after-caster");
    expect(summonTurnOf({ spellId: "find-steed" })).toBe("after-caster");
    expect(summonTurnOf({ itemId: "staff-of-the-python" })).toBe("after-caster");
    expect(summonTurnOf({ itemId: "figurine-of-wondrous-power" })).toBe("after-caster");
    expect(summonTurnOf({ spellId: "bigbys-hand" })).toBe("caster-turn");
    expect(summonTurnOf({ spellId: "animate-dead" })).toBe("own");
    expect(summonTurnOf({ spellId: "planar-ally" })).toBe("own");
    expect(summonTurnOf({ itemId: "horn-of-valhalla" })).toBe("own");
    expect(summonTurnOf({ spellId: "no-such-spell" })).toBe("own");
  });
});

describe("the initiative rows a summon brings", () => {
  it("a creature that shares the caster's count gets the caster's Initiative", () => {
    const rows = summonInitiativeEntries(
      [{ itemId: "staff-of-the-python", groupId: "magic-item:s1", count: 1 }],
      ana
    );
    expect(rows).toEqual([
      {
        key: "magic-item:s1#1",
        groupId: "magic-item:s1",
        n: 1,
        turn: "after-caster",
        initiative: 15,
        afterId: "pc-ana",
      },
    ]);
  });

  it("each creature of a group gets a row, keyed like its Hit Points", () => {
    const rows = summonInitiativeEntries(
      [{ spellId: "animate-dead", count: 2, monsterId: "skeleton" }],
      ana
    );
    expect(rows.map((r) => r.key)).toEqual(["animate-dead#1", "animate-dead#2"]);
    // The text says nothing: each rolls its own Initiative (typed at the table).
    expect(rows.every((r) => r.turn === "own" && r.initiative === null)).toBe(true);
    expect(rows.every((r) => r.afterId === undefined)).toBe(true);
    expect(rows[0]?.monsterId).toBe("skeleton");
  });

  it("a creature with no turn of its own gets no row", () => {
    expect(summonInitiativeEntries([{ spellId: "bigbys-hand", count: 1 }], ana)).toEqual(
      []
    );
  });

  it("a caster who has not rolled yet leaves the count blank, still after them", () => {
    const [row] = summonInitiativeEntries([{ spellId: "summon-dragon", count: 1 }], {
      id: "pc-ana",
      initiative: null,
    });
    expect(row?.initiative).toBeNull();
    expect(row?.afterId).toBe("pc-ana");
  });

  it("no creatures, no rows", () => {
    expect(summonInitiativeEntries([{ spellId: "animate-dead", count: 0 }], ana)).toEqual(
      []
    );
  });
});

/** Ana (pc-ana), a goblin (monster-1) and Ana's dragon (monster-2). */
function fight(): EncounterState {
  const start = startEncounter({ ana: { characterId: "c-ana" } }, ["ana"], 1);
  const goblin = addMonster(start, {
    name: "Goblin",
    ac: 15,
    maxHp: 7,
    count: 1,
    initiative: 12,
  });
  return addMonster(goblin, {
    name: "Dragon Spirit",
    ac: 14,
    maxHp: 50,
    count: 1,
    initiative: 15,
    side: "ally",
  });
}

describe("the caster link on the encounter", () => {
  it("before turns begin, the live order puts a summon right after its caster", () => {
    // Same count as Ana: the id tiebreak alone would put the dragon first.
    const links = [{ summonId: "monster-2", casterId: "pc-ana" }];
    expect(summonedTurnOrder(["monster-2", "pc-ana", "monster-1"], links)).toEqual([
      "pc-ana",
      "monster-2",
      "monster-1",
    ]);
  });

  it("several summons follow their caster in the order they came", () => {
    const links = [
      { summonId: "monster-3", casterId: "pc-ana" },
      { summonId: "monster-1", casterId: "pc-ana" },
    ];
    expect(
      summonedTurnOrder(["monster-1", "monster-2", "pc-ana", "monster-3"], links)
    ).toEqual(["monster-2", "pc-ana", "monster-3", "monster-1"]);
  });

  it("linking a summon once turns run moves it right after its caster", () => {
    const begun = beginEncounterTurns(fight(), ["monster-2", "pc-ana", "monster-1"]);
    const linked = linkSummon(begun, { summonId: "monster-2", casterId: "pc-ana" });
    expect(linked?.summons).toEqual([{ summonId: "monster-2", casterId: "pc-ana" }]);
    expect(linked?.order).toEqual(["pc-ana", "monster-2", "monster-1"]);
    expect(begun.summons).toBeUndefined();
  });

  it("refuses a missing creature, a creature linked to itself, or a second caster", () => {
    const state = fight();
    expect(linkSummon(state, { summonId: "monster-9", casterId: "pc-ana" })).toBeNull();
    expect(linkSummon(state, { summonId: "pc-ana", casterId: "pc-ana" })).toBeNull();
    const once = linkSummon(state, { summonId: "monster-2", casterId: "pc-ana" });
    expect(
      linkSummon(once as EncounterState, { summonId: "monster-2", casterId: "monster-1" })
    ).toBeNull();
  });

  it("a removed creature's link no longer counts, and a malformed one is ignored", () => {
    const linked = linkSummon(fight(), { summonId: "monster-2", casterId: "pc-ana" });
    const gone = removeCombatant(linked as EncounterState, "monster-2");
    expect(summonLinks(gone)).toEqual([]);
    const junk = {
      ...fight(),
      summons: [
        { summonId: 7 },
        "x",
        { summonId: "monster-2", casterId: "pc-ana" },
        { summonId: "monster-2", casterId: "monster-1" },
      ],
    } as unknown as EncounterState;
    expect(summonLinks(junk)).toEqual([{ summonId: "monster-2", casterId: "pc-ana" }]);
  });

  it("the summon leaving the caster's control drops the link", () => {
    const linked = linkSummon(fight(), { summonId: "monster-2", casterId: "pc-ana" });
    const freed = unlinkSummon(linked as EncounterState, "monster-2");
    expect(freed?.summons).toBeUndefined();
    expect(unlinkSummon(fight(), "monster-2")).toBeNull();
  });

  it("an encounter carrying links still parses (encounter key, not a monster key)", () => {
    const linked = linkSummon(fight(), { summonId: "monster-2", casterId: "pc-ana" });
    expect(() => parseEncounterState(linked)).not.toThrow();
  });
});
