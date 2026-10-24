/**
 * A homebrew weapon or item that declares structured mechanics
 * (`CustomWeapon.mechanics` / `CustomEquipment.mechanics`, the catalogue magic
 * item's own shape) plays through the SAME paths as a catalogue magic item: its
 * +N on its own weapon row, its grants while worn and attuned, its typed charges
 * spent by the same controller and recovered at dawn by the same boundary, and the
 * spell cast from them through the same cast-source list.
 *
 * Cases mirror real catalogue items so the two can be compared on one character:
 * a +1 Weapon, a Wand of Magic Missiles, a Ring of Resistance that needs
 * attunement.
 */
import { isDeepStrictEqual } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import type { HomebrewItemMechanics, SrdMagicItemData } from "@/data/types";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import {
  HOMEBREW_ITEM_FIELD_SCHEMAS,
  homebrewItemData,
  homebrewItemMechanics,
} from "@/lib/homebrew-items";
import { canSpendCopy } from "@/lib/item-copies";
import { itemResourceSpend } from "@/lib/item-resource-commands";
import { prepareItemResourceBoundary } from "@/lib/item-resource-boundaries";
import { createItemResourceCommands } from "@/lib/item-resource-controller";
import { migrateLegacyItemResources, resolveItemResources } from "@/lib/item-resources";
import { parseLibraryEntries } from "@/lib/library-codec";
import { toLibraryEntry } from "@/lib/library";
import { makeItemResourceIdentity } from "@/lib/resources";
import { resolveActions } from "@/lib/smart-tracker";
import { castWeaponBinding } from "@/lib/weapon-binding";
import { freeCastSourcesForSpell } from "@/lib/views/spell-cast-sources";
import { getSpellById } from "@/data/spells";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc, CustomEquipment, CustomWeapon } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

function homebrewWeapon(over: Partial<CustomWeapon> = {}): CustomWeapon {
  return {
    custom: true,
    name: "Moon Blade",
    quantity: 1,
    damageDie: "1d8",
    damageType: "slashing",
    attackStat: "STR",
    properties: "Versatile",
    instanceId: customInstanceId(over.name ?? "Moon Blade"),
    ...over,
  };
}

function homebrewItem(over: Partial<CustomEquipment> = {}): CustomEquipment {
  return {
    custom: true,
    name: "Ember Wand",
    equipped: true,
    quantity: 1,
    instanceId: customInstanceId(over.name ?? "Ember Wand"),
    ...over,
  };
}

/** A +1 Weapon of the player's own: +1 to attack and damage with THIS weapon. */
const MOON_BLADE = homebrewWeapon({
  mechanics: {
    rarity: "uncommon",
    grants: [{ type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 1 }],
  },
});
/** The same weapon, mundane — the comparison row. */
const PLAIN_BLADE = homebrewWeapon({ name: "Plain Blade" });

/** A Wand of Magic Missiles of the player's own: 7 charges, 1d6+1 back at dawn. */
const EMBER_WAND = homebrewItem({
  mechanics: {
    rarity: "uncommon",
    type: "wand",
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 7 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: { kind: "entered-roll", roll: { dice: 1, sides: 6, modifier: 1 } },
          },
        ],
      },
    ],
    grants: [
      { type: "always-prepared-spell", spellId: "magic-missile" },
      {
        type: "free-cast-spell",
        spellId: "magic-missile",
        resourceCost: { resourceId: "charges" },
        castLevels: [
          { level: 1, cost: 1 },
          { level: 2, cost: 2 },
          { level: 3, cost: 3 },
        ],
      },
    ],
  },
});

/** A Ring of Fire Resistance that needs attunement. */
function emberRing(attuned?: boolean): CustomEquipment {
  return homebrewItem({
    name: "Ember Ring",
    ...(attuned !== undefined ? { attuned } : {}),
    mechanics: {
      type: "ring",
      attunement: true,
      grants: [{ type: "damage-resistance", damageType: "fire" }],
    },
  });
}

function fighter(over: Partial<CharacterDoc["character"]> = {}): CharacterDoc {
  return makeCharacterDoc({
    classId: "fighter",
    level: 3,
    abilityScores: { STR: 16, DEX: 12, CON: 14, INT: 10, WIS: 10, CHA: 8 },
    weapons: [],
    equipment: [],
    ...over,
  });
}

function weaponRow(doc: CharacterDoc, name: string) {
  const found = resolveActions(doc).find(
    (a) => a.source === "weapon" && isDeepStrictEqual(a.name, { custom: name })
  );
  if (!found) throw new Error(`no ${name} row`);
  return found.summary;
}

const resists = (doc: CharacterDoc) =>
  aggregateCharacterGrants(doc.character, doc.session).damageResistances.has("fire");

