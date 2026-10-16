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
  rowNeedsTotal,
  setAttackOutcome,
  setMultiplier,
  sharedAttackOutcome,
  toggleCondition,
  toggleDefense,
  toggleSaved,
  trayOutcomeReceipts,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { SRD_WEAPONS } from "@/data/weapons";
import { buildDevScenario } from "@/lib/dev-scenarios";
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
  it("every save-for-half damage spell starts at ×1 and Saved selects ½", () => {
    for (const a of halfOnSave) {
      const p = plan(a, FOES);
      expect(p.effect, a.id).toBe("damage");
      expect(p.save?.onSave, a.id).toBe("half");
      expect(p.targets, a.id).toEqual(FOES);
      const row = initialTrayRow(p, FOE);
      expect(row.multiplier, a.id).toBe("1");
      expect(rowAmount(28, row, p), a.id).toBe(28);
      const saved = toggleSaved(row, p);
      expect(saved, a.id).toMatchObject({ saved: true, multiplier: "0.5" });
      expect(rowAmount(27, saved, p), a.id).toBe(13);
      expect(toggleSaved(saved, p), a.id).toMatchObject({
        saved: false,
        multiplier: "1",
      });
    }
  });

  it("every damage spell that does nothing on a save selects 0 once Saved", () => {
    for (const a of noneOnSave) {
      const p = plan(a);
      expect(p.save?.onSave, a.id).toBe("none");
      const row = initialTrayRow(p, FOE);
      expect(rowAmount(9, row, p), a.id).toBe(9);
      const saved = toggleSaved(row, p);
      expect(saved.multiplier, a.id).toBe("0");
      expect(rowAmount(9, saved, p), a.id).toBe(0);
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
      expect(rowConditions(toggleSaved(row, p)), a.id).toEqual([]);
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
    expect(toggleDefense(resist, fireball).multiplier).toBe("1");
    expect(toggleDefense(toggleDefense(resist, fireball), fireball).multiplier).toBe(
      "0.5"
    );

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

  it("saved and resistant: Saved selects ¼ (halve, halve again, rounding down)", () => {
    const row = toggleSaved(
      initialTrayRow(fireball, FOE, defenses({ res: ["fire"] })),
      fireball
    );
    expect(row.multiplier).toBe("0.25");
    expect(rowAmount(27, row, fireball)).toBe(6);
    // Vulnerable and saved: ½ × 2 = ×1; immune stays 0.
    const vuln = initialTrayRow(fireball, FOE, defenses({ vul: ["fire"] }));
    expect(toggleSaved(vuln, fireball).multiplier).toBe("1");
    const immune = initialTrayRow(fireball, FOE, defenses({ imm: ["fire"] }));
    expect(toggleSaved(immune, fireball).multiplier).toBe("0");
  });

  it("the segment IS the multiplier: a hand-picked segment wins over Saved", () => {
    const saved = toggleSaved(initialTrayRow(fireball, FOE), fireball);
    const manual = setMultiplier(saved, "2");
    expect(manual).toMatchObject({ saved: true, multiplier: "2" });
    expect(rowAmount(10, manual, fireball)).toBe(20);
    // Turning Saved off again recomputes from the facts: ×1.
    expect(toggleSaved(manual, fireball).multiplier).toBe("1");
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

/** Every SRD weapon's attack card, carried by a level-5 Fighter who mastered it. */
const weaponCards: ResolvedAction[] = SRD_WEAPONS.flatMap((weapon) => {
  const fighter = buildDevScenario("weapon-mastery-numbers");
  if (!fighter) throw new Error("scenario missing");
  fighter.character.weapons = [{ srdId: weapon.id, quantity: 1 }];
  const entry = fighter.character.classes[0];
  if (entry) entry.weaponMasteries = [weapon.id];
  return localizeActions(fighter, "en").filter((a) => a.id === `weapon-${weapon.id}`);
});
/** Every spell the catalogue says makes an attack roll, and every save spell. */
const attackSpells = catalogue.filter(
  (a) => spells.find((spell) => spell.id === a.spellId)?.attackType !== undefined
);
const saveSpells = catalogue.filter((a) => {
  const spell = spells.find((s) => s.id === a.spellId);
  return spell?.saveAbility !== undefined && spell.attackType === undefined;
});

describe("Hit · Miss · Critical on attacks", () => {
  it("the catalogue holds every weapon and every attack-roll spell", () => {
    expect(weaponCards.length).toBe(SRD_WEAPONS.length);
    expect(new Set(attackSpells.map((a) => a.spellId))).toEqual(
      new Set(spells.filter((s) => s.attackType).map((s) => s.id))
    );
    expect(saveSpells.length).toBeGreaterThan(50);
  });

  it("every weapon and every attack-roll spell offers the outcome, Hit by default", () => {
    for (const a of [...weaponCards, ...attackSpells]) {
      const p = plan(a);
      expect(p.attack, a.id).toBeDefined();
      expect(p.targets, a.id).toEqual([FOE]);
      expect(initialTrayRow(p, FOE).attack, a.id).toBe("hit");
    }
  });

  it("no save spell offers it", () => {
    for (const a of saveSpells) {
      const p = damageTrayPlan(a, [FOE], ME);
      expect(p?.attack, a.id).toBeUndefined();
      if (p) expect(initialTrayRow(p, FOE).attack, a.id).toBeUndefined();
    }
  });

  it("Miss deals nothing and needs no number; Critical keeps the typed total", () => {
    const misses = [...weaponCards, ...attackSpells].filter((a) => {
      const p = plan(a);
      return p.effect === "damage" && p.attack?.onMiss === "none" && !p.attack.graze;
    });
    expect(misses.length).toBeGreaterThan(30);
    for (const a of misses) {
      const p = plan(a);
      const row = initialTrayRow(p, FOE);
      expect(rowNeedsTotal(row, p), a.id).toBe(true);
      const miss = setAttackOutcome(row, "miss", p);
      expect(miss).toMatchObject({ attack: "miss", multiplier: "0" });
      expect(rowAmount(14, miss, p), a.id).toBe(0);
      expect(rowNeedsTotal(miss, p), a.id).toBe(false);
      const crit = setAttackOutcome(miss, "critical", p);
      expect(crit).toMatchObject({ attack: "critical", multiplier: "1" });
      expect(rowAmount(14, crit, p), a.id).toBe(14);
    }
  });

  it("a miss with Graze deals the mastery's damage, whatever was rolled", () => {
    const grazing = weaponCards.filter((a) => a.summary.masteryDetail?.grazeDamage);
    expect(grazing.length).toBeGreaterThan(0);
    for (const a of grazing) {
      const graze = a.summary.masteryDetail?.grazeDamage ?? 0;
      const p = plan(a);
      expect(p.attack?.graze, a.id).toBe(graze);
      const miss = setAttackOutcome(initialTrayRow(p, FOE), "miss", p);
      expect(miss.multiplier, a.id).toBe("1");
      expect(rowNeedsTotal(miss, p), a.id).toBe(false);
      expect(rowAmount(99, miss, p), a.id).toBe(graze);
      // A known resistance still halves it.
      const resistant = setAttackOutcome(
        initialTrayRow(p, FOE, defenses({ res: [p.damageType ?? "slashing"] })),
        "miss",
        p
      );
      expect(rowAmount(99, resistant, p), a.id).toBe(Math.floor(graze / 2));
    }
  });

  it("an attack whose data says half on a miss deals half the total", () => {
    // No catalogue spell carries `damageOnMiss` yet (Acid Arrow's splash is prose):
    // the seam is the resolved summary's own fact.
    const bolt = action("spell-fire-bolt");
    const p = plan({ ...bolt, summary: { ...bolt.summary, damageOnMiss: "half" } });
    expect(p.attack?.onMiss).toBe("half");
    const miss = setAttackOutcome(initialTrayRow(p, FOE), "miss", p);
    expect(miss.multiplier).toBe("0.5");
    expect(rowAmount(9, miss, p)).toBe(4);
  });

  it("a miss lands no hit-gated rider (Topple's Prone)", () => {
    const topple = weaponCards.find((a) => a.summary.masteryDetail?.toppleDc);
    if (!topple) throw new Error("no Topple weapon");
    const p = plan(topple);
    const row = toggleCondition(initialTrayRow(p, FOE), "prone", p);
    expect(rowConditions(row)).toEqual(["prone"]);
    expect(rowConditions(setAttackOutcome(row, "miss", p))).toEqual([]);
  });

  it("an attack with nothing else to apply still asks its result (Ray of Enfeeblement)", () => {
    const p = plan(action("spell-ray-of-enfeeblement"));
    expect(p).toMatchObject({ effect: null, targets: [FOE] });
    expect(p.attack).toBeDefined();
    expect(damageTrayPlan(action("spell-ray-of-enfeeblement"), [], ME)).toBeNull();
  });

  it("the rows become per-target outcome receipts and one shared result", () => {
    const p = plan(action("spell-scorching-ray"), ["monster-1", "monster-2"]);
    const hit = initialTrayRow(p, "monster-1");
    const crit = setAttackOutcome(initialTrayRow(p, "monster-2"), "critical", p);
    expect(sharedAttackOutcome([hit, crit])).toBeUndefined();
    expect(sharedAttackOutcome([crit])).toBe("critical");
    expect(
      trayOutcomeReceipts("turn:outcome:1:x", "spell-scorching-ray", [hit, crit]).map(
        (r) => [r.target.combatantId, r.fact]
      )
    ).toEqual([
      ["monster-1", { kind: "attack", result: "hit" }],
      ["monster-2", { kind: "attack", result: "critical-hit" }],
    ]);
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

describe("one total per target when each target took its own share", () => {
  // Magic Missile's darts, Scorching Ray's rays: the spell's own data says it makes
  // several separate instances, not one area roll.
  const split = catalogue.filter((a) => {
    const spec = combatResolutionSpec(a);
    return spec.hasDamage && !spec.area && (a.summary.instances ?? 1) > 1;
  });
  const areas = catalogue.filter(
    (a) => combatResolutionSpec(a).hasDamage && combatResolutionSpec(a).area
  );

  it("the catalogue holds both shapes", () => {
    expect(split.map((a) => a.spellId)).toContain("magic-missile");
    expect(areas.map((a) => a.spellId)).toContain("fireball");
  });

  it("split across two targets, every row asks its own total", () => {
    for (const a of split) expect(plan(a, FOES.slice(0, 2)).perTarget, a.id).toBe(true);
  });

  it("all on one target, the one shared total is enough", () => {
    for (const a of split) expect(plan(a, [FOE]).perTarget, a.id).toBeUndefined();
  });

  it("an area deals one roll to everyone in it: one shared total", () => {
    for (const a of areas) expect(plan(a, FOES).perTarget, a.id).toBeUndefined();
  });
});
