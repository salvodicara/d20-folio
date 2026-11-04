/**
 * The Play screen tray's form: rows, typed totals, what each row applies and when
 * Apply opens. Cases from catalogue spells: Fireball (half on a save), a weapon attack
 * (a miss needs no number), Magic Missile split on two targets (a total each).
 */
import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import { facesSum, trayForm } from "@/domains/play/tray-form";
import { buildDevScenario } from "@/lib/dev-scenarios";
import type { TrayTarget } from "@/components/shared/damage-tray-target";
import { NO_DEFENSES } from "@/lib/damage-intake";
import {
  damageTrayPlan,
  setAttackOutcome,
  toggleSaved,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { makeCharacterDoc } from "./_helpers";

const wizard = makeCharacterDoc({
  classes: [{ classId: "wizard", level: 9 }],
  spells: spells.map((spell) => ({ srdId: spell.id })),
});
const spell = (id: string) => {
  const found = resolveActions(wizard, "spellbook").find((a) => a.spellId === id);
  if (!found) throw new Error(`no ${id}`);
  return localizeAction(found, "en");
};
const two = [
  { id: "m1", name: "One", kind: "monster" as const },
  { id: "m2", name: "Two", kind: "monster" as const },
];
const none = new Map();
const only = <T>(value: T | undefined): T => {
  if (value === undefined) throw new Error("missing row");
  return value;
};

describe("trayForm", () => {
  const fireball = damageTrayPlan(spell("fireball"), ["m1", "m2"], "pc-me");
  if (!fireball) throw new Error("no fireball tray");

  it("waits for the rolled total, then applies it, halved for a target that saved", () => {
    const empty = trayForm({
      plan: fireball,
      targets: two,
      edited: none,
      total: "",
      rowTotals: none,
    });
    expect(empty.canApply).toBe(false);
    expect(empty.amounts).toEqual([null, null]);

    const rows = trayForm({
      plan: fireball,
      targets: two,
      edited: none,
      total: "",
      rowTotals: none,
    }).rows;
    const saved = new Map([["m2", toggleSaved(only(rows[1]), fireball)]]);
    const typed = trayForm({
      plan: fireball,
      targets: two,
      edited: saved,
      total: "8+6+9",
      rowTotals: none,
    });
    expect(typed.total).toBe(23);
    expect(typed.amounts).toEqual([23, 11]);
    expect(typed.canApply).toBe(true);
  });

  it("a typo blocks Apply and says so", () => {
    const form = trayForm({
      plan: fireball,
      targets: two,
      edited: none,
      total: "8+x",
      rowTotals: none,
    });
    expect(form.totalInvalid).toBe(true);
    expect(form.canApply).toBe(false);
  });

  it("a tray of misses applies without a number", () => {
    const fighter = buildDevScenario("twf-extra-attack");
    if (!fighter) throw new Error("no scenario");
    const dagger = resolveActions(fighter).find((a) => a.id === "weapon-dagger");
    if (!dagger) throw new Error("no dagger");
    const plan = damageTrayPlan(localizeAction(dagger, "en"), ["m1"], "pc-me");
    if (!plan?.attack) throw new Error("no attack tray");
    const first = trayForm({
      plan,
      targets: two.slice(0, 1),
      edited: none,
      total: "",
      rowTotals: none,
    });
    expect(first.canApply).toBe(false);
    const missed = new Map([["m1", setAttackOutcome(only(first.rows[0]), "miss", plan)]]);
    const form = trayForm({
      plan,
      targets: two.slice(0, 1),
      edited: missed,
      total: "",
      rowTotals: none,
    });
    expect(form.canApply).toBe(true);
    expect(form.amounts).toEqual([0]);
  });

  it("split darts: each target its own total; an empty one gets nothing, a typo blocks", () => {
    const missile = damageTrayPlan(spell("magic-missile"), ["m1", "m2"], "pc-me");
    if (!missile?.perTarget) throw new Error("magic missile should split");
    const one = trayForm({
      plan: missile,
      targets: two,
      edited: none,
      total: "",
      rowTotals: new Map([["m1", "7"]]),
    });
    expect(one.totals).toEqual([7, null]);
    expect(one.canApply).toBe(true);
    const typo = trayForm({
      plan: missile,
      targets: two,
      edited: none,
      total: "",
      rowTotals: new Map([
        ["m1", "7"],
        ["m2", "x"],
      ]),
    });
    expect(typo.rowInvalid).toEqual([false, true]);
    expect(typo.canApply).toBe(false);
  });
});

// A hit of two damage types (a fire + radiant smite): one total per type, each meeting
// the target's own defense (the engine's `rowAmountByType`).
describe("trayForm — one total per damage type", () => {
  const smite: DamageTrayPlan = {
    effect: "damage",
    damageTypes: ["fire", "radiant"],
    targets: ["m1", "m2"],
  };
  const fireResistant: TrayTarget[] = [
    { ...only(two[0]), defenses: { ...NO_DEFENSES, resistances: new Set(["fire"]) } },
    only(two[1]),
  ];
  const typed = (fire: string, radiant: string) =>
    trayForm({
      plan: smite,
      targets: fireResistant,
      edited: none,
      total: "",
      rowTotals: none,
      typeTotals: new Map([
        ["fire", fire],
        ["radiant", radiant],
      ]),
    });

  it("each part meets each target's own defense", () => {
    expect(typed("10", "10").amounts).toEqual([15, 20]);
    expect(typed("10", "10").canApply).toBe(true);
  });

  it("a type left empty counts as none; nothing typed waits", () => {
    expect(typed("10", "").amounts).toEqual([5, 10]);
    expect(typed("", "").canApply).toBe(false);
  });

  it("a typo in one type blocks Apply and is marked", () => {
    const form = typed("10", "x");
    expect(form.typeInvalid).toEqual({ radiant: true });
    expect(form.canApply).toBe(false);
  });
});

describe("Great Weapon Fighting's dice faces", () => {
  const greatsword: DamageTrayPlan = {
    effect: "damage",
    damageType: "slashing",
    targets: ["m1"],
    dieFloor: { floorBelow: 2, floorTo: 3, dice: "2d6", bonus: 3 },
  };
  const one = [{ id: "m1", name: "One", kind: "monster" as const }];
  const form = (faces: string, total = "") =>
    trayForm({
      plan: greatsword,
      targets: one,
      edited: none,
      total,
      rowTotals: none,
      faces,
    });

  it("counts a 1 or 2 as a 3 and adds the weapon's bonus", () => {
    const f = form("1+5");
    expect(f.faces).toEqual({ terms: [3, 5], bonus: 3, total: 11 });
    expect(f.amounts).toEqual([11]);
    expect(f.canApply).toBe(true);
  });

  it("takes the faces spaced or with commas", () => {
    expect(form("2 6").faces?.total).toBe(12);
    expect(form("1, 1").faces?.total).toBe(9);
  });

  it("without faces, the typed total stands", () => {
    const f = form("", "9");
    expect(f.faces).toBeNull();
    expect(f.amounts).toEqual([9]);
  });

  it("faces that aren't numbers block Apply", () => {
    const f = form("1+x");
    expect(f.facesInvalid).toBe(true);
    expect(f.canApply).toBe(false);
  });

  it("a plan without the weapon's dice never reads faces", () => {
    const f = trayForm({
      plan: { ...greatsword, dieFloor: { floorBelow: 2, floorTo: 3 } },
      targets: one,
      edited: none,
      total: "7",
      rowTotals: none,
      faces: "1+1",
    });
    expect(f.faces).toBeNull();
    expect(f.amounts).toEqual([7]);
  });
});

describe("facesSum", () => {
  it("adds a bonus, subtracts a penalty, and leaves out a zero", () => {
    expect(facesSum({ terms: [3, 5], bonus: 3, total: 11 })).toBe("3 + 5 + 3");
    expect(facesSum({ terms: [3, 5], bonus: -1, total: 7 })).toBe("3 + 5 − 1");
    expect(facesSum({ terms: [4, 6], bonus: 0, total: 10 })).toBe("4 + 6");
  });
});

describe("a melee hit's knock out", () => {
  it("starts off: the player turns it on", () => {
    const melee: DamageTrayPlan = {
      effect: "damage",
      damageType: "slashing",
      melee: true,
      attack: { onMiss: "none" },
      targets: ["m1"],
    };
    const f = trayForm({
      plan: melee,
      targets: [{ id: "m1", name: "One", kind: "monster", defenses: NO_DEFENSES }],
      edited: none,
      total: "7",
      rowTotals: none,
    });
    expect(f.rows).toHaveLength(1);
    expect(f.rows[0]?.knockOut).toBeUndefined();
  });
});
