/**
 * «Passa il tempo» on the Play screen (approved prototype time-pass): how much time,
 * then what it ends, named, before anything changes. Read from the engine's own
 * preview (`timePassEnds`), so it never promises what passing time doesn't do.
 */
import { describe, expect, it } from "vitest";
import { timePassView, TIME_STEPS } from "@/domains/play/time-pass-view";
import { setActiveState } from "@/lib/play/states";
import type { CharacterDoc } from "@/types/character";
import { conc } from "./__helpers__/concentration";
import { makeCharacterDoc } from "./_helpers";

function caster(): CharacterDoc {
  const doc = makeCharacterDoc(
    {
      classes: [{ classId: "wizard", level: 9 }],
      spells: ["detect-magic", "mage-armor"].map((srdId) => ({ srdId, prepared: true })),
      spellSlots: [{ level: 1, total: 4 }],
    },
    { hp: { current: 40, temp: 0 }, concentration: conc("detect-magic") }
  );
  const session = setActiveState(doc, "spell-mage-armor", true, 0);
  if (!session) throw new Error("Mage Armor did not light");
  return { ...doc, session };
}

describe("timePassView", () => {
  it("offers the prototype's steps: 1 minute, 10 minutes, 1 hour, 8 hours", () => {
    expect(TIME_STEPS).toEqual([1, 10, 60, 480]);
  });

  it("a minute ends nothing", () => {
    expect(timePassView(caster(), 1, "en")).toEqual({ ends: [], concentration: null });
  });

  it("ten minutes end the Concentration on Detect Magic, named", () => {
    expect(timePassView(caster(), 10, "en").concentration).toBe("Detect Magic");
  });

  it("eight hours end Mage Armor, by name", () => {
    expect(timePassView(caster(), 480, "en").ends).toContain("Mage Armor");
  });
});
