/**
 * The Help action in a fight (SRD 5.2.1 Help, attack: "the next attack roll by one of
 * your allies against that enemy has Advantage"): «Su chi?» lists the living enemies;
 * whichever ally attacks first gets it. Outside a fight, or with no enemy, it asks
 * nothing.
 */
import { describe, expect, it } from "vitest";

import { helpView } from "@/domains/play/help-view";

const fight = {
  myId: "pc-me",
  rows: [
    { id: "m-gob", kind: "monster" as const, name: "Goblin" },
    { id: "pc-me", kind: "pc" as const, name: "Lyra" },
    { id: "pc-bren", kind: "pc" as const, name: "Bren" },
    { id: "m-wolf", kind: "monster" as const, side: "ally" as const, name: "Lupo" },
    { id: "m-ogre", kind: "monster" as const, name: "Ogre", down: true },
  ],
};

describe("helpView", () => {
  it("offers the living enemies", () => {
    expect(helpView(fight)).toEqual({ enemies: [{ id: "m-gob", name: "Goblin" }] });
  });

  it("asks nothing outside a fight, or with no enemy standing", () => {
    expect(helpView(null)).toBeNull();
    expect(
      helpView({ ...fight, rows: fight.rows.filter((r) => r.id !== "m-gob") })
    ).toBeNull();
  });
});
