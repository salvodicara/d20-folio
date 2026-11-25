/**
 * Per-level HP grows on every level-up, whatever grants it. A species' trait
 * (Dwarven Toughness, SRD 5.2.1: "your Hit Point maximum increases by 1 whenever
 * you gain a level") lives on `race`, not in `features[]`, so the level-up reads
 * the species too. A subclass feature gained mid-career (Draconic Resilience at
 * Sorcerer 3: "increases by 3, and it increases by 1 whenever you gain another
 * Sorcerer level") counts for the levels already gained.
 */
import { describe, expect, it } from "vitest";

import { NO_ANSWERS, levelUpAsks } from "@/domains/leveling/level-up-asks";
import { computeCharacterMaxHp } from "@/lib/aggregate-character";
import { buildNewCharacter } from "@/lib/creation/build";
import {
  creationDraftReducer,
  initialCreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { commitLevelUp } from "@/lib/level-up-commit";
import type { CharacterDoc } from "@/types/character";

function created(classId: string, raceId: string): CharacterDoc {
  const acts: CreationDraftAction[] = [
    { type: "setName", name: "Test" },
    { type: "setAlignment", alignment: "neutral" },
    { type: "selectClass", classId },
    { type: "selectRace", raceId },
    { type: "fillReadyMade" },
  ];
  const built = buildNewCharacter(
    acts.reduce(creationDraftReducer, initialCreationDraft()),
    {
      displayName: null,
    }
  );
  if (!built.ok) throw new Error(built.error);
  return {
    id: "x",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    revision: 0,
    ...built.payload,
  };
}

const levelUp = (
  doc: CharacterDoc,
  classId = "fighter",
  subclassId: string | null = null
) =>
  commitLevelUp(
    doc,
    levelUpAsks(doc, classId, { ...NO_ANSWERS, subclassId }, "en").picks
  );
const fighter = (raceId: string) => created("fighter", raceId);

describe("species per-level HP on level-up", () => {
  it("a dwarf gains 1 more HP than a human at each level", () => {
    const dwarf = fighter("dwarf");
    const human = fighter("human");
    expect(dwarf.character.hp.max - human.character.hp.max).toBe(1);
    const d2 = levelUp(dwarf);
    const h2 = levelUp(human);
    expect(d2.character.hp.max - dwarf.character.hp.max).toBe(
      h2.character.hp.max - human.character.hp.max + 1
    );
  });

  it("the stored max after a level-up is the by-the-book max", () => {
    const d2 = levelUp(fighter("dwarf"));
    expect(d2.character.hp.max).toBe(computeCharacterMaxHp(d2.character));
  });

  it("a Draconic Sorcerer's subclass HP counts for levels 1 to 3", () => {
    const s2 = levelUp(created("sorcerer", "human"), "sorcerer");
    const s3 = levelUp(s2, "sorcerer", "draconic-sorcery");
    expect(s3.character.hp.max).toBe(computeCharacterMaxHp(s3.character));
    // d6 average 4 + CON, plus 1 per Sorcerer level (3 at once at level 3).
    expect(s3.character.hp.max - s2.character.hp.max).toBe(
      s2.character.hp.max - created("sorcerer", "human").character.hp.max + 3
    );
  });
});
