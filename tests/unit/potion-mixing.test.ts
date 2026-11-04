/**
 * Mixing potions (the DMG's optional table): drinking a potion while another
 * potion's effect is still running calls for a d100 roll on the DM's table. The
 * sheet offers the roll and records what the table rolled; the table itself is
 * the DM's (pack data, source missing), so with no table the DM reads the result.
 */
import { describe, expect, it } from "vitest";

import {
  mixingOutcome,
  potionMixingOffer,
  type MixingTable,
} from "@/lib/play/potion-mixing";
import { makeCharacterDoc } from "./_helpers";

const flying = { srdId: "potion-of-flying", quantity: 1 };
const giant = { srdId: "potion-of-hill-giant-strength", quantity: 1 };

describe("potionMixingOffer", () => {
  it("nothing is running: no offer", () => {
    const doc = makeCharacterDoc({ equipment: [flying] });
    expect(potionMixingOffer(doc, "potion-of-flying")).toBeNull();
  });

  it("a lit potion state: drinking another offers the roll, naming both", () => {
    const doc = makeCharacterDoc(
      { equipment: [flying, giant] },
      { activeFeatures: ["potion:potion-of-flying"] }
    );
    expect(potionMixingOffer(doc, "potion-of-hill-giant-strength")).toEqual({
      drinking: "potion-of-hill-giant-strength",
      running: ["potion-of-flying"],
    });
  });

  it("a running countdown counts too; its after-effect does not", () => {
    const doc = makeCharacterDoc(
      { equipment: [flying, giant] },
      {
        effectTimers: { "potion:potion-of-hill-giant-strength": { roundsLeft: 50 } },
        activeFeatures: ["potion:potion-of-speed:aftereffect"],
      }
    );
    expect(potionMixingOffer(doc, "potion-of-flying")?.running).toEqual([
      "potion-of-hill-giant-strength",
    ]);
  });

  it("drinking the same potion again restarts it: no mixing", () => {
    const doc = makeCharacterDoc(
      { equipment: [flying] },
      { activeFeatures: ["potion:potion-of-flying"] }
    );
    expect(potionMixingOffer(doc, "potion-of-flying")).toBeNull();
  });
});

describe("mixingOutcome", () => {
  const table: MixingTable = {
    die: "d100",
    rows: [
      { min: 1, max: 1, outcome: "explosion" },
      { min: 2, max: 100, outcome: "no-effect" },
    ],
  };
  it("the rolled row, or null when the table has no row for it (the DM reads it)", () => {
    expect(mixingOutcome(1, table)).toBe("explosion");
    expect(mixingOutcome(57, table)).toBe("no-effect");
    expect(mixingOutcome(57, undefined)).toBeNull();
    expect(mixingOutcome(0, table)).toBeNull();
  });
});
