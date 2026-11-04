/**
 * The Help action in a fight («Su chi?» then «Per chi?», SRD 5.2.1 Help: the next
 * attack by one of your allies against that enemy has Advantage): the enemies first,
 * then the allies it can help, neither listing the helper nor the dead. Outside a
 * fight, or with nobody to help or help against, it asks nothing.
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
  it("offers the living enemies, then the allies but the helper", () => {
    expect(helpView(fight)).toEqual({
      enemies: [{ id: "m-gob", name: "Goblin" }],
      allies: [
        { id: "pc-bren", name: "Bren" },
        { id: "m-wolf", name: "Lupo" },
      ],
    });
  });

  it("asks nothing outside a fight, or with no ally or no enemy", () => {
    expect(helpView(null)).toBeNull();
    expect(
      helpView({ ...fight, rows: fight.rows.filter((r) => r.kind === "monster") })
    ).toEqual({
      enemies: [{ id: "m-gob", name: "Goblin" }],
      allies: [{ id: "m-wolf", name: "Lupo" }],
    });
    expect(
      helpView({ ...fight, rows: fight.rows.filter((r) => r.id !== "m-gob") })
    ).toBeNull();
    expect(
      helpView({
        ...fight,
        rows: fight.rows.filter((r) => r.id === "m-gob" || r.id === "pc-me"),
      })
    ).toBeNull();
  });
});
