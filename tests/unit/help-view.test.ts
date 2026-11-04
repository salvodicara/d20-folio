/**
 * The Help action in a fight (SRD 5.2.1 Help): «Su chi?» lists the living enemies
 * (the next attack against one has Advantage) and the living allies (its next
 * ability check has Advantage). Outside a fight, or with nobody to help, it asks
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
  it("offers the living enemies and the living allies, never itself", () => {
    expect(helpView(fight)).toEqual({
      enemies: [{ id: "m-gob", name: "Goblin" }],
      allies: [
        { id: "pc-bren", name: "Bren" },
        { id: "m-wolf", name: "Lupo" },
      ],
    });
  });

  it("an ally alone is still someone to help", () => {
    expect(
      helpView({ ...fight, rows: fight.rows.filter((r) => r.id !== "m-gob") })?.allies
    ).toHaveLength(2);
  });

  it("asks nothing outside a fight, or with nobody standing to help", () => {
    expect(helpView(null)).toBeNull();
    expect(
      helpView({
        ...fight,
        rows: fight.rows.filter((r) => r.id === "pc-me" || r.id === "m-ogre"),
      })
    ).toBeNull();
  });
});
