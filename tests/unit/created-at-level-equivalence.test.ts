/**
 * A character created at level N is the character created at level 1 and levelled to N
 * (E4 item 1: a group that starts at level 3). With average HP and the class's own
 * picks, both roads must agree on everything that does not depend on a personal
 * choice: proficiency bonus, max HP, class and subclass features, spell slots, the
 * cantrip and prepared-spell counts. Every class, levels 3 and 5.
 */
import { describe, expect, it } from "vitest";

import { classTables, getClassFeatures } from "@/data/classes";
import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type LevelUpAnswers,
} from "@/domains/leveling/level-up-asks";
import { buildNewCharacter } from "@/lib/creation/build";
import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
  missingCreationRequirements,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { commitLevelUp } from "@/lib/level-up-commit";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import type { CharacterDoc } from "@/types/character";

const apply = (d: CreationDraft, ...a: CreationDraftAction[]) =>
  a.reduce(creationDraftReducer, d);

function created(
  classId: string,
  level: number,
  subclassId: string
): CharacterDoc | string {
  let d = apply(
    initialCreationDraft(),
    { type: "setName", name: "Test" },
    { type: "setAlignment", alignment: "neutral" },
    { type: "selectClass", classId },
    { type: "setLevel", level },
    ...(subclassId ? [{ type: "setSubclass", subclassId } as CreationDraftAction] : []),
    { type: "selectRace", raceId: "dwarf" },
    { type: "fillReadyMade" }
  );
  // The class step (Fighting Style, masteries, invocations, Expertise): the first
  // legal options, the way the level-up road answers its own rows.
  const f = creationFacts(d);
  for (const kind of Object.keys(f.classNeeds) as (keyof typeof f.classOptions)[]) {
    const count = f.classNeeds[kind];
    if (typeof count !== "number" || count === 0) continue;
    d = apply(d, {
      type: "setClassPick",
      kind,
      ids: f.classOptions[kind].slice(0, count),
    });
  }
  for (const key of f.classNeeds.bundleKeys) {
    const bundle = getClassFeatures(classId)
      .flatMap((feature) => feature.grants ?? [])
      .find((g) => g.type === "choice-grant-bundle" && g.bundleKey === key);
    const first =
      bundle?.type === "choice-grant-bundle" ? bundle.options[0]?.id : undefined;
    if (first)
      d = apply(d, { type: "setLineageChoice", bundleKey: key, optionId: first });
  }
  d = apply(d, { type: "fillReadyMade" });
  if (!creationFacts(d).classChoicesComplete) return "missing: class choices";
  const missing = missingCreationRequirements(d, creationFacts(d));
  if (missing.length) return `missing: ${missing.map((m) => m.key).join(",")}`;
  const built = buildNewCharacter(d, { displayName: null });
  if (!built.ok) return `build: ${built.error}`;
  return {
    id: "x",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    revision: 0,
    ...built.payload,
  };
}

function answerAll(
  doc: CharacterDoc,
  classId: string,
  subclassId: string
): LevelUpAnswers {
  let a: LevelUpAnswers = { ...NO_ANSWERS, subclassId: subclassId || null };
  for (let pass = 0; pass < 10; pass++) {
    const asks = levelUpAsks(doc, classId, a, "en");
    if (asks.complete) return a;
    for (const row of asks.rows) {
      if (row.count === 0 || row.picked.length >= row.count) continue;
      for (const o of row.options) {
        const now = levelUpAsks(doc, classId, a, "en").rows.find(
          (r) => r.key === row.key
        );
        if (!now || now.picked.length >= now.count) break;
        if (!now.picked.includes(o.id)) a = toggleAnswer(a, now, o.id);
      }
    }
  }
  return a;
}

const facts = (doc: CharacterDoc) => {
  const n = sheetNumbers(doc);
  return {
    pb: n.proficiencyBonus.total,
    maxHp: n.maxHp.total,
    features: doc.character.features
      .flatMap((f) => ("srdId" in f ? [f.srdId] : []))
      .filter((id) => !id.includes("asi") && !id.includes("epic-boon"))
      .sort(),
  };
};

describe("created at level N == created at 1 and levelled to N", () => {
  for (const table of classTables) {
    for (const level of [3, 5]) {
      it(`${table.id} ${level}`, () => {
        const sub = table.subclasses[0]?.id ?? "";
        const direct = created(table.id, level, sub);
        let road = created(table.id, 1, "");
        // A string is the reason the build could not be made.
        expect(typeof direct === "string" ? direct : "built").toBe("built");
        expect(typeof road === "string" ? road : "built").toBe("built");
        if (typeof road === "string" || typeof direct === "string") return;
        for (let l = 2; l <= level; l++) {
          const a = answerAll(road, table.id, sub);
          road = commitLevelUp(road, levelUpAsks(road, table.id, a, "en").picks);
        }
        expect(facts(direct)).toEqual(facts(road));
      });
    }
  }
});
