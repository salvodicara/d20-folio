/**
 * Swarms (SRD 5.2.1 bestiary, the Swarm trait every "Swarm of Tiny Beasts" prints):
 * "The swarm can occupy another creature's space and vice versa, and the swarm can
 * move through any opening large enough for a Tiny bat. The swarm can't regain Hit
 * Points or gain Temporary Hit Points." Each swarm attack prints a smaller amount
 * "if the swarm is Bloodied". Resistance to Bludgeoning, Piercing and Slashing is the
 * block's own printed defense line, already declared.
 *
 * Cases come from the stat blocks and their English print.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { MonsterAttackEntry, MonsterStatBlock } from "@/data/types";
import { SRD_MONSTERS_A_B } from "@/data/monsters/a-b";
import { SRD_MONSTERS_C_D } from "@/data/monsters/c-d";
import { SRD_MONSTERS_E_G } from "@/data/monsters/e-g";
import { SRD_MONSTERS_H_K } from "@/data/monsters/h-k";
import { SRD_MONSTERS_L_M } from "@/data/monsters/l-m";
import { SRD_MONSTERS_N_P } from "@/data/monsters/n-p";
import { SRD_MONSTERS_Q_S } from "@/data/monsters/q-s";
import { SRD_MONSTERS_T_Z } from "@/data/monsters/t-z";
import { printedAttack } from "@/lib/activities/monster-print";
import {
  swarmAttackDamage,
  swarmFacts,
  swarmHealing,
  swarmTempHp,
} from "@/lib/play/swarm";

const EN = JSON.parse(
  readFileSync(join(process.cwd(), "src/i18n/en/srd/monsters.json"), "utf8")
) as Readonly<Record<string, { name: string; text?: string }>>;

const block = (id: string): MonsterStatBlock => {
  const found = SRD_MONSTERS_Q_S.find((monster) => monster.id === id);
  if (!found) throw new Error(id);
  return found;
};
const attack = (monster: MonsterStatBlock, id: string): MonsterAttackEntry => {
  const entry = monster.actions.find((candidate) => candidate.id === id);
  if (entry?.kind !== "attack") throw new Error(id);
  return entry;
};

describe("printedAttack reads a swarm's Bloodied amount", () => {
  it("the primary amount it swaps in while the swarm is Bloodied", () => {
    expect(printedAttack(EN["swarm-of-rats.actions.bites"]?.text ?? "")).toMatchObject({
      damage: [{ dice: "2d4", damageType: "piercing" }],
      bloodiedDamage: { dice: "1d4", damageType: "piercing" },
    });
  });

  it("the dashed variant keeps its plus clause (Venomous Snakes)", () => {
    expect(
      printedAttack(EN["swarm-of-venomous-snakes.actions.bites"]?.text ?? "")
    ).toMatchObject({
      damage: [
        { dice: "1d8+4", damageType: "piercing" },
        { dice: "3d6", damageType: "poison" },
      ],
      bloodiedDamage: { dice: "1d4+4", damageType: "piercing" },
    });
  });

  it("an amount that depends on the target being Bloodied is not the attacker's", () => {
    // Blood Hawk: "or 6 (1d8 + 2) Piercing damage if the target is Bloodied."
    expect(
      printedAttack(EN["blood-hawk.actions.beak"]?.text ?? "")?.bloodiedDamage
    ).toBeUndefined();
  });
});

describe("swarm facts", () => {
  it("a swarm occupies others' spaces, squeezes through its members' size, never heals", () => {
    expect(swarmFacts(block("swarm-of-bats"))).toEqual({
      memberSize: "Tiny",
      sharesSpaces: true,
      regainsHp: false,
      gainsTempHp: false,
    });
  });

  it("a creature that is no swarm has none", () => {
    expect(swarmFacts(block("sahuagin-warrior"))).toBeNull();
  });

  it("a swarm can't regain Hit Points or gain Temporary Hit Points", () => {
    const rats = block("swarm-of-rats");
    expect(swarmHealing(rats, 7)).toBe(0);
    expect(swarmTempHp(rats, 5)).toBe(0);
    const other = block("sahuagin-warrior");
    expect(swarmHealing(other, 7)).toBe(7);
    expect(swarmTempHp(other, 5)).toBe(5);
  });

  it("a swarm resists Bludgeoning, Piercing and Slashing on its own defense line", () => {
    for (const swarm of SRD_MONSTERS_Q_S.filter((m) => m.swarmOf)) {
      expect(swarm.damageResistances, swarm.id).toEqual(
        expect.arrayContaining(["bludgeoning", "piercing", "slashing"])
      );
    }
  });
});

describe("swarmAttackDamage", () => {
  const rats = block("swarm-of-rats");
  const bites = attack(rats, "bites");

  it("deals the full amount above half its Hit Points", () => {
    expect(swarmAttackDamage(bites, { current: 8, max: 14 })).toEqual([
      { dice: "2d4", damageType: "piercing" },
    ]);
  });

  it("deals the smaller amount once Bloodied (half its Hit Points or fewer)", () => {
    expect(swarmAttackDamage(bites, { current: 7, max: 14 })).toEqual([
      { dice: "1d4", damageType: "piercing" },
    ]);
  });

  it("keeps the rider clauses when the primary amount shrinks", () => {
    const snakes = attack(block("swarm-of-venomous-snakes"), "bites");
    expect(swarmAttackDamage(snakes, { current: 10, max: 36 })).toEqual([
      { dice: "1d4+4", damageType: "piercing" },
      { dice: "3d6", damageType: "poison" },
    ]);
  });

  it("an attack with no Bloodied amount is unchanged", () => {
    const plain: MonsterAttackEntry = { ...bites, bloodiedDamage: undefined };
    expect(swarmAttackDamage(plain, { current: 1, max: 14 })).toEqual(plain.damage);
  });
});

describe("RULES_COVERAGE mounts and swarms row", () => {
  it("states the counted swarms of the public bestiary", () => {
    const srd = [
      ...SRD_MONSTERS_A_B,
      ...SRD_MONSTERS_C_D,
      ...SRD_MONSTERS_E_G,
      ...SRD_MONSTERS_H_K,
      ...SRD_MONSTERS_L_M,
      ...SRD_MONSTERS_N_P,
      ...SRD_MONSTERS_Q_S,
      ...SRD_MONSTERS_T_Z,
    ];
    const swarms = srd.filter((monster) => swarmFacts(monster) !== null);
    const smaller = srd.flatMap((monster) =>
      monster.actions.filter((entry) => entry.kind === "attack" && entry.bloodiedDamage)
    );
    const line = readFileSync("docs/RULES_COVERAGE.md", "utf8")
      .split("\n")
      .find((l) => l.includes("| Mounts, swarms"));
    expect(line).toContain(`${swarms.length} swarms`);
    expect(line).toContain(`${smaller.length} swarm attacks`);
  });
});
