import { describe, expect, it } from "vitest";

import { MAGIC_ITEMS_PART_1 } from "@/data/magic-items/part-1";
import { MAGIC_ITEMS_PART_2 } from "@/data/magic-items/part-2";
import { MAGIC_ITEMS_PART_3 } from "@/data/magic-items/part-3";

function publicItem(id: string) {
  return [...MAGIC_ITEMS_PART_1, ...MAGIC_ITEMS_PART_2, ...MAGIC_ITEMS_PART_3].find(
    (item) => item.id === id
  );
}

describe("magic-item resource source facts", () => {
  it("models Wand of Magic Missiles as one dawn-recovered charge counter", () => {
    expect(publicItem("wand-of-magic-missiles")?.resources).toEqual([
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 7 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 6, modifier: 1 },
            },
          },
        ],
        onEmpty: {
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [
                {
                  kind: "set-item-disposition",
                  disposition: "destroyed",
                },
              ],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        },
      },
    ]);
  });

  it("models Winged Boots as one dawn-recovered charge counter", () => {
    expect(publicItem("winged-boots")?.resources).toEqual([
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 4 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 4 },
            },
          },
        ],
      },
    ]);
  });

  it("does not alias either dawn recovery to a long rest", () => {
    for (const id of ["wand-of-magic-missiles", "winged-boots"]) {
      const recoveries = publicItem(id)?.resources?.flatMap(
        (resource) => resource.recoveries ?? []
      );
      expect(
        recoveries?.some((recovery) => recovery.trigger.kind === "long-rest"),
        id
      ).toBe(false);
    }
  });

  it("models Ring of Three Wishes as a finite, nonrenewing physical pool", () => {
    const ring = publicItem("ring-of-three-wishes");
    expect(ring?.resources).toEqual([
      {
        kind: "counter",
        id: "wishes",
        unit: "charges",
        capacity: { kind: "fixed", amount: 3 },
        initial: { kind: "full" },
        onEmpty: {
          kind: "deterministic",
          outcomes: [{ kind: "set-item-disposition", disposition: "nonmagical" }],
        },
      },
    ]);
    expect(ring?.grants).toEqual([
      { type: "always-prepared-spell", spellId: "wish" },
      {
        type: "free-cast-spell",
        spellId: "wish",
        resourceCost: { resourceId: "wishes" },
      },
    ]);
  });

  it("makes typed resources the sole owner of migrated capacity and recovery", () => {
    const wandCast = publicItem("wand-of-magic-missiles")?.grants?.find(
      (grant) => grant.type === "free-cast-spell"
    );
    expect(wandCast).toMatchObject({
      resourceCost: { resourceId: "charges" },
      castLevels: [
        { level: 1, cost: 1 },
        { level: 2, cost: 2 },
        { level: 3, cost: 3 },
      ],
    });
    expect(wandCast).not.toHaveProperty("chargesPerRest");
    expect(wandCast).not.toHaveProperty("rest");
    expect(wandCast).not.toHaveProperty("autoRecover");

    const bootsActivation = publicItem("winged-boots")?.grants?.find(
      (grant) => grant.type === "while-active"
    );
    expect(bootsActivation?.activation).toEqual({
      action: "action",
      resourceCost: { resourceId: "charges" },
    });
  });
});
