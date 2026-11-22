/**
 * The homebrew item form's effects (step 1, coordinator 2026-11-12; pattern source:
 * D&D Beyond's homebrew magic item form, its "Requires Attunement", +N "Bonus / Magic"
 * modifier, "Has Charges" with a reset condition and rarity): read from and written
 * into the item's `mechanics` in the catalogue magic item's own shape, so the engine
 * plays them as it plays a +1 Longsword or a Wand of Binding. Fields the form doesn't
 * show are kept.
 */
import { describe, expect, it } from "vitest";

import type { HomebrewItemMechanics } from "@/data/types";
import { effectiveAC } from "@/lib/aggregate-character";
import type { CustomEquipment } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";
import {
  parseChargeReturn,
  readItemEffects,
  writeItemEffects,
} from "@/lib/homebrew-item-effects";

describe("the charges that come back, as typed", () => {
  it("empty or «tutte» is all of them; a number is that many; a roll is entered at the table", () => {
    expect(parseChargeReturn("")).toEqual({ kind: "full" });
    expect(parseChargeReturn("tutte")).toEqual({ kind: "full" });
    expect(parseChargeReturn("all")).toEqual({ kind: "full" });
    expect(parseChargeReturn("3")).toEqual({ kind: "fixed", amount: 3 });
    expect(parseChargeReturn("1d6+1")).toEqual({
      kind: "entered-roll",
      roll: { dice: 1, sides: 6, modifier: 1 },
    });
    expect(parseChargeReturn("2d4")).toEqual({
      kind: "entered-roll",
      roll: { dice: 2, sides: 4 },
    });
    expect(parseChargeReturn("lots")).toBeNull();
  });
});

describe("writing the effects in the catalogue's shape", () => {
  it("a +1 weapon that needs attunement", () => {
    expect(
      writeItemEffects(undefined, "weapon", {
        attunement: true,
        magicBonus: 1,
      })
    ).toEqual({
      attunement: true,
      grants: [
        { type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 1 },
      ],
    });
  });

  it("a +2 armour or shield adds to AC", () => {
    expect(writeItemEffects(undefined, "armor", { magicBonus: 2 })).toEqual({
      grants: [{ type: "ac-bonus", amount: 2 }],
    });
  });

  it("a 3-charge item back at dawn, 1d3 of them; and rarity", () => {
    expect(
      writeItemEffects(undefined, "item", {
        rarity: "uncommon",
        charges: { max: 3, recovery: "dawn", returns: "1d3" },
      })
    ).toEqual({
      rarity: "uncommon",
      resources: [
        {
          kind: "counter",
          id: "charges",
          unit: "charges",
          capacity: { kind: "fixed", amount: 3 },
          initial: { kind: "full" },
          recoveries: [
            {
              trigger: { kind: "dawn" },
              amount: { kind: "entered-roll", roll: { dice: 1, sides: 3 } },
            },
          ],
        },
      ],
    });
  });

  it("charges that never come back have no recovery", () => {
    const written = writeItemEffects(undefined, "item", {
      charges: { max: 5, recovery: "none", returns: "" },
    });
    expect(written?.resources?.[0]).not.toHaveProperty("recoveries");
  });

  it("no effect at all: no mechanics, the text-only item of today", () => {
    expect(writeItemEffects(undefined, "item", {})).toBeUndefined();
  });

  it("keeps what the form doesn't show: other grants, other resources, spells", () => {
    const before = {
      attunement: true,
      grants: [
        { type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 1 },
        { type: "resistance", damageType: "fire" },
      ],
      resources: [
        {
          kind: "counter",
          id: "charges",
          unit: "charges",
          capacity: { kind: "fixed", amount: 3 },
          initial: { kind: "full" },
        },
        {
          kind: "counter",
          id: "other",
          unit: "uses",
          capacity: { kind: "fixed", amount: 1 },
          initial: { kind: "full" },
        },
      ],
      spells: [{ spellId: "fireball" }],
    } as unknown as HomebrewItemMechanics;
    const after = writeItemEffects(before, "weapon", { magicBonus: 2 });
    expect(after).toEqual({
      grants: [
        { type: "resistance", damageType: "fire" },
        { type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 2 },
      ],
      resources: [before.resources?.[1]],
      spells: [{ spellId: "fireball" }],
    });
  });
});

describe("reading them back for an edit", () => {
  it("opens with the current values", () => {
    const mechanics = writeItemEffects(undefined, "weapon", {
      attunement: true,
      magicBonus: 3,
      rarity: "very-rare",
      charges: { max: 7, recovery: "long-rest", returns: "1d6+1" },
    });
    expect(readItemEffects(mechanics)).toEqual({
      attunement: true,
      magicBonus: 3,
      rarity: "very-rare",
      charges: { max: 7, recovery: "long-rest", returns: "1d6+1" },
    });
    expect(readItemEffects(undefined)).toEqual({});
  });

  it("all charges back reads as an empty «how many»; a fixed number as itself", () => {
    const full = writeItemEffects(undefined, "item", {
      charges: { max: 2, recovery: "short-rest", returns: "" },
    });
    expect(readItemEffects(full).charges).toEqual({
      max: 2,
      recovery: "short-rest",
      returns: "",
    });
    const fixed = writeItemEffects(undefined, "item", {
      charges: { max: 2, recovery: "dawn", returns: "1" },
    });
    expect(readItemEffects(fixed).charges?.returns).toBe("1");
  });
});

describe("the engine plays what the form writes", () => {
  it("a homebrew medium armour 14 +1, worn: 14 + DEX (max 2) + 1, the #1125 rule kept", () => {
    const armour: CustomEquipment = {
      custom: true,
      name: "Elven Scale",
      equipped: true,
      quantity: 1,
      armorCategory: "medium",
      ac: { base: 14, dexBonus: true, maxDex: 2 },
      instanceId: customInstanceId("Elven Scale"),
      mechanics: writeItemEffects(undefined, "armor", { magicBonus: 1 }),
    };
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 3,
      abilityScores: { STR: 14, DEX: 16, CON: 14, INT: 10, WIS: 10, CHA: 8 },
      equipment: [armour],
    });
    expect(effectiveAC(doc.character, doc.session)).toBe(14 + 2 + 1);
    const plain = makeCharacterDoc({
      classId: "fighter",
      level: 3,
      abilityScores: { STR: 14, DEX: 16, CON: 14, INT: 10, WIS: 10, CHA: 8 },
      equipment: [{ ...armour, mechanics: undefined }],
    });
    expect(effectiveAC(plain.character, plain.session)).toBe(14 + 2);
  });
});
