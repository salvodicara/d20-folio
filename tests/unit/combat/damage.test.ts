import { describe, expect, it } from "vitest";
import { applyDamage, applyHealing } from "@/lib/combat/damage";
import { testEntity } from "./__helpers__/entities";

describe("applyDamage — SRD 5.2.1 order: adjustments, resistance, vulnerability, temp HP, HP", () => {
  it("halves resisted damage after flat reduction and doubles vulnerable damage", () => {
    const entity = testEntity({
      id: "e",
      hp: 30,
      resistances: ["fire"],
      vulnerabilities: ["cold"],
    });
    const fire = applyDamage(entity, [{ amount: 11, type: "fire" }], {
      flatReduction: 3,
    });
    expect(fire.entity.vitals.hp).toBe(30 - 4); // (11-3)=8 → halved rounded down = 4
    const cold = applyDamage(entity, [{ amount: 5, type: "cold" }], {});
    expect(cold.entity.vitals.hp).toBe(20);
  });

  it("ignores immune damage entirely", () => {
    const entity = testEntity({ id: "e", hp: 10, immunities: ["poison"] });
    const result = applyDamage(entity, [{ amount: 9, type: "poison" }], {});
    expect(result.entity.vitals.hp).toBe(10);
    expect(result.taken).toBe(0);
  });

  it("consumes temporary HP first and never heals it", () => {
    const entity = testEntity({ id: "e", hp: 10, tempHp: 4 });
    const result = applyDamage(entity, [{ amount: 6, type: "slashing" }], {});
    expect(result.entity.vitals.tempHp).toBeNull();
    expect(result.entity.vitals.hp).toBe(8);
    expect(result.taken).toBe(6);
  });

  it("drops a PC to dying at 0 and a monster to dead", () => {
    const pc = applyDamage(
      testEntity({ id: "pc", kind: "pc", hp: 3 }),
      [{ amount: 3, type: "fire" }],
      {}
    );
    expect(pc.entity.vitals.life).toBe("dying");
    expect(pc.hpZero).toBe(true);
    const monster = applyDamage(
      testEntity({ id: "m", kind: "monster", hp: 3 }),
      [{ amount: 3, type: "fire" }],
      {}
    );
    expect(monster.entity.vitals.life).toBe("dead");
  });

  it("kills outright on massive damage (remaining damage ≥ max HP)", () => {
    const pc = applyDamage(
      testEntity({ id: "pc", kind: "pc", hp: 5, maxHp: 20 }),
      [{ amount: 25, type: "fire" }],
      {}
    );
    expect(pc.entity.vitals.life).toBe("dead");
  });

  it("healing from 0 restores life and clears death saves", () => {
    const dying = testEntity({
      id: "pc",
      kind: "pc",
      hp: 0,
      life: "dying",
      deathSaves: { successes: 1, failures: 2 },
    });
    const healed = applyHealing(dying, 5);
    expect(healed.vitals.hp).toBe(5);
    expect(healed.vitals.life).toBe("alive");
    expect(healed.vitals.deathSaves).toEqual({ successes: 0, failures: 0 });
  });
});
