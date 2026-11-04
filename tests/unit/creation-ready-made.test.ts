/**
 * The class's ready-made picks (the new creation screen's Equipaggiamento step):
 * after the player chose class, background, species and abilities, `fillReadyMade`
 * fills what is still missing (class skills, cantrips and spells, the remaining
 * choice slots, the origin languages) so the Riepilogo shows a complete build.
 * It never overwrites a pick the player made, and never the species' own.
 */
import { describe, expect, it } from "vitest";

import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { classTables } from "@/data/classes";
import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
  missingCreationRequirements,
  type CreationDraft,
  type CreationDraftAction,
} from "@/lib/creation/draft";

const apply = (draft: CreationDraft, ...actions: CreationDraftAction[]) =>
  actions.reduce(creationDraftReducer, draft);

/** A draft as the new screen leaves it before Equipaggiamento: picks emptied by the class change. */
function chosen(classId: string, backgroundId: string): CreationDraft {
  return apply(
    initialCreationDraft(),
    { type: "setName", name: "Lia" },
    { type: "selectClass", classId },
    { type: "selectBackground", backgroundId },
    { type: "selectRace", raceId: "dwarf" }
  );
}

describe("fillReadyMade", () => {
  for (const table of classTables) {
    for (const background of SRD_BACKGROUNDS) {
      it(`${table.id} + ${background.id}: nothing left but what the player owes`, () => {
        const before = chosen(table.id, background.id);
        const after = apply(before, { type: "fillReadyMade" });
        const missing = missingCreationRequirements(after).map((r) => r.key);
        // The +2/+1 is the Caratteristiche step's, already placed by the screen.
        expect(missing.filter((key) => key !== "bgAsi")).toEqual([]);
      });
    }
  }

  it("keeps every pick the player already made", () => {
    const cleric = apply(chosen("cleric", "acolyte"), {
      type: "toggleClassSkill",
      skillId: "history",
    });
    const filled = apply(cleric, { type: "fillReadyMade" });
    expect(filled.classSkills).toContain("history");
    expect(filled.classSkills).toHaveLength(2);
  });

  it("is a no-op on a complete draft", () => {
    const done = apply(chosen("fighter", "soldier"), { type: "fillReadyMade" });
    expect(apply(done, { type: "fillReadyMade" })).toBe(done);
  });

  it("never fills the species' own choices", () => {
    const elf = apply(chosen("wizard", "sage"), { type: "selectRace", raceId: "elf" });
    const filled = apply(elf, { type: "fillReadyMade" });
    const facts = creationFacts(filled);
    expect(facts.speciesChoicesComplete).toBe(false);
    expect(filled.speciesSpellAbility).toBe("");
  });
});
