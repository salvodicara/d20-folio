/**
 * The DM's hit from the Scontro tab: one entry (an amount, maybe a type, Danni or Cura)
 * lands on every chosen creature through its own path: a monster through its defenses
 * (`changeMonsterHp`), a character through their own damage rule (`damagePcFromDm`).
 * The DM heals monsters; a character's healing stays on their sheet.
 */
import { describe, expect, it } from "vitest";

import { dmTargets, planDmHit } from "@/domains/combat/dm-hit-plan";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";

const base = {
  ac: 13,
  initiative: 12,
  conditions: [],
  tempHp: 0,
  down: false,
  hidden: false,
} as const;
const goblin = (n: number, hp: number): EncounterCombatantView => ({
  ...base,
  id: `monster-${n}`,
  kind: "monster",
  name: `Goblin ${n}`,
  currentHp: hp,
  maxHp: 7,
});
const mara: EncounterCombatantView = {
  ...base,
  id: "pc-member-mara",
  kind: "pc",
  name: "Mara",
  currentHp: 30,
  maxHp: 38,
  memberUid: "member-mara",
  characterId: "char-mara",
};

describe("planDmHit", () => {
  const rows = [goblin(1, 7), goblin(2, 3), mara];

  it("hits each chosen creature on its own path, with the type", () => {
    const plan = planDmHit(
      dmTargets(rows, ["monster-1", "monster-2", "pc-member-mara"]),
      {
        kind: "damage",
        amount: 8,
        type: "fire",
      }
    );
    expect(plan).toEqual([
      {
        kind: "monster",
        monsterId: "monster-1",
        change: { kind: "damage", parts: [{ amount: 8, type: "fire" }] },
      },
      {
        kind: "monster",
        monsterId: "monster-2",
        change: { kind: "damage", parts: [{ amount: 8, type: "fire" }] },
      },
      {
        kind: "pc",
        memberUid: "member-mara",
        characterId: "char-mara",
        maxHp: 38,
        parts: [{ amount: 8, type: "fire" }],
      },
    ]);
  });

  it("an untyped hit is one part with no type", () => {
    const [step] = planDmHit(dmTargets(rows, ["monster-1"]), {
      kind: "damage",
      amount: 5,
    });
    expect(step).toEqual({
      kind: "monster",
      monsterId: "monster-1",
      change: { kind: "damage", parts: [{ amount: 5 }] },
    });
  });

  it("heals monsters only: a character's healing stays on their sheet", () => {
    const plan = planDmHit(dmTargets(rows, ["monster-2", "pc-member-mara"]), {
      kind: "heal",
      amount: 4,
    });
    expect(plan).toEqual([
      { kind: "monster", monsterId: "monster-2", change: { kind: "heal", amount: 4 } },
    ]);
  });

  it("drops ids that are no longer in the fight, and nothing for zero", () => {
    expect(dmTargets(rows, ["monster-9"])).toEqual([]);
    expect(
      planDmHit(dmTargets(rows, ["monster-1"]), { kind: "damage", amount: 0 })
    ).toEqual([]);
  });
});
