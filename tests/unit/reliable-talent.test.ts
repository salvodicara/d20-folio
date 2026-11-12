/**
 * Reliable Talent (SRD 5.2.1 Rogue, level 7): "Whenever you make an ability check that
 * uses one of your skill or tool proficiencies, you can treat a d20 roll of 9 or lower
 * as a 10." The check entries the sheet judges (Hide, escaping a grapple, Search /
 * Study / Influence) count the entered face at the floor; a skill without
 * proficiency, or a rogue below level 7, counts the face as rolled.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import {
  checkEntriesFor,
  skillBonusFor,
  skillFaceFloorFor,
} from "@/domains/play/check-entry";
import { countedFace } from "@/lib/play/checks";
import { buildScenario } from "@/lib/dev-scenarios";
import { resolveActions } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import type { CharacterDoc } from "@/types/character";

/** A Thief built as the builder builds one, with the skills set by hand. */
const rogue = (level: number): CharacterDoc => {
  const doc = buildScenario({
    name: "Pip, Thief",
    raceId: "halfling",
    classId: "rogue",
    subclassId: "thief",
    level,
    background: "criminal",
    abilityScores: { STR: 10, DEX: 17, CON: 14, INT: 12, WIS: 12, CHA: 10 },
  });
  return {
    ...doc,
    character: {
      ...doc.character,
      skills: {
        stealth: "expertise",
        perception: "proficient",
        athletics: "halfProficiency",
      },
    },
  };
};

describe("Reliable Talent", () => {
  it("floors a proficient or expert skill's d20 at 10 from level 7", () => {
    const floor = skillFaceFloorFor(rogue(7));
    expect(floor("stealth")).toBe(10);
    expect(floor("perception")).toBe(10);
  });

  it("does not floor a skill without proficiency (half proficiency is not one)", () => {
    const floor = skillFaceFloorFor(rogue(7));
    expect(floor("athletics")).toBe(1);
    expect(floor("arcana")).toBe(1);
  });

  it("does not floor anything before level 7", () => {
    expect(skillFaceFloorFor(rogue(6))("stealth")).toBe(1);
  });

  it("counts a 9 or lower as the floor, and a higher face as rolled", () => {
    expect(countedFace(3, 10)).toBe(10);
    expect(countedFace(9, 10)).toBe(10);
    expect(countedFace(14, 10)).toBe(14);
    expect(countedFace(3, 1)).toBe(3);
  });

  it("carries the floor on each check entry", () => {
    const doc = rogue(7);
    const hide = resolveActions(doc).find((a) => a.id === "base-hide");
    const search = resolveActions(doc).find((a) => a.id === "base-search");
    if (!hide || !search) throw new Error("missing in test");
    const floors = skillFaceFloorFor(doc);
    const [hideEntry] = checkEntriesFor(
      localizeAction(hide, "en"),
      skillBonusFor(doc),
      floors
    );
    expect(hideEntry).toMatchObject({ kind: "hide", skill: "stealth", floor: 10 });
    const [searchEntry] = checkEntriesFor(
      localizeAction(search, "en"),
      skillBonusFor(doc),
      floors
    );
    if (searchEntry?.kind !== "check") throw new Error("missing in test");
    expect(searchEntry.skills.find((s) => s.id === "perception")?.floor).toBe(10);
    expect(searchEntry.skills.find((s) => s.id === "insight")?.floor).toBe(1);
  });
});
