/**
 * Magic-weapon +N parity with the catalogue text. Every SRD magic item whose
 * English description grants "+N (bonus) to attack (rolls) and/ /damage (rolls)"
 * — the weapon's own enchant — declares an `item-bound-bonus` grant of N, so the
 * inventory enchant binding folds it into that weapon's to-hit and damage
 * (no hand-edited override). Conversely, no item declares a bonus its text lacks.
 *
 * The cases come from `src/i18n/en/srd/magic-items.json`, never a hand list.
 * "+1 bonus to the attack and damage rolls of your Unarmed Strikes" (Demon
 * Armor) is deliberately not matched: it is not a weapon enchant.
 */
import { describe, expect, it } from "vitest";
import { getMagicItem } from "@/data/magic-items";
import { resolveItemBoundWeaponBonus } from "@/lib/compute";
import en from "@/i18n/en/srd/magic-items.json";

const WEAPON_BONUS =
  /\+(\d) (?:bonus )?to attack(?: rolls)?(?: and |\/)damage(?: rolls)?/i;

const texts = Object.entries(en as Record<string, { description?: string }>);

const expected = texts.flatMap(([id, entry]) => {
  const m = WEAPON_BONUS.exec(entry.description ?? "");
  return m ? [[id, Number(m[1])] as const] : [];
});

describe("magic weapon +N matches its catalogue text", () => {
  it("finds the printed weapon bonuses", () => {
    expect(expected.length).toBeGreaterThan(20);
  });

  it.each(expected)("%s declares an item-bound +%i", (id, amount) => {
    expect(resolveItemBoundWeaponBonus(getMagicItem(id)?.grants)).toBe(amount);
  });

  it("no item declares an item-bound bonus its text does not print", () => {
    const printed = new Set(expected.map(([id]) => id));
    const extra = texts
      .map(([id]) => id)
      .filter((id) => resolveItemBoundWeaponBonus(getMagicItem(id)?.grants) !== 0)
      .filter((id) => !printed.has(id));
    expect(extra).toEqual([]);
  });
});
