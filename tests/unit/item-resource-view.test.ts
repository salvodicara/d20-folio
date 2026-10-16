import { describe, expect, it } from "vitest";
import type { ItemResourceState } from "@/types/character";
import { MOCK_CHARACTER } from "@/lib/mock";
import {
  buildItemResourceViewModels,
  itemResourceRecoveryTranslationKey,
} from "@/lib/views/item-resource-view";

const ITEM_ID = "wand-of-magic-missiles";

function state(instanceId: string, current: number): ItemResourceState {
  return {
    itemId: ITEM_ID,
    instanceId,
    revision: 0,
    resources: {
      charges: { capacity: 7, current, disabled: false },
    },
    disposition: "magical",
    causalHead: null,
  };
}

describe("typed item-resource presenter", () => {
  it("keeps identical copies exact while exposing only display-safe copy ordinals", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [
      { srdId: ITEM_ID, instanceId: "wand-copy-a", equipped: true, quantity: 1 },
      { srdId: ITEM_ID, instanceId: "wand-copy-b", equipped: true, quantity: 1 },
    ];
    doc.session.itemResources = {
      "wand-copy-a": state("wand-copy-a", 2),
      "wand-copy-b": state("wand-copy-b", 6),
    };

    const result = buildItemResourceViewModels(doc);

    expect(result.omissions).toEqual([]);
    expect(
      result.resources.map((resource) => ({
        identity: resource.identity,
        current: resource.current,
        capacity: resource.capacity,
        copyNumber: resource.copyNumber,
        labelKey: resource.labelKey,
        unitKey: resource.unitKey,
        canSpend: resource.canSpend,
      }))
    ).toEqual([
      {
        identity: {
          itemId: ITEM_ID,
          instanceId: "wand-copy-a",
          resourceId: "charges",
          key: "item:wand-copy-a:charges",
        },
        current: 2,
        capacity: 7,
        copyNumber: 1,
        labelKey: "equipment.charges",
        unitKey: "units.charges",
        canSpend: true,
      },
      {
        identity: {
          itemId: ITEM_ID,
          instanceId: "wand-copy-b",
          resourceId: "charges",
          key: "item:wand-copy-b:charges",
        },
        current: 6,
        capacity: 7,
        copyNumber: 2,
        labelKey: "equipment.charges",
        unitKey: "units.charges",
        canSpend: true,
      },
    ]);
    expect(result.resources.map(({ recoveryTriggers }) => recoveryTriggers)).toEqual([
      [{ kind: "dawn" }],
      [{ kind: "dawn" }],
    ]);
  });

  it("maps every exact boundary without turning dawn or dusk into a rest", () => {
    expect(itemResourceRecoveryTranslationKey({ kind: "short-rest" })).toBe(
      "combat.perShortRest"
    );
    expect(itemResourceRecoveryTranslationKey({ kind: "long-rest" })).toBe(
      "combat.perLongRest"
    );
    expect(itemResourceRecoveryTranslationKey({ kind: "dawn" })).toBe(
      "combat.resourceRecoveryDawn"
    );
    expect(itemResourceRecoveryTranslationKey({ kind: "dusk" })).toBe(
      "combat.resourceRecoveryDusk"
    );
    expect(itemResourceRecoveryTranslationKey({ kind: "turn-start" })).toBe(
      "combat.resourceRecoveryTurnStart"
    );
    expect(itemResourceRecoveryTranslationKey({ kind: "turn-end" })).toBe(
      "combat.resourceRecoveryTurnEnd"
    );
    expect(
      itemResourceRecoveryTranslationKey({ kind: "event", eventId: "story-beat" })
    ).toBe("combat.resourceRecoveryEvent");
    expect(itemResourceRecoveryTranslationKey({ kind: "manual" })).toBe(
      "combat.resourceRecoveryManual"
    );
  });

  it("shows an inert copy but does not offer a spend that the command seam rejects", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [
      { srdId: ITEM_ID, instanceId: "stowed-wand", equipped: false, quantity: 1 },
    ];

    const [resource] = buildItemResourceViewModels(doc).resources;
    expect(resource).toMatchObject({
      current: 7,
      capacity: 7,
      copyNumber: null,
      available: true,
      canSpend: false,
      spendBlock: "not-equipped",
    });
  });

  it("names why an attunement item's spend is blocked: attunement first, then equipping", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    const wand = "wand-of-lightning-bolts";
    doc.character.equipment = [
      { srdId: wand, instanceId: "fresh", equipped: false, attuned: false, quantity: 1 },
      {
        srdId: wand,
        instanceId: "attuned-only",
        equipped: false,
        attuned: true,
        quantity: 1,
      },
      {
        srdId: wand,
        instanceId: "held-only",
        equipped: true,
        attuned: false,
        quantity: 1,
      },
      { srdId: wand, instanceId: "ready", equipped: true, attuned: true, quantity: 1 },
    ];

    expect(
      buildItemResourceViewModels(doc).resources.map(({ canSpend, spendBlock }) => ({
        canSpend,
        spendBlock,
      }))
    ).toEqual([
      { canSpend: false, spendBlock: "needs-attunement" },
      { canSpend: false, spendBlock: "not-equipped" },
      { canSpend: false, spendBlock: "needs-attunement" },
      { canSpend: true, spendBlock: null },
    ]);
  });

  it("keeps a disposed copy legible but marks it unavailable and unspendable", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [
      { srdId: ITEM_ID, instanceId: "destroyed-wand", equipped: true, quantity: 1 },
    ];
    doc.session.itemResources = {
      "destroyed-wand": {
        ...state("destroyed-wand", 0),
        disposition: "destroyed",
      },
    };

    const [resource] = buildItemResourceViewModels(doc).resources;
    expect(resource).toMatchObject({
      current: 0,
      capacity: 7,
      available: false,
      canSpend: false,
    });
  });
});
