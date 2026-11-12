/**
 * A hit on a monster that can be undone on any copy of the fight: the hit carries a seed
 * (the zone question's key), so its engine action has the same id however many other
 * changes landed before it, and the undo takes back exactly that hit. The DM's edit log
 * replays both onto the server's newest fight, where the beats' numbers can differ from
 * the screen's.
 */
import { describe, expect, it } from "vitest";

import {
  applyAdversaryDamage,
  applyAdversaryDamageParts,
  undoAdversaryHit,
} from "@/features/campaigns/encounter-world-command";
import { addMonster, startEncounter } from "@/lib/play/encounter";
import type { EncounterState } from "@/types/campaign";

const CAMPAIGN = "c1";

/** Two goblins, 7 HP each: monster-1 and monster-2. */
function fight(): EncounterState {
  return addMonster(startEncounter({}, [], 1), {
    name: "Goblin",
    ac: 12,
    maxHp: 7,
    count: 2,
    initiative: null,
  });
}

const hp = (f: EncounterState, id: string) => {
  const c = f.combatants.find((x) => x.id === id);
  return c?.kind === "monster" ? c.hp.current : undefined;
};

describe("a seeded hit on a monster, and its undo", () => {
  it("the undo gives back that monster's HP and takes its beat off", () => {
    const hit = applyAdversaryDamageParts(
      fight(),
      CAMPAIGN,
      "monster-1",
      [{ amount: 4 }],
      "z1"
    );
    expect(hp(hit, "monster-1")).toBe(3);
    const undone = undoAdversaryHit(hit, CAMPAIGN, "monster-1", "z1");
    expect(hp(undone, "monster-1")).toBe(7);
    expect(undone.events ?? []).toHaveLength(fight().events?.length ?? 0);
  });

  it("a change to another monster made after the hit survives the undo", () => {
    let f = applyAdversaryDamageParts(
      fight(),
      CAMPAIGN,
      "monster-1",
      [{ amount: 4 }],
      "z1"
    );
    f = applyAdversaryDamage(f, CAMPAIGN, "monster-2", 2);
    f = undoAdversaryHit(f, CAMPAIGN, "monster-1", "z1");
    expect(hp(f, "monster-1")).toBe(7);
    expect(hp(f, "monster-2")).toBe(5);
  });

  it("finds its hit on a fight where other beats came first (the server's copy)", () => {
    // On the server another monster was hit before this hit replayed: its beat numbers
    // shift, the seeded action does not.
    let server = applyAdversaryDamage(fight(), CAMPAIGN, "monster-2", 1);
    server = applyAdversaryDamageParts(
      server,
      CAMPAIGN,
      "monster-1",
      [{ amount: 4 }],
      "z1"
    );
    const undone = undoAdversaryHit(server, CAMPAIGN, "monster-1", "z1");
    expect(hp(undone, "monster-1")).toBe(7);
    expect(hp(undone, "monster-2")).toBe(6);
  });

  it("another hit's seed undoes nothing", () => {
    const hit = applyAdversaryDamageParts(
      fight(),
      CAMPAIGN,
      "monster-1",
      [{ amount: 4 }],
      "z1"
    );
    expect(hp(undoAdversaryHit(hit, CAMPAIGN, "monster-1", "z2"), "monster-1")).toBe(3);
  });
});
