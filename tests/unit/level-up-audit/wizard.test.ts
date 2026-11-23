/**
 * Level-up audit — Wizard 1 → 20 against SRD 5.2.1 (srd.txt "Wizard Features" table,
 * lines 4622-4644, the class text at 4605-4750 and the Evoker at 4878-4930). Every
 * expected value below is read from that text, never from src/data.
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
  rowsLike,
  slotRow,
  spellRefs,
  spellsVm,
  srdSpell,
  SRD_PB,
  tracker,
  walk,
  type Step,
} from "./_walk-rswz";
import { eligibleSpellMasteryPicks } from "@/lib/spell-mastery-pick";
import { levelUpAsks, NO_ANSWERS, toggleAnswer } from "@/domains/leveling/level-up-asks";
import { commitLevelUp } from "@/lib/level-up-commit";

/** A value the walk must have produced; throws (failing the test) when it did not. */
function must<T>(v: T | null | undefined): T {
  if (v === null || v === undefined) throw new Error("audit walk: missing value");
  return v;
}

// "Wizard Features" table (srd.txt 4622-4644).
const FEATURES: Record<number, string[]> = {
  1: ["Spellcasting", "Ritual Adept", "Arcane Recovery"],
  2: ["Scholar"],
  5: ["Memorize Spell"],
  18: ["Spell Mastery"],
  19: ["Epic Boon"],
  20: ["Signature Spells"],
};
// Evoker (srd.txt 4878-4930): Evocation Savant 3, Potent Cantrip 3, Sculpt Spells 6,
// Empowered Evocation 10, Overchannel 14.
const EVOKER: Record<number, string[]> = {
  3: ["Evocation Savant", "Potent Cantrip"],
  6: ["Sculpt Spells"],
  10: ["Empowered Evocation"],
  14: ["Overchannel"],
};
const CANTRIPS = [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
const PREPARED = [
  4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25,
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
const highestSlot = (l: number) =>
  (SLOTS[l - 1] ?? []).reduce((m, n, i) => (n > 0 ? i + 1 : m), 0);
// "Level 4: Ability Score Improvement ... again at Wizard levels 8, 12, and 16".
const ASI_LEVELS = [4, 8, 12, 16];
// Scholar: "Arcana, History, Investigation, Medicine, Nature, or Religion" (srd.txt 4668-4671).
const SCHOLAR = ["arcana", "history", "investigation", "medicine", "nature", "religion"];
// Hit Point Die D6 (srd.txt 4600); CON 14 → +2.
const CON = 2;
const expectedHp = (l: number) => 6 + CON + (l - 1) * (4 + CON);
const BOOK_START = [
  "detect-magic",
  "feather-fall",
  "mage-armor",
  "magic-missile",
  "sleep",
  "thunderwave",
];

let steps: Step[] = [];
beforeAll(() => {
  steps = walk({
    classId: "wizard",
    subclassId: "evoker",
    primary: "INT",
    boon: "boon-of-spell-recall",
    level1: {
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 16, WIS: 12, CHA: 10 },
      skills: {
        arcana: "proficient",
        history: "proficient",
        athletics: "proficient",
        intimidation: "proficient",
      },
      // "You know three Wizard cantrips" and the book "starts with six level 1 Wizard
      // spells", four prepared (srd.txt 4612-4616, 4657-4662, 4675-4678): the SRD's
      // recommended ones.
      spells: [
        { srdId: "light" },
        { srdId: "mage-hand" },
        { srdId: "ray-of-frost" },
        ...BOOK_START.map((srdId, i) => ({ srdId, prepared: i < 4 })),
      ],
    },
  });
});

const isSavant = (key: string) => key.includes("evocation-savant");

describe("Wizard level-up audit (SRD 5.2.1)", () => {
  for (let level = 1; level <= 20; level++) {
    it(`level ${level}`, () => {
      const step = steps[level - 1];
      if (!step) throw new Error("walk did not reach this level");
      const { doc, asks } = step;
      const at = `Wizard ${level}`;
      const i = level - 1;

      expect.soft(pb(doc), `${at} proficiency bonus`).toBe(SRD_PB[i]);
      expect.soft(maxHp(doc), `${at} max HP`).toBe(expectedHp(level));

      for (let l = 1; l <= level; l++) {
        for (const name of FEATURES[l] ?? [])
          expect.soft(hasFeature(doc, name), `${at} has ${name} (L${l})`).toBe(true);
        for (const name of EVOKER[l] ?? [])
          expect
            .soft(hasFeature(doc, name), `${at} has Evoker ${name} (L${l})`)
            .toBe(true);
      }

      // Columns as the sheet shows them.
      expect.soft(slotRow(doc, "wizard"), `${at} spell slots`).toEqual(SLOTS[i]);
      const cast = spellsVm(doc, "wizard").castSummary;
      expect
        .soft(cast?.preparedMax, `${at} Prepared Spells (limit shown)`)
        .toBe(PREPARED[i]);
      // Signature Spells (20) are "always prepared" and so stop counting against the
      // limit (srd.txt 4679-4682): the commit fills the limit before they are chosen.
      const signature = spellRefs(doc).filter((s) => s.wizardSignatureSpell).length;
      expect
        .soft(
          (cast?.preparedCount ?? 0) + signature,
          `${at} prepared spells after the picks`
        )
        .toBe(PREPARED[i]);
      const cantripsKnown = spellRefs(doc).filter(
        (s) => levelOf(s.srdId) === 0 && !s.alwaysPrepared && !s.grantedBy
      ).length;
      expect.soft(cantripsKnown, `${at} cantrips known`).toBe(CANTRIPS[i]);
      // The book: six at 1, "Whenever you gain a Wizard level after 1, add two Wizard
      // spells" (srd.txt 4664-4667); Evocation Savant's free spells come on top.
      const freeBook = spellRefs(doc).filter(
        (s) =>
          levelOf(s.srdId) > 0 &&
          (!s.alwaysPrepared || s.wizardSignatureSpell) &&
          !s.grantedBy
      ).length;
      expect.soft(freeBook, `${at} spellbook (own picks)`).toBe(6 + 2 * (level - 1));
      // Arcane Recovery: once per Long Rest (srd.txt 4653-4664).
      expect
        .soft(tracker(doc, "wizard-arcane-recovery")?.total, `${at} Arcane Recovery use`)
        .toBe(1);

      if (level === 1) return;
      const prev = must(steps[level - 2]).doc;
      const plan = must(asks).plan;
      expect.soft(asks?.complete, `${at} every question can be answered`).toBe(true);
      expect
        .soft(row(asks, "subclass") !== undefined, `${at} asks the subclass`)
        .toBe(level === 3);
      expect
        .soft(asksAsi(asks), `${at} asks an ASI or feat`)
        .toBe(ASI_LEVELS.includes(level));
      if (level === 19)
        epicBoonChecks(at, prev, step, "wizard", "boon-of-spell-recall", (v, m) =>
          expect.soft(v, m)
        );
      expect
        .soft(row(asks, "newCantrips")?.count ?? 0, `${at} new cantrips asked`)
        .toBe(must(CANTRIPS[i]) - must(CANTRIPS[i - 1]));
      const book = row(asks, "newSpells");
      expect.soft(book?.count ?? 0, `${at} spellbook picks asked`).toBe(2);
      if (book) {
        const levels = book.options.map((o) => levelOf(o.id));
        expect
          .soft(Math.max(...levels), `${at} highest book level offered`)
          .toBe(highestSlot(level));
        expect.soft(Math.min(...levels), `${at} lowest book level offered`).toBe(1);
      }
      // Scholar at 2: Expertise in one of six skills you are proficient in.
      const expertiseRows = rowsLike(asks, /^slot:expertise:/);
      expect.soft(expertiseRows.length, `${at} Scholar asked`).toBe(level === 2 ? 1 : 0);
      if (level === 2 && expertiseRows[0]) {
        expect.soft(expertiseRows[0].count, `${at} Scholar picks`).toBe(1);
        for (const o of expertiseRows[0].options)
          expect.soft(SCHOLAR, `${at} Scholar option ${o.id}`).toContain(o.id);
        expect
          .soft(
            SCHOLAR.filter((s) => doc.character.skills[s] === "expertise").length,
            `${at} Scholar Expertise saved`
          )
          .toBe(1);
        // Answering the row with a skill outside the six: does the commit save it?
        const outside = expertiseRows[0].options.find((o) => !SCHOLAR.includes(o.id));
        if (outside) {
          let a = NO_ANSWERS;
          for (const r of must(asks).rows) {
            if (r.key === expertiseRows[0].key) continue;
            for (const id of r.picked) a = toggleAnswer(a, r, id);
          }
          a = toggleAnswer(a, expertiseRows[0], outside.id);
          const saved = commitLevelUp(prev, levelUpAsks(prev, "wizard", a, "en").picks);
          expect
            .soft(
              saved.character.skills[outside.id],
              `${at} Scholar saves Expertise in ${outside.id}`
            )
            .not.toBe("expertise");
        }
      }
      // Evocation Savant: "Choose two Wizard spells from the Evocation school, each of
      // which must be no higher than level 2" at 3; "whenever you gain access to a new
      // level of spell slots in this class, you can add one Wizard spell from the
      // Evocation school" (srd.txt 4884-4893).
      const savant = rowsLike(asks, /^slot:spell:/).filter((r) => isSavant(r.key));
      const newSlotLevel = highestSlot(level) > highestSlot(level - 1);
      const wantSavant = level === 3 ? 2 : level > 3 && newSlotLevel ? 1 : 0;
      expect
        .soft(
          savant.reduce((n, r) => n + r.count, 0),
          `${at} Evocation Savant picks`
        )
        .toBe(wantSavant);
      for (const r of savant) {
        const offered = r.options.map((o) => srdSpell(o.id));
        expect
          .soft(
            offered.every((s) => s?.school === "evocation"),
            `${at} Savant options are Evocation`
          )
          .toBe(true);
        const max = level === 3 ? 2 : highestSlot(level);
        expect
          .soft(
            Math.max(...offered.map((s) => s?.level ?? 0)),
            `${at} Savant highest level`
          )
          .toBe(max);
      }
      // Spell Mastery at 18 (srd.txt 4726-4735): "Choose a level 1 and a level 2 spell
      // in your spellbook that have a casting time of an action."
      expect.soft(plan.needsSpellMastery, `${at} asks Spell Mastery`).toBe(level === 18);
      if (level === 18) {
        for (const lvl of [1, 2] as const) {
          const eligible = eligibleSpellMasteryPicks(prev.character.spells, lvl).map(
            (s) => s.id
          );
          const notAction = eligible.filter(
            (id) => srdSpell(id)?.castingTime !== "action"
          );
          expect
            .soft(
              notAction,
              `${at} Spell Mastery level ${lvl} options without an action casting time`
            )
            .toEqual([]);
        }
        // The new screen marks this level unsupported and hands it to the classic
        // wizard (asks.supported false); the walker commits what that wizard would.
      }
      if (level >= 18) {
        const mastered = spellRefs(doc).filter((s) => s.wizardSpellMastery);
        expect
          .soft(mastered.map((s) => levelOf(s.srdId)).sort(), `${at} mastered spells`)
          .toEqual([1, 2]);
        // "You always have those spells prepared" (srd.txt 4731), and spells a Wizard
        // feature keeps always prepared "don't count against the number of spells you
        // can prepare" (srd.txt 4690-4692).
        expect
          .soft(
            mastered.every((s) => s.alwaysPrepared === true),
            `${at} mastered spells always prepared`
          )
          .toBe(true);
        const prepared = spellsVm(doc, "wizard").castSummary?.preparedCount ?? 0;
        const countedMastered = mastered.filter(
          (s) => s.prepared && !s.alwaysPrepared
        ).length;
        expect
          .soft(
            countedMastered,
            `${at} mastered spells counted against the prepared limit (of ${prepared})`
          )
          .toBe(0);
      }
      // Signature Spells at 20 (srd.txt 4745-4752): two level 3 spells, always prepared.
      expect
        .soft(plan.needsSignatureSpells, `${at} asks Signature Spells`)
        .toBe(level === 20);
      if (level === 20) {
        const sig = spellRefs(doc).filter((s) => s.wizardSignatureSpell);
        expect
          .soft(
            sig.map((s) => levelOf(s.srdId)),
            `${at} signature spells`
          )
          .toEqual([3, 3]);
        expect
          .soft(
            sig.every((s) => s.alwaysPrepared),
            `${at} signature spells always prepared`
          )
          .toBe(true);
      }
    });
  }
});
