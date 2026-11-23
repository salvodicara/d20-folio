/**
 * Level-up audit — Sorcerer 1 → 20 against SRD 5.2.1 (srd.txt "Sorcerer Features"
 * table, lines 3873-3901, the class text at 3880-3995 and Draconic Sorcery at
 * 4134-4235). Every expected value below is read from that text, never from src/data.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  asksAsi,
  epicBoonChecks,
  hasFeature,
  levelOf,
  maxHp,
  pb,
  row,
  slotRow,
  spellRefs,
  spellsVm,
  SRD_PB,
  tracker,
  walk,
  type Step,
} from "./_walk-rswz";

/** A value the walk must have produced; throws (failing the test) when it did not. */
function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error("audit walk: missing value");
  return v;
}

// "Sorcerer Features" table (srd.txt 3873-3901).
const FEATURES: Record<number, string[]> = {
  1: ["Spellcasting", "Innate Sorcery"],
  2: ["Font of Magic", "Metamagic"],
  5: ["Sorcerous Restoration"],
  7: ["Sorcery Incarnate"],
  10: ["Metamagic"],
  17: ["Metamagic"],
  19: ["Epic Boon"],
  20: ["Arcane Apotheosis"],
};
// Draconic Sorcery (srd.txt 4134-4235): Draconic Resilience 3, Draconic Spells 3,
// Elemental Affinity 6, Dragon Wings 14, Dragon Companion 18.
const DRACONIC: Record<number, string[]> = {
  3: ["Draconic Resilience", "Draconic Spells"],
  6: ["Elemental Affinity"],
  14: ["Dragon Wings"],
  18: ["Dragon Companion"],
};
// Draconic Spells table (srd.txt 4153-4166): always prepared from these levels.
const DRACONIC_SPELLS: Record<number, string[]> = {
  3: ["alter-self", "chromatic-orb", "command", "dragons-breath"],
  5: ["fear", "fly"],
  7: ["arcane-eye", "charm-monster"],
  9: ["legend-lore", "summon-dragon"],
};
// Table columns: Sorcery Points ("—" at 1), Cantrips, Prepared Spells, slots 1-9.
const SORCERY_POINTS = [
  0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
];
const CANTRIPS = [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6];
const PREPARED = [
  2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
];
const SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
// Metamagic: "you gain two Metamagic options" at 2; "two more options at Sorcerer
// level 10 and two more at Sorcerer level 17" (srd.txt 3929-3931, 4010-4013).
const METAMAGIC_KNOWN = (l: number) => (l >= 17 ? 6 : l >= 10 ? 4 : l >= 2 ? 2 : 0);
// "Level 4: Ability Score Improvement ... again at Sorcerer levels 8, 12, and 16".
const ASI_LEVELS = [4, 8, 12, 16];
// Hit Point Die D6 (srd.txt 3815); CON 14 → +2. Draconic Resilience: "Your Hit Point
// maximum increases by 3, and it increases by 1 whenever you gain another Sorcerer
// level" (srd.txt 4163-4166) → +3 at 3, +1 a level after: +level from 3 on.
const CON = 2;
const expectedHp = (l: number) =>
  6 + CON + (l - 1) * (4 + CON) + (l >= 3 ? 3 + (l - 3) : 0);
const highestSlot = (l: number) =>
  (SLOTS[l - 1] ?? []).reduce((m, n, i) => (n > 0 ? i + 1 : m), 0);
const ELEMENTS = ["acid", "cold", "fire", "lightning", "poison"];

let steps: Step[] = [];
beforeAll(() => {
  steps = walk({
    classId: "sorcerer",
    subclassId: "draconic-sorcery",
    primary: "CHA",
    boon: "boon-of-dimensional-travel",
    avoidSpells: Object.values(DRACONIC_SPELLS).flat(),
    level1: {
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 16 },
      skills: {
        arcana: "proficient",
        persuasion: "proficient",
        athletics: "proficient",
        intimidation: "proficient",
      },
      // "You know four Sorcerer cantrips" and "choose two level 1 Sorcerer spells"
      // (srd.txt 3905-3925), the SRD's recommended ones.
      spells: [
        { srdId: "light" },
        { srdId: "prestidigitation" },
        { srdId: "shocking-grasp" },
        { srdId: "sorcerous-burst" },
        { srdId: "burning-hands", prepared: true },
        { srdId: "detect-magic", prepared: true },
      ],
    },
  });
});

