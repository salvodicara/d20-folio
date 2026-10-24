/**
 * An item's activated state ends when its source copy stops being held. The cases
 * come from the items' own text: the Ring of Invisibility keeps you Invisible "until
 * the ring is removed"; the Cloak's effect "ends early if you … cease wearing the
 * hood". Generic: Boots of Speed's state (no condition) ends the same way.
 */
import { describe, expect, it } from "vitest";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import {
  unheldItemStateEvents,
  unheldItemStateKeys,
  unheldItemStateLogEvents,
} from "@/lib/play/item-held-states";
import { foldPlayLog, type PlayLogEntry } from "@/lib/play/play-log";
import { applySheetEvent } from "@/lib/play/sheet-events";
import type { CharacterDoc, SrdEquipmentRef } from "@/types/character";
import { srd } from "../_harness/loc";
import { makeCharacterDoc } from "./_helpers";

const text = (id: string): string => srd("magic-item", id, "description", "en");

function wearing(
  srdId: string,
  ref: Partial<SrdEquipmentRef> = {},
  key = `magic-item:${srdId}-copy:${srdId}`
): CharacterDoc {
  const doc = makeCharacterDoc({
    classId: "fighter",
    level: 5,
    equipment: [
      {
        srdId,
        instanceId: `${srdId}-copy`,
        equipped: true,
        attuned: true,
        quantity: 1,
        ...ref,
      },
    ],
  });
  doc.session.activeFeatures = [key, "barbarian-rage", "potion:potion-of-invisibility"];
  return doc;
}

function fold(doc: CharacterDoc): CharacterDoc {
  return unheldItemStateEvents(doc, 0).reduce(
    (next, event) => applySheetEvent(next, event) ?? next,
    doc
  );
}

const ringKey = "magic-item:ring-of-invisibility-copy:ring-of-invisibility";

describe("an item's activated state ends when its copy stops being held", () => {
  it("the texts tie the effect to wearing the item", () => {
    expect(text("ring-of-invisibility")).toMatch(/until the ring is removed/);
    expect(text("cloak-of-invisibility")).toMatch(/cease wearing the hood/);
  });

  it("a held copy keeps its state and its condition", () => {
    const doc = wearing("ring-of-invisibility");
    expect(effectiveSessionConditions(doc.session)).toContain("invisible");
    expect(unheldItemStateKeys(doc)).toEqual([]);
    expect(unheldItemStateEvents(doc, 0)).toEqual([]);
  });

  it.each([
    ["unequipped", { equipped: false }],
    ["unattuned", { attuned: false }],
  ] as const)("Ring of Invisibility %s: the state and Invisible end", (_, change) => {
    const doc = wearing("ring-of-invisibility", change);
    expect(effectiveSessionConditions(doc.session)).toContain("invisible");
    expect(unheldItemStateKeys(doc)).toEqual([ringKey]);

    const after = fold(doc);
    expect(after.session.activeFeatures).toEqual([
      "barbarian-rage",
      "potion:potion-of-invisibility",
    ]);
    // The drunk potion still gives Invisible; drop it to see the ring's go.
    const noPotion = (d: CharacterDoc) => ({
      ...d,
      session: {
        ...d.session,
        activeFeatures: (d.session.activeFeatures ?? []).filter(
          (k) => !k.startsWith("potion:")
        ),
      },
    });
    expect(effectiveSessionConditions(noPotion(after).session)).not.toContain(
      "invisible"
    );
    expect(unheldItemStateLogEvents(noPotion(doc), noPotion(after))).toEqual([
      { kind: "condition-loss", conditionId: "invisible" },
    ]);
  });

  it("Cloak of Invisibility taken off: its state ends", () => {
    const key = "magic-item:cloak-of-invisibility-copy:cloak-of-invisibility";
    const doc = wearing("cloak-of-invisibility", { equipped: false }, key);
    expect(unheldItemStateKeys(doc)).toEqual([key]);
    expect(fold(doc).session.activeFeatures).not.toContain(key);
  });

  it("a copy that left the bag ends its state", () => {
    const doc = wearing("ring-of-invisibility");
    doc.character.equipment = [];
    expect(unheldItemStateKeys(doc)).toEqual([ringKey]);
  });

  it("a copy left nonmagical ends its state", () => {
    const doc = wearing(
      "cloak-of-invisibility",
      {},
      "magic-item:cloak-of-invisibility-copy:cloak-of-invisibility"
    );
    doc.session.itemResources = {
      "cloak-of-invisibility-copy": {
        itemId: "cloak-of-invisibility",
        instanceId: "cloak-of-invisibility-copy",
        revision: 1,
        resources: { charges: { capacity: 3, current: 0, disabled: false } },
        disposition: "nonmagical",
        causalHead: null,
      },
    };
    expect(unheldItemStateKeys(doc)).toEqual([
      "magic-item:cloak-of-invisibility-copy:cloak-of-invisibility",
    ]);
  });

  it("generic: Boots of Speed (an un-numbered copy, no condition) end when unequipped", () => {
    const doc = makeCharacterDoc({
      classId: "fighter",
      level: 5,
      equipment: [
        { srdId: "boots-of-speed", equipped: true, attuned: true, quantity: 1 },
      ],
    });
    doc.session.activeFeatures = ["boots-of-speed"];
    expect(unheldItemStateKeys(doc)).toEqual([]);
    doc.character.equipment = [
      { srdId: "boots-of-speed", equipped: false, attuned: true, quantity: 1 },
    ];
    expect(unheldItemStateKeys(doc)).toEqual(["boots-of-speed"]);
    expect(fold(doc).session.activeFeatures).toEqual([]);
  });

  it("goes through the play log: one entry per state, undo brings it back", () => {
    const doc = wearing("ring-of-invisibility", { equipped: false });
    doc.session.activeFeatures = [ringKey];
    const entries: PlayLogEntry[] = unheldItemStateEvents(doc, 0).map((event, i) => ({
      id: `e${i}`,
      seq: i,
      actor: "player",
      event,
    }));
    expect(entries).toHaveLength(1);
    const ended = foldPlayLog(doc, entries);
    expect(effectiveSessionConditions(ended.session)).not.toContain("invisible");
    const undone = foldPlayLog(doc, [
      ...entries,
      { id: "u", seq: 9, actor: "player", undo: "e0" },
    ]);
    expect(undone.session.activeFeatures).toEqual([ringKey]);
    expect(effectiveSessionConditions(undone.session)).toContain("invisible");
  });
});
