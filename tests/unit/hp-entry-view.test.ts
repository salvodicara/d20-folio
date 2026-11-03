/**
 * «Danni e cure» on the Play screen (approved prototype x-play-hp): the note under the
 * buttons says what the entered damage will do, through the path the Danni button
 * commits — the character's defenses (resistance halves), temporary HP absorbed
 * first, HP stopping at 0, and the concentration DC (half the damage, at least 10).
 */
import { describe, expect, it } from "vitest";

import { hpEntryNote } from "@/domains/play/hp-entry-view";
import { NO_DEFENSES } from "@/lib/damage-intake";
import type { StoredConcentration } from "@/types/ids";
import { makeCharacterDoc } from "./_helpers";

const concentrating = makeCharacterDoc(
  { classes: [{ classId: "cleric", level: 9 }] },
  {
    hp: { current: 31, temp: 5 },
    concentration: "bless" as StoredConcentration,
  }
);
const fireResistant = { ...NO_DEFENSES, resistances: new Set(["fire" as const]) };

describe("hpEntryNote", () => {
  it("the prototype's case: 14, the 5 temporary first, 31 → 22, concentration DC 10", () => {
    expect(hpEntryNote(concentrating, 14, undefined, NO_DEFENSES)).toEqual({
      net: 14,
      defense: null,
      absorbed: 0,
      fromTemp: 5,
      from: 31,
      to: 22,
      concentrationDc: 10,
    });
  });

  it("a resisted type halves it before anything else", () => {
    expect(hpEntryNote(concentrating, 14, "fire", fireResistant)).toMatchObject({
      net: 7,
      defense: "resisted",
      fromTemp: 5,
      to: 29,
    });
  });

  it("the DC comes from the damage taken, after the resistance", () => {
    // 40 fire, resisted: 20 taken → DC 10 (not the 20 the entered 40 would give).
    expect(hpEntryNote(concentrating, 40, "fire", fireResistant)?.concentrationDc).toBe(
      10
    );
  });

  it("a big hit raises the DC to half the damage; HP stop at 0", () => {
    expect(hpEntryNote(concentrating, 70, undefined, NO_DEFENSES)).toMatchObject({
      to: 0,
      concentrationDc: 30,
    });
  });

  it("no concentration, no save; nothing entered, nothing to say", () => {
    const free = makeCharacterDoc({}, { hp: { current: 10, temp: 0 } });
    expect(hpEntryNote(free, 4, undefined, NO_DEFENSES)?.concentrationDc).toBe(0);
    expect(hpEntryNote(free, 0, undefined, NO_DEFENSES)).toBeNull();
  });
});
