/**
 * A third-caster subclass (a class that doesn't cast, whose subclass does) learns
 * cantrips and spells from its subclass's own table. Picked late on the sheet, or
 * on the level-up (at its level or late), they are asked or owed with the right
 * counts, from the subclass's list. A synthetic subclass stands in for one: the
 * 2024 third-caster tables (cantrips 2 from level 3, 3 from 10; prepared spells 3 at
 * 3, 4 at 4, 5 at 7, 6 at 8, 7 at 10; slots up to level 1 until 7, level 2 from 7).
 */
import { describe, expect, it, vi } from "vitest";

const THIRD = {
  ability: "INT",
  spellList: "wizard",
  fixedCantrips: ["mage-hand"],
  cantripsKnown: [0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  preparedKnown: [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13],
  casterFraction: "third",
};

vi.mock("@/data/classes", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/data/classes")>();
  return {
    ...real,
    getClassTable: (id: string) => {
      const table = real.getClassTable(id);
      if (!table || id !== "rogue") return table;
      return {
        ...table,
        subclasses: [
          ...table.subclasses,
          { id: "test-trickster", featureIds: [], spellcasting: THIRD },
        ],
      };
    },
  };
});

// The synthetic subclass has no catalogue name: it reads as its id.
vi.mock("@/i18n/resolver", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/i18n/resolver")>();
  return {
    ...real,
    localizeSrd: (...args: Parameters<typeof real.localizeSrd>) =>
      args[1] === "test-trickster" ? "Test Trickster" : real.localizeSrd(...args),
  };
});

import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type LevelUpAnswers,
} from "@/domains/leveling/level-up-asks";
import { getSpellById } from "@/data/spells";
import { buildScenario } from "@/lib/dev-scenarios";
import { commitLevelUp } from "@/lib/level-up-commit";
import {
  applyOwedClassPicks,
  classPickPool,
  owedClassPicks,
} from "@/lib/owed-class-picks";
import { resolveOwedSubclass } from "@/lib/subclass-pick";
import { owedClassPickLabel, owedClassPickRows } from "@/lib/views/owed-class-picks-view";
import type { CharacterDoc } from "@/types/character";

const rogue = (level: number, subclassId?: string) =>
  buildScenario({
    name: "Trickster",
    raceId: "halfling",
    background: "",
    classId: "rogue",
    level,
    ...(subclassId ? { subclassId } : {}),
    abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 14, WIS: 12, CHA: 10 },
    skills: { stealth: "proficient", perception: "proficient" },
  });

const owedSpells = (doc: CharacterDoc) =>
  owedClassPicks(doc.character, doc.session.grantBundleChoices).filter(
    (o) => o.pick === "cantrips" || o.pick === "spells"
  );

/** Every level-up row answered with its first options, the subclass with `sub`. */
function answer(doc: CharacterDoc, sub: string | null) {
  let a: LevelUpAnswers = NO_ANSWERS;
  for (let pass = 0; pass < 8; pass++) {
    for (const row of levelUpAsks(doc, "rogue", a, "en").rows) {
      if (row.count === 0 || row.picked.length >= row.count) continue;
      if (row.key === "asiMode") {
        a = toggleAnswer(a, row, "plus2");
        continue;
      }
      const ids =
        row.key === "subclass" ? (sub ? [sub] : []) : row.options.map((o) => o.id);
      for (const id of ids) {
        const now = levelUpAsks(doc, "rogue", a, "en").rows.find(
          (r) => r.key === row.key
        );
        if (!now || now.picked.length >= now.count) break;
        a = toggleAnswer(a, now, id);
      }
    }
  }
  return levelUpAsks(doc, "rogue", a, "en");
}

const counts = (doc: CharacterDoc, sub: string | null) => {
  const rows = answer(doc, sub).rows;
  const row = (key: string) => rows.find((r) => r.key === key);
  return {
    cantrips: row("newCantrips")?.count ?? 0,
    spells: row("newSpells")?.count ?? 0,
  };
};

