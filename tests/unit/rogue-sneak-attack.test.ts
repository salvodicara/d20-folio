import { describe, it, expect } from "vitest";
import { resolveTrackers } from "@/lib/smart-tracker";
import { resolveActions } from "@/lib/smart-tracker";
import { buildScenario } from "@/lib/dev-scenarios";
import { makeCharacterDoc } from "./_helpers";

const sneak = (level: number) =>
  resolveTrackers(
    makeCharacterDoc({
      classes: [{ classId: "rogue", level: level }],
      features: [{ srdId: "rogue-sneak-attack" }],
    })
  ).find((t) => t.id === "rogue-sneak-attack");

describe("Sneak Attack scaling (H3)", () => {
  it("die shows the scaling damage ⌈level/2⌉d6 (not a flat d6)", () => {
    expect(sneak(1)?.die).toBe("1d6");
    expect(sneak(2)?.die).toBe("1d6");
    expect(sneak(3)?.die).toBe("2d6");
    expect(sneak(5)?.die).toBe("3d6");
    expect(sneak(9)?.die).toBe("5d6");
    expect(sneak(11)?.die).toBe("6d6");
    expect(sneak(19)?.die).toBe("10d6");
    expect(sneak(20)?.die).toBe("10d6");
  });

  it("stays a once-per-turn single use", () => {
    expect(sneak(11)?.total).toBe(1);
  });

  it("rides exactly Finesse or Ranged weapons with its live tracker cost", () => {
    const rogue = buildScenario({
      name: "Rook",
      raceId: "human",
      classId: "rogue",
      level: 3,
      background: "criminal",
      abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 12, CHA: 8 },
      weapons: [
        { srdId: "rapier", quantity: 1 },
        { srdId: "shortbow", quantity: 1 },
        { srdId: "club", quantity: 1 },
      ],
    });
    const byWeapon = new Map(
      resolveActions(rogue)
        .filter((action) => action.source === "weapon" && !action.offhand)
        .map((action) => [action.weaponId, action.summary.extraDamage ?? []])
    );

    for (const weaponId of ["rapier", "shortbow"]) {
      expect(byWeapon.get(weaponId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            dice: "2d6",
            resourceTrackerId: "rogue-sneak-attack",
          }),
        ])
      );
    }
    expect(byWeapon.get("club")).toEqual([]);
  });

  it("remains available on an eligible off-hand hit after a main-hand miss", () => {
    const rogue = buildScenario({
      name: "Rook",
      raceId: "human",
      classId: "rogue",
      level: 3,
      background: "criminal",
      abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 12, CHA: 8 },
      weapons: [
        { srdId: "shortsword", quantity: 1 },
        { srdId: "dagger", quantity: 1 },
      ],
    });
    const offhand = resolveActions(rogue).find((action) => action.offhand);

    expect(offhand?.summary.extraDamage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dice: "2d6",
          resourceTrackerId: "rogue-sneak-attack",
        }),
      ])
    );
  });

  it("models Steady Aim as a turn effect instead of prose-only chrome", () => {
    const rogue = buildScenario({
      name: "Rook",
      raceId: "human",
      classId: "rogue",
      level: 3,
      background: "criminal",
      abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 12, CHA: 8 },
    });
    expect(
      resolveActions(rogue).find((action) => action.id === "rogue-steady-aim-bonus")
    ).toEqual(
      expect.objectContaining({
        grantsNextAttackAdvantage: true,
        locksMovement: true,
      })
    );
  });

  it("models every Cunning Action choice as its own Bonus Action", () => {
    const rogue = buildScenario({
      name: "Rook",
      raceId: "human",
      classId: "rogue",
      level: 3,
      background: "criminal",
      abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 12, CHA: 8 },
    });
    const actions = resolveActions(rogue);

    expect(actions.find((row) => row.id === "rogue-cunning-action-dash")).toEqual(
      expect.objectContaining({ type: "bonus", economyCategory: "dash" })
    );
    expect(actions.find((row) => row.id === "rogue-cunning-action-disengage")).toEqual(
      expect.objectContaining({ type: "bonus", economyCategory: "disengage" })
    );
    const hide = actions.find((row) => row.id === "rogue-cunning-action-hide");
    expect(hide).toEqual(
      expect.objectContaining({ type: "bonus", economyCategory: "hide" })
    );
    expect(hide?.summary.skillCheck).toEqual({ dc: 15, skill: "stealth" });
  });
});
