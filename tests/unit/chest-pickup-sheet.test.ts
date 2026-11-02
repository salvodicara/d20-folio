import { describe, expect, it } from "vitest";

import { pickupForSheet } from "@/features/campaigns/chest";
import { applySheetEvent } from "@/lib/play/sheet-events";
import type { Pickup } from "@/types/campaign";

import { makeCharacterDoc } from "./_helpers";

const pickup = (extra: Partial<Pickup>): Pickup => ({
  id: "p",
  ownerUid: "kaela",
  reason: "share",
  by: "brann",
  at: 1,
  ...extra,
});

describe("what a pickup puts on its owner's sheet", () => {
  it("a share is its coins, nothing else", () => {
    expect(pickupForSheet(pickup({ coins: { gp: 33, sp: 0 } }))).toEqual({
      coins: { gp: 33 },
      item: null,
    });
  });

  it("a taken item is the item, at least one of it", () => {
    expect(
      pickupForSheet(pickup({ reason: "take", item: { srdId: "potion-of-healing" } }))
    ).toEqual({ coins: null, item: { srdId: "potion-of-healing", quantity: 1 } });
    expect(
      pickupForSheet(pickup({ item: { custom: true, name: "Gemma" }, quantity: 2 })).item
    ).toEqual({ custom: true, name: "Gemma", quantity: 2 });
  });
});

describe("an item received into the bag", () => {
  it("stacks onto the same catalogue item, as the Add-Item picker does", () => {
    const doc = makeCharacterDoc({
      equipment: [{ srdId: "potion-of-healing", quantity: 1 }],
    });
    const next = applySheetEvent(doc, {
      kind: "receive-item",
      ref: { srdId: "potion-of-healing", quantity: 2 },
    });
    expect(next?.character.equipment).toEqual([
      { srdId: "potion-of-healing", quantity: 3 },
    ]);
  });

  it("a free-text item is its own row", () => {
    const doc = makeCharacterDoc({ equipment: [] });
    const next = applySheetEvent(doc, {
      kind: "receive-item",
      ref: { custom: true, instanceId: "g1", name: "Gemma", quantity: 2 },
    });
    expect(next?.character.equipment).toEqual([
      { custom: true, instanceId: "g1", name: "Gemma", quantity: 2 },
    ]);
  });
});
