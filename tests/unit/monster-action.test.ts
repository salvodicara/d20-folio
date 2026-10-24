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
  toggleCondition,
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
      if (entry.conditions?.length) {
        // The Hit clause's conditions, off when a sentence gates them or a save
        // the hit forces decides them, and never on a miss.
        const optIn = Boolean(entry.conditionsIf || entry.conditionSave);
        expect(plan.conditions).toEqual({
          options: [...entry.conditions],
          pickOne: false,
          ...(optIn ? { optIn: true } : {}),
          ...(entry.conditionSave
            ? {
                save: {
                  ability: entry.conditionSave.save,
                  dc: entry.conditionSave.dc,
                },
              }
            : {}),
        });
        const row = initialTrayRow(plan, "pc-a");
        expect(row.conditions).toEqual(optIn ? [] : [...entry.conditions]);
        const on = { ...row, conditions: [...entry.conditions] };
        expect(monsterTrayLandings(plan, [on], 10)[0]?.conditions).toEqual([
          ...entry.conditions,
        ]);
        const missed = setAttackOutcome(on, "miss", plan);
        expect(monsterTrayLandings(plan, [missed], 10)[0]?.conditions).toEqual([]);
      } else {
        expect(plan.conditions).toBeUndefined();
      }
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
      for (const action of monsterActions(monster)) {
        const entry = (monster[action.section] ?? []).find(
          (candidate) => candidate.id === action.entryId
        );
        expect(entry?.kind).not.toBe("spellcasting");
        if (entry?.kind === "narrative")
          expect(Boolean(entry.damage || entry.performs)).toBe(true);
      }
    }
  });
});

const prose = MONSTERS.flatMap((monster) =>
  MONSTER_ACTION_SECTIONS.flatMap((section) =>
    (monster[section] ?? []).flatMap((entry) =>
      entry.kind === "narrative" && (entry.damage || entry.performs)
        ? [{ monster, section, entry: entry }]
        : []
    )
  )
);

const SECTION_ECONOMY = {
  traits: "trait",
  actions: "action",
  bonusActions: "bonus",
  reactions: "reaction",
  legendaryActions: "legendary",
} as const;

describe("monster actions — prose entries the print makes one tap", () => {
  it("covers the auras and the entries that use another attack", () => {
    expect(prose.filter(({ entry }) => entry.damage).length).toBeGreaterThan(8);
    expect(prose.filter(({ entry }) => entry.performs).length).toBeGreaterThan(25);
  });

  it.each(
    prose.map(({ monster, section, entry }) => [
      `${monster.id}.${section}.${entry.id}`,
      monster,
      section,
      entry,
    ])
  )("%s opens the tray its print states", (key, monster, section, entry) => {
    const action = monsterActions(monster).find(
      (candidate) => `${monster.id}.${candidate.section}.${candidate.entryId}` === key
    );
    expect(action).toBeDefined();
    if (!action) return;
    expect(action.activity.source).toEqual({
      kind: "monster",
      monsterId: monster.id,
      section,
      entryId: entry.id,
    });
    expect(action.activity.cost.economy).toBe(SECTION_ECONOMY[section]);
    const plan = monsterTrayPlan(action, ["pc-a"]);
    if (entry.damage) {
      // Damage with no roll: the total lands on every picked creature.
      expect(monsterActionDice(action)).toEqual(entry.damage.map((c) => c.dice));
      expect(plan.effect).toBe("damage");
      expect(plan.attack).toBeUndefined();
      expect(plan.save).toBeUndefined();
      expect(monsterTrayLandings(plan, [initialTrayRow(plan, "pc-a")], 6)).toEqual([
        { targetId: "pc-a", amount: 6, conditions: [] },
      ]);
    }
    if (entry.performs) {
      // The used entry's numbers and tray, at this entry's own cost.
      const used = monsterActions(monster).find(
        (candidate) =>
          candidate.section === entry.performs?.section &&
          candidate.entryId === entry.performs.entryId
      );
      expect(used).toBeDefined();
      if (!used) return;
      expect(action.toHit).toBe(used.toHit);
      expect(action.save).toEqual(used.save);
      expect(monsterActionDice(action)).toEqual(monsterActionDice(used));
      expect(plan).toEqual(monsterTrayPlan(used, ["pc-a"]));
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

  it("a wolf's bite: Prone is offered off (Medium or smaller), lands when the DM taps it", () => {
    const wolf = MONSTERS.find((m) => m.id === "wolf");
    const bite = wolf && monsterActions(wolf).find((a) => a.entryId === "bite");
    if (!bite) throw new Error("wolf bite expected");
    const plan = monsterTrayPlan(bite, ["pc-lyra"]);
    expect(plan.conditions).toEqual({ options: ["prone"], pickOne: false, optIn: true });
    const row = toggleCondition(initialTrayRow(plan, "pc-lyra"), "prone", plan);
    expect(monsterTrayLandings(plan, [row], 5)).toEqual([
      { targetId: "pc-lyra", amount: 5, conditions: ["prone"], outcome: "hit" },
    ]);
  });

  it("a ghoul's claw: Paralyzed rides the CON 10 save the hit forces", () => {
    const ghoul = MONSTERS.find((m) => m.id === "ghoul");
    const claw = ghoul && monsterActions(ghoul).find((a) => a.entryId === "claw");
    if (!claw) throw new Error("ghoul claw expected");
    expect(monsterTrayPlan(claw, ["pc-lyra"]).conditions).toEqual({
      options: ["paralyzed"],
      pickOne: false,
      optIn: true,
      save: { ability: "CON", dc: 10 },
    });
  });

  it("a kraken's tentacle: Grappled and Restrained land on a hit", () => {
    const kraken = MONSTERS.find((m) => m.id === "kraken");
    const tentacle =
      kraken && monsterActions(kraken).find((a) => a.entryId === "tentacle");
    if (!tentacle) throw new Error("kraken tentacle expected");
    const plan = monsterTrayPlan(tentacle, ["pc-lyra"]);
    expect(monsterTrayLandings(plan, [initialTrayRow(plan, "pc-lyra")], 24)).toEqual([
      {
        targetId: "pc-lyra",
        amount: 24,
        conditions: ["grappled", "restrained"],
        outcome: "hit",
      },
    ]);
  });

  it("a salamander's fire aura: the rolled fire lands on each creature the DM picks", () => {
    const salamander = MONSTERS.find((m) => m.id === "salamander");
    const aura =
      salamander && monsterActions(salamander).find((a) => a.entryId === "fire-aura");
    if (!aura) throw new Error("salamander fire aura expected");
    const plan = monsterTrayPlan(aura, ["a", "b"]);
    expect(plan.damageType).toBe("fire");
    expect(
      monsterTrayLandings(
        plan,
        plan.targets.map((id) => initialTrayRow(plan, id)),
        7
      )
    ).toEqual([
      { targetId: "a", amount: 7, conditions: [] },
      { targetId: "b", amount: 7, conditions: [] },
    ]);
  });

  it("a dragon's Pounce is its Rend, as a legendary action", () => {
    const pounce = dragon && monsterActions(dragon).find((a) => a.entryId === "pounce");
    const rend = dragon && monsterActions(dragon).find((a) => a.entryId === "rend");
    if (!pounce || !rend) throw new Error("adult-red-dragon pounce and rend expected");
    expect(pounce.section).toBe("legendaryActions");
    expect(pounce.toHit).toBe(rend.toHit);
    expect(pounce.activity.cost).toEqual({ economy: "legendary" });
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
