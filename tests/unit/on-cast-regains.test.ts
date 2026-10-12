/**
 * `lib/play/on-cast`: what casting a spell with a slot gives back (2024 RAW).
 *
 * - Wizard Abjurer, Arcane Ward: "Whenever you cast an Abjuration spell with a spell
 *   slot, the ward regains a number of Hit Points equal to twice the level of the
 *   spell slot."
 * - Wizard Diviner, Expert Divination: "When you cast a Divination spell using a level
 *   2+ spell slot, you regain one expended spell slot. The slot you regain must be of a
 *   level lower than the slot you expended and can't be higher than level 5."
 *
 * The cases come from the spell catalogue: every Abjuration / Divination spell at
 * every slot it can be cast with. Both subclasses live in the private content pack; in
 * SRD-only mode the two features are stood in with the pack's own `onCast` specs.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/srd-feature-lookup", async (importOriginal) =>
  (await import("./__helpers__/on-cast-features")).withOnCastFeatures(
    await importOriginal()
  )
);

import { spells } from "@/data/spells";
import { expendedSlotLevel, onCastRegains } from "@/lib/play/on-cast";
import { makeCharacterDoc } from "./_helpers";
import { ARCANE_WARD as WARD, EXPERT_DIVINATION } from "./__helpers__/on-cast-features";

const SLOT_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const levelled = spells.filter((spell) => spell.level >= 1);
const castableAt = (spellLevel: number) =>
  SLOT_LEVELS.filter((level) => level >= spellLevel);

const abjurer = (wardUsed: number) =>
  makeCharacterDoc(
    {
      classId: "wizard",
      subclassId: "abjurer",
      level: 18,
      features: [{ srdId: WARD }],
    },
    { trackers: { [WARD]: { used: wardUsed } } }
  );

/** A Diviner with one slot of every level, all of them expended. */
const diviner = (expended: number[] = SLOT_LEVELS) =>
  makeCharacterDoc(
    {
      classId: "wizard",
      subclassId: "diviner",
      level: 18,
      features: [{ srdId: EXPERT_DIVINATION }],
      spellSlots: SLOT_LEVELS.map((level) => ({ level, total: 1 })),
    },
    {
      spellSlots: Object.fromEntries(
        expended.map((level) => [String(level), { used: 1 }])
      ),
    }
  );

describe("Arcane Ward refill", () => {
  const abjuration = levelled.filter((spell) => spell.school === "abjuration");

  it("the catalogue has Abjuration spells to check", () => {
    expect(abjuration.length).toBeGreaterThan(10);
  });

  it.each(abjuration.map((spell) => [spell.id, spell.level] as const))(
    "%s refills the ward by twice the slot level at every slot",
    (spellId, spellLevel) => {
      for (const slot of castableAt(spellLevel)) {
        expect(onCastRegains(abjurer(99), spellId, slot)).toEqual([
          {
            refund: { kind: "tracker", trackerId: WARD, amount: 2 * slot },
            event: { kind: "tracker-regain", trackerId: WARD, amount: 2 * slot },
          },
        ]);
      }
    }
  );

  it("regains only the Hit Points the ward is missing, and nothing when it is full", () => {
    expect(onCastRegains(abjurer(1), "shield", 3)[0]?.refund).toEqual({
      kind: "tracker",
      trackerId: WARD,
      amount: 1,
    });
    expect(onCastRegains(abjurer(0), "shield", 3)).toEqual([]);
  });

  it("no other school, no free cast and no other Wizard refills it", () => {
    for (const spell of levelled.filter((s) => s.school !== "abjuration")) {
      expect(onCastRegains(abjurer(99), spell.id, Math.max(spell.level, 1))).toEqual([]);
    }
    expect(onCastRegains(abjurer(99), "shield", null)).toEqual([]);
    expect(
      onCastRegains(makeCharacterDoc({ classId: "wizard", level: 5 }), "shield", 1)
    ).toEqual([]);
  });
});

describe("Expert Divination slot regain", () => {
  const divination = levelled.filter((spell) => spell.school === "divination");

  it("the catalogue has Divination spells to check", () => {
    expect(divination.length).toBeGreaterThan(10);
  });

  it.each(divination.map((spell) => [spell.id, spell.level] as const))(
    "%s regains the highest lower slot, at most level 5, from a level 2+ slot",
    (spellId, spellLevel) => {
      for (const slot of castableAt(spellLevel)) {
        const regained = Math.min(slot - 1, 5);
        expect(onCastRegains(diviner(), spellId, slot)).toEqual(
          slot >= 2
            ? [
                {
                  refund: { kind: "slot", level: regained, pactMagic: false },
                  event: { kind: "slot-regain", level: regained },
                },
              ]
            : []
        );
      }
    }
  );

  it("regains only a slot that is expended and lower than the one spent", () => {
    expect(onCastRegains(diviner([1, 4]), "clairvoyance", 4)[0]?.refund).toEqual({
      kind: "slot",
      level: 1,
      pactMagic: false,
    });
    expect(onCastRegains(diviner([3, 4]), "clairvoyance", 3)).toEqual([]);
    expect(onCastRegains(diviner([]), "clairvoyance", 3)).toEqual([]);
  });

  it("no other school and no free cast regains a slot", () => {
    for (const spell of levelled.filter((s) => s.school !== "divination")) {
      expect(onCastRegains(diviner(), spell.id, Math.max(spell.level, 2))).toEqual([]);
    }
    expect(onCastRegains(diviner(), "clairvoyance", null)).toEqual([]);
  });
});

describe("the slot a use expended", () => {
  it("is the slot or scoped-slot level, never a free cast, ritual or cantrip", () => {
    expect(expendedSlotLevel({ kind: "slot", level: 3 }, [])).toBe(3);
    expect(
      expendedSlotLevel(
        {
          kind: "free-cast",
          sourceId: "x",
          sourceName: "X",
          level: 2,
          remaining: 1,
          total: 1,
          recovery: { kind: "tracker", rest: "long" },
          cost: 1,
          expendsSpellSlot: true,
        },
        []
      )
    ).toBe(2);
    expect(expendedSlotLevel({ kind: "ritual", level: 1 }, [])).toBeNull();
    expect(expendedSlotLevel({ kind: "cantrip", level: 0 }, [])).toBeNull();
    expect(
      expendedSlotLevel(undefined, [{ kind: "slot", level: 1, pactMagic: true }])
    ).toBe(1);
    expect(
      expendedSlotLevel(undefined, [{ kind: "tracker", trackerId: "x", amount: 1 }])
    ).toBeNull();
  });
});
