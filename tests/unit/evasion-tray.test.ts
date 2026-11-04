/**
 * Evasion through the real path (edge-case M1): the rogue's sheet defenses carry
 * the DEX save rule, the damage tray reads it, and Incapacitated switches it off.
 */
import { describe, expect, it } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  initialTrayRow,
  rowAmount,
  toggleSaved,
  type DamageTrayPlan,
} from "@/lib/play/damage-tray";
import { deriveDamageDefenses } from "@/lib/views/sheet-view";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const plan = (ability: string): DamageTrayPlan =>
  ({
    effect: "damage",
    damageType: "fire",
    save: { ability, dc: 15, onSave: "half" },
  }) as DamageTrayPlan;

function defensesOf(doc: CharacterDoc) {
  const agg = aggregateCharacterGrants(doc.character, doc.session);
  return deriveDamageDefenses(agg, {}, undefined, 3, false, agg.conditions);
}

const rogue = (conditions: string[] = []) =>
  makeCharacterDoc(
    { classId: "rogue", level: 7, features: [{ srdId: "rogue-evasion" }] },
    { conditions }
  );

describe("Evasion in the damage tray", () => {
  it("a saved DEX half-damage area deals nothing, a failed one half", () => {
    const row = initialTrayRow(plan("DEX"), "pc-rogue", defensesOf(rogue()));
    expect(row.evades).toBe(true);
    expect(rowAmount(20, row, plan("DEX"))).toBe(10);
    expect(rowAmount(20, toggleSaved(row, plan("DEX")), plan("DEX"))).toBe(0);
  });

  it("only for its own save", () => {
    const row = initialTrayRow(plan("CON"), "pc-rogue", defensesOf(rogue()));
    expect(row.evades).toBeUndefined();
    expect(rowAmount(20, row, plan("CON"))).toBe(20);
  });

  it("not while Incapacitated", () => {
    const row = initialTrayRow(
      plan("DEX"),
      "pc-rogue",
      defensesOf(rogue(["incapacitated"]))
    );
    expect(row.evades).toBeUndefined();
  });
});
