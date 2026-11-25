/**
 * Divine Order «Thaumaturge. You know one extra cantrip from the Cleric spell list»
 * (SRD 5.2.1), Primal Order «Magician» the same from the Druid list. A character
 * who takes its first Cleric or Druid level through the level-up picks the order
 * there, so the level-up asks the extra cantrip under it, waits for it, and stores
 * it as creation does.
 */
import { describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type LevelUpAnswers,
} from "@/domains/leveling/level-up-asks";
import { commitLevelUp } from "@/lib/level-up-commit";
import { owedClassPicks } from "@/lib/owed-class-picks";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const ORDERS = [
  {
    classId: "cleric",
    bundle: "cleric-divine-order",
    extra: "thaumaturge",
    plain: "protector",
  },
  { classId: "druid", bundle: "druid-primal-order", extra: "magician", plain: "warden" },
] as const;

const fighter = (): CharacterDoc =>
  makeCharacterDoc({
    classes: [{ classId: "fighter", level: 3 }],
    abilityScores: { STR: 15, DEX: 13, CON: 14, INT: 10, WIS: 14, CHA: 8 },
    spells: [],
  });

const row = (doc: CharacterDoc, classId: string, a: LevelUpAnswers, key: string) =>
  levelUpAsks(doc, classId, a, "en").rows.find((r) => r.key === key);

const orderCantripRows = (
  doc: CharacterDoc,
  classId: string,
  bundle: string,
  a: LevelUpAnswers
) =>
  levelUpAsks(doc, classId, a, "en").rows.filter((r) =>
    r.key.startsWith(`slot:spell:${bundle}:`)
  );

/** The answers with the order picked and every other count row filled. */
function answerAll(doc: CharacterDoc, classId: string, bundle: string, order: string) {
  let a = toggleAnswer(
    NO_ANSWERS,
    { key: `bundle:${bundle}`, title: "", count: 1, picked: [], options: [] },
    order
  );
  for (let pass = 0; pass < 6; pass++) {
    for (const { key } of levelUpAsks(doc, classId, a, "en").rows) {
      // Each pick reads the row afresh: a pick elsewhere can take an option away.
      for (;;) {
        const now = row(doc, classId, a, key);
        const next = now?.options.find((o) => !now.picked.includes(o.id));
        if (!now || !next || now.count === 0 || now.picked.length >= now.count) break;
        a = toggleAnswer(a, now, next.id);
      }
    }
  }
  return a;
}

const cantripCount = (doc: CharacterDoc) =>
  doc.character.spells.filter((s) => "srdId" in s && getSpellById(s.srdId)?.level === 0)
    .length;

describe("a first Cleric or Druid level taken through the level-up", () => {
  for (const { classId, bundle, extra, plain } of ORDERS) {
    it(`${classId}: ${extra} asks one extra ${classId} cantrip; ${plain} none`, () => {
      const doc = fighter();
      const pick = (order: string) =>
        toggleAnswer(
          NO_ANSWERS,
          { key: `bundle:${bundle}`, title: "", count: 1, picked: [], options: [] },
          order
        );
      const rows = orderCantripRows(doc, classId, bundle, pick(extra));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.count).toBe(1);
      expect(
        rows[0]?.options.every((o) =>
          (getSpellById(o.id)?.classes as readonly string[] | undefined)?.includes(
            classId
          )
        )
      ).toBe(true);
      expect(orderCantripRows(doc, classId, bundle, pick(plain))).toHaveLength(0);
    });

    it(`${classId}: the level waits for the cantrip, and the commit stores it`, () => {
      const doc = fighter();
      const full = answerAll(doc, classId, bundle, extra);
      expect(levelUpAsks(doc, classId, full, "en").complete).toBe(true);
      const withoutCantrip = { ...full, choicePicks: { ...full.choicePicks, spell: {} } };
      expect(levelUpAsks(doc, classId, withoutCantrip, "en").complete).toBe(false);

      const plainDoc = commitLevelUp(
        doc,
        levelUpAsks(doc, classId, answerAll(doc, classId, bundle, plain), "en").picks
      );
      const next = commitLevelUp(doc, levelUpAsks(doc, classId, full, "en").picks);
      expect(cantripCount(next)).toBe(cantripCount(plainDoc) + 1);
      expect(
        next.character.spells.some(
          (s) => "srdId" in s && s.grantedBy === `${bundle}:${extra}`
        )
      ).toBe(true);
      // «Scelte da completare» reads it as made: nothing of the class is owed.
      expect(
        owedClassPicks(next.character, next.session.grantBundleChoices).filter(
          (o) => o.classId === classId
        )
      ).toEqual([]);
    });

    it(`${classId}: a cantrip picked in one row is not offered in the other`, () => {
      const doc = fighter();
      const a = answerAll(doc, classId, bundle, extra);
      const asks = levelUpAsks(doc, classId, a, "en");
      const orderRow = asks.rows.find((r) => r.key.startsWith(`slot:spell:${bundle}:`));
      const newRow = asks.rows.find((r) => r.key === "newCantrips");
      const orderPick = orderRow?.picked[0] ?? "";
      expect(newRow?.options.map((o) => o.id)).not.toContain(orderPick);
      for (const id of newRow?.picked ?? [])
        expect(orderRow?.options.map((o) => o.id)).not.toContain(id);
    });

    it(`${classId}: a level in the class with the order chosen asks it no more`, () => {
      const doc = makeCharacterDoc(
        // The order feature's id is its bundle's key.
        { classes: [{ classId, level: 1 }], spells: [], features: [{ srdId: bundle }] },
        { grantBundleChoices: { [bundle]: extra } }
      );
      expect(
        orderCantripRows(doc, classId, bundle, {
          ...NO_ANSWERS,
          bundlePicks: { [bundle]: extra },
        })
      ).toHaveLength(0);
    });
  }
});
