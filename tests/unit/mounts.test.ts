/**
 * Mounted combat (SRD 5.2.1 Playing the Game, "Mounted Combat"):
 *
 *   "A willing creature that is at least one size larger than a rider and that has an
 *   appropriate anatomy can serve as a mount … During your move, you can mount a
 *   creature that is within 5 feet of you or dismount. Doing so costs an amount of
 *   movement equal to half your Speed (round down) … The Initiative of a controlled
 *   mount changes to match yours when you mount it. It moves on your turn as you direct
 *   it, and it has only three action options during that turn: Dash, Disengage, and
 *   Dodge … an independent mount … retains its place in the Initiative order and moves
 *   and acts as it likes. Falling Off. If an effect is about to move your mount against
 *   its will while you're on it, you must succeed on a DC 10 Dexterity saving throw or
 *   fall off, landing with the Prone condition … While mounted, you must make the same
 *   save if you're knocked Prone or the mount is."
 *
 * The link lives on the encounter (`mounts`), never on a monster: older readers reject
 * unknown monster keys but keep unknown encounter keys.
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
  canServeAsMount,
  dismount,
  fallOff,
  fallOffSave,
  MOUNT_CONTROLLED_ACTIONS,
  mountActionOptions,
  mountCreature,
  mountedTurnOrder,
  mountingCost,
  mountLinks,
  mountOf,
  riderOf,
} from "@/lib/play/mounts";
import type { EncounterState } from "@/types/campaign";

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

/** A knight (pc-ana), her warhorse (monster-1) and a goblin (monster-2). */
function fight(): EncounterState {
  const start = startEncounter({ ana: { characterId: "c-ana" } }, ["ana"], 1);
  const horse = addMonster(start, {
    name: "Warhorse",
    srdId: "warhorse",
    ac: 11,
    maxHp: 19,
    count: 1,
    initiative: 13,
    side: "ally",
  });
  return addMonster(horse, {
    name: "Goblin",
    ac: 15,
    maxHp: 7,
    count: 1,
    initiative: 8,
  });
}

const begun = (state: EncounterState) =>
  beginEncounterTurns(state, ["monster-1", "pc-ana", "monster-2"]);

describe("who can ride what", () => {
  it("a mount is at least one size larger than its rider", () => {
    expect(canServeAsMount("Medium", "Large")).toBe(true);
    expect(canServeAsMount("Small", "Medium")).toBe(true);
    expect(canServeAsMount("Medium", "Medium")).toBe(false);
    expect(canServeAsMount("Large", "Medium")).toBe(false);
  });

  it("mounting or dismounting costs half your Speed, rounded down", () => {
    expect(mountingCost(30)).toBe(15);
    expect(mountingCost(25)).toBe(12);
  });
});

