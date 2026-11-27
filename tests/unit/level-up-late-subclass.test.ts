/**
 * A character past its subclass level with no subclass (a live Rogue 6 has none):
 * the next level-up asks the subclass, and cannot be confirmed without it. Picked
 * late, the subclass brings every feature up to the new level, not only the new
 * level's (SRD 5.2.1 Thief: Fast Hands and Second-Story Work at Rogue level 3).
 */
import { describe, expect, it } from "vitest";

import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type LevelUpAnswers,
} from "@/domains/leveling/level-up-asks";
import { buildScenario } from "@/lib/dev-scenarios";
import { commitLevelUp } from "@/lib/level-up-commit";
import { owedChoiceCount } from "@/lib/unresolved-build-choices";
import { srdEn } from "@/i18n/srd-en";
import type { CharacterDoc } from "@/types/character";

const rogue6 = () =>
  buildScenario({
    name: "Late Thief",
    raceId: "halfling",
    background: "",
    classId: "rogue",
    level: 6,
    abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 12, WIS: 12, CHA: 10 },
    skills: { stealth: "proficient", perception: "proficient", acrobatics: "proficient" },
  });

const names = (doc: CharacterDoc) =>
  doc.character.features.flatMap((f) =>
    "custom" in f ? [] : [srdEn("class-feature", f.srdId, "name") ?? f.srdId]
  );

/** Every owed row answered with its first options, the subclass with `sub`. */
function answer(doc: CharacterDoc, sub: string | null) {
  let a: LevelUpAnswers = NO_ANSWERS;
  for (let pass = 0; pass < 6; pass++) {
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

describe("a level-up past the subclass level, with no subclass", () => {
  it("Rogue 6 → 7 asks the subclass and cannot be confirmed without it", () => {
    const asks = answer(rogue6(), null);
    expect(asks.rows.map((r) => r.key)).toContain("subclass");
    expect(asks.complete).toBe(false);
  });

  it("picked at 7, the Thief brings its level-3 features too", () => {
    const doc = rogue6();
    const after = commitLevelUp(doc, answer(doc, "thief").picks);
    expect(after.character.classes[0]?.subclassId).toBe("thief");
    expect(names(after)).toEqual(
      expect.arrayContaining([
        "Fast Hands",
        "Second-Story Work",
        "Evasion",
        "Reliable Talent",
      ])
    );
  });

  // Known red (#1393): the sheet's «Scelte da completare» does not list a missing
  // subclass yet. When it does, this turns red: flip `it.fails` to `it`.
  it.fails("a Rogue 6 with no subclass owes it on the sheet", () => {
    const doc = rogue6();
    expect(owedChoiceCount(doc.character, doc.session)).toBeGreaterThan(0);
  });

  it("7 → 8 does not ask it again", () => {
    const doc = rogue6();
    const at7 = commitLevelUp(doc, answer(doc, "thief").picks);
    const asks = answer(at7, "thief");
    expect(asks.rows.map((r) => r.key)).not.toContain("subclass");
    expect(asks.complete).toBe(true);
  });
});
