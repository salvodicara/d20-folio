/**
 * «Chi risparmi?» (Spirit Guardians, SRD 5.2.1: "you can designate any number of
 * creatures you can see to be unaffected by it"): in a fight, the creatures the cast may
 * spare, every ally ticked to start (`defaultSpared`), the caster never listed; a zone
 * that spares no one by choice (Moonbeam) and a cast outside a fight ask nothing.
 */
import { describe, expect, it } from "vitest";
import { spareView } from "@/domains/play/spare-view";

const FIGHT = {
  myId: "pc-me",
  rows: [
    { id: "m-gob", kind: "monster" as const, name: "Goblin" },
    { id: "pc-me", kind: "pc" as const, name: "Lyra" },
    { id: "pc-bren", kind: "pc" as const, name: "Bren" },
    { id: "m-wolf", kind: "monster" as const, side: "ally" as const, name: "Lupo" },
    { id: "m-ogre", kind: "monster" as const, name: "Ogre", down: true },
  ],
};

describe("spareView", () => {
  it("Spirit Guardians: allies first and ticked, then the enemies; never the caster", () => {
    expect(spareView("spirit-guardians", FIGHT)).toEqual({
      choices: [
        { id: "pc-bren", name: "Bren", side: "ally" },
        { id: "m-wolf", name: "Lupo", side: "ally" },
        { id: "m-gob", name: "Goblin", side: "enemy" },
      ],
      spared: ["pc-bren", "m-wolf"],
    });
  });

  it("a zone that spares no one by choice asks nothing", () => {
    expect(spareView("moonbeam", FIGHT)).toBeNull();
  });

  it("a spell with no zone asks nothing", () => {
    expect(spareView("fireball", FIGHT)).toBeNull();
  });

  it("outside a fight there is no one to spare", () => {
    expect(spareView("spirit-guardians", null)).toBeNull();
  });
});