describe("a homebrew +1 weapon", () => {
  const doc = fighter({ weapons: [MOON_BLADE, PLAIN_BLADE] });

  it("adds +1 to attack and damage on its own row only", () => {
    const magic = weaponRow(doc, "Moon Blade");
    const plain = weaponRow(doc, "Plain Blade");
    expect(magic.attackBonus).toBe((plain.attackBonus ?? 0) + 1);
    expect(plain.damage).toBe("1d8+3");
    expect(magic.damage).toBe("1d8+4");
  });

  it("is a magic weapon: Magic Weapon refuses it, as it refuses a bound enchant", () => {
    const magicWeapon = getSpellById("magic-weapon");
    if (!magicWeapon) throw new Error("no magic-weapon");
    const on = (instanceId: string) =>
      castWeaponBinding(
        { spell: magicWeapon, weapon: { kind: "custom", instanceId } },
        doc
      );
    expect(on(MOON_BLADE.instanceId)).toEqual({ ok: false, reason: "magical-weapon" });
    expect(on(PLAIN_BLADE.instanceId).ok).toBe(true);
  });

  it("its own extra damage rides its row only", () => {
    const flaming = homebrewWeapon({
      name: "Ash Edge",
      mechanics: {
        grants: [{ type: "item-bound-damage-rider", dice: "1d6", damageType: "fire" }],
      },
    });
    const withRider = fighter({ weapons: [flaming, PLAIN_BLADE] });
    expect(weaponRow(withRider, "Ash Edge").extraDamage).toEqual([
      expect.objectContaining({
        dice: "1d6",
        damageType: "fire",
        source: { custom: "Ash Edge" },
      }),
    ]);
    expect(weaponRow(withRider, "Plain Blade").extraDamage ?? []).toEqual([]);
  });
});

describe("a homebrew ring that needs attunement", () => {
  it("grants its resistance only while worn AND attuned", () => {
    expect(resists(fighter({ equipment: [emberRing()] }))).toBe(false);
    expect(resists(fighter({ equipment: [emberRing(false)] }))).toBe(false);
    expect(resists(fighter({ equipment: [emberRing(true)] }))).toBe(true);
    const unworn = { ...emberRing(true), equipped: false };
    expect(resists(fighter({ equipment: [unworn] }))).toBe(false);
  });

  it("a homebrew weapon's grant follows its attunement too", () => {
    const brand = (attuned?: boolean) =>
      homebrewWeapon({
        name: "Frost Edge",
        ...(attuned !== undefined ? { attuned } : {}),
        mechanics: {
          attunement: true,
          grants: [{ type: "damage-resistance", damageType: "fire" }],
        },
      });
    expect(resists(fighter({ weapons: [brand()] }))).toBe(false);
    expect(resists(fighter({ weapons: [brand(true)] }))).toBe(true);
  });
});

