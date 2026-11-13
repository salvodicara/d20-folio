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

// Every Weapon Mastery the Fighter 5 has, so only the species' choices are owed.
const MASTERED = {
  classes: [
    {
      classId: "fighter",
      level: 5,
      weaponMasteries: ["longsword", "greatsword", "longbow", "handaxe"],
    },
  ],
};

function load(race: string): CharacterDoc {
  const base = makeCharacterDoc(MASTERED);
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

/** Twelve Wizard spells of levels 1–2: the book a Wizard 4 holds. */
const BOOK = [
  "burning-hands",
  "charm-person",
  "detect-magic",
  "feather-fall",
  "mage-armor",
  "magic-missile",
  "shield",
  "sleep",
  "thunderwave",
  "misty-step",
  "web",
  "invisibility",
].map((srdId) => ({ srdId }));

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
    const base = makeCharacterDoc(MASTERED);
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

  it("asks the cantrips a Wizard 4 owes (4 at L4) and stores them as the level-up does", () => {
    const base = makeCharacterDoc({
      race: asRaceId("dwarf"),
      classes: [{ classId: "wizard", level: 4 }],
      // A full book (12 at Wizard 4), so only the cantrips are owed.
      spells: [{ srdId: "fire-bolt" }, { srdId: "light" }, ...BOOK],
    });
    useCharacterStore.getState().setCharacter(base);
    render(<Banner />);
    expect(
      screen.getByRole("group", { name: "Choices to finish" }).textContent
    ).toContain("Your class lets you choose more: 2 cantrips (Wizard).");
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.getByText("Pick 2 Wizard Cantrips")).toBeTruthy();
    // A cantrip already known isn't offered again.
    expect(screen.queryByRole("button", { name: "Fire Bolt" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mage Hand" }));
    fireEvent.click(screen.getByRole("button", { name: "Ray of Frost" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      useCharacterStore.getState().character?.character.spells.slice(2 + BOOK.length)
    ).toEqual([{ srdId: "mage-hand" }, { srdId: "ray-of-frost" }]);
    expect(screen.queryByRole("group", { name: "Choices to finish" })).toBeNull();
  });
});

describe("PlaySpeciesChoices: a long owed list can be searched", () => {
  // A Paladin 5 owes 2 Weapon Masteries out of about 38 weapons: the new Play offers
  // the level-up's pick grid with a name filter, as the classic list does.
  it("narrows the weapons by name and stores the two picked", () => {
    const base = makeCharacterDoc({
      race: asRaceId("dwarf"),
      classes: [{ classId: "paladin", level: 5 }],
    });
    useCharacterStore.getState().setCharacter(base);
    render(<Banner />);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    const search = screen.getByRole("searchbox", { name: /search/i });
    fireEvent.change(search, { target: { value: "long" } });
    expect(screen.getByRole("button", { name: /^Longsword/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Greataxe/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Longsword/ }));
    fireEvent.change(search, { target: { value: "axe" } });
    fireEvent.click(screen.getByRole("button", { name: /^Greataxe/ }));
    // the first pick stays shown whatever the filter (its slot and the grid's top)
    expect(screen.getAllByRole("button", { name: /^Longsword/ }).length).toBeGreaterThan(
      0
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      useCharacterStore.getState().character?.character.classes[0]?.weaponMasteries
    ).toEqual(["longsword", "greataxe"]);
  }, 15_000);
});
