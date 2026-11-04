/**
 * «Creazione rapida»: the player picks a class and a species (and a name); Folio
 * picks the rest the class preset's way, then the first legal options — and the
 * result is a complete character: nothing the guided path would still ask.
 */
import { describe, expect, it } from "vitest";

import { classTables } from "@/data/classes";
import { SRD_RACES } from "@/data/races";
import {
  creationFacts,
  initialCreationDraft,
  missingCreationRequirements,
  speciesStepComplete,
} from "@/lib/creation/draft";
import { rapidDraft } from "@/lib/creation/rapid";
import { buildNewCharacter } from "@/lib/creation/build";

describe("rapidDraft", () => {
  for (const table of classTables) {
    for (const race of SRD_RACES) {
      it(`${table.id} + ${race.id}: a complete character`, () => {
        const draft = rapidDraft(
          { ...initialCreationDraft(), name: "Lia" },
          table.id,
          race.id
        );
        const facts = creationFacts(draft);
        expect(draft.classId).toBe(table.id);
        expect(draft.raceId).toBe(race.id);
        expect(missingCreationRequirements(draft, facts).map((r) => r.key)).toEqual([]);
        expect(speciesStepComplete(draft, facts)).toBe(true);
        expect(facts.classChoicesComplete).toBe(true);
        expect(buildNewCharacter(draft, { displayName: null }).ok).toBe(true);
      });
    }
  }

  it("keeps the class preset's own picks when the species is the preset's", () => {
    // The Fighter preset is a Human with Alert.
    const draft = rapidDraft(initialCreationDraft(), "fighter", "human");
    expect(draft.humanFeat).toBe("alert");
    expect(draft.backgroundId).toBe("soldier");
  });

  it("masters the weapons it starts with first", () => {
    const draft = rapidDraft(initialCreationDraft(), "fighter", "dwarf");
    // Option A: Chain Mail, Greatsword, Flail, 8 Javelins.
    expect(draft.classPicks.weaponMasteries).toEqual(
      expect.arrayContaining(["greatsword", "flail", "javelin"])
    );
  });
});