describe("a homebrew charged wand casting a catalogue spell", () => {
  const instanceId = EMBER_WAND.instanceId;
  const identity = makeItemResourceIdentity(instanceId, instanceId, "charges");
  const store = () => useCharacterStore.getState();

  beforeEach(() => {
    useCharacterStore.setState({
      character: fighter({ equipment: [EMBER_WAND] }),
      readonly: false,
      loading: false,
      error: null,
      parentPersistenceFlush: null,
    });
  });

  const commands = (answer = 5) =>
    createItemResourceCommands({
      character: () => store().character,
      readonly: () => false,
      applyOperation: (item, binding, operation) =>
        store().applyItemResourceOperation(item, binding, operation),
      applyOperations: (entries) => store().applyItemResourceOperations(entries),
      requestInput: (_name, requests) =>
        Promise.resolve(new Map(requests.map((r) => [r.kind, answer]))),
      notifyConflict: () => {
        throw new Error("conflict");
      },
      itemName: () => "Ember Wand",
    });

  const charges = () => {
    const doc = store().character;
    if (!doc) throw new Error("no character");
    return freeCastSourcesForSpell(doc, "magic-missile", "en", "SIG")[0];
  };

  it("offers Magic Missile from its 7 charges, named by the wand", () => {
    expect(charges()).toMatchObject({
      sourceName: "Ember Wand",
      usesPerRest: 7,
      usedNow: 0,
      payment: { kind: "item-resource", ...identity },
      castLevels: [
        { level: 1, cost: 1 },
        { level: 2, cost: 2 },
        { level: 3, cost: 3 },
      ],
    });
  });

  it("spends its charges through the item-resource controller, per copy", async () => {
    const api = commands();
    const prepared = await api.prepare(itemResourceSpend(identity, 3), "Ember Wand");
    if (!prepared) throw new Error("not prepared");
    expect(api.commit(prepared)).not.toBeNull();
    expect(charges()?.usedNow).toBe(3);
    expect(store().character?.session.itemResources?.[instanceId]).toMatchObject({
      itemId: instanceId,
      instanceId,
      disposition: "magical",
    });
  });

  it("recovers 1d6+1 at dawn through the same boundary", async () => {
    const api = commands();
    const spent = await api.prepare(itemResourceSpend(identity, 5), "Ember Wand");
    if (!spent) throw new Error("not prepared");
    api.commit(spent);
    const dawn = await commands(4).prepareBoundary({ kind: "dawn" });
    if (!dawn) throw new Error("no dawn boundary");
    expect(api.commitBoundary(dawn)).not.toBeNull();
    // 2 charges left + 4 rolled at dawn.
    expect(charges()?.usedNow).toBe(1);
  });

  it("cannot be spent while unworn", () => {
    const doc = fighter({ equipment: [{ ...EMBER_WAND, equipped: false }] });
    expect(canSpendCopy(doc, instanceId, instanceId)).toBe(false);
    expect(freeCastSourcesForSpell(doc, "magic-missile", "en", "SIG")).toEqual([]);
    expect(
      canSpendCopy(fighter({ equipment: [EMBER_WAND] }), instanceId, instanceId)
    ).toBe(true);
  });

  it("the legacy item-resource migration leaves a homebrew copy untouched", () => {
    const doc = fighter({
      equipment: [
        EMBER_WAND,
        {
          ...EMBER_WAND,
          name: "Text Wand",
          mechanics: undefined,
          instanceId: "text-wand",
        },
      ],
    });
    const result = migrateLegacyItemResources(doc, SRD_MAGIC_ITEMS, () => "unused-id");
    expect(result.status).toBe("unchanged");
    expect(result.doc).toBe(doc);
  });

  it("a stored state that names another item is never lent to the copy", () => {
    const resolved = resolveItemResources({
      equipment: [EMBER_WAND],
      catalogue: SRD_MAGIC_ITEMS,
      itemResources: {
        [instanceId]: {
          itemId: "wand-of-magic-missiles",
          instanceId,
          revision: 0,
          resources: { charges: { capacity: 7, current: 1, disabled: false } },
          disposition: "magical",
          causalHead: null,
        },
      },
    });
    expect(resolved.resources).toEqual([]);
    expect(resolved.omissions).toEqual([
      { itemId: instanceId, instanceId, reason: "state-item-mismatch" },
    ]);
  });

  it("the dawn boundary stays a no-op for a full homebrew wand", () => {
    const result = prepareItemResourceBoundary({
      trigger: { kind: "dawn" },
      occurrenceId: "dawn-1",
      equipment: [EMBER_WAND],
      catalogue: SRD_MAGIC_ITEMS,
      itemResources: {},
    });
    expect(result).toMatchObject({ status: "prepared", prepared: { entries: [] } });
  });
});

