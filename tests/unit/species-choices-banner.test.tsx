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

function loadElf() {
  const base = makeCharacterDoc(MASTERED);
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

  it("asks a Human short of skills for Skillful, saying why; trusts one with the full count", () => {
    const base = makeCharacterDoc(MASTERED);
    const human = (skills: string[]) =>
      useCharacterStore.getState().setCharacter({
        ...base,
        character: {
          ...base.character,
          race: asRaceId("human"),
          humanOriginFeat: "alert",
          skills: Object.fromEntries(skills.map((id) => [id, "proficient" as const])),
          spells: [],
        },
      });
    const four = ["athletics", "acrobatics", "history", "religion"];
    human(four);
    const { unmount } = render(<SpeciesChoicesBanner />);
    expect(screen.getByRole("group", { name: "Choices to finish" }).textContent).toMatch(
      /Skillful: you have 4 skills, your build gives at least \d+/
    );
    unmount();
    human([...four, "stealth", "arcana", "nature", "medicine"]);
    render(<SpeciesChoicesBanner />);
    expect(screen.queryByText(/Skillful/)).toBeNull();
  });

  it("asks a Human's never-chosen Versatile feat and sets it on Save", () => {
    const base = makeCharacterDoc(MASTERED);
    useCharacterStore.getState().setCharacter({
      ...base,
      character: {
        ...base.character,
        race: asRaceId("human"),
        humanOriginFeat: "",
        // a full skill count, so only the Versatile feat is owed
        skills: Object.fromEntries(
          [
            "athletics",
            "acrobatics",
            "history",
            "religion",
            "stealth",
            "arcana",
            "nature",
            "medicine",
          ].map((id) => [id, "proficient" as const])
        ),
        spells: [],
      },
    });
    render(<SpeciesChoicesBanner />);
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

  it(
    "asks the invocations a Warlock 2 owes (3 at L2) with the level-up's pick list",
    () => {
      const base = makeCharacterDoc({
        race: asRaceId("dwarf"),
        classes: [
          { classId: "warlock", level: 2, invocationChoices: ["agonizing-blast"] },
        ],
        spells: [{ srdId: "eldritch-blast" }, { srdId: "chill-touch" }],
      });
      useCharacterStore.getState().setCharacter(base);
      render(<SpeciesChoicesBanner />);
      expect(
        screen.getByRole("group", { name: "Choices to finish" }).textContent
      ).toContain("Your class lets you choose more: 2 Eldritch Invocations (Warlock).");
      fireEvent.click(screen.getByRole("button", { name: "Finish" }));
      expect(screen.getByText("Choose 2 Eldritch Invocations")).toBeTruthy();
      for (const name of [/^Devil.s Sight$/, /^Eldritch Mind$/]) {
        fireEvent.click(screen.getByTitle(name));
        fireEvent.click(
          screen.getByRole("button", {
            name: new RegExp(`^Choose ${name.source.slice(1)}`),
          })
        );
      }
      expect(
        useCharacterStore.getState().character?.character.classes[0]?.invocationChoices
      ).toEqual(["agonizing-blast"]);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(
        useCharacterStore.getState().character?.character.classes[0]?.invocationChoices
      ).toEqual(["agonizing-blast", "devils-sight", "eldritch-mind"]);
      expect(screen.queryByRole("group", { name: "Choices to finish" })).toBeNull();
    },
    SUITE_TIMEOUT
  );
});