describe("a third caster picked late on the sheet", () => {
  const picked = () => resolveOwedSubclass(rogue(6), "rogue", "test-trickster");

  it("owes its 2 cantrips and 4 spells at Rogue 6; the fixed cantrip isn't one", () => {
    const doc = picked();
    expect(doc.character.spells.map((s) => ("custom" in s ? "" : s.srdId))).toContain(
      "mage-hand"
    );
    expect(owedSpells(doc)).toEqual([
      { classId: "rogue", pick: "cantrips", owed: 2 },
      { classId: "rogue", pick: "spells", owed: 4 },
    ]);
  });

  it("offers them from the subclass's list, spells up to its slots (level 1 at 6)", () => {
    const doc = picked();
    const cantrips = classPickPool(doc.character, "rogue", "cantrips");
    expect(cantrips).toContain("fire-bolt");
    expect(cantrips).not.toContain("mage-hand");
    const spells = classPickPool(doc.character, "rogue", "spells");
    expect(spells).toContain("magic-missile");
    expect(spells.every((id) => getSpellById(id)?.level === 1)).toBe(true);
    expect(spells.every((id) => getSpellById(id)?.classes.includes("wizard"))).toBe(true);
    const rows = owedClassPickRows(doc.character, "en");
    // The same spells, in the row's display-name order.
    expect(
      rows
        .find((r) => r.pick === "spells")
        ?.options.map((o) => o.id)
        .sort()
    ).toEqual([...spells].sort());
    expect(rows.find((r) => r.pick === "cantrips")?.options.map((o) => o.id)).toContain(
      "fire-bolt"
    );
  });

  it("answered, stores the spells prepared for the Rogue and owes nothing", () => {
    const doc = picked();
    const pool = (pick: "cantrips" | "spells", n: number) =>
      classPickPool(doc.character, "rogue", pick).slice(0, n);
    const next = applyOwedClassPicks(doc.character, [
      { classId: "rogue", pick: "cantrips", ids: pool("cantrips", 2) },
      { classId: "rogue", pick: "spells", ids: pool("spells", 4) },
    ]);
    expect(owedClassPicks(next)).toEqual([]);
    const spell = next.spells.find(
      (s) => !("custom" in s) && s.srdId === pool("spells", 1)[0]
    );
    expect(spell).toMatchObject({ prepared: true, viaClass: "rogue" });
  });

  it('names them «4 incantesimi (Ladro)» / "1 spell (Rogue)"', () => {
    expect(owedClassPickLabel("spells", 4, "rogue", "it")).toBe("4 incantesimi (Ladro)");
    expect(owedClassPickLabel("spells", 1, "rogue", "en")).toBe("1 spell (Rogue)");
  });

  it("an always-prepared spell of its list is not one of them", () => {
    const doc = picked();
    const withShield = {
      ...doc.character,
      spells: [
        ...doc.character.spells,
        { srdId: "shield", prepared: true, alwaysPrepared: true },
      ],
    };
    expect(owedClassPicks(withShield).find((o) => o.pick === "spells")?.owed).toBe(4);
  });

  it("a Rogue 6 Thief owes no spells", () => {
    expect(owedSpells(rogue(6, "thief"))).toEqual([]);
  });
});

describe("a third caster on the level-up", () => {
  it("picked at Rogue 3 asks 2 cantrips and 3 spells", () => {
    expect(counts(rogue(2), "test-trickster")).toEqual({ cantrips: 2, spells: 3 });
  });

  it("picked late at Rogue 7 asks every cantrip and spell up to 7 (2 and 5)", () => {
    expect(counts(rogue(6), "test-trickster")).toEqual({ cantrips: 2, spells: 5 });
  });

  it("held at Rogue 10 asks only what the level adds (1 and 1)", () => {
    const at9 = resolveOwedSubclass(rogue(9), "rogue", "test-trickster");
    const filled = applyOwedClassPicks(
      at9.character,
      (["cantrips", "spells"] as const).map((pick) => ({
        classId: "rogue",
        pick,
        ids: classPickPool(at9.character, "rogue", pick).slice(0, 6),
      }))
    );
    expect(counts({ ...at9, character: filled }, null)).toEqual({
      cantrips: 1,
      spells: 1,
    });
  });

  it("the level-up's picks leave nothing owed, late or on time", () => {
    for (const from of [2, 6]) {
      const doc = rogue(from);
      const after = commitLevelUp(doc, answer(doc, "test-trickster").picks);
      expect(owedSpells(after)).toEqual([]);
    }
  });

  it("offers the level-up's cantrips from the subclass's list", () => {
    const row = answer(rogue(6), "test-trickster").rows.find(
      (r) => r.key === "newCantrips"
    );
    expect(row?.options.map((o) => o.id)).toContain("fire-bolt");
  });
});