describe("the mount link", () => {
  it("a controlled mount moves to act right after its rider", () => {
    const state = mountCreature(begun(fight()), {
      mountId: "monster-1",
      riderId: "pc-ana",
      controlled: true,
    });
    expect(state?.mounts).toEqual([
      { mountId: "monster-1", riderId: "pc-ana", controlled: true },
    ]);
    expect(state?.order).toEqual(["pc-ana", "monster-1", "monster-2"]);
    expect(mountOf(must(state), "pc-ana")?.mountId).toBe("monster-1");
    expect(riderOf(must(state), "monster-1")?.riderId).toBe("pc-ana");
  });

  it("an independent mount keeps its place in the order", () => {
    const state = mountCreature(begun(fight()), {
      mountId: "monster-1",
      riderId: "pc-ana",
      controlled: false,
    });
    expect(state?.order).toEqual(["monster-1", "pc-ana", "monster-2"]);
  });

  it("before turns begin, the live order puts a controlled mount after its rider", () => {
    const links = [{ mountId: "monster-1", riderId: "pc-ana", controlled: true }];
    expect(mountedTurnOrder(["monster-1", "pc-ana", "monster-2"], links)).toEqual([
      "pc-ana",
      "monster-1",
      "monster-2",
    ]);
    expect(
      mountedTurnOrder(
        ["monster-1", "pc-ana"],
        [{ ...must(links[0]), controlled: false }]
      )
    ).toEqual(["monster-1", "pc-ana"]);
  });

  it("a creature carries one rider and rides one mount; nobody rides itself", () => {
    const once = must(
      mountCreature(fight(), {
        mountId: "monster-1",
        riderId: "pc-ana",
        controlled: true,
      })
    );
    expect(
      mountCreature(once, {
        mountId: "monster-1",
        riderId: "monster-2",
        controlled: true,
      })
    ).toBeNull();
    expect(
      mountCreature(once, { mountId: "monster-2", riderId: "pc-ana", controlled: true })
    ).toBeNull();
    expect(
      mountCreature(fight(), { mountId: "pc-ana", riderId: "pc-ana", controlled: true })
    ).toBeNull();
    expect(
      mountCreature(fight(), {
        mountId: "monster-9",
        riderId: "pc-ana",
        controlled: true,
      })
    ).toBeNull();
  });

  it("a link to a removed creature, or a malformed one, reads as no link", () => {
    const mounted = must(
      mountCreature(fight(), {
        mountId: "monster-1",
        riderId: "pc-ana",
        controlled: true,
      })
    );
    expect(mountLinks(removeCombatant(mounted, "monster-1"))).toEqual([]);
    expect(
      mountLinks({ ...mounted, mounts: [{ mountId: "monster-1" }] } as never)
    ).toEqual([]);
    expect(mountLinks({ ...mounted, mounts: "x" } as never)).toEqual([]);
  });

  it("the encounter reader keeps the link (an encounter key, not a monster key)", () => {
    const mounted = must(
      mountCreature(fight(), {
        mountId: "monster-1",
        riderId: "pc-ana",
        controlled: true,
      })
    );
    const read = parseEncounterState(JSON.parse(JSON.stringify(mounted)));
    expect(mountLinks(read)).toEqual(mounted.mounts);
  });

  it("dismounting drops the link; without one it is a no-op", () => {
    const mounted = must(
      mountCreature(fight(), {
        mountId: "monster-1",
        riderId: "pc-ana",
        controlled: true,
      })
    );
    const off = dismount(mounted, "pc-ana");
    expect(off?.mounts).toBeUndefined();
    expect(dismount(fight(), "pc-ana")).toBeNull();
  });
});

describe("what a mount does on its turn", () => {
  it("a controlled mount has only Dash, Disengage and Dodge", () => {
    expect(MOUNT_CONTROLLED_ACTIONS).toEqual(["dash", "disengage", "dodge"]);
    const mounted = must(
      mountCreature(fight(), {
        mountId: "monster-1",
        riderId: "pc-ana",
        controlled: true,
      })
    );
    expect(mountActionOptions(mounted, "monster-1")).toEqual(MOUNT_CONTROLLED_ACTIONS);
  });

  it("an independent mount, or a creature nobody rides, acts as it likes", () => {
    const free = must(
      mountCreature(fight(), {
        mountId: "monster-1",
        riderId: "pc-ana",
        controlled: false,
      })
    );
    expect(mountActionOptions(free, "monster-1")).toBeNull();
    expect(mountActionOptions(fight(), "monster-2")).toBeNull();
  });
});

describe("falling off", () => {
  const mounted = () =>
    must(
      mountCreature(fight(), {
        mountId: "monster-1",
        riderId: "pc-ana",
        controlled: true,
      })
    );

  it("a forced move of the mount, or either knocked Prone, asks the rider DC 10 DEX", () => {
    const save = { riderId: "pc-ana", ability: "DEX", dc: 10 };
    expect(
      fallOffSave(mounted(), { kind: "moved-against-will", id: "monster-1" })
    ).toEqual(save);
    expect(fallOffSave(mounted(), { kind: "knocked-prone", id: "pc-ana" })).toEqual(save);
    expect(fallOffSave(mounted(), { kind: "knocked-prone", id: "monster-1" })).toEqual(
      save
    );
  });

  it("no save for a creature that rides nothing and carries nobody", () => {
    expect(fallOffSave(mounted(), { kind: "knocked-prone", id: "monster-2" })).toBeNull();
    expect(fallOffSave(fight(), { kind: "knocked-prone", id: "pc-ana" })).toBeNull();
  });

  it("the rider moving itself is not the mount moved against its will", () => {
    expect(
      fallOffSave(mounted(), { kind: "moved-against-will", id: "pc-ana" })
    ).toBeNull();
  });

  it("a failed save dismounts the rider and lands it Prone; a success changes nothing", () => {
    expect(fallOff(mounted(), "pc-ana", false)).toEqual({
      state: dismount(mounted(), "pc-ana"),
      prone: true,
    });
    expect(fallOff(mounted(), "pc-ana", true)).toBeNull();
  });
});
