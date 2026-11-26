/**
 * A character past its class's subclass level with no subclass owes one (#1393): a
 * live Rogue 6 has none. «Scelte da completare» lists it, and picking it on the sheet
 * applies the same step the level-up commit uses (`applySubclass`): the subclass id,
 * every subclass feature up to the class's level, the subclass spells, and the
 * choices those features ask. Cases from SRD 5.2.1: Rogue and Sorcerer gain their
 * subclass at level 3; the Thief's features come at 3, 9, 13 and 17.
 */
import { describe, expect, it } from "vitest";

import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type LevelUpAnswers,
} from "@/domains/leveling/level-up-asks";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { maxHpBase } from "@/lib/aggregate-character";
import { commitLevelUp, type LevelUpPicks } from "@/lib/level-up-commit";
import { applyOwedClassPicks, owedClassPicks } from "@/lib/owed-class-picks";
import {
  resolveOwedSubclass,
  subclassFeaturesThrough,
  subclassPickChoices,
} from "@/lib/subclass-pick";
import { owedChoiceCount, unresolvedBuildChoices } from "@/lib/unresolved-build-choices";
import { owedClassPickRows } from "@/lib/views/owed-class-picks-view";
import { subclassReveal } from "@/lib/views/level-up-view";
import { pendingSpeciesItems } from "@/lib/views/species-choices-view";
import { srdEn } from "@/i18n/srd-en";
import { EMPTY_CHOICE_PICKS, type ChoicePicks } from "@/lib/feature-choices";
import type { CharacterDoc } from "@/types/character";

const SCORES = { STR: 10, DEX: 16, CON: 14, INT: 12, WIS: 12, CHA: 16 };

const build = (classId: string, level: number, extra: Partial<ScenarioSpec> = {}) =>
  buildScenario({
    name: "No subclass",
    raceId: "halfling",
    background: "",
    classId,
    level,
    abilityScores: SCORES,
    skills: { stealth: "proficient", perception: "proficient", acrobatics: "proficient" },
    ...extra,
  });

const featureNames = (doc: CharacterDoc) =>
  doc.character.features.flatMap((f) =>
    "custom" in f ? [] : [srdEn("class-feature", f.srdId, "name") ?? f.srdId]
  );

const subclassOwed = (doc: CharacterDoc) =>
  owedClassPicks(doc.character, doc.session.grantBundleChoices).filter(
    (o) => o.pick === "subclass"
  );

describe("the owed subclass", () => {
  it("a Rogue 6 with no subclass owes one", () => {
    const doc = build("rogue", 6);
    expect(subclassOwed(doc)).toEqual([{ classId: "rogue", pick: "subclass", owed: 1 }]);
    expect(unresolvedBuildChoices(doc.character, doc.session)).toContainEqual({
      kind: "class-pick",
      classId: "rogue",
      pick: "subclass",
      owed: 1,
    });
    expect(owedChoiceCount(doc.character, doc.session)).toBeGreaterThanOrEqual(1);
  });

  it("a Rogue 3, at the subclass level, owes one", () => {
    expect(subclassOwed(build("rogue", 3))).toHaveLength(1);
  });

  it("a Rogue 2 does not", () => {
    const doc = build("rogue", 2);
    expect(subclassOwed(doc)).toEqual([]);
    expect(owedChoiceCount(doc.character, doc.session)).toBe(0);
  });

  it("a Rogue 6 Thief does not", () => {
    expect(subclassOwed(build("rogue", 6, { subclassId: "thief" }))).toEqual([]);
  });

  it("the banner names it «Rogue subclass», with the class's subclasses to pick", () => {
    const doc = build("rogue", 6);
    const items = pendingSpeciesItems(doc.character, doc.session, "en");
    expect(items.map((i) => ("label" in i ? i.label : ""))).toContain("Rogue subclass");
    const it_ = pendingSpeciesItems(doc.character, doc.session, "it");
    expect(it_.map((i) => ("label" in i ? i.label : ""))).toContain(
      "Sottoclasse del Ladro"
    );
    const row = owedClassPickRows(doc.character, "en").find((r) => r.pick === "subclass");
    expect(row?.options.map((o) => o.id)).toContain("thief");
    expect(row?.options.find((o) => o.id === "thief")?.name).toBe("Thief");
  });
});

