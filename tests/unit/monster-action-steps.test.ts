/**
 * A monster's printed action, applied from the new fight screen (classic
 * `applyMonsterAction`): the tray's rows become one step per target — a monster's
 * damage on its encounter HP, a hero's through their own sheet with the monster as the
 * attacker — and one step per failed-save condition. The tray has already applied the
 * target's defense and the row's multiplier, so the amount travels untyped.
 */
import { describe, expect, it } from "vitest";

import { monsterActionSteps } from "@/domains/combat/monster-action-steps";
import type { DmTarget } from "@/domains/combat/dm-hit-plan";
import type { DamageTrayPlan, TrayRow } from "@/lib/play/damage-tray";

const row = (targetId: string, extra: Partial<TrayRow> = {}): TrayRow => ({
  targetId,
  multiplier: "1",
  saved: false,
  defense: null,
  defenseOn: false,
  conditions: [],
  ...extra,
});
const goblin: DmTarget = {
  id: "monster-2",
  kind: "monster",
  name: "Goblin",
  hp: { current: 7, max: 7, temp: 0 },
  conditions: [],
};
const ana: DmTarget = {
  id: "pc-ana",
  kind: "pc",
  name: "Ana",
  hp: { current: 20, max: 30, temp: 0 },
  conditions: [],
  memberUid: "ana",
  characterId: "c-ana",
};

describe("monsterActionSteps", () => {
  const attack: DamageTrayPlan = {
    effect: "damage",
    damageType: "slashing",
    attack: { onMiss: "none" },
    melee: true,
    targets: ["pc-ana", "monster-2"],
  };

  it("a hit on a hero goes through their sheet with the monster as melee attacker; a miss does nothing", () => {
    const steps = monsterActionSteps(
      "monster-1",
      attack,
      [
        row("pc-ana", { attack: "hit" }),
        row("monster-2", { attack: "miss", multiplier: "0" }),
      ],
      8,
      [ana, goblin]
    );
    expect(steps).toEqual([
      {
        kind: "pc",
        memberUid: "ana",
        characterId: "c-ana",
        maxHp: 30,
        parts: [{ amount: 8 }],
        attacker: { id: "monster-1", melee: true },
      },
    ]);
  });

  it("a critical doubles on the row; a monster target takes it on its encounter HP", () => {
    const steps = monsterActionSteps(
      "monster-1",
      attack,
      [row("monster-2", { attack: "critical", multiplier: "2" })],
      5,
      [goblin]
    );
    expect(steps).toEqual([
      {
        kind: "monster",
        monsterId: "monster-2",
        change: { kind: "damage", parts: [{ amount: 10 }], attackerId: "monster-1" },
      },
    ]);
  });

  it("a failed save lands half or full damage and its conditions; a success halves", () => {
    const save: DamageTrayPlan = {
      effect: "damage",
      save: { ability: "DEX", dc: 13, onSave: "half" },
      conditions: { options: ["prone"], pickOne: false },
      targets: ["pc-ana", "monster-2"],
    };
    const steps = monsterActionSteps(
      "monster-1",
      save,
      [
        row("pc-ana", { conditions: ["prone"] }),
        row("monster-2", { saved: true, multiplier: "0.5" }),
      ],
      12,
      [ana, goblin]
    );
    expect(steps).toEqual([
      {
        kind: "pc",
        memberUid: "ana",
        characterId: "c-ana",
        maxHp: 30,
        parts: [{ amount: 12 }],
      },
      { kind: "condition", target: ana, conditionId: "prone" },
      {
        kind: "monster",
        monsterId: "monster-2",
        change: { kind: "damage", parts: [{ amount: 6 }], attackerId: "monster-1" },
      },
    ]);
  });
});
