/**
 * The Play screen's left column "Risorse" (Play list row 8, approved): every pool the
 * character spends from, with what is used, the most it holds, when it comes back,
 * and its kind for the colour family (spell slot, class resource, item charges, Hit
 * Dice). Read from the same sources the sheet's rail reads, in the same order.
 */
import { describe, expect, it } from "vitest";

import { resourcesView } from "@/lib/views/resources-view";
import { makeCharacterDoc } from "./_helpers";

describe("resourcesView", () => {
  it("a wizard's spell slots, by level, with what is used and when they come back", () => {
    const doc = makeCharacterDoc(
      {
        classId: "wizard",
        level: 3,
        spellSlots: [
          { level: 1, total: 4 },
          { level: 2, total: 2 },
        ],
      },
      { spellSlots: { "1": { used: 3 } } }
    );
    const slots = resourcesView(doc, "en").filter((r) => r.kind === "spell-slot");
    expect(slots).toEqual([
      {
        kind: "spell-slot",
        id: "slot:1",
        level: 1,
        pact: false,
        used: 3,
        max: 4,
        recharge: "long-rest",
      },
      {
        kind: "spell-slot",
        id: "slot:2",
        level: 2,
        pact: false,
        used: 0,
        max: 2,
        recharge: "long-rest",
      },
    ]);
  });

  it("a warlock's Pact Magic slots come back on a Short Rest", () => {
    const doc = makeCharacterDoc({
      classId: "warlock",
      level: 3,
      spellSlots: [{ level: 2, total: 2, pactMagic: true }],
    });
    expect(resourcesView(doc, "en").find((r) => r.kind === "spell-slot")).toMatchObject({
      id: "slot:pact-2",
      pact: true,
      recharge: "short-rest",
    });
  });

  it("class resources by name in the reader's language, and the Hit Dice", () => {
    const doc = makeCharacterDoc(
      { classId: "fighter", level: 5, features: [{ srdId: "fighter-second-wind" }] },
      { hitDice: { used: 2 }, trackers: { "fighter-second-wind": { used: 1 } } }
    );
    const rows = resourcesView(doc, "it");
    expect(rows.find((r) => r.id === "fighter-second-wind")).toMatchObject({
      kind: "class-resource",
      name: "Recuperare Energie",
      used: 1,
      recharge: "short-rest",
    });
    expect(rows.at(-1)).toEqual({
      kind: "hit-dice",
      id: "hit-dice",
      used: 2,
      max: 5,
      recharge: "long-rest",
    });
  });

  it("an item's charges, with its exact recovery and whether it can spend now", () => {
    const doc = makeCharacterDoc({
      classId: "wizard",
      level: 5,
      equipment: [
        { srdId: "wand-of-magic-missiles", instanceId: "wand-1", equipped: true },
      ],
    });
    const wand = resourcesView(doc, "en").find((r) => r.kind === "item-charges");
    expect(wand).toMatchObject({
      kind: "item-charges",
      itemId: "wand-of-magic-missiles",
      canSpend: true,
    });
    expect(
      wand && "recoveryTriggers" in wand && wand.recoveryTriggers.length
    ).toBeGreaterThan(0);
  });

  it("a character with nothing to spend still has Hit Dice", () => {
    const doc = makeCharacterDoc({ classId: "fighter", level: 1 });
    expect(resourcesView(doc, "en").map((r) => r.kind)).toEqual(["hit-dice"]);
  });
});