describe("the stored mechanics", () => {
  function throughCharacterCodec<T extends CustomWeapon | CustomEquipment>(item: T): T {
    const doc = fighter(
      "damageDie" in item ? { weapons: [item] } : { equipment: [item] }
    );
    const stored = JSON.parse(JSON.stringify(serializeCharacterEnvelope(doc))) as {
      build: Record<string, unknown>;
      state: Record<string, unknown>;
    };
    const parsed = parseCharacterEnvelope(stored.build, stored.state);
    if (!parsed.ok) throw new Error(`character codec rejected: ${parsed.error}`);
    const back = [...parsed.character.weapons, ...parsed.character.equipment].find(
      (entry) => "custom" in entry && entry.instanceId === item.instanceId
    );
    if (!back) throw new Error("homebrew item lost by the character codec");
    return back as T;
  }

  function throughLibraryCodec<T extends CustomWeapon | CustomEquipment>(item: T): T {
    const entry =
      "damageDie" in item
        ? toLibraryEntry({ kind: "weapon", item }, 1)
        : toLibraryEntry({ kind: "equipment", item: item }, 1);
    const parsed = parseLibraryEntries(
      JSON.parse(JSON.stringify({ entries: [entry] })) as Record<string, unknown>
    );
    if (!parsed.ok) throw new Error(`library codec rejected: ${parsed.failure.path}`);
    const back = parsed.entries[0];
    if (back?.kind !== "weapon" && back?.kind !== "equipment") {
      throw new Error("library entry lost");
    }
    return back.item as T;
  }

  it("round-trip both codecs unchanged, as a known field", () => {
    for (const item of [MOON_BLADE, EMBER_WAND, emberRing()]) {
      for (const read of [throughCharacterCodec, throughLibraryCodec]) {
        const back = read(item);
        expect(back.mechanics, read.name).toEqual(item.mechanics);
        expect(back.unknown?.mechanics, read.name).toBeUndefined();
        expect(homebrewItemData(back), read.name).toEqual(homebrewItemData(item));
      }
    }
  });

  it("a weapon's attunement is per copy: the sheet keeps it, the library drops it", () => {
    const attuned = { ...MOON_BLADE, attuned: true };
    expect(throughCharacterCodec(attuned).attuned).toBe(true);
    expect(throughCharacterCodec(attuned).unknown).toBeUndefined();
    expect(throughLibraryCodec(attuned).attuned).toBeUndefined();
  });

  it("a newer client's field is stored verbatim and inert; a rejected field is left out", () => {
    const future = homebrewItem({
      mechanics: {
        ...EMBER_WAND.mechanics,
        rarity: "mythic",
        futureField: { kind: "x" },
        grants: [{ type: "future-kind" }, { type: "darkvision", range: 60 }],
      } as unknown as HomebrewItemMechanics,
    });
    const back = throughCharacterCodec(future);
    expect(back.mechanics).toEqual(future.mechanics);
    const played = homebrewItemMechanics(back);
    expect(played).not.toHaveProperty("futureField");
    expect(played).not.toHaveProperty("rarity");
    expect(played?.resources).toEqual(EMBER_WAND.mechanics?.resources);
    expect(played?.grants).toEqual([{ type: "darkvision", range: 60 }]);
    expect(homebrewItemData(back)?.rarity).toBe("common");
  });

  it("a malformed pool is left out whole (its charges never half-play)", () => {
    const bad = homebrewItem({
      mechanics: {
        resources: [
          {
            ...EMBER_WAND.mechanics?.resources?.[0],
            onEmpty: {
              kind: "entered-d20",
              bands: [{ min: 1, max: 5, outcomes: [] }],
            },
          },
        ],
      } as unknown as HomebrewItemMechanics,
    });
    expect(homebrewItemMechanics(bad)).not.toHaveProperty("resources");
  });

  it("an older reader keeps an unknown key (as v0.25.0 does `mechanics`) verbatim", () => {
    // v0.25.0's custom weapon and equipment readers knew no `mechanics` (nor a
    // weapon's `attuned`): each lands in the entry's `unknown` bucket and is
    // written back last, unchanged. The same contract, exercised on a key this
    // reader does not know either.
    const nested = { rarity: "rare", grants: [{ type: "darkvision", range: 60 }] };
    for (const item of [MOON_BLADE, EMBER_WAND]) {
      const older = { ...item, laterMechanics: nested } as unknown as typeof item;
      for (const read of [throughCharacterCodec, throughLibraryCodec]) {
        const back = read(older);
        const stored = JSON.parse(JSON.stringify(back)) as Record<string, unknown>;
        const kept = back.unknown?.laterMechanics ?? stored.laterMechanics;
        expect(kept, read.name).toEqual(nested);
        expect(back.mechanics, read.name).toEqual(item.mechanics);
      }
      const twice = throughCharacterCodec(throughCharacterCodec(older));
      expect(twice.unknown?.laterMechanics).toEqual(nested);
    }
  });

  it("a text-only homebrew item keeps its text-only play", () => {
    expect(homebrewItemData(PLAIN_BLADE)).toBeUndefined();
    const plain = homebrewItem({ name: "Plain Ring", attuned: true });
    expect(homebrewItemData(plain)).toBeUndefined();
  });

  it("a copy id a catalogue item owns carries no item identity", () => {
    const squatter = homebrewItem({ instanceId: "wand-of-magic-missiles" });
    expect(
      homebrewItemData({ ...squatter, mechanics: EMBER_WAND.mechanics })
    ).toBeUndefined();
  });
});

/** Catalogue identity and the facts a homebrew item stores elsewhere. */
const NOT_MECHANICS = new Set(["id", "source", "potionFormula", "properties"]);

function mechanicsOf(item: SrdMagicItemData): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(item).filter(([key]) => !NOT_MECHANICS.has(key))
  );
}

describe("the homebrew item schema is the catalogue's shape", () => {
  it("every catalogue magic item's structured fields are accepted unchanged", () => {
    const rejected: string[] = [];
    for (const item of SRD_MAGIC_ITEMS) {
      const mechanics = mechanicsOf(item);
      const accepted = homebrewItemMechanics({ mechanics }) as Record<string, unknown>;
      for (const key of Object.keys(mechanics)) {
        if (!isDeepStrictEqual(accepted[key], mechanics[key])) {
          rejected.push(`${item.id}.${key}`);
        }
      }
    }
    expect(rejected).toEqual([]);
  });

  it("schemas exist for exactly the structured catalogue fields", () => {
    const used = new Set(
      SRD_MAGIC_ITEMS.flatMap((item) => Object.keys(mechanicsOf(item)))
    );
    for (const key of used) expect(HOMEBREW_ITEM_FIELD_SCHEMAS, key).toHaveProperty(key);
  });
});
