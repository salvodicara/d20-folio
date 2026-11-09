/**
 * Rests for the new Play screen (headless: direction renders it), from the classic
 * RestModal summary and ResourceRail's rest-frequency choosers:
 *
 * - `restSummary(kind, before, after, receipts)`: what the rest gave, as data (Hit
 *   Points, Hit Point Dice, slots, uses, Exhaustion, Heroic Inspiration, item uses,
 *   fading penalties and a restored maximum), so PlayRest can show it before closing
 *   or moving on to PlayPrepare.
 * - `grantBundleChoices(doc)`: the variants re-chosen at a rest (Circle of the Land's
 *   terrain…), one per choice; `pickGrantBundle` picks one, undoably.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import i18n from "i18next";

import {
  grantBundleChoices,
  pickGrantBundle,
  restSummary,
} from "@/domains/play/rest-model";
import { asRaceId } from "@/data/srd-names";
import { longRestCharacter } from "@/lib/play/rests";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const t = i18n.getFixedT("en");

/** A tired Human Wizard 5 at 4 HP, with spent slots, a spent use and Hit Point Dice. */
function tired(): CharacterDoc {
  const doc = makeCharacterDoc(
    { race: asRaceId("human"), classId: "wizard", level: 5 },
    {
      hp: { current: 4, temp: 0 },
      hitDice: { used: 3 },
      exhaustion: 2,
      inspiration: false,
      spellSlots: { "1": { used: 3 }, "2": { used: 1 } },
      fadingPenalties: { "raise-dead": 4 },
      hpMaxReduction: 6,
    }
  );
  return doc;
}

describe("restSummary", () => {
  it("a Long Rest: full HP to the restored maximum, every die and slot, one Exhaustion level, Inspiration, the fades", () => {
    const before = tired();
    const after = longRestCharacter(before);
    const summary = restSummary("long", before, after);
    expect(summary).toMatchObject({
      kind: "long",
      hp: { before: 4, after: summary.hp.max },
      hitDice: { count: 3 },
      slotsRestored: 4,
      exhaustionReduced: true,
      inspirationGained: true,
      itemResourceUnitsRecovered: 0,
    });
    expect(summary.fades?.penalties).toEqual([{ id: "raise-dead", before: 4, after: 3 }]);
    expect(summary.fades?.maxHp?.after).toBeGreaterThan(
      summary.fades?.maxHp?.before ?? 0
    );
  });

  it("a Short Rest: the dice spent and the HP they gave; nothing a Long Rest brings", () => {
    const before = makeCharacterDoc(
      { classId: "fighter", level: 5 },
      { hp: { current: 10, temp: 0 } }
    );
    const after: CharacterDoc = {
      ...before,
      session: { ...before.session, hp: { current: 24, temp: 0 }, hitDice: { used: 2 } },
    };
    expect(restSummary("short", before, after)).toMatchObject({
      kind: "short",
      hp: { before: 10, after: 24 },
      hitDice: { count: 2 },
      slotsRestored: 0,
      inspirationGained: false,
      fades: null,
    });
  });

  it("item uses come back as the rest's receipts report them", () => {
    const doc = makeCharacterDoc();
    expect(
      restSummary("long", doc, doc, [
        { before: 1, after: 3 },
        { before: 2, after: 2 },
      ]).itemResourceUnitsRecovered
    ).toBe(2);
  });
});

describe("the rest-frequency variants", () => {
  /** A Circle of the Land Druid 10: Circle Spells and Nature's Ward share the terrain. */
  const landDruid = () => {
    const doc = makeCharacterDoc({
      classId: "druid",
      subclassId: "circle-of-the-land",
      level: 10,
    });
    return {
      ...doc,
      character: {
        ...doc.character,
        features: [
          { srdId: "druid-land-circle-spells" },
          { srdId: "druid-land-natures-ward" },
        ],
      },
    };
  };

  beforeEach(() => useUndoStore.setState({ past: [], future: [] }));

  it("one chooser per variant, even when two features share it", () => {
    const choices = grantBundleChoices(landDruid());
    expect(choices.map((c) => c.bundleKey)).toEqual(["druid-land-terrain"]);
    expect(choices[0]?.options.length).toBeGreaterThan(1);
    expect(choices[0]?.selected).toBeNull();
  });

  it("picking a terrain sets it, undoably", () => {
    useCharacterStore.setState({ character: landDruid(), readonly: false });
    const option = grantBundleChoices(landDruid())[0]?.options[0]?.id ?? "";
    pickGrantBundle("druid-land-terrain", option, t);
    const live = () => useCharacterStore.getState().character;
    expect(live()?.session.grantBundleChoices?.["druid-land-terrain"]).toBe(option);
    useUndoStore.getState().undo();
    expect(live()?.session.grantBundleChoices?.["druid-land-terrain"]).toBeUndefined();
  });
});
