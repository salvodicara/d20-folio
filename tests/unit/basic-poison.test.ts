/**
 * Basic Poison (SRD 5.2.1 Adventuring Gear): as a Bonus Action, coat one weapon or up
 * to three pieces of ammunition. A creature that takes Piercing or Slashing damage
 * from the poisoned weapon or ammunition takes an extra 1d4 Poison damage. The
 * poison lasts 1 minute (10 rounds) or until its damage is dealt.
 */
import { describe, expect, it } from "vitest";
import {
  BASIC_POISON,
  basicPoisonOnHit,
  coatWithBasicPoison,
} from "@/lib/play/basic-poison";

const EXTRA = { dice: "1d4", damageType: "poison" };

describe("Basic Poison", () => {
  it("is a Bonus Action that spends one vial", () => {
    expect(BASIC_POISON).toMatchObject({ itemId: "poison-basic", economy: "bonus" });
  });

  it("a coated weapon adds 1d4 Poison to its first Piercing or Slashing hit, then is clean", () => {
    const coat = coatWithBasicPoison({ kind: "weapon", weaponKey: "dagger" }, 2);
    const first = basicPoisonOnHit(coat, {
      weaponKey: "dagger",
      damageTypes: ["piercing"],
      round: 3,
    });
    expect(first).toEqual({ extra: EXTRA, coat: null });
  });

  it("another weapon's hit, or a hit with no Piercing or Slashing damage, leaves the coat", () => {
    const coat = coatWithBasicPoison({ kind: "weapon", weaponKey: "dagger" }, 2);
    expect(
      basicPoisonOnHit(coat, {
        weaponKey: "longsword",
        damageTypes: ["slashing"],
        round: 3,
      })
    ).toEqual({ extra: null, coat });
    expect(
      basicPoisonOnHit(coat, { weaponKey: "dagger", damageTypes: ["fire"], round: 3 })
    ).toEqual({ extra: null, coat });
  });

  it("up to three pieces of ammunition: each hit spends one", () => {
    const coat = coatWithBasicPoison(
      { kind: "ammunition", itemKey: "arrows", pieces: 5 },
      1
    );
    expect(coat.target).toEqual({ kind: "ammunition", itemKey: "arrows", pieces: 3 });
    const hit = { ammunitionKey: "arrows", damageTypes: ["piercing"], round: 2 } as const;
    const one = basicPoisonOnHit(coat, hit);
    expect(one.extra).toEqual(EXTRA);
    expect(one.coat?.target).toEqual({
      kind: "ammunition",
      itemKey: "arrows",
      pieces: 2,
    });
    const two = basicPoisonOnHit(one.coat, hit);
    const three = basicPoisonOnHit(two.coat, hit);
    expect(three).toEqual({ extra: EXTRA, coat: null });
  });

  it("after 1 minute (10 rounds) the poison is gone", () => {
    const coat = coatWithBasicPoison({ kind: "weapon", weaponKey: "dagger" }, 2);
    const hit = { weaponKey: "dagger", damageTypes: ["piercing"] } as const;
    expect(basicPoisonOnHit(coat, { ...hit, round: 11 }).extra).toEqual(EXTRA);
    expect(basicPoisonOnHit(coat, { ...hit, round: 12 })).toEqual({
      extra: null,
      coat: null,
    });
  });
});
