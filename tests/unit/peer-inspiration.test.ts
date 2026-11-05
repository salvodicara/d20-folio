/**
 * Inspiration given to another PC (Musician: Heroic Inspiration to allies after a
 * rest; Bardic Inspiration: a die the creature keeps). It lands on that PC's play
 * state through the peer write; Heroic Inspiration doesn't stack, and a creature
 * holds one Bardic Inspiration die at a time. The write's undo puts back what it
 * changed, unless someone changed it since.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({}));

import { revertPeerEffect } from "@/features/campaigns/campaign-io";
import { defaultCombatState, grantInspiration } from "@/lib/combat-state";

const fresh = () => defaultCombatState(20);

describe("inspiration given to another PC", () => {
  it("Heroic Inspiration lands, and doesn't stack", () => {
    const after = grantInspiration(fresh(), { kind: "heroic" });
    expect(after.heroicInspiration).toBe(true);
    expect(grantInspiration(after, { kind: "heroic" })).toBe(after);
  });

  it("a Bardic Inspiration die lands only on a creature holding none", () => {
    const after = grantInspiration(fresh(), { kind: "bardic-die", die: "d8" });
    expect(after.bardicInspirationDie).toBe("d8");
    expect(grantInspiration(after, { kind: "bardic-die", die: "d10" })).toBe(after);
  });

  it("the undo takes it back, unless it was spent since", () => {
    const before = fresh();
    const written = grantInspiration(before, { kind: "heroic" });
    expect(revertPeerEffect(written, written, before).heroicInspiration).toBeFalsy();
    const spent = { ...written, heroicInspiration: false };
    expect(revertPeerEffect(spent, written, before).heroicInspiration).toBe(false);
    const die = grantInspiration(before, { kind: "bardic-die", die: "d8" });
    expect(revertPeerEffect(die, die, before).bardicInspirationDie ?? "").toBe("");
  });
});

describe("the undo of any other peer write", () => {
  it("never writes an inspiration field the write didn't touch", () => {
    const before = fresh();
    const hit = { ...before, hp: { ...before.hp, current: 10 } };
    const reverted = revertPeerEffect(hit, hit, before);
    expect(
      "heroicInspiration" in reverted && reverted.heroicInspiration !== undefined
    ).toBe(false);
    expect(reverted.bardicInspirationDie).toBeUndefined();
  });
});
