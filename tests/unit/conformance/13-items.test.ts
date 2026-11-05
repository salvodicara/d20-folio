/** Conformance, category 13: items, attunement, charges, curses, artifacts (corpus.md § 13). */
import {
  mixingOutcome,
  potionMixingOffer,
  type MixingTable,
} from "@/lib/play/potion-mixing";
import { passTime } from "@/lib/play/time";
import { describe, expect } from "vitest";
import { canAttune, unattuneItem } from "@/lib/attunement-guard";
import { applyCastSourceOverrides } from "@/lib/cast-source-profile";
import { computeAC } from "@/lib/compute";
import { consumableActionSlot, resolveItemConsumable } from "@/lib/srd-resolve";
import { equipmentAfterDawn, equipmentAfterLongRest } from "@/lib/smart-tracker";
import { getMagicItem } from "@/data/magic-items";
import { getEquipment } from "@/data/equipment";
import { getSpellById } from "@/data/spells";
import type { CustomEquipment, SrdEquipmentRef } from "@/types/character";
import { customInstanceId } from "../__helpers__/custom-items";
import { makeCharacterDoc } from "../_helpers";
import { rule } from "./rule";

const SCORES = { STR: 10, DEX: 14, CON: 10, INT: 10, WIS: 10, CHA: 10 };

const item = (srdId: string, instanceId: string, attuned?: boolean): SrdEquipmentRef => ({
  srdId,
  instanceId,
  quantity: 1,
  equipped: true,
  ...(attuned === undefined ? {} : { attuned }),
});

/** A module the mechanism will add; importing it fails until it exists. */
async function future(
  id: string
): Promise<Record<string, (...args: never[]) => unknown>> {
  return (await import(/* @vite-ignore */ id)) as Record<
    string,
    (...args: never[]) => unknown
  >;
}

