/**
 * The damage tray's row math: one rolled total, one row per target with ×0 · ×½ · ×1 ·
 * ×2, a "saved" toggle, the failed-save condition and the target's own defenses.
 *
 * Cases come from the catalogue: every SRD spell resolved for a full-spellbook sheet,
 * classified by its own resolution spec (never a hand-written list).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveActions, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction, localizeActions } from "@/lib/views/combat-action-view";
import { spells } from "@/data/spells";
import {
  combatDamageParts,
  combatResolutionSpec,
  shouldResolveCombatAction,
} from "@/lib/combat-resolution";
import { NO_DEFENSES, type DamageDefenses } from "@/lib/damage-intake";
import {
  damageTrayPlan,
  initialTrayRow,
  parseRolledTotal,
  previewHp,
  rowAmount,
  rowConditions,
  toggleCondition,
  toggleDefense,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import type { DamageType } from "@/types/damage";
import { makeCharacterDoc } from "./_helpers";

const doc = makeCharacterDoc({
  classes: [{ classId: "wizard", level: 9 }],
  spells: spells.map((spell) => ({ srdId: spell.id })),
});
const catalogue: ResolvedAction[] = resolveActions(doc, "spellbook")
  .map((row) => localizeAction(row, "en"))
  .filter(shouldResolveCombatAction);
const byId = new Map(catalogue.map((action) => [action.id, action]));
const action = (id: string): ResolvedAction => {
  const found = byId.get(id);
  if (!found) throw new Error(`no action ${id}`);
  return found;
};

const ME = "pc-me";
const FOE = "monster-1";
const FOES = ["monster-1", "monster-2", "monster-3"];

function plan(a: ResolvedAction, targets: string[] = [FOE]): DamageTrayPlan {
  const found = damageTrayPlan(a, targets, ME);
  if (!found) throw new Error(`no tray for ${a.id}`);
  return found;
}

/** Damage that rides the target's save (the spell's own data says so). */
const saveDamage = catalogue.filter(
  (a) =>
    combatResolutionSpec(a).hasDamage &&
    Boolean(a.summary.saveAbility || a.summary.saveDC) &&
    combatDamageParts(a).some((part) => part.resolution === "save")
);
const halfOnSave = saveDamage.filter(
  (a) => combatResolutionSpec(a).damageOnSave === "half"
);
const noneOnSave = saveDamage.filter(
  (a) => combatResolutionSpec(a).damageOnSave === "none"
);
// A spell that can heal OR harm (Conjure Celestial) opens as damage: the harmful use is
// the one aimed at a target the tray must change.
const heals = catalogue.filter(
  (a) => combatResolutionSpec(a).hasHealing && !combatResolutionSpec(a).hasDamage
);
const saveConditions = catalogue.filter(
  (a) => combatResolutionSpec(a).conditionApplication?.on === "failed-save"
);

function defenses(partial: Partial<Record<"res" | "imm" | "vul", DamageType[]>>) {
  return {
    ...NO_DEFENSES,
    resistances: new Set(partial.res ?? []),
    immunities: new Set(partial.imm ?? []),
    vulnerabilities: new Set(partial.vul ?? []),
  } satisfies DamageDefenses;
}

describe("the catalogue", () => {
  it("holds every kind of case", () => {
    expect(halfOnSave.length).toBeGreaterThan(20);
    expect(noneOnSave.length).toBeGreaterThan(5);
    expect(heals.length).toBeGreaterThan(5);
    expect(saveConditions.length).toBeGreaterThan(10);
  });
});

