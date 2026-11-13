/**
 * A damage of ONE type the player picks (Chromatic Orb: Acid, Cold, Fire, Lightning,
 * Poison or Thunder; a Monk's Empowered Strikes: Bludgeoning or Force) is one number
 * of one type, not one total per listed type: the tray asks one total and lets the
 * player pick the type, which decides each target's defense. Typing two totals once
 * doubled the damage.
 */
import { describe, expect, it } from "vitest";
import { resolveActions, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import {
  damageTrayPlan,
  initialTrayRow,
  rowAmount,
  withDamageTypeChoice,
} from "@/lib/play/damage-tray";
import { totalsByType } from "@/domains/play/tray-form";
import { NO_DEFENSES, type DamageDefenses } from "@/lib/damage-intake";
import { makeCharacterDoc } from "./_helpers";

const ME = "pc-me";
const FOE = "monster-1";

function actionOf(doc: ReturnType<typeof makeCharacterDoc>, id: string): ResolvedAction {
  const row = resolveActions(doc, "spellbook").find((a) => a.id === id);
  if (!row) throw new Error(`no action ${id}`);
  return localizeAction(row, "en");
}

const wizard = makeCharacterDoc({
  classes: [{ classId: "wizard", level: 3 }],
  spells: [{ srdId: "chromatic-orb" }],
});
const monk = makeCharacterDoc({
  classes: [{ classId: "monk", level: 6 }],
  features: [{ srdId: "monk-empowered-strikes" }],
});
const unarmed = () => {
  const row = resolveActions(monk, "spellbook").find(
    (a) =>
      a.summary.multiDamageTypeFlavor === "choice" &&
      a.summary.damageTypes?.includes("force")
  );
  if (!row) throw new Error("no Unarmed Strike with the Force choice");
  return localizeAction(row, "en");
};

describe("a damage type the player picks", () => {
  it.each([
    ["Chromatic Orb", () => actionOf(wizard, "spell-chromatic-orb")],
    ["Empowered Strikes", unarmed],
  ] as const)("%s: one total, a type to pick, the first by default", (_name, make) => {
    const plan = damageTrayPlan(make(), [FOE], ME);
    if (!plan) throw new Error("no tray");
    expect(totalsByType(plan)).toEqual([]);
    expect(plan.damageTypes).toBeUndefined();
    expect(plan.damageTypeChoices?.length).toBeGreaterThan(1);
    expect(plan.damageType).toBe(plan.damageTypeChoices?.[0]);
  });

  it("the picked type decides the target's defense (Force against a Bludgeoning resistance)", () => {
    const plan = damageTrayPlan(unarmed(), [FOE], ME);
    if (!plan) throw new Error("no tray");
    const resistsBludgeoning: DamageDefenses = {
      ...NO_DEFENSES,
      resistances: new Set(["bludgeoning"] as const),
    };
    const asBludgeoning = initialTrayRow(plan, FOE, resistsBludgeoning);
    expect(rowAmount(10, asBludgeoning, plan)).toBe(5);
    const force = withDamageTypeChoice(plan, "force");
    expect(force.damageType).toBe("force");
    expect(rowAmount(10, initialTrayRow(force, FOE, resistsBludgeoning), force)).toBe(10);
    // a type outside the choices is refused: the plan stays as it was
    expect(withDamageTypeChoice(plan, "fire")).toBe(plan);
  });
});