describe("conformance · 13. items", () => {
  rule(
    {
      category: 13,
      case: "Attunement limits and duplicates",
      source: "SAC #159",
      status: "works",
    },
    () => {
      const doc = makeCharacterDoc({
        equipment: [
          item("cloak-of-protection", "cloak", true),
          item("amulet-of-health", "amulet", true),
          item("ring-of-protection", "ring-1", true),
          item("ring-of-protection", "ring-2", false),
          item("gauntlets-of-ogre-power", "gauntlets", false),
        ],
      });
      // Never two copies of the same item, and never a fourth.
      expect(canAttune(doc, "ring-2")).toMatchObject({
        ok: false,
        reason: "duplicate-copy",
      });
      expect(canAttune(doc, "gauntlets")).toMatchObject({
        ok: false,
        reason: "attunement-limit",
        limit: 3,
      });
    }
  );

  rule(
    {
      category: 13,
      case: "Attunement class requirements",
      source: "ITEMS",
      status: "works",
    },
    () => {
      // A Wand of Fireballs requires attunement by a spellcaster; a Fighter 5
      // casts no spells of their own.
      const doc = makeCharacterDoc({
        classId: "fighter",
        level: 5,
        equipment: [item("wand-of-fireballs", "wand", false)],
      });
      expect(canAttune(doc, "wand").ok).toBe(false);
    }
  );

  rule(
    {
      category: 13,
      case: "Cursed attunement",
      source: "ITEMS; rpgbot",
      status: "works",
    },
    () => {
      // Armor of Vulnerability is cursed: you can't end its attunement voluntarily
      // until the curse is broken.
      const doc = makeCharacterDoc({
        equipment: [item("armor-of-vulnerability", "armor", true)],
      });
      expect(unattuneItem(doc, "armor").ok).toBe(false);
    }
  );

  rule(
    {
      category: 13,
      case: "Identify shows charges but not curses",
      source: "ITEMS",
      status: "M20",
    },
    async () => {
      // Charges are open information on the item ...
      expect(getMagicItem("wand-of-fireballs")?.resources?.[0]).toMatchObject({
        id: "charges",
        capacity: { kind: "fixed", amount: 7 },
      });
      // ... while a curse shows only where the item says Identify reveals it (Armor of
      // Vulnerability: "revealed only when the Identify spell is cast on the armor or
      // you attune to it"); a Berserker Axe's stays hidden. Whether THIS copy is cursed
      // is the DM's state: the case works once the DM can reveal it.
      expect(getMagicItem("armor-of-vulnerability")?.curse?.revealedByIdentify).toBe(
        true
      );
      expect(getMagicItem("berserker-axe")?.curse?.revealedByIdentify).toBeUndefined();
      const id = "@/lib/item-overlays";
      const overlays = (await import(/* @vite-ignore */ id)) as Record<string, unknown>;
      expect(typeof overlays.revealCurse).toBe("function");
    }
  );

  rule(
    {
      category: 13,
      case: "Dawn recharge and destruction",
      source: "ITEMS",
      status: "works",
    },
    () => {
      // The last charge rolls a d20: on a 1 the wand is destroyed.
      const wand = getMagicItem("wand-of-fireballs")?.resources?.[0];
      expect(wand && "onEmpty" in wand ? wand.onEmpty : undefined).toMatchObject({
        kind: "entered-d20",
        bands: [{ min: 1, max: 1, outcomes: [{ disposition: "destroyed" }] }, {}],
      });
      // Charges come back at dawn, its own clock event (or when the DM says on a
      // plane with no dawn), not because a rest finished.
      const dawnItem: CustomEquipment = {
        custom: true,
        name: "Dawn Rod",
        quantity: 1,
        equipped: true,
        instanceId: customInstanceId("Dawn Rod"),
        charges: { current: 0, max: 7, recovery: "dawn" },
      };
      expect(equipmentAfterLongRest([dawnItem])[0]).toEqual(dawnItem);
      expect(equipmentAfterDawn([dawnItem])[0]?.charges?.current).toBe(7);
      // Eight hours from 22:00 cross dawn: the clock refills it (M18 clock, step 2).
      const night = makeCharacterDoc({ equipment: [dawnItem] }, { timeOfDay: 22 * 60 });
      const morning = passTime(night, 8 * 60);
      expect(morning?.character.equipment[0]?.charges?.current).toBe(7);
    }
  );

  rule(
    {
      category: 13,
      case: "Command words and Silence",
      source: "ITEMS",
      status: "works",
    },
    async () => {
      // Inside Silence nothing can be spoken, so no command word can be heard.
      const silence = getSpellById("silence");
      expect(JSON.stringify(silence?.grants)).toContain('"no-speech"');
      expect(getMagicItem("carpet-of-flying")?.commandWord).toBe(true);
      const speech = await import("@/lib/play/speech");
      const inside = makeCharacterDoc(
        {},
        {
          encounterEffects: [
            {
              id: "silence-1",
              actor: { kind: "monster", combatantId: "caster" },
              target: {
                kind: "pc",
                combatantId: "pc-me",
                memberUid: "me",
                characterId: "test-char",
              },
              source: { kind: "spell", id: "silence", actionId: "spell-silence" },
              payload: { kind: "grant-group", activeKey: "spell-silence" },
              duration: { kind: "concentration", actorId: "caster", sourceId: "silence" },
            },
          ],
        }
      );
      expect(speech.commandWordBlocked(inside, "carpet-of-flying")).toBe(true);
    }
  );

  rule(
    {
      category: 13,
      case: "Spells from items",
      source: "ITEMS; SAC #155",
      status: "works",
    },
    () => {
      // The item's own DC replaces the caster's; Concentration stays the spell's.
      expect(
        applyCastSourceOverrides({ saveDC: 17, concentration: false }, { saveDC: 15 })
      ).toEqual({ saveDC: 15, concentration: false });
      expect(
        applyCastSourceOverrides({ saveDC: 17, concentration: true }, { saveDC: 13 })
      ).toEqual({ saveDC: 13, concentration: true });
    }
  );

  rule(
    {
      category: 13,
      case: "Potions are a Bonus Action",
      source: "SAC #156; SAC #157; arcaneeye",
      status: "works",
    },
    () => {
      const potion = resolveItemConsumable(item("potion-of-healing", "potion"));
      expect(consumableActionSlot(potion)).toBe("bonus");
    }
  );

  rule(
    { category: 13, case: "Mixing potions", source: "ITEMS", status: "M18" },
    async () => {
      // Drinking a second potion while one is running calls for a d100 roll on the
      // DM's table: the sheet offers it, naming both potions.
      const doc = makeCharacterDoc(
        {
          equipment: [
            { srdId: "potion-of-flying", quantity: 1 },
            { srdId: "potion-of-hill-giant-strength", quantity: 1 },
          ],
        },
        { activeFeatures: ["potion:potion-of-flying"] }
      );
      expect(potionMixingOffer(doc, "potion-of-hill-giant-strength")?.running).toEqual([
        "potion-of-flying",
      ]);
      // The case works once the table is data (the DMG's, source still missing).
      const id = "@/data/potion-mixing";
      const data = (await import(/* @vite-ignore */ id)) as Record<string, unknown>;
      expect(mixingOutcome(1, data.POTION_MIXING_TABLE as MixingTable)).not.toBeNull();
    }
  );

  rule(
    { category: 13, case: "Sentient item conflict", source: "ITEMS", status: "M20" },
    async () => {
      // The bearer saves against 12 + the item's Charisma modifier (CHA 16 → DC 15).
      const overlays = await future("@/lib/item-overlays");
      expect(
        (overlays.sentientConflictDc as (item: { charisma: number }) => number)({
          charisma: 16,
        })
      ).toBe(15);
      // Engine-ready, needs a caller: the case works once a sentient item's card
      // offers the conflict save (its catalogue stat block, M20 order step 2).
      const view = await future("@/lib/views/sentient-item-view");
      expect(view.sentientConflictOffer).toBeTypeOf("function");
    }
  );

  rule({ category: 13, case: "Artifacts", source: "ITEMS", status: "M20" }, async () => {
    // An artifact's random properties are rolled per instance and kept.
    const overlays = await future("@/lib/item-overlays");
    expect(overlays.rolledProperties).toBeTypeOf("function");
  });

  rule(
    { category: 13, case: "Magic items resist damage", source: "ITEMS", status: "M20" },
    async () => {
      // A magic item (not a potion or scroll) has Resistance to all damage: 10 → 5.
      const overlays = await future("@/lib/item-overlays");
      const damageToItem = overlays.damageToItem as (
        itemId: string,
        amount: number
      ) => number;
      expect(damageToItem("cloak-of-protection", 10)).toBe(5);
      expect(damageToItem("potion-of-healing", 10)).toBe(10);
      // Engine-ready, needs a caller: the case works once the tray can name an item
      // as a target (as for objects in the area).
      const tray = await future("@/lib/play/object-targets");
      expect(tray.objectTrayTarget).toBeTypeOf("function");
    }
  );

  rule(
    {
      category: 13,
      case: "Shields must be donned",
      source: "SAC #163; SAC #89; ERRATA; KIBBLES #6",
      status: "works",
    },
    () => {
      const shield = (equipped: boolean): SrdEquipmentRef => ({
        srdId: "shield",
        instanceId: "shield",
        quantity: 1,
        equipped,
      });
      // 10 + DEX 2, +2 only while the shield is donned.
      expect(computeAC([shield(true)], SCORES, getEquipment)).toBe(14);
      expect(computeAC([shield(false)], SCORES, getEquipment)).toBe(12);
    }
  );

  rule(
    {
      category: 13,
      case: "Magic ranged weapon, plain ammunition",
      source: "SAC #160; SAC #161",
      status: "works",
    },
    () => {
      // The +1 belongs to the weapon's own attack row, whatever ammunition it fires.
      expect(getMagicItem("weapon-plus-1")?.grants).toEqual([
        { type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 1 },
      ]);
    }
  );

  rule(
    {
      category: 13,
      case: "Ammunition and Loading",
      source: "KIBBLES #9; rpgbot",
      status: "works",
    },
    async () => {
      // After the fight, half the spent ammunition (rounded down) is recovered.
      const ammo = await future("@/lib/play/ammunition");
      expect((ammo.recoveredAmmunition as (spent: number) => number)(7)).toBe(3);
    }
  );

  rule(
    {
      category: 13,
      case: "Paired and worn items",
      source: "ITEMS; WIKI druid:main",
      status: "works",
    },
    () => {
      // Only a worn item works: the equip flag is the DM's ruling on whether it fits.
      const ring = (equipped: boolean): CustomEquipment => ({
        custom: true,
        name: "Ring of Warding",
        quantity: 1,
        equipped,
        acBonus: 1,
        instanceId: customInstanceId("Ring of Warding"),
      });
      expect(computeAC([ring(true)], SCORES, getEquipment)).toBe(13);
      expect(computeAC([ring(false)], SCORES, getEquipment)).toBe(12);
    }
  );

  rule(
    {
      category: 13,
      case: "Sphere of Annihilation and Tiny Hut",
      source: "SAC #162",
      status: "works",
    },
    () => {
      // Both are catalogue entries; their interaction is reference text.
      expect(getMagicItem("sphere-of-annihilation")).toBeDefined();
      expect(getSpellById("leomunds-tiny-hut")).toBeDefined();
    }
  );

  rule(
    {
      category: 13,
      case: "Evolving magic items (optional rule)",
      source: "WIKI evolving-magic-items",
      status: "M20",
    },
    async () => {
      // An evolving item unlocks properties per instance as its owner progresses.
      const overlays = await future("@/lib/item-overlays");
      expect(overlays.unlockedProperties).toBeTypeOf("function");
    }
  );
});