describe("Sorcerer level-up audit (SRD 5.2.1)", () => {
  for (let level = 1; level <= 20; level++) {
    it(`level ${level}`, () => {
      const step = steps[level - 1];
      if (!step) throw new Error("walk did not reach this level");
      const { doc, asks } = step;
      const at = `Sorcerer ${level}`;
      const i = level - 1;

      expect.soft(pb(doc), `${at} proficiency bonus`).toBe(SRD_PB[i]);
      expect.soft(maxHp(doc), `${at} max HP`).toBe(expectedHp(level));

      for (let l = 1; l <= level; l++) {
        for (const name of FEATURES[l] ?? [])
          expect.soft(hasFeature(doc, name), `${at} has ${name} (L${l})`).toBe(true);
        for (const name of DRACONIC[l] ?? [])
          expect
            .soft(hasFeature(doc, name), `${at} has Draconic ${name} (L${l})`)
            .toBe(true);
        for (const id of DRACONIC_SPELLS[l] ?? []) {
          const ref = spellRefs(doc).find((s) => s.srdId === id);
          expect
            .soft(ref?.alwaysPrepared, `${at} ${id} always prepared (L${l})`)
            .toBe(true);
        }
      }

      // Columns as the sheet shows them.
      expect
        .soft(tracker(doc, "sorcerer-font-of-magic")?.total ?? 0, `${at} Sorcery Points`)
        .toBe(SORCERY_POINTS[i]);
      expect.soft(slotRow(doc, "sorcerer"), `${at} spell slots`).toEqual(SLOTS[i]);
      const cast = spellsVm(doc, "sorcerer").castSummary;
      expect
        .soft(cast?.preparedMax, `${at} Prepared Spells (limit shown)`)
        .toBe(PREPARED[i]);
      expect
        .soft(cast?.preparedCount, `${at} prepared spells after the picks`)
        .toBe(PREPARED[i]);
      const cantripsKnown = spellRefs(doc).filter(
        (s) => levelOf(s.srdId) === 0 && !s.alwaysPrepared
      ).length;
      expect.soft(cantripsKnown, `${at} cantrips known`).toBe(CANTRIPS[i]);
      expect
        .soft(
          doc.character.classes[0]?.metamagicChoices?.length ?? 0,
          `${at} Metamagic options known`
        )
        .toBe(METAMAGIC_KNOWN(level));
      // Innate Sorcery: "You can use this feature twice" (srd.txt 3934).
      expect
        .soft(tracker(doc, "sorcerer-innate-sorcery")?.total, `${at} Innate Sorcery uses`)
        .toBe(2);

      if (level === 1) return;
      const prev = must(steps[level - 2]).doc;
      expect.soft(asks?.complete, `${at} every question can be answered`).toBe(true);
      expect
        .soft(row(asks, "subclass") !== undefined, `${at} asks the subclass`)
        .toBe(level === 3);
      expect
        .soft(asksAsi(asks), `${at} asks an ASI or feat`)
        .toBe(ASI_LEVELS.includes(level));
      if (level === 19)
        epicBoonChecks(at, prev, step, "sorcerer", "boon-of-dimensional-travel", (v, m) =>
          expect.soft(v, m)
        );
      expect
        .soft(row(asks, "metamagic")?.count ?? 0, `${at} new Metamagic options asked`)
        .toBe([2, 10, 17].includes(level) ? 2 : 0);
      expect
        .soft(row(asks, "newCantrips")?.count ?? 0, `${at} new cantrips asked`)
        .toBe(must(CANTRIPS[i]) - must(CANTRIPS[i - 1]));
      // "Whenever that number increases, choose additional Sorcerer spells ... of a
      // level for which you have spell slots" (srd.txt 3914-3920).
      const spells = row(asks, "newSpells");
      expect
        .soft(spells?.count ?? 0, `${at} new prepared spells asked`)
        .toBe(must(PREPARED[i]) - must(PREPARED[i - 1]));
      if (spells) {
        const levels = spells.options.map((o) => levelOf(o.id));
        expect
          .soft(Math.max(...levels), `${at} highest spell level offered`)
          .toBe(highestSlot(level));
        expect.soft(Math.min(...levels), `${at} lowest spell level offered`).toBe(1);
        // A spell this very level hands out always prepared (Draconic Spells) is not
        // one of the player's own picks (srd.txt 3921-3924: such spells "don't count
        // against the number of spells you can prepare").
        const granted = DRACONIC_SPELLS[level] ?? [];
        const offered = spells.options
          .map((o) => o.id)
          .filter((id) => granted.includes(id));
        expect
          .soft(offered, `${at} new-spell options exclude the spells this level grants`)
          .toEqual([]);
      }
      // "Whenever you gain a Sorcerer level, you can replace one of your cantrips" and
      // "one spell on your list" (srd.txt 3909-3911, 3927-3929): optional rows.
      expect
        .soft(row(asks, "cantripRemove") !== undefined, `${at} offers a cantrip swap`)
        .toBe(true);
      expect
        .soft(row(asks, "swapRemove") !== undefined, `${at} offers a spell swap`)
        .toBe(true);
      // "Whenever you gain a Sorcerer level, you can replace one of your Metamagic
      // options with one you don't know" (srd.txt 3928-3930): an optional row.
      // (The classic sheet's Features tab also re-picks Metamagic at any time.)
      const known = prev.character.classes[0]?.metamagicChoices ?? [];
      if (known.length > 0)
        expect
          .soft(
            asks?.rows.some(
              (r) => r.count === 0 && r.options.some((o) => known.includes(o.id))
            ),
            `${at} offers to replace a known Metamagic option`
          )
          .toBe(true);
      // Elemental Affinity: "Choose one of those types: Acid, Cold, Fire, Lightning, or
      // Poison" (srd.txt 4198-4202) — asked the level it is gained.
      if (level === 6) {
        const affinity = asks?.rows.find((r) =>
          ELEMENTS.every((e) =>
            r.options.some((o) => o.id.includes(e) || o.label.toLowerCase().includes(e))
          )
        );
        expect
          .soft(affinity !== undefined, `${at} asks the Elemental Affinity type`)
          .toBe(true);
        expect.soft(affinity?.options.length, `${at} Elemental Affinity choices`).toBe(5);
      }
    });
  }
});
