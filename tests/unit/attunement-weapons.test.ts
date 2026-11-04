/**
 * One attunement model across equipment and weapons: a magic weapon that requires
 * attunement (a Flame Tongue, a Holy Avenger) counts toward the three, is guarded the
 * same way, and its enchant applies only while attuned.
 */
import { describe, expect, it } from "vitest";
import {
  attunables,
  attunedCount,
  attuneItem,
  canAttune,
  unattuneItem,
  weaponAttunementKey,
} from "@/lib/attunement-guard";
import { resolveActions } from "@/lib/smart-tracker";
import type { CharacterDoc, SrdEquipmentRef, SrdWeaponRef } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const item = (srdId: string, instanceId: string, attuned?: boolean): SrdEquipmentRef => ({
  srdId,
  instanceId,
  quantity: 1,
  equipped: true,
  ...(attuned === undefined ? {} : { attuned }),
});

const sword = (enchantItemId: string, attuned?: boolean): SrdWeaponRef => ({
  srdId: "longsword",
  quantity: 1,
  enchantItemId,
  ...(attuned === undefined ? {} : { attuned }),
});

function withWeapons(
  weapons: SrdWeaponRef[],
  equipment: SrdEquipmentRef[] = []
): CharacterDoc {
  return makeCharacterDoc({ classId: "fighter", level: 5, weapons, equipment });
}

describe("attuning a magic weapon", () => {
  it("counts toward the three with the equipment", () => {
    const doc = withWeapons(
      [sword("flame-tongue", true)],
      [
        item("cloak-of-protection", "cloak", true),
        item("amulet-of-health", "amulet", true),
      ]
    );
    expect(attunedCount(doc)).toBe(3);
    const ring = withWeapons(
      [sword("flame-tongue", true)],
      [
        item("cloak-of-protection", "cloak", true),
        item("amulet-of-health", "amulet", true),
        item("ring-of-protection", "ring", false),
      ]
    );
    expect(canAttune(ring, "ring")).toMatchObject({
      ok: false,
      reason: "attunement-limit",
    });
  });

  it("is addressed by its weapon key, attunes and ends", () => {
    const doc = withWeapons([sword("flame-tongue", false)]);
    const key = weaponAttunementKey(0);
    expect(attunables(doc).map((a) => a.key)).toEqual([key]);
    const on = attuneItem(doc, key);
    expect(on.ok && on.weapons[0]).toMatchObject({ attuned: true });
    const off = unattuneItem(doc, key);
    expect(off.ok && off.weapons[0]).toMatchObject({ attuned: false });
  });

  it("checks the item's prerequisite (Holy Avenger: a Paladin)", () => {
    const doc = withWeapons([sword("holy-avenger", false)]);
    expect(canAttune(doc, weaponAttunementKey(0))).toMatchObject({
      ok: false,
      reason: "prerequisite",
    });
  });

  it("a weapon enchanted before attunement was tracked still plays as attuned", () => {
    const doc = withWeapons([sword("weapon-plus-1"), sword("flame-tongue")]);
    expect(attunables(doc)).toEqual([
      { key: weaponAttunementKey(1), itemId: "flame-tongue", attuned: true },
    ]);
  });

  it("an enchant that requires attunement applies only while attuned", () => {
    const plus3 = (attuned?: boolean) =>
      withWeapons([{ ...sword("holy-avenger", attuned), srdId: "longsword" }]);
    const bonus = (doc: CharacterDoc) =>
      resolveActions(doc, "combat").find((a) => a.id === "weapon-longsword")?.summary
        .attackBonus;
    const attuned = bonus(plus3(true));
    const not = bonus(plus3(false));
    expect(attuned !== undefined && not !== undefined && attuned - not).toBe(3);
  });
});