describe("picking the owed subclass on the sheet", () => {
  it("the Thief at Rogue 6 brings its level-3 features, and nothing from level 9", () => {
    const after = resolveOwedSubclass(build("rogue", 6), "rogue", "thief");
    expect(after.character.classes[0]?.subclassId).toBe("thief");
    const names = featureNames(after);
    expect(names).toEqual(expect.arrayContaining(["Fast Hands", "Second-Story Work"]));
    expect(names).not.toContain("Supreme Sneak");
    expect(names).not.toContain("Use Magic Device");
  });

  it("after the pick, nothing is owed", () => {
    const after = resolveOwedSubclass(build("rogue", 6), "rogue", "thief");
    expect(subclassOwed(after)).toEqual([]);
    expect(owedChoiceCount(after.character, after.session)).toBe(0);
  });

  it("a subclass the class does not have writes nothing", () => {
    const doc = build("rogue", 6);
    expect(resolveOwedSubclass(doc, "rogue", "champion")).toBe(doc);
  });

  it("a subclass not owed writes nothing", () => {
    const doc = build("rogue", 2);
    expect(resolveOwedSubclass(doc, "rogue", "thief")).toBe(doc);
  });

  it("a plain class-pick answer leaves the subclass to its own step", () => {
    const doc = build("rogue", 6);
    const next = applyOwedClassPicks(doc.character, [
      { classId: "rogue", pick: "subclass", ids: ["thief"] },
    ]);
    expect(next).toBe(doc.character);
  });

  it("Draconic Sorcery at Sorcerer 6: Draconic Resilience's Hit Points count for every level", () => {
    const doc = build("sorcerer", 6);
    const after = resolveOwedSubclass(doc, "sorcerer", "draconic-sorcery", {
      bundlePicks: firstBundles(doc, "sorcerer", "draconic-sorcery"),
    });
    const before = maxHpBase(doc.character, doc.session);
    expect(maxHpBase(after.character, after.session)).toBe(before + 6);
    expect(after.session.hp.current).toBe(doc.session.hp.current + 6);
  });

  it("a College of Lore at Bard 6 asks its level-3 skills and its level-6 spells", () => {
    const doc = build("bard", 6);
    const { slots } = subclassPickChoices(doc, "bard", "college-of-lore");
    expect(slots.skill.map((s) => s.amount)).toEqual([3]);
    expect(slots.spell.length).toBeGreaterThan(0);
  });

  it("an unanswered choice the subclass asks writes nothing", () => {
    const doc = build("bard", 6);
    expect(resolveOwedSubclass(doc, "bard", "college-of-lore")).toBe(doc);
  });

  it("an unanswered option bundle writes nothing (Elemental Affinity at Sorcerer 6)", () => {
    const doc = build("sorcerer", 6);
    expect(subclassPickChoices(doc, "sorcerer", "draconic-sorcery").bundles).toHaveLength(
      1
    );
    expect(resolveOwedSubclass(doc, "sorcerer", "draconic-sorcery")).toBe(doc);
  });

  it("the features a pick brings are the subclass's up to the level", () => {
    expect(
      subclassFeaturesThrough("rogue", "thief", 9).map(
        (f) => srdEn("class-feature", f.srdId, "name") ?? f.srdId
      )
    ).toEqual(expect.arrayContaining(["Fast Hands", "Supreme Sneak"]));
    expect(subclassFeaturesThrough("rogue", "thief", 2)).toEqual([]);
  });
});

describe("the subclass reveal, before the pick", () => {
  it("a Thief picked at Rogue 6 shows what it brings from level 3", () => {
    const names = subclassReveal("rogue", "thief", 6, "en").features.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["Fast Hands", "Second-Story Work"]));
    expect(names).not.toContain("Supreme Sneak");
  });
});

// ── The level-up and the sheet produce the same character ─────────────────────

