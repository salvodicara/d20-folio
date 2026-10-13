/**
 * A monster's action on the DM's damage tray: every attack and save entry of the
 * bestiary (public SRD + content pack, never a hand list) is one tap away, and the
 * tray it opens asks exactly what the stat block prints:
 *
 *  - an attack: Hit · Miss · Critical per target, the printed to-hit bonus, the
 *    printed dice, the damage type when the entry deals one;
 *  - a save: the printed ability and DC, "Saved" halving the damage only when the
 *    print says "Success: Half damage", and the conditions its Failure clause names
 *    offered as chips (on by default);
 *  - Apply lands each row's own amount, conditions and result.
 */
import { describe, expect, it } from "vitest";

import { MONSTERS } from "@/data/monsters";
import type { MonsterEntry } from "@/data/types";
import {
  initialTrayRow,
  setAttackOutcome,
  toggleSaved,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import {
  MONSTER_ACTION_SECTIONS,
  monsterActionDice,
  monsterActions,
  monsterTrayLandings,
  monsterTrayPlan,
} from "@/lib/play/monster-action";

type Printed = Extract<MonsterEntry, { kind: "attack" | "save" }>;

const printed = MONSTERS.flatMap((monster) =>
  MONSTER_ACTION_SECTIONS.flatMap((section) =>
    (monster[section] ?? []).flatMap((entry) =>
      entry.kind === "attack" || entry.kind === "save"
        ? [{ monster, section, entry }]
        : []
    )
  )
);

/** The one concrete damage type every printed clause shares, if any. */
function oneType(entry: Printed): string | undefined {
  const types = new Set<string>();
  for (const clause of entry.damage ?? []) {
    if (!clause.damageType) return undefined;
    types.add(clause.damageType);
  }
  return types.size === 1 ? [...types][0] : undefined;
}

describe("monster actions — every printed attack and save", () => {
  it("covers the bestiary", () => {
    expect(printed.filter(({ entry }) => entry.kind === "attack").length).toBeGreaterThan(
      400
    );
    expect(printed.filter(({ entry }) => entry.kind === "save").length).toBeGreaterThan(
      180
    );
  });

  it.each(
    printed.map(({ monster, section, entry }) => [
      `${monster.id}.${section}.${entry.id}`,
      monster,
      entry,
    ])
  )("%s opens a tray with its printed numbers", (key, monster, entry) => {
    const action = monsterActions(monster).find(
      (candidate) => `${monster.id}.${candidate.section}.${candidate.entryId}` === key
    );
    expect(action).toBeDefined();
    if (!action) return;
    const plan = monsterTrayPlan(action, ["pc-a", "pc-b"]);
    expect(plan.targets).toEqual(["pc-a", "pc-b"]);
    expect(monsterActionDice(action)).toEqual((entry.damage ?? []).map((c) => c.dice));
    expect(plan.damageType).toBe(oneType(entry));
    if (entry.kind === "attack") {
      expect(action.toHit).toBe(entry.toHit);
      expect(plan.attack).toEqual({ onMiss: "none" });
      expect(plan.effect).toBe("damage");
      expect(plan.save).toBeUndefined();
      expect(plan.conditions).toBeUndefined();
    } else {
      expect(action.save).toEqual({ ability: entry.save, dc: entry.dc });
      expect(plan.attack).toBeUndefined();
      expect(plan.save).toEqual({
        ability: entry.save,
        dc: entry.dc,
        onSave: entry.onSuccess === "half" ? "half" : "none",
      });
      const deals = (entry.damage?.length ?? 0) > 0 || entry.onSuccess === "half";
      expect(plan.effect).toBe(deals ? "damage" : null);
      if (entry.conditions?.length) {
        expect(plan.conditions).toEqual({
          options: [...entry.conditions],
          pickOne: false,
        });
        // Offered on, and dropped once the target saves.
        const row = initialTrayRow(plan, "pc-a");
        expect(row.conditions).toEqual([...entry.conditions]);
        const landed = monsterTrayLandings(plan, [toggleSaved(row, plan)], 10);
        expect(landed[0]?.conditions).toEqual([]);
      } else {
        expect(plan.conditions).toBeUndefined();
      }
    }
  });

  it("keeps prose entries (Multiattack, Spellcasting) off the one-tap list", () => {
    for (const monster of MONSTERS) {
      for (const action of monsterActions(monster))
        expect(["attack", "save"]).toContain(
          action.toHit !== undefined ? "attack" : action.save ? "save" : "other"
        );
    }
  });
});

describe("monster actions — Apply", () => {
  const goblin = MONSTERS.find((m) => m.id === "goblin-warrior");
  const dragon = MONSTERS.find((m) => m.id === "adult-red-dragon");

  it("a goblin's scimitar: hit on Lyra lands the total, a miss lands nothing", () => {
    const scimitar =
      goblin && monsterActions(goblin).find((a) => a.entryId === "scimitar");
    if (!scimitar) throw new Error("goblin-warrior scimitar expected");
    expect(scimitar.toHit).toBe(4);
    const plan = monsterTrayPlan(scimitar, ["pc-lyra", "pc-bren"]);
    const lyra = initialTrayRow(plan, "pc-lyra");
    const bren = setAttackOutcome(initialTrayRow(plan, "pc-bren"), "miss", plan);
    expect(monsterTrayLandings(plan, [lyra, bren], 7)).toEqual([
      { targetId: "pc-lyra", amount: 7, conditions: [], outcome: "hit" },
      { targetId: "pc-bren", amount: 0, conditions: [], outcome: "miss" },
    ]);
  });

  it("a dragon's fire breath: Saved halves for one of three targets", () => {
    const breath =
      dragon && monsterActions(dragon).find((a) => a.entryId === "fire-breath");
    if (!breath) throw new Error("adult-red-dragon fire breath expected");
    const plan: DamageTrayPlan = monsterTrayPlan(breath, ["a", "b", "c"]);
    expect(plan.save).toEqual({ ability: "DEX", dc: 21, onSave: "half" });
    expect(plan.damageType).toBe("fire");
    const rows = plan.targets.map((id) => initialTrayRow(plan, id));
    rows[1] = toggleSaved(rows[1] ?? initialTrayRow(plan, "b"), plan);
    expect(monsterTrayLandings(plan, rows, 59)).toEqual([
      { targetId: "a", amount: 59, conditions: [], outcome: "failed" },
      { targetId: "b", amount: 29, conditions: [], outcome: "saved" },
      { targetId: "c", amount: 59, conditions: [], outcome: "failed" },
    ]);
  });
});
