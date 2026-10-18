/**
 * The "Passa il tempo" popover's preview (design session, 2026-10-18): before the time
 * skip is applied, what it will do. "N minutes pass" lists what ends, with what was
 * left of it (the same lapse `passTime` applies); "dawn" / "dusk" lists the items that
 * recharge (the same planner the real boundary commit uses). It changes nothing.
 */
import { describe, expect, it } from "vitest";

import { previewTimePasses } from "@/lib/views/time-preview-view";
import { makeCharacterDoc } from "./_helpers";

const potionDoc = () =>
  makeCharacterDoc(
    { classId: "fighter", level: 3 },
    { effectTimers: { "potion:potion-of-flying": { roundsLeft: 600 } } }
  );

describe("previewTimePasses", () => {
  it("a stretch shorter than what is left ends nothing", () => {
    expect(previewTimePasses(potionDoc(), { minutes: 10 }, "en")).toEqual([]);
  });

  it("a stretch that outlasts a countdown ends it, saying what was left", () => {
    expect(previewTimePasses(potionDoc(), { minutes: 60 }, "en")).toEqual([
      {
        id: "potion:potion-of-flying",
        name: "Potion of Flying",
        what: "ends",
        remainingBefore: { minutes: 60 },
      },
    ]);
  });

  it("a state kept up turn by turn (Rage) ends with any time skip", () => {
    const doc = makeCharacterDoc(
      { classId: "barbarian", level: 3, features: [{ srdId: "barbarian-rage" }] },
      {
        activeFeatures: ["barbarian-rage"],
        effectTimers: { "barbarian-rage": { roundsLeft: 100 } },
      }
    );
    expect(previewTimePasses(doc, { minutes: 1 }, "it")).toEqual([
      {
        id: "barbarian-rage",
        name: "Ira",
        what: "ends",
        remainingBefore: { minutes: 10 },
      },
    ]);
  });

  it("dawn lists the items that recharge then", () => {
    // A Gem of Seeing with 1 of its 3 charges left: dawn regains 1d3.
    const instanceId = "gem-1";
    const doc = makeCharacterDoc(
      {
        classId: "fighter",
        level: 3,
        equipment: [{ srdId: "gem-of-seeing", instanceId, quantity: 1 }],
      },
      {
        itemResources: {
          [instanceId]: {
            itemId: "gem-of-seeing",
            instanceId,
            revision: 0,
            resources: { charges: { capacity: 3, current: 1, disabled: false } },
            disposition: "magical",
            causalHead: null,
          },
        },
      }
    );
    expect(previewTimePasses(doc, { boundary: "dawn" }, "en")).toEqual([
      {
        id: "gem-of-seeing",
        name: "Gem of Seeing",
        what: "recharges",
        remainingBefore: null,
      },
    ]);
    expect(previewTimePasses(doc, { boundary: "dusk" }, "en")).toEqual([]);
  });

  it("previewing changes nothing on the sheet", () => {
    const doc = potionDoc();
    const before = structuredClone(doc);
    previewTimePasses(doc, { minutes: 60 }, "en");
    expect(doc).toEqual(before);
  });
});
