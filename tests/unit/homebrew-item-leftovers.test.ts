/**
 * The four item paths a structured homebrew item did not reach after #440, each
 * through the SAME seam a catalogue item uses:
 *
 * - charges on a homebrew WEAPON (the item-resource path, keyed by its instanceId);
 * - creatures a homebrew item calls (`buildItemSummonGroups`, and their Initiative
 *   placement);
 * - a homebrew potion's countdown and its standing state (`drinkPotion`, the
 *   `potion:<id>` state the catalogue's `POTION_STATE` declares);
 * - a homebrew weapon's own Weapon Mastery property (the same mastery chip and
 *   numbers a catalogue weapon's rides).
 *
 * Cases mirror real catalogue items: a charged weapon (the Mace of Terror's shape),
 * a Figurine-style summon, a Potion of Resistance, a Vex weapon.
 */
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import type { HomebrewItemMechanics, HomebrewWeaponMechanics } from "@/data/types";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import {
  homebrewWeaponMastery,
  isHomebrewMagicWeapon,
  itemCopies,
} from "@/lib/homebrew-items";
import { SRD_WEAPONS } from "@/data/weapons";
import { canSpendCopy } from "@/lib/item-copies";
import { prepareItemResourceBoundary } from "@/lib/item-resource-boundaries";
import { resolveItemResources } from "@/lib/item-resources";
import { drinkPotion } from "@/lib/play/states";
import { summonInitiativeEntries } from "@/lib/play/summon-initiative";
import { makeItemResourceIdentity } from "@/lib/resources";
import { resolveActions } from "@/lib/smart-tracker";
import { buildItemSummonGroups } from "@/lib/views/companion-row-view";
import { buildItemResourceViewModels } from "@/lib/views/item-resource-view";
import {
  canCastSpellWithSlots,
  freeCastSourcesForSpell,
} from "@/lib/views/spell-cast-sources";
import type { CharacterDoc, CustomEquipment, CustomWeapon } from "@/types/character";
import { customInstanceId } from "./__helpers__/custom-items";
import { makeCharacterDoc } from "./_helpers";

function homebrewWeapon(
  name: string,
  mechanics?: HomebrewWeaponMechanics,
  over: Partial<CustomWeapon> = {}
): CustomWeapon {
  return {
    custom: true,
    name,
    quantity: 1,
    damageDie: "1d8",
    damageType: "bludgeoning",
    attackStat: "STR",
    properties: "",
    instanceId: customInstanceId(name),
    ...(mechanics ? { mechanics } : {}),
    ...over,
  };
}

