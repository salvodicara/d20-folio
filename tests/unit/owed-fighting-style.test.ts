/**
 * An unchosen Fighting Style is a pick the character owes (2024 Paladin Features:
 * Fighting Style at level 2; Fighter at 1; Ranger at 2), so «Scelte da completare»
 * asks for it, and the answer is stored as the level-up stores it (the style feat
 * among the features). Found on a live Paladin whose sheet kept the placeholder.
 */
import { describe, expect, it } from "vitest";
import {
  applyOwedClassPicks,
  classPickPool,
  owedClassPicks,
} from "@/lib/owed-class-picks";
import type { ClassEntry, CharacterData } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const paladin5: ClassEntry = {
  classId: "paladin",
  level: 5,
  weaponMasteries: ["longsword", "javelin"],
};
const build = (features: CharacterData["features"]) =>
  makeCharacterDoc({ classes: [paladin5], features }).character;

describe("an unchosen Fighting Style", () => {
  it("is owed by a Paladin 5 who never picked one", () => {
    const owed = owedClassPicks(build([{ srdId: "paladin-fighting-style" }]));
    expect(owed).toContainEqual({ classId: "paladin", pick: "fightingStyles", owed: 1 });
  });

  it("is not owed once a style is held", () => {
    const owed = owedClassPicks(
      build([{ srdId: "paladin-fighting-style" }, { srdId: "defense" }])
    );
    expect(owed.find((o) => o.pick === "fightingStyles")).toBeUndefined();
  });

  it("offers the styles not held yet", () => {
    const pool = classPickPool(
      build([{ srdId: "archery" }]),
      "paladin",
      "fightingStyles"
    );
    expect(pool).toContain("defense");
    expect(pool).not.toContain("archery");
  });

  it("the answer is stored as the level-up stores it", () => {
    const next = applyOwedClassPicks(build([{ srdId: "paladin-fighting-style" }]), [
      { classId: "paladin", pick: "fightingStyles", ids: ["defense"] },
    ]);
    expect(next.features).toContainEqual({ srdId: "defense" });
    expect(owedClassPicks(next).find((o) => o.pick === "fightingStyles")).toBeUndefined();
  });
});

describe("«Scelte da completare»", () => {
  it("names the owed style and lists the styles to pick, in Italian", async () => {
    const { owedClassPickRows, owedClassPickLabel } =
      await import("@/lib/views/owed-class-picks-view");
    const character = build([{ srdId: "paladin-fighting-style" }]);
    const row = owedClassPickRows(character, "it").find(
      (r) => r.pick === "fightingStyles"
    );
    expect(row?.title).toBe("Scegli uno Stile di Combattimento");
    expect(row?.options.map((o) => o.id)).toContain("defense");
    expect(owedClassPickLabel("fightingStyles", 1, "paladin", "it")).toBe(
      "1 Stile di Combattimento (Paladino)"
    );
  });
});
