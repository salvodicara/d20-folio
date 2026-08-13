import { describe, expect, it } from "vitest";

import {
  insertResolvedMaterialResource,
  locateMaterialResource,
  removeResolvedMaterialResource,
  replaceResolvedMaterialResource,
} from "@/lib/material-resource";
import { createEmptyCharacterMaterialState } from "@/lib/material-state";
import {
  discoverMechanicsEndWave,
  finalizeMechanicsEndWave,
  parseMechanicsWorld,
} from "@/lib/mechanics-world";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsWorld } from "@/types/mechanics-world";
import type { CountResourceCell, ResourceRef } from "@/types/resource";

const CHARACTER = {
  characterId: "hero",
  kind: "character-play",
  uid: "user",
} as const;
const SELF = { entityId: "self", material: CHARACTER } as const;

function count(current: number): CountResourceCell {
  return {
    capacity: { base: { kind: "unbounded" }, override: null },
    current,
    disabled: false,
    kind: "count",
  };
}

function state(instanceOrdinal = 1): CharacterMaterialState {
  const value = structuredClone(
    createEmptyCharacterMaterialState(1, CHARACTER, {
      hitPoints: {
        current: 10,
        temporary: { current: 0, sourceOccurrence: null },
      },
      zeroHitPoints: null,
    })
  );
  value.resources.pools.focus = count(2);
  value.resources.standardSpellSlots["1"] = count(3);
  value.resources.pactSpellSlot = count(1);
  value.resources.hitDice.d8 = count(2);
  value.nextInventoryOrdinal = instanceOrdinal + 1;
  value.inventory.wand = {
    attuned: false,
    definition: { itemId: "wand", kind: "catalogue" },
    disposition: "magical",
    enchantment: null,
    equipped: false,
    notes: "",
    ordinal: instanceOrdinal,
    overrides: {
      armorClass: null,
      attackBonus: null,
      damageFormula: null,
      damageType: null,
      name: null,
    },
    ownerOccurrence: null,
    quantity: count(1),
    resources: { charges: count(5) },
    tags: [],
  };
  value.nextEntityOrdinal = 2;
  value.entities.familiar = {
    availability: "present",
    controller: null,
    exhaustion: 0,
    kind: "creature",
    label: "",
    ordinal: 1,
    ownerOccurrence: null,
    overrides: {
      armorClass: null,
      hitPointMaximum: 1,
      initiativeBonus: null,
      speedFt: null,
    },
    resources: { commands: count(1) },
    template: {
      kind: "catalogue-companion",
      sourceId: "familiar",
      variantId: "owl",
    },
    vitals: {
      hitPoints: {
        current: 1,
        temporary: { current: 0, sourceOccurrence: null },
      },
      zeroHitPoints: null,
    },
  };
  return value;
}

function world(instanceOrdinal = 1): Readonly<MechanicsWorld> {
  const parsed = parseMechanicsWorld({
    documents: [
      { kind: "character", material: CHARACTER, state: state(instanceOrdinal) },
    ],
    scope: CHARACTER,
  });
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.value;
}