function homebrewItem(
  name: string,
  mechanics?: HomebrewItemMechanics,
  over: Partial<CustomEquipment> = {}
): CustomEquipment {
  return {
    custom: true,
    name,
    equipped: true,
    quantity: 1,
    instanceId: customInstanceId(name),
    ...(mechanics ? { mechanics } : {}),
    ...over,
  };
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

// ─── (a) charges on a homebrew weapon ────────────────────────────────────────

/** A Mace of Terror of the player's own: 3 charges, 1d3 back at dawn, Fear from one. */
const DREAD_MACE = homebrewWeapon("Dread Mace", {
  rarity: "rare",
  type: "weapon",
  attunement: true,
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
  grants: [
    { type: "always-prepared-spell", spellId: "fear" },
    {
      type: "free-cast-spell",
      spellId: "fear",
      resourceCost: { resourceId: "charges" },
      castLevels: [{ level: 3, cost: 1 }],
    },
  ],
});

describe("a homebrew weapon with charges", () => {
  const id = DREAD_MACE.instanceId;
  const attuned = (over: Partial<CustomWeapon> = {}) =>
    fighter({ weapons: [{ ...DREAD_MACE, attuned: true, ...over }] });

  it("is an item copy, whose charges resolve under its own instanceId", () => {
    const doc = attuned();
    expect(itemCopies(doc.character).map((copy) => copy.instanceId)).toEqual([id]);
    const resolved = resolveItemResources({
      equipment: itemCopies(doc.character),
      catalogue: SRD_MAGIC_ITEMS,
      itemResources: {},
    });
    expect(resolved.omissions).toEqual([]);
    expect(resolved.resources).toMatchObject([
      { itemId: id, instanceId: id, resourceId: "charges", capacity: 3, current: 3 },
    ]);
  });

  it("is spendable while carried and attuned (a weapon has no worn flag)", () => {
    expect(canSpendCopy(attuned(), id, id)).toBe(true);
    expect(canSpendCopy(fighter({ weapons: [DREAD_MACE] }), id, id)).toBe(false);
  });

  it("offers Fear from its charges, named by the weapon", () => {
    expect(freeCastSourcesForSpell(attuned(), "fear", "en", "SIG")[0]).toMatchObject({
      sourceName: "Dread Mace",
      usesPerRest: 3,
      usedNow: 0,
      payment: { kind: "item-resource", ...makeItemResourceIdentity(id, id, "charges") },
    });
  });

  it("its always-prepared spell never lends the bearer's class slots", () => {
    expect(canCastSpellWithSlots(attuned(), "fear")).toBe(false);
  });

  it("shows its charge row on the sheet, spendable", () => {
    expect(buildItemResourceViewModels(attuned()).resources).toMatchObject([
      { current: 3, capacity: 3, canSpend: true },
    ]);
  });

  it("recovers at dawn through the same boundary", () => {
    const doc = attuned();
    const result = prepareItemResourceBoundary({
      trigger: { kind: "dawn" },
      occurrenceId: "dawn-1",
      equipment: itemCopies(doc.character),
      catalogue: SRD_MAGIC_ITEMS,
      itemResources: {
        [id]: {
          itemId: id,
          instanceId: id,
          revision: 1,
          resources: { charges: { capacity: 3, current: 1, disabled: false } },
          disposition: "magical",
          causalHead: null,
        },
      },
    });
    expect(result.status).toBe("pending-input");
  });

  it("a destroyed weapon's grants stop, as a destroyed item's do", () => {
    const doc = attuned();
    const destroyed = {
      ...doc,
      session: {
        ...doc.session,
        itemResources: {
          [id]: {
            itemId: id,
            instanceId: id,
            revision: 1,
            resources: { charges: { capacity: 3, current: 0, disabled: false } },
            disposition: "destroyed" as const,
            causalHead: null,
          },
        },
      },
    };
    const prepared = (d: CharacterDoc) =>
      aggregateCharacterGrants(d.character, d.session).alwaysPrepared.includes("fear");
    expect(prepared(doc)).toBe(true);
    expect(prepared(destroyed)).toBe(false);
  });
});

// ─── (b) creatures a homebrew item calls ─────────────────────────────────────

const GRIFFON_TOKEN = homebrewItem("Griffon Token", {
  type: "wondrous",
  summonedMonsters: { options: [{ monsterId: "griffon", count: { base: 1 } }] },
  summonTurn: "after-caster",
});

describe("a homebrew item that calls a creature", () => {
  const groupId = `magic-item:${GRIFFON_TOKEN.instanceId}`;

  it("joins the item summon groups while worn, keyed by its copy", () => {
    expect(buildItemSummonGroups(fighter({ equipment: [GRIFFON_TOKEN] }))).toEqual([
      expect.objectContaining({
        itemId: GRIFFON_TOKEN.instanceId,
        groupId,
        monsterId: "griffon",
        count: 1,
        summonTurn: "after-caster",
      }),
    ]);
    const unworn = { ...GRIFFON_TOKEN, equipped: false };
    expect(buildItemSummonGroups(fighter({ equipment: [unworn] }))).toEqual([]);
  });

  it("a carried homebrew weapon calls its creature too", () => {
    const blade = homebrewWeapon("Griffon Blade", GRIFFON_TOKEN.mechanics);
    expect(buildItemSummonGroups(fighter({ weapons: [blade] }))).toEqual([
      expect.objectContaining({ itemId: blade.instanceId, monsterId: "griffon" }),
    ]);
  });

  it("its creature acts right after the caster, as its item says", () => {
    const groups = buildItemSummonGroups(fighter({ equipment: [GRIFFON_TOKEN] }));
    expect(summonInitiativeEntries(groups, { id: "ana", initiative: 14 })).toEqual([
      expect.objectContaining({
        key: `${groupId}#1`,
        turn: "after-caster",
        initiative: 14,
        afterId: "ana",
      }),
    ]);
  });
});

// ─── (c) a homebrew potion's countdown and state ─────────────────────────────

/** A Potion of Resistance of the player's own: Fire Resistance for 1 hour. */
const IVY_DRAUGHT = homebrewItem(
  "Ivy Draught",
  {
    type: "potion",
    durationRounds: 600,
    grants: [
      {
        type: "while-active",
        activeKey: "potion:ivy-draught",
        duration: { kind: "timed", minutes: 60, maxRounds: 600 },
        grants: [{ type: "damage-resistance", damageType: "fire" }],
      },
    ],
  },
  { isPotion: true, isConsumable: true, quantity: 2, equipped: false }
);
/** A potion that only runs a countdown (no standing state). */
const FOG_TONIC = homebrewItem(
  "Fog Tonic",
  { type: "potion", durationRounds: 10 },
  { isPotion: true, isConsumable: true, quantity: 1, equipped: false }
);

describe("a homebrew potion", () => {
  const resists = (doc: CharacterDoc) =>
    aggregateCharacterGrants(doc.character, doc.session).damageResistances.has("fire");

  it("lights its standing state for its countdown when drunk", () => {
    const doc = fighter({ equipment: [IVY_DRAUGHT] });
    const key = `potion:${IVY_DRAUGHT.instanceId}`;
    const session = drinkPotion(doc, `custom-${IVY_DRAUGHT.instanceId}`, 3);
    expect(session?.activeFeatures).toContain(key);
    expect(session?.effectTimers?.[key]).toEqual({ roundsLeft: 600, tickedRound: 3 });
    expect(resists(doc)).toBe(false);
    expect(resists({ ...doc, session: session ?? doc.session })).toBe(true);
  });

  it("a countdown-only potion arms its bare countdown", () => {
    const doc = fighter({ equipment: [FOG_TONIC] });
    const session = drinkPotion(doc, `custom-${FOG_TONIC.instanceId}`, 0);
    expect(session?.effectTimers?.[`potion:${FOG_TONIC.instanceId}`]).toEqual({
      roundsLeft: 10,
      tickedRound: 0,
    });
  });

  it("an instant or text-only homebrew potion arms nothing", () => {
    const text = homebrewItem("Plain Tonic", undefined, { isPotion: true });
    const doc = fighter({ equipment: [text] });
    expect(drinkPotion(doc, `custom-${text.instanceId}`, 0)).toBeNull();
  });
});

// ─── (d) a homebrew weapon's Weapon Mastery ──────────────────────────────────

const HOOK_BLADE = homebrewWeapon("Hook Blade", { mastery: "Vex" });

function masterOf(picks: string[]): CharacterDoc {
  return fighter({
    weapons: [HOOK_BLADE],
    classes: [{ classId: "fighter", level: 3, weaponMasteries: picks }],
  });
}

function hookRow(doc: CharacterDoc) {
  const row = resolveActions(doc).find(
    (a) => a.source === "weapon" && isDeepStrictEqual(a.name, { custom: "Hook Blade" })
  );
  if (!row) throw new Error("no Hook Blade row");
  return row.summary;
}

describe("a homebrew weapon's Weapon Mastery", () => {
  it("declares its property in its mechanics, conformed like every other field", () => {
    expect(homebrewWeaponMastery(HOOK_BLADE)).toBe("Vex");
    const bogus = homebrewWeapon("Odd Blade", {
      mastery: "Shove",
    } as unknown as HomebrewWeaponMechanics);
    expect(homebrewWeaponMastery(bogus)).toBeUndefined();
  });

  it("a weapon that declares only its mastery stays mundane (no item identity)", () => {
    expect(isHomebrewMagicWeapon(HOOK_BLADE)).toBe(false);
    expect(itemCopies(masterOf([]).character)).toEqual([]);
  });

  it("every catalogue weapon's mastery is a homebrew weapon's too", () => {
    const masteries = new Set(SRD_WEAPONS.flatMap((w) => (w.mastery ? [w.mastery] : [])));
    expect(masteries.size).toBeGreaterThan(0);
    for (const mastery of masteries) {
      expect(homebrewWeaponMastery(homebrewWeapon("Any Blade", { mastery }))).toBe(
        mastery
      );
    }
  });

  it("rides its row once the character masters this weapon (its own kind)", () => {
    expect(hookRow(masterOf([HOOK_BLADE.instanceId])).weaponMastery).toBe("Vex");
  });

  it("an unmastered homebrew weapon never shows its mastery", () => {
    expect(hookRow(masterOf(["longsword"])).weaponMastery).toBeUndefined();
  });
});