/** The first options of the bundles the subclass asks. */
function firstBundles(doc: CharacterDoc, classId: string, sub: string) {
  return Object.fromEntries(
    subclassPickChoices(doc, classId, sub).bundles.map((b) => [
      b.bundleKey,
      b.options[0]?.id ?? "",
    ])
  );
}

/** Every level-up row answered with its first options, the subclass with `sub`. */
function answer(doc: CharacterDoc, classId: string, sub: string) {
  let a: LevelUpAnswers = NO_ANSWERS;
  for (let pass = 0; pass < 8; pass++) {
    for (const row of levelUpAsks(doc, classId, a, "en").rows) {
      if (row.count === 0 || row.picked.length >= row.count) continue;
      if (row.key === "asiMode") {
        a = toggleAnswer(a, row, "plus2");
        continue;
      }
      const ids = row.key === "subclass" ? [sub] : row.options.map((o) => o.id);
      for (const id of ids) {
        const now = levelUpAsks(doc, classId, a, "en").rows.find(
          (r) => r.key === row.key
        );
        if (!now || now.picked.length >= now.count) break;
        a = toggleAnswer(a, now, id);
      }
    }
  }
  const asks = levelUpAsks(doc, classId, a, "en");
  expect(asks.complete).toBe(true);
  return asks.picks;
}

/** The picks a subclass's features own: slots under its feature ids, its bundles. */
function split(picks: LevelUpPicks, classId: string, sub: string, level: number) {
  const ids = subclassFeaturesThrough(classId, sub, level).map((f) => f.srdId);
  const mine = (slotId: string) => ids.some((id) => slotId.startsWith(`${id}:`));
  const part = (keep: boolean): ChoicePicks => {
    const out = { ...EMPTY_CHOICE_PICKS } as Record<string, Record<string, unknown>>;
    for (const [kind, bySlot] of Object.entries(picks.choicePicks)) {
      out[kind] = Object.fromEntries(
        Object.entries(bySlot as Record<string, unknown>).filter(
          ([slotId]) => mine(slotId) === keep
        )
      );
    }
    return out as unknown as ChoicePicks;
  };
  return { subclass: part(true), rest: part(false) };
}

const normal = (doc: CharacterDoc) => ({
  ...doc.character,
  features: [...doc.character.features].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  ),
  spells: [...doc.character.spells].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))
  ),
  levelUpChecklist: null,
});

describe("the level-up and the sheet apply a subclass the same way", () => {
  const cases: Array<[string, string, number]> = [
    ["rogue", "thief", 3],
    ["rogue", "thief", 6],
    ["sorcerer", "draconic-sorcery", 6],
    ["bard", "college-of-lore", 6],
    ["druid", "circle-of-the-land", 3],
  ];
  for (const [classId, sub, level] of cases) {
    it(`${sub} picked at ${classId} ${String(level)}`, () => {
      const doc = build(classId, level - 1);
      const picks = answer(doc, classId, sub);
      const viaLevelUp = commitLevelUp(doc, picks);

      const { subclass, rest } = split(picks, classId, sub, level);
      const bundles = subclassPickChoices(
        {
          ...doc,
          character: { ...doc.character, classes: viaLevelUp.character.classes },
        },
        classId,
        sub
      ).bundles.map((b) => b.bundleKey);
      const subBundles = Object.fromEntries(
        Object.entries(picks.bundlePicks).filter(([k]) => bundles.includes(k))
      );
      const without = commitLevelUp(doc, {
        ...picks,
        subclassId: null,
        choicePicks: rest,
        bundlePicks: Object.fromEntries(
          Object.entries(picks.bundlePicks).filter(([k]) => !bundles.includes(k))
        ),
      });
      expect(subclassOwed(without)).toHaveLength(1);
      const viaSheet = resolveOwedSubclass(without, classId, sub, {
        choicePicks: subclass,
        bundlePicks: subBundles,
      });

      expect(normal(viaSheet)).toEqual(normal(viaLevelUp));
      expect(viaSheet.session.hp.current).toBe(viaLevelUp.session.hp.current);
      expect(viaSheet.session.grantBundleChoices).toEqual(
        viaLevelUp.session.grantBundleChoices
      );
    });
  }
});