describe("damageTrayPlan + rows over the catalogue", () => {
  it("every save-for-half damage spell starts at ×1 and Saved gives half", () => {
    for (const a of halfOnSave) {
      const p = plan(a, FOES);
      expect(p.effect, a.id).toBe("damage");
      expect(p.save?.onSave, a.id).toBe("half");
      expect(p.targets, a.id).toEqual(FOES);
      const row = initialTrayRow(p, FOE);
      expect(row.multiplier, a.id).toBe("1");
      expect(rowAmount(28, row, p), a.id).toBe(28);
      expect(rowAmount(27, { ...row, saved: true }, p), a.id).toBe(13);
    }
  });

  it("every damage spell that does nothing on a save gives 0 once Saved", () => {
    for (const a of noneOnSave) {
      const p = plan(a);
      expect(p.save?.onSave, a.id).toBe("none");
      const row = initialTrayRow(p, FOE);
      expect(rowAmount(9, row, p), a.id).toBe(9);
      expect(rowAmount(9, { ...row, saved: true }, p), a.id).toBe(0);
    }
  });

  it("every heal spell has no save toggle and heals the full total", () => {
    for (const a of heals) {
      const p = plan(a, [ME]);
      expect(p.effect, a.id).toBe("heal");
      expect(p.save, a.id).toBeUndefined();
      expect(rowAmount(11, initialTrayRow(p, ME), p), a.id).toBe(11);
    }
  });

  it("every failed-save condition spell shows its condition chip, gone once Saved", () => {
    for (const a of saveConditions) {
      const application = combatResolutionSpec(a).conditionApplication;
      if (!application) throw new Error(a.id);
      const p = plan(a);
      expect(p.save, a.id).toBeDefined();
      expect(p.conditions?.options, a.id).toEqual(application.options);
      const row = initialTrayRow(p, FOE);
      expect(rowConditions(row).length, a.id).toBeGreaterThan(0);
      expect(
        rowConditions(row).every((id) => application.options.includes(id)),
        a.id
      ).toBe(true);
      expect(rowConditions({ ...row, saved: true }), a.id).toEqual([]);
    }
  });

  it("Hold Person has no number: Paralyzed on a failed save", () => {
    const p = plan(action("spell-hold-person"));
    expect(p.effect).toBeNull();
    expect(p.save?.ability).toBe("WIS");
    expect(rowConditions(initialTrayRow(p, FOE))).toEqual(["paralyzed"]);
  });

  it("an attack spell has no Saved toggle (Fire Bolt)", () => {
    const p = plan(action("spell-fire-bolt"));
    expect(p).toMatchObject({ effect: "damage", damageType: "fire" });
    expect(p.save).toBeUndefined();
  });

  it("Blindness/Deafness picks one condition, the first by default", () => {
    const p = plan(action("spell-blindness-deafness"));
    expect(p.conditions?.pickOne).toBe(true);
    const row = initialTrayRow(p, FOE);
    expect(row.conditions).toEqual(["blinded"]);
    expect(toggleCondition(row, "deafened", p).conditions).toEqual(["deafened"]);
  });

  it("a pool spend already chose its amount: no tray (Lay on Hands)", () => {
    const paladin = makeCharacterDoc({
      classId: "paladin",
      level: 3,
      features: [{ srdId: "paladin-lay-on-hands" }],
    });
    const lay = localizeActions(paladin, "en").find(
      (a) => a.costTracker === "paladin-lay-on-hands"
    );
    if (!lay) throw new Error("no Lay on Hands");
    expect(combatResolutionSpec(lay).hasHealing).toBe(true);
    expect(damageTrayPlan(lay, [], ME)).toBeNull();
  });

  it("nothing to apply, no tray (Mage Armor; damage without a target)", () => {
    expect(damageTrayPlan(action("spell-mage-armor"), [ME], ME)).toBeNull();
    expect(damageTrayPlan(action("spell-fireball"), [], ME)).toBeNull();
  });
});

describe("the target's own defenses pre-set the multiplier", () => {
  let fireball: DamageTrayPlan;
  beforeEach(() => {
    fireball = plan(action("spell-fireball"));
  });

  it("resistance ½, vulnerability ×2, immunity 0; the chip switches back to ×1", () => {
    const resist = initialTrayRow(fireball, FOE, defenses({ res: ["fire"] }));
    expect(resist).toMatchObject({ multiplier: "0.5", defense: "resistant" });
    expect(rowAmount(27, resist, fireball)).toBe(13);
    expect(toggleDefense(resist).multiplier).toBe("1");
    expect(toggleDefense(toggleDefense(resist)).multiplier).toBe("0.5");

    const vuln = initialTrayRow(fireball, FOE, defenses({ vul: ["fire"] }));
    expect(rowAmount(27, vuln, fireball)).toBe(54);
    const immune = initialTrayRow(
      fireball,
      FOE,
      defenses({ imm: ["fire"], res: ["fire"] })
    );
    expect(immune).toMatchObject({ multiplier: "0", defense: "immune" });
    expect(rowAmount(27, immune, fireball)).toBe(0);
  });

  it("saved and resistant: halve, then halve again, rounding down each time", () => {
    const row = {
      ...initialTrayRow(fireball, FOE, defenses({ res: ["fire"] })),
      saved: true,
    };
    expect(rowAmount(27, row, fireball)).toBe(6);
  });

  it("another type, both resistance and vulnerability, or no defenses: ×1", () => {
    expect(initialTrayRow(fireball, FOE, defenses({ res: ["cold"] })).defense).toBeNull();
    expect(
      initialTrayRow(fireball, FOE, defenses({ res: ["fire"], vul: ["fire"] })).multiplier
    ).toBe("1");
    expect(initialTrayRow(fireball, FOE).multiplier).toBe("1");
  });

  it("a heal is never cut by a defense", () => {
    const heal = plan(action("spell-cure-wounds"), [ME]);
    expect(initialTrayRow(heal, ME, defenses({ res: ["fire"] })).multiplier).toBe("1");
  });
});

describe("parseRolledTotal", () => {
  it.each([
    ["14", 14],
    ["8+6+3", 17],
    [" 8 + 6 ", 14],
    ["0", 0],
  ])("%s → %s", (text, total) => expect(parseRolledTotal(text)).toBe(total));

  it.each(["", "—", "8+", "+8", "8-3", "2d6", "abc", "8++6"])(
    "%s is not a total",
    (text) => expect(parseRolledTotal(text)).toBeNull()
  );
});

describe("previewHp", () => {
  const hp = { current: 22, max: 22, temp: 5 };
  it("damage eats temp HP first and stops at 0", () => {
    expect(previewHp("damage", 14, hp)).toEqual({ current: 13, max: 22, temp: 0 });
    expect(previewHp("damage", 99, hp)).toMatchObject({ current: 0 });
  });
  it("a heal stops at the maximum; temp HP keep the higher", () => {
    expect(previewHp("heal", 8, { ...hp, current: 10 }).current).toBe(18);
    expect(previewHp("heal", 8, hp).current).toBe(22);
    expect(previewHp("temp-hp", 3, hp).temp).toBe(5);
    expect(previewHp("temp-hp", 9, hp).temp).toBe(9);
  });
});
