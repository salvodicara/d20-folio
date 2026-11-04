/**
 * The Play sheet's «Scelte da completare»: an Elf saved by the old wizard sees its
 * owed choices named, completes them in the dialog, and nothing is written until
 * Save. A read-only sheet, or a species that owes nothing, shows no banner.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { asRaceId } from "@/data/srd-names";
import { PlaySpeciesChoices } from "@/domains/play/ui/PlaySpeciesChoices";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function load(race: string): CharacterDoc {
  const base = makeCharacterDoc();
  useCharacterStore.getState().setCharacter({
    ...base,
    character: {
      ...base.character,
      race: asRaceId(race),
      skills: {},
      spells: [],
      speciesSpellAbility: undefined,
    },
    session: { ...base.session, grantBundleChoices: {} },
  });
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
}

function Banner({ readonly = false }: { readonly?: boolean }) {
  const doc = useCharacterStore((s) => s.character);
  return doc ? <PlaySpeciesChoices doc={doc} locale="en" readonly={readonly} /> : null;
}

beforeEach(() => {
  // jsdom has no modal <dialog>.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => useCharacterStore.getState().setCharacter(null));

describe("PlaySpeciesChoices", () => {
  it("names an Elf's owed choices and completes them on Save", () => {
    load("elf");
    render(<Banner />);
    expect(
      screen.getByRole("group", { name: "Choices to finish" }).textContent
    ).toContain(
      "Your species asks you to choose: Elven Lineage and Keen Senses. Species spellcasting ability: it uses Charisma today. Choose the right one."
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByRole("button", { name: "Wood Elf" }));
    fireEvent.click(screen.getByRole("button", { name: "Wisdom" }));
    fireEvent.click(screen.getByRole("button", { name: "Survival" }));
    // Nothing written before Save.
    expect(
      useCharacterStore.getState().character?.character.speciesSpellAbility
    ).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const doc = useCharacterStore.getState().character;
    expect(doc?.session.grantBundleChoices?.["elf-lineage"]).toBe("wood-elf");
    expect(doc?.character.speciesSpellAbility).toBe("WIS");
    expect(doc?.character.skills.survival).toBe("proficient");
    expect(screen.queryByRole("group", { name: "Choices to finish" })).toBeNull();
  });

  it("is absent on a read-only sheet and for a species that owes nothing", () => {
    load("elf");
    const { unmount } = render(<Banner readonly />);
    expect(screen.queryByRole("group", { name: "Choices to finish" })).toBeNull();
    unmount();
    load("dwarf");
    render(<Banner />);
    expect(screen.queryByRole("group", { name: "Choices to finish" })).toBeNull();
  });

  it("asks a Human's never-chosen Versatile feat and sets it on Save", () => {
    const base = makeCharacterDoc();
    useCharacterStore.getState().setCharacter({
      ...base,
      character: {
        ...base.character,
        race: asRaceId("human"),
        humanOriginFeat: "",
        skills: {},
        spells: [],
      },
    });
    render(<Banner />);
    expect(
      screen.getByRole("group", { name: "Choices to finish" }).textContent
    ).toContain("Your species asks you to choose: Versatile.");
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByRole("button", { name: /^Alert/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(useCharacterStore.getState().character?.character.humanOriginFeat).toBe(
      "alert"
    );
    expect(screen.queryByRole("group", { name: "Choices to finish" })).toBeNull();
  }, 15_000);
});
