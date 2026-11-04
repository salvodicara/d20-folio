/**
 * The classic sheet's «Scelte da completare»: the same owed species choices as
 * the new Play screen, asked with the sheet's own pickers; nothing written before
 * Save, and the banner leaves once they are made.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { asRaceId } from "@/data/srd-names";
import { SpeciesChoicesBanner } from "@/features/character/SpeciesChoicesBanner";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

function loadElf() {
  const base = makeCharacterDoc();
  useCharacterStore.getState().setCharacter({
    ...base,
    character: {
      ...base.character,
      race: asRaceId("elf"),
      skills: {},
      spells: [],
      speciesSpellAbility: undefined,
    },
    session: { ...base.session, grantBundleChoices: {} },
  });
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => {
  useCharacterStore.getState().setCharacter(null);
  useCharacterStore.setState({ readonly: false });
});

// The modal mounts the sheet's full skill picker: room under a loaded parallel run.
const SUITE_TIMEOUT = 15_000;

describe("SpeciesChoicesBanner", () => {
  it(
    "asks an Elf's lineage, ability and Keen Senses, then leaves",
    () => {
      loadElf();
      render(<SpeciesChoicesBanner />);
      const banner = screen.getByRole("group", { name: "Choices to finish" });
      expect(banner.textContent).toContain(
        "Elven Lineage and Keen Senses. Species spellcasting ability: it uses Charisma today"
      );
      fireEvent.click(screen.getByRole("button", { name: "Finish" }));
      // The modal names the species, never the add-modals' «Add» eyebrow.
      expect(screen.queryByText("Add")).toBeNull();
      expect(screen.getAllByText("Elf").length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole("button", { name: "High Elf" }));
      fireEvent.click(screen.getByRole("button", { name: "Intelligence" }));
      const perception = screen
        .getAllByRole("button")
        .find(
          (b) => b.classList.contains("wiz-row") && b.textContent.includes("Perception")
        );
      if (!perception) throw new Error("Keen Senses row not found");
      fireEvent.click(perception);
      expect(
        useCharacterStore.getState().character?.character.skills.perception
      ).toBeUndefined();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      const doc = useCharacterStore.getState().character;
      expect(doc?.session.grantBundleChoices?.["elf-lineage"]).toBe("high-elf");
      expect(doc?.character.speciesSpellAbility).toBe("INT");
      expect(doc?.character.skills.perception).toBe("proficient");
      expect(screen.queryByRole("group", { name: "Choices to finish" })).toBeNull();
    },
    SUITE_TIMEOUT
  );

  it("is absent on a read-only sheet", () => {
    loadElf();
    useCharacterStore.setState({ readonly: true });
    render(<SpeciesChoicesBanner />);
    expect(screen.queryByRole("group", { name: "Choices to finish" })).toBeNull();
  });
});