describe("physical material resource locator", () => {
  it.each([
    [
      { kind: "pool", owner: SELF, resourceId: "focus" },
      ["resources", "pools", "focus"],
      2,
    ],
    [
      {
        kind: "pool",
        owner: { entityId: "familiar", material: CHARACTER, ordinal: 1 },
        resourceId: "commands",
      },
      ["entities", "familiar", "resources", "commands"],
      1,
    ],
    [
      { character: CHARACTER, kind: "standard-spell-slot", level: 1 },
      ["resources", "standardSpellSlots", "1"],
      3,
    ],
    [
      { character: CHARACTER, kind: "pact-spell-slot" },
      ["resources", "pactSpellSlot"],
      1,
    ],
    [
      { character: CHARACTER, die: "d8", kind: "hit-die" },
      ["resources", "hitDice", "d8"],
      2,
    ],
    [
      { character: CHARACTER, denomination: "gp", kind: "currency" },
      ["resources", "currency", "gp"],
      0,
    ],
    [
      {
        character: CHARACTER,
        instanceId: "wand",
        instanceOrdinal: 1,
        kind: "item-resource",
        resourceId: "charges",
      },
      ["inventory", "wand", "resources", "charges"],
      5,
    ],
    [
      {
        character: CHARACTER,
        instanceId: "wand",
        instanceOrdinal: 1,
        kind: "item-quantity",
      },
      ["inventory", "wand", "quantity"],
      1,
    ],
  ] satisfies ReadonlyArray<readonly [ResourceRef, readonly string[], number]>)(
    "resolves $0 to the only journal path",
    (resource, path, current) => {
      const located = locateMaterialResource(world(), resource);
      expect(located?.path).toEqual(path);
      expect(located?.cell).toMatchObject({ current });
    }
  );

  it("replaces through the locator and lets world closure delete an empty item", () => {
    const before = world();
    const resource = {
      character: CHARACTER,
      instanceId: "wand",
      instanceOrdinal: 1,
      kind: "item-quantity",
    } as const satisfies ResourceRef;
    const candidate = replaceResolvedMaterialResource(before, resource, count(0));
    expect(candidate).not.toBeNull();
    if (!candidate) return;

    expect(parseMechanicsWorld(candidate)).toMatchObject({
      ok: false,
      reason: "missing-reference",
    });
    const discovery = discoverMechanicsEndWave(candidate);
    expect(discovery.status).toBe("discovered");
    if (discovery.status !== "discovered") return;
    const closed = finalizeMechanicsEndWave(discovery.world, discovery.wave);
    expect(closed.status).toBe("applied");
    if (closed.status !== "applied") return;
    expect(closed.world.documents[0]?.state.inventory).not.toHaveProperty("wand");
  });

  it("rejects missing and malformed physical addresses", () => {
    expect(
      locateMaterialResource(world(), {
        character: CHARACTER,
        instanceId: "missing",
        instanceOrdinal: 1,
        kind: "item-quantity",
      })
    ).toBeNull();
    expect(
      locateMaterialResource(world(), {
        character: CHARACTER,
        instanceId: "wand",
        instanceOrdinal: 1,
        kind: "item-quantity",
        legacyAmount: 1,
      })
    ).toBeNull();
  });

  it.each([
    { kind: "pool", owner: SELF, resourceId: "new-focus" },
    {
      kind: "pool",
      owner: { entityId: "familiar", material: CHARACTER, ordinal: 1 },
      resourceId: "new-command",
    },
    { character: CHARACTER, kind: "standard-spell-slot", level: 2 },
    { character: CHARACTER, die: "d6", kind: "hit-die" },
    {
      character: CHARACTER,
      instanceId: "wand",
      instanceOrdinal: 1,
      kind: "item-resource",
      resourceId: "secondary",
    },
  ] satisfies ReadonlyArray<ResourceRef>)(
    "inserts and removes the absent dynamic address $kind without mutating inputs",
    (resource) => {
      const before = world();
      const snapshot = structuredClone(before);
      const inserted = insertResolvedMaterialResource(before, resource, count(4));

      expect(inserted).not.toBeNull();
      expect(before).toEqual(snapshot);
      expect(locateMaterialResource(before, resource)).toBeNull();
      expect(inserted && locateMaterialResource(inserted, resource)?.cell).toMatchObject({
        current: 4,
      });
      expect(
        inserted && insertResolvedMaterialResource(inserted, resource, count(5))
      ).toBeNull();

      const removed = inserted && removeResolvedMaterialResource(inserted, resource);
      expect(removed).not.toBeNull();
      expect(inserted && locateMaterialResource(inserted, resource)).not.toBeNull();
      expect(removed && locateMaterialResource(removed, resource)).toBeNull();
      expect(removed && removeResolvedMaterialResource(removed, resource)).toBeNull();
    }
  );

  it("keeps stale resource refs dead when an inventory id is recreated", () => {
    const recreated = world(2);
    const staleQuantity = {
      character: CHARACTER,
      instanceId: "wand",
      instanceOrdinal: 1,
      kind: "item-quantity",
    } as const satisfies ResourceRef;
    const currentQuantity = {
      ...staleQuantity,
      instanceOrdinal: 2,
    } as const satisfies ResourceRef;
    const staleCharges = {
      character: CHARACTER,
      instanceId: "wand",
      instanceOrdinal: 1,
      kind: "item-resource",
      resourceId: "charges",
    } as const satisfies ResourceRef;
    const currentCharges = {
      ...staleCharges,
      instanceOrdinal: 2,
    } as const satisfies ResourceRef;

    expect(locateMaterialResource(recreated, staleQuantity)).toBeNull();
    expect(locateMaterialResource(recreated, staleCharges)).toBeNull();
    expect(locateMaterialResource(recreated, currentQuantity)?.cell).toMatchObject({
      current: 1,
    });
    expect(locateMaterialResource(recreated, currentCharges)?.cell).toMatchObject({
      current: 5,
    });
    expect(
      replaceResolvedMaterialResource(recreated, staleQuantity, count(0))
    ).toBeNull();
    expect(removeResolvedMaterialResource(recreated, staleCharges)).toBeNull();

    const staleSecondary = { ...staleCharges, resourceId: "secondary" } as const;
    const currentSecondary = { ...currentCharges, resourceId: "secondary" } as const;
    expect(
      insertResolvedMaterialResource(recreated, staleSecondary, count(4))
    ).toBeNull();
    const inserted = insertResolvedMaterialResource(
      recreated,
      currentSecondary,
      count(4)
    );
    expect(inserted).not.toBeNull();
    expect(
      inserted && locateMaterialResource(inserted, currentSecondary)?.cell
    ).toMatchObject({ current: 4 });
  });

  it("keeps stale pool refs dead when an entity id is recreated", () => {
    const recreated = world();
    const stalePool = {
      kind: "pool",
      owner: { entityId: "familiar", material: CHARACTER, ordinal: 2 },
      resourceId: "commands",
    } as const satisfies ResourceRef;
    const staleNewPool = { ...stalePool, resourceId: "new-command" } as const;

    expect(locateMaterialResource(recreated, stalePool)).toBeNull();
    expect(replaceResolvedMaterialResource(recreated, stalePool, count(0))).toBeNull();
    expect(removeResolvedMaterialResource(recreated, stalePool)).toBeNull();
    expect(insertResolvedMaterialResource(recreated, staleNewPool, count(1))).toBeNull();
  });

  it("uses null as the pact-slot absence state", () => {
    const resource = { character: CHARACTER, kind: "pact-spell-slot" } as const;
    const before = world();
    const removed = removeResolvedMaterialResource(before, resource);

    const removedDocument = removed?.documents[0];
    expect(
      removedDocument?.kind === "character"
        ? removedDocument.state.resources.pactSpellSlot
        : undefined
    ).toBeNull();
    if (!removed) return;
    const inserted = insertResolvedMaterialResource(removed, resource, count(2));
    const insertedDocument = inserted?.documents[0];
    expect(
      insertedDocument?.kind === "character"
        ? insertedDocument.state.resources.pactSpellSlot
        : undefined
    ).toMatchObject({ current: 2 });
  });

  it.each([
    { character: CHARACTER, denomination: "gp", kind: "currency" },
    {
      character: CHARACTER,
      instanceId: "wand",
      instanceOrdinal: 1,
      kind: "item-quantity",
    },
  ] satisfies ReadonlyArray<ResourceRef>)(
    "rejects insert and remove for fixed-shape $kind",
    (resource) => {
      const before = world();
      expect(insertResolvedMaterialResource(before, resource, count(1))).toBeNull();
      expect(removeResolvedMaterialResource(before, resource)).toBeNull();
    }
  );

  it("rejects missing containers and non-count spell cells", () => {
    const rolled = {
      capacity: { base: { kind: "unbounded" }, override: null },
      disabled: false,
      kind: "rolled",
      remaining: 2,
      rolledMaximum: 2,
    } as const;
    expect(
      insertResolvedMaterialResource(
        world(),
        {
          character: CHARACTER,
          instanceId: "missing",
          instanceOrdinal: 1,
          kind: "item-resource",
          resourceId: "charges",
        },
        count(1)
      )
    ).toBeNull();
    expect(
      insertResolvedMaterialResource(
        world(),
        { character: CHARACTER, kind: "standard-spell-slot", level: 2 },
        rolled
      )
    ).toBeNull();
  });
});
