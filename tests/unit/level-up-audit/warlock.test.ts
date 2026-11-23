/**
 * Level-up audit — Warlock 1 → 20 against SRD 5.2.1 (srd.txt "Warlock Features"
 * table, lines 4246-4268, the class text at 4220-4360 and the Fiend Patron at
 * 4547-4600). Every expected value below is read from that text, never from src/data.
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

// "Warlock Features" table (srd.txt 4246-4268).
const FEATURES: Record<number, string[]> = {
  1: ["Eldritch Invocations", "Pact Magic"],
  2: ["Magical Cunning"],
  9: ["Contact Patron"],
  11: ["Mystic Arcanum"],
  19: ["Epic Boon"],
  20: ["Eldritch Master"],
};
// Fiend Patron (srd.txt 4568-4600): Dark One's Blessing 3, Fiend Spells 3,
// Dark One's Own Luck 6, Fiendish Resilience 10, Hurl Through Hell 14.
const FIEND: Record<number, string[]> = {
  3: ["Dark One's Blessing", "Fiend Spells"],
  6: ["Dark One's Own Luck"],
  10: ["Fiendish Resilience"],
  14: ["Hurl Through Hell"],
};
// Fiend Spells table (srd.txt 4547-4553).
const FIEND_SPELLS: Record<number, string[]> = {
  3: ["burning-hands", "command", "scorching-ray", "suggestion"],
  5: ["fireball", "stinking-cloud"],
  7: ["fire-shield", "wall-of-fire"],
  9: ["geas", "insect-plague"],
};
// Table columns.
const INVOCATIONS = [1, 3, 3, 3, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10];
const CANTRIPS = [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
const PREPARED = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15];
const SLOTS = [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4];
const SLOT_LEVEL = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
// Mystic Arcanum: "Choose one level 6 Warlock spell" at 11, then a level 7 spell at
// 13, level 8 at 15, level 9 at 17 (srd.txt 4345-4356).
const ARCANUM: Record<number, number> = { 11: 6, 13: 7, 15: 8, 17: 9 };
// "Level 4: Ability Score Improvement ... again at Warlock levels 8, 12, and 16".
const ASI_LEVELS = [4, 8, 12, 16];
// Hit Point Die D8 (srd.txt 4181); CON 14 → +2.
const CON = 2;
const expectedHp = (l: number) => 8 + CON + (l - 1) * (5 + CON);

let steps: Step[] = [];
beforeAll(() => {
  steps = walk({
    classId: "warlock",
    subclassId: "fiend-patron",
    primary: "CHA",
    boon: "boon-of-fate",
    avoidSpells: [...Object.values(FIEND_SPELLS).flat(), "contact-other-plane"],
    level1: {
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 16 },
      skills: {
        arcana: "proficient",
        deception: "proficient",
        athletics: "proficient",
        intimidation: "proficient",
      },
      // "You know two Warlock cantrips" and "choose two level 1 Warlock spells"
      // (srd.txt 4286-4296), the SRD's recommended ones; one invocation (4228-4232).
      spells: [
        { srdId: "eldritch-blast" },
        { srdId: "prestidigitation" },
        { srdId: "charm-person", prepared: true },
        { srdId: "hex", prepared: true },
      ],
      classes: [{ classId: "warlock", level: 1, invocationChoices: ["eldritch-mind"] }],
    },
  });
});

describe("Warlock level-up audit (SRD 5.2.1)", () => {
  for (let level = 1; level <= 20; level++) {
    it(`level ${level}`, () => {
      const step = steps[level - 1];
      if (!step) throw new Error("walk did not reach this level");
      const { doc, asks } = step;
      const at = `Warlock ${level}`;
      const i = level - 1;

      expect.soft(pb(doc), `${at} proficiency bonus`).toBe(SRD_PB[i]);
      expect.soft(maxHp(doc), `${at} max HP`).toBe(expectedHp(level));

      for (let l = 1; l <= level; l++) {
        for (const name of FEATURES[l] ?? [])
          expect.soft(hasFeature(doc, name), `${at} has ${name} (L${l})`).toBe(true);
        for (const name of FIEND[l] ?? [])
          expect
            .soft(hasFeature(doc, name), `${at} has Fiend ${name} (L${l})`)
            .toBe(true);
        for (const id of FIEND_SPELLS[l] ?? []) {
          const ref = spellRefs(doc).find((s) => s.srdId === id);
          expect
            .soft(ref?.alwaysPrepared, `${at} ${id} always prepared (L${l})`)
            .toBe(true);
        }
      }
      // Contact Patron: "you always have the Contact Other Plane spell prepared"
      // (srd.txt 4328-4331).
      if (level >= 9) {
        const ref = spellRefs(doc).find((s) => s.srdId === "contact-other-plane");
        expect
          .soft(ref?.alwaysPrepared, `${at} Contact Other Plane always prepared`)
          .toBe(true);
      }

      // Columns as the sheet shows them.
      const vm = spellsVm(doc, "warlock");
      const pact = vm.slots.filter((s) => s.pactMagic);
      expect.soft(vm.slots.length, `${at} one slot pool`).toBe(1);
      expect.soft(pact[0]?.total, `${at} Pact Magic slots`).toBe(SLOTS[i]);
      expect.soft(pact[0]?.level, `${at} Pact Magic slot level`).toBe(SLOT_LEVEL[i]);
      expect
        .soft(vm.castSummary?.preparedMax, `${at} Prepared Spells (limit shown)`)
        .toBe(PREPARED[i]);
      expect
        .soft(vm.castSummary?.preparedCount, `${at} prepared spells after the picks`)
        .toBe(PREPARED[i]);
      const cantripsKnown = spellRefs(doc).filter(
        (s) => levelOf(s.srdId) === 0 && !s.alwaysPrepared && !s.grantedBy
      ).length;
      expect.soft(cantripsKnown, `${at} cantrips known`).toBe(CANTRIPS[i]);
      expect
        .soft(
          doc.character.classes[0]?.invocationChoices?.length ?? 0,
          `${at} invocations known`
        )
        .toBe(INVOCATIONS[i]);
      for (const [lvl, spellLevel] of Object.entries(ARCANUM)) {
        if (level < Number(lvl)) continue;
        const id = `warlock-mystic-arcanum-${spellLevel}th`;
        expect
          .soft(tracker(doc, id)?.total, `${at} Mystic Arcanum (level ${spellLevel}) use`)
          .toBe(1);
        const arcanum = spellRefs(doc).filter((s) => s.freeCastSource?.sourceId === id);
        expect
          .soft(arcanum.length, `${at} one level ${spellLevel} arcanum spell saved`)
          .toBe(1);
        expect
          .soft(
            arcanum.map((s) => levelOf(s.srdId)),
            `${at} arcanum spell is level ${spellLevel}`
          )
          .toEqual([spellLevel]);
      }

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
        epicBoonChecks(at, prev, step, "warlock", "boon-of-fate", (v, m) =>
          expect.soft(v, m)
        );
      expect
        .soft(row(asks, "invocations")?.count ?? 0, `${at} new invocations asked`)
        .toBe(must(INVOCATIONS[i]) - must(INVOCATIONS[i - 1]));
      expect
        .soft(row(asks, "newCantrips")?.count ?? 0, `${at} new cantrips asked`)
        .toBe(must(CANTRIPS[i]) - must(CANTRIPS[i - 1]));
      // "choose additional Warlock spells ... of a level no higher than what's shown in
      // the table's Slot Level column" (srd.txt 4291-4299).
      const spells = row(asks, "newSpells");
      expect
        .soft(spells?.count ?? 0, `${at} new prepared spells asked`)
        .toBe(must(PREPARED[i]) - must(PREPARED[i - 1]));
      if (spells) {
        const levels = spells.options.map((o) => levelOf(o.id));
        expect
          .soft(Math.max(...levels), `${at} highest spell level offered`)
          .toBe(SLOT_LEVEL[i]);
        expect.soft(Math.min(...levels), `${at} lowest spell level offered`).toBe(1);
        // A spell this very level hands out always prepared (Fiend Spells, Contact
        // Patron) is not one of the player's own picks (srd.txt 4299-4302: such
        // spells "don't count against the number of spells you can prepare").
        const granted = [
          ...(FIEND_SPELLS[level] ?? []),
          ...(level === 9 ? ["contact-other-plane"] : []),
        ];
        const offered = spells.options
          .map((o) => o.id)
          .filter((id) => granted.includes(id));
        expect
          .soft(offered, `${at} new-spell options exclude the spells this level grants`)
          .toEqual([]);
      }
      // Mystic Arcanum asked at 11/13/15/17, one spell of exactly that level.
      const arcanumRows = rowsLike(asks, /^slot:spell:/).filter((r) =>
        (r.slotRow?.slotId ?? r.key).includes("mystic-arcanum")
      );
      const want = ARCANUM[level];
      expect.soft(arcanumRows.length, `${at} Mystic Arcanum asked`).toBe(want ? 1 : 0);
      if (want && arcanumRows[0]) {
        expect.soft(arcanumRows[0].count, `${at} arcanum picks`).toBe(1);
        const levels = [
          ...new Set(arcanumRows[0].options.map((o) => levelOf(o.id))),
        ].sort();
        expect
          .soft(levels, `${at} arcanum options are only level ${want} Warlock spells`)
          .toEqual([want]);
      }
      // "you can replace one of your cantrips" / "one spell on your list" on each
      // Warlock level (srd.txt 4288-4290, 4303-4306): optional rows.
      expect
        .soft(row(asks, "cantripRemove") !== undefined, `${at} offers a cantrip swap`)
        .toBe(true);
      expect
        .soft(row(asks, "swapRemove") !== undefined, `${at} offers a spell swap`)
        .toBe(true);
      // "Replacing and Gaining Invocations. Whenever you gain a Warlock level, you can
      // replace one of your invocations" (srd.txt 4238-4241): an optional row.
      // (The classic sheet's Features tab also re-picks invocations at any time.)
      const knownInv = prev.character.classes[0]?.invocationChoices ?? [];
      expect
        .soft(
          asks?.rows.some(
            (r) => r.count === 0 && r.options.some((o) => knownInv.includes(o.id))
          ),
          `${at} offers to replace a known invocation`
        )
        .toBe(true);
    });
  }
});
