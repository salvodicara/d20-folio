import { describe, expect, it } from "vitest";
import {
  canAssignActionClaims,
  economyClaimsForTurn,
  economyActionCategory,
  type EconomyActionRule,
} from "@/lib/combat-economy";

const haste: EconomyActionRule = {
  slot: "action",
  count: 1,
  allowedActions: ["attack", "dash", "disengage", "hide", "utilize"],
  maxAttacks: 1,
};

describe("restricted combat economy", () => {
  it("lets a restricted action happen before or after an unrestricted action", () => {
    const cast = { category: null } as const;
    const dash = { category: "dash" } as const;
    expect(canAssignActionClaims([cast, dash], [haste])).toBe(true);
    expect(canAssignActionClaims([dash, cast], [haste])).toBe(true);
  });

  it("rejects two actions that both need the one unrestricted slot", () => {
    expect(canAssignActionClaims([{ category: null }, { category: null }], [haste])).toBe(
      false
    );
  });

  it("limits the Haste Attack action to one attack without shrinking the base Attack", () => {
    expect(
      canAssignActionClaims(
        [
          { category: "attack", attackCount: 2 },
          { category: "attack", attackCount: 1 },
        ],
        [haste]
      )
    ).toBe(true);
    expect(
      canAssignActionClaims(
        [{ category: null }, { category: "attack", attackCount: 2 }],
        [haste]
      )
    ).toBe(false);
  });

  it("composes restricted slots with unrestricted Action Surge slots", () => {
    const actionSurge: EconomyActionRule = { slot: "action", count: 1 };
    expect(
      canAssignActionClaims(
        [{ category: null }, { category: null }, { category: "hide" }],
        [actionSurge, haste]
      )
    ).toBe(true);
    expect(
      canAssignActionClaims(
        [{ category: null }, { category: null }, { category: null }],
        [actionSurge, haste]
      )
    ).toBe(false);
  });

  it("classifies only actions named by the rules contract", () => {
    expect(economyActionCategory({ id: "weapon-longsword", source: "weapon" })).toBe(
      "attack"
    );
    expect(economyActionCategory({ id: "base-grapple", source: "feature" })).toBe(
      "attack"
    );
    expect(economyActionCategory({ id: "base-dash", source: "feature" })).toBe("dash");
    // Casting a spell is the Magic action (Action Surge's extra action can't be it).
    expect(economyActionCategory({ id: "fireball", source: "spell" })).toBe("magic");
    expect(economyActionCategory({ id: "base-help", source: "feature" })).toBeNull();
  });

  it("Action Surge's extra action takes anything but the Magic action", () => {
    const surge = [
      { slot: "action" as const, count: 1, excludedActions: ["magic" as const] },
    ];
    expect(
      canAssignActionClaims([{ category: "attack" }, { category: "magic" }], surge)
    ).toBe(true);
    expect(
      canAssignActionClaims([{ category: "magic" }, { category: "magic" }], surge)
    ).toBe(false);
    expect(canAssignActionClaims([{ category: null }, { category: "dash" }], surge)).toBe(
      true
    );
  });

  it("reconstructs each persisted Attack group with its own swing count", () => {
    expect(
      economyClaimsForTurn(
        [
          { isAttackGroup: true, economyCategory: "attack" },
          { isAttackGroup: true, economyCategory: "attack" },
          { economyCategory: "dash" },
        ],
        3,
        2
      )
    ).toEqual([
      { category: "attack", attackCount: 2 },
      { category: "attack", attackCount: 1 },
      { category: "dash" },
    ]);
  });
});
