import { describe, expect, it } from "vitest";
import {
  canAssignActionClaims,
  economyClaimsForTurn,
  economyActionCategory,
  successfulActionPrerequisiteMet,
  type EconomyActionRule,
} from "@/lib/combat-economy";

const haste: EconomyActionRule = {
  slot: "action",
  count: 1,
  allowedActions: ["attack", "dash", "disengage", "hide", "utilize"],
  maxAttacks: 1,
};

describe("restricted combat economy", () => {
  it("unlocks a reviewed follow-up only from a successful durable receipt", () => {
    const redirect = {
      requiresSuccessfulActionThisTurn: "monk-deflect-attacks-reaction",
    };
    expect(
      successfulActionPrerequisiteMet(redirect, [{ id: "monk-deflect-attacks-reaction" }])
    ).toBe(false);
    expect(
      successfulActionPrerequisiteMet(redirect, [
        { id: "monk-deflect-attacks-reaction", resolutionSucceeded: true },
      ])
    ).toBe(true);
    expect(
      successfulActionPrerequisiteMet(redirect, [], {
        id: "monk-deflect-attacks-reaction",
        resolutionSucceeded: true,
      })
    ).toBe(true);
  });

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
    expect(economyActionCategory({ id: "fireball", source: "spell" })).toBeNull();
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
