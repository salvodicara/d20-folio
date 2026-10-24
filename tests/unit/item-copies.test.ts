/**
 * The one rule for "this exact copy of an item can still spend its charges", which
 * the item-resource command provider, the inventory's resource rows and the grant
 * aggregation each wrote on their own (architecture pass 2026-10-24). A copy spends
 * while it is the single copy with that id on the sheet, it is worn (equipped), its
 * attunement is satisfied when it needs one, and it is still magical. The cases are
 * the provider's own `hasActiveSpendOwner`, characterized before the move.
 */
import { describe, expect, it } from "vitest";

import { canSpendCopy, exactItemCopy, isMagicalCopy } from "@/lib/item-copies";
import type { CharacterDoc, ItemResourceState } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const RING = "ring-of-protection"; // needs attunement
const WAND = "wand-of-magic-missiles"; // doesn't

function sheet(
  equipment: CharacterDoc["character"]["equipment"],
  itemResources: Record<string, ItemResourceState> = {}
): CharacterDoc {
  const doc = makeCharacterDoc({ classId: "wizard", level: 5, equipment });
  doc.session.itemResources = itemResources;
  return doc;
}

const state = (
  itemId: string,
  instanceId: string,
  disposition: "magical" | "nonmagical"
) =>
  ({
    itemId,
    instanceId,
    revision: 1,
    resources: {},
    disposition,
    causalHead: null,
  }) as ItemResourceState;

describe("canSpendCopy", () => {
  it("a worn, attuned, still-magical single copy spends", () => {
    const doc = sheet([{ srdId: RING, instanceId: "r1", equipped: true, attuned: true }]);
    expect(canSpendCopy(doc, RING, "r1")).toBe(true);
  });

  it("an item that needs no attunement spends while worn", () => {
    const doc = sheet([{ srdId: WAND, instanceId: "w1", equipped: true }]);
    expect(canSpendCopy(doc, WAND, "w1")).toBe(true);
  });

  it.each([
    ["not worn", [{ srdId: RING, instanceId: "r1", equipped: false, attuned: true }], {}],
    [
      "not attuned",
      [{ srdId: RING, instanceId: "r1", equipped: true, attuned: false }],
      {},
    ],
    [
      "no longer magical",
      [{ srdId: RING, instanceId: "r1", equipped: true, attuned: true }],
      { r1: state(RING, "r1", "nonmagical") },
    ],
    [
      "a state that belongs to another item",
      [{ srdId: RING, instanceId: "r1", equipped: true, attuned: true }],
      { r1: state(WAND, "r1", "magical") },
    ],
    [
      "two copies sharing one id",
      [
        { srdId: RING, instanceId: "r1", equipped: true, attuned: true },
        { srdId: RING, instanceId: "r1", equipped: true, attuned: true },
      ],
      {},
    ],
    ["not on the sheet", [], {}],
  ] as const)("doesn't spend: %s", (_case, equipment, resources) => {
    const doc = sheet(
      equipment as unknown as CharacterDoc["character"]["equipment"],
      resources
    );
    expect(canSpendCopy(doc, RING, "r1")).toBe(false);
  });
});

describe("exactItemCopy and isMagicalCopy", () => {
  it("the single copy with that id, or none", () => {
    const one = sheet([{ srdId: WAND, instanceId: "w1" }]);
    expect(exactItemCopy(one, WAND, "w1")).toMatchObject({ instanceId: "w1" });
    expect(exactItemCopy(one, WAND, "w2")).toBeNull();
  });

  it("magical with no state yet, or a state of this copy that is still magical", () => {
    expect(isMagicalCopy(undefined, WAND, "w1")).toBe(true);
    expect(isMagicalCopy(state(WAND, "w1", "magical"), WAND, "w1")).toBe(true);
    expect(isMagicalCopy(state(WAND, "w1", "nonmagical"), WAND, "w1")).toBe(false);
    expect(isMagicalCopy(state(WAND, "w9", "magical"), WAND, "w1")).toBe(false);
  });
});
