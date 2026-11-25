/**
 * Copying a spell into the Wizard's spellbook (SRD 5.2.1 Wizard, "Expanding the
 * Book"): a Wizard spell of a level the Wizard has slots for, found outside the book,
 * is copied for 2 hours and 50 GP per spell level. While the book still owes its free
 * picks, an added spell is one of those picks and costs nothing.
 */
import { describe, expect, it } from "vitest";

import {
  copyIntoSpellbook,
  spellbookCopyCost,
  spellbookEntry,
} from "@/lib/wizard-spellbook";
import type { CharacterDoc, SrdSpellRef } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

/** Fourteen levelled Wizard spells: a Wizard 5's whole book (6 + 2 × 4). */
const BOOK = [
  "magic-missile",
  "shield",
  "mage-armor",
  "sleep",
  "detect-magic",
  "burning-hands",
  "feather-fall",
  "thunderwave",
  "misty-step",
  "web",
  "invisibility",
  "hold-person",
  "fireball",
  "counterspell",
];

function wizard(
  over: { level?: number; spells?: SrdSpellRef[]; gp?: number; pp?: number } = {}
): CharacterDoc {
  const doc = makeCharacterDoc({
    classes: [{ classId: "wizard", level: over.level ?? 5 }],
    spells: over.spells ?? BOOK.map((srdId) => ({ srdId, prepared: false })),
  });
  doc.session.currency = { pp: over.pp ?? 0, gp: over.gp ?? 200, ep: 0, sp: 0, cp: 0 };
  return doc;
}

describe("the copy's cost", () => {
  it("2 hours and 50 GP per spell level", () => {
    expect(spellbookCopyCost(1)).toEqual({ hours: 2, gp: 50 });
    expect(spellbookCopyCost(3)).toEqual({ hours: 6, gp: 150 });
  });
});

describe("what adding a spell is, for a Wizard", () => {
  it("a Wizard spell of a level with slots, not in the book, is copied at its cost", () => {
    expect(spellbookEntry(wizard(), "fly")).toEqual({
      kind: "copy",
      hours: 6,
      gp: 150,
      affordable: true,
    });
  });

  it("says when the purse is short", () => {
    expect(spellbookEntry(wizard({ gp: 100 }), "fly")).toMatchObject({
      kind: "copy",
      affordable: false,
    });
  });

  it("while the book owes free picks, an added spell is one of them", () => {
    const short = wizard({ spells: [{ srdId: "magic-missile" }] });
    expect(spellbookEntry(short, "fly")).toEqual({ kind: "free" });
  });

  it("nothing to copy: a spell already in the book, a cantrip, another class's spell, a level with no slots, a non-Wizard", () => {
    expect(spellbookEntry(wizard(), "fireball")).toBeNull();
    expect(spellbookEntry(wizard(), "fire-bolt")).toBeNull();
    expect(spellbookEntry(wizard(), "cure-wounds")).toBeNull();
    expect(spellbookEntry(wizard(), "polymorph")).toBeNull();
    const bard = makeCharacterDoc({ classes: [{ classId: "bard", level: 5 }] });
    expect(spellbookEntry(bard, "fly")).toBeNull();
  });
});

describe("copyIntoSpellbook", () => {
  it("adds the spell to the book (not prepared) and pays its cost from the gold", () => {
    const next = copyIntoSpellbook(wizard(), "fly", { pay: true });
    expect(next?.character.spells.at(-1)).toEqual({ srdId: "fly" });
    expect(next?.session.currency).toMatchObject({ gp: 50, pp: 0 });
  });

  it("breaks platinum when the gold is short, the change in gold", () => {
    const next = copyIntoSpellbook(wizard({ gp: 20, pp: 20 }), "fly", { pay: true });
    // 150 gp: 20 gp, then 13 pp broken into 130 gp; nothing left over
    expect(next?.session.currency).toMatchObject({ gp: 0, pp: 7 });
  });

  it("refuses to pay what the purse does not hold; copying anyway leaves the coins", () => {
    expect(copyIntoSpellbook(wizard({ gp: 100 }), "fly", { pay: true })).toBeNull();
    const next = copyIntoSpellbook(wizard({ gp: 100 }), "fly", { pay: false });
    expect(next?.character.spells.at(-1)).toEqual({ srdId: "fly" });
    expect(next?.session.currency.gp).toBe(100);
  });

  it("refuses what is not a copy", () => {
    expect(copyIntoSpellbook(wizard(), "fireball", { pay: true })).toBeNull();
    const short = wizard({ spells: [{ srdId: "magic-missile" }] });
    expect(copyIntoSpellbook(short, "fly", { pay: true })).toBeNull();
  });
});
