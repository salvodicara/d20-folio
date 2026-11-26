/**
 * The Play sheet's «Scelte da completare»: an Elf saved by the old wizard sees its
 * owed choices named, completes them in the dialog, and nothing is written until
 * Save. A read-only sheet, or a species that owes nothing, shows no banner.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { asRaceId } from "@/data/srd-names";
import { PlaySpeciesChoices } from "@/domains/play/ui/PlaySpeciesChoices";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { owedClassPicks } from "@/lib/owed-class-picks";
import { preparedLevelledCount } from "@/lib/wizard-spellbook";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";
import { DISCOVERIES, loreBardDoc } from "./_lore-bard";

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
    // the slots say what they are: «Picked: 0 of 2»
    expect(screen.getByText("Picked: 0 of 2")).toBeTruthy();
    const search = screen.getByRole("searchbox", { name: /search/i });
    // the hint sits inside the field, not as a label above it
    expect(search.getAttribute("placeholder")).toMatch(/search/i);
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
    expect(screen.getByText("Picked: 2 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      useCharacterStore.getState().character?.character.classes[0]?.weaponMasteries
    ).toEqual(["longsword", "greataxe"]);
  }, 15_000);
});

describe("PlaySpeciesChoices: Magical Discoveries saved without their mark", () => {
  it("lets the player change which spells they are, then marks those only", () => {
    useCharacterStore.getState().setCharacter(
      loreBardDoc([
        { srdId: "healing-word", prepared: true },
        { srdId: "fireball", prepared: true },
        { srdId: "spirit-guardians", prepared: true },
        { srdId: "shield", prepared: true },
      ])
    );
    render(<Banner />);
    expect(
      screen.getByRole("group", { name: "Choices to finish" }).textContent
    ).toContain(
      "Fireball and Spirit Guardians are your Magical Discoveries. Confirming keeps them always prepared and frees 2 of your normal prepared places."
    );
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    fireEvent.click(screen.getByRole("button", { name: "Spirit Guardians" }));
    expect(
      screen.getByText(
        "Fireball is your Magical Discovery. Confirming keeps it always prepared and frees 1 of your normal prepared places."
      )
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Shield" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const after = useCharacterStore.getState().character?.character;
    if (!after) throw new Error("no character");
    expect(
      after.spells.flatMap((s) =>
        !("custom" in s) && s.grantedBy === DISCOVERIES ? [s.srdId] : []
      )
    ).toEqual(["fireball", "shield"]);
    expect(preparedLevelledCount(after)).toBe(2);
    expect(screen.queryByRole("group", { name: "Choices to finish" })).toBeNull();
  });
});

describe("PlaySpeciesChoices: the four kinds the live survey found owed (#1397)", () => {
  /** Opens the banner's dialog on a dev scenario. */
  function open(id: string) {
    const doc = buildDevScenario(id);
    if (!doc) throw new Error(id);
    useCharacterStore.getState().setCharacter(doc);
    render(<Banner />);
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    return screen.getByRole("dialog");
  }
  const owedNow = () => {
    const doc = useCharacterStore.getState().character;
    if (!doc) throw new Error("no character");
    return owedClassPicks(doc.character, doc.session.grantBundleChoices);
  };
  const pick = (dialog: HTMLElement, name: string) =>
    fireEvent.click(within(dialog).getByRole("button", { name: new RegExp(`^${name}`) }));

  it("a Paladin 5 picks 2 Weapon Masteries and a Fighting Style, and owes none", () => {
    const dialog = open("paladin-5-no-class-picks");
    expect(within(dialog).getByText("Choose a Fighting Style")).toBeTruthy();
    for (const name of ["Defense", "Longsword", "Javelin"]) pick(dialog, name);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const character = useCharacterStore.getState().character?.character;
    expect(character?.classes[0]?.weaponMasteries).toEqual(["longsword", "javelin"]);
    expect(character?.features).toContainEqual({ srdId: "defense" });
    expect(owedNow()).toEqual([]);
  }, 15_000);

  it("a Bard 9 raises 4 proficient skills to Expertise, and owes none", () => {
    const dialog = open("bard-9-no-expertise");
    expect(within(dialog).getByText("Choose 4 skills for Expertise")).toBeTruthy();
    for (const name of ["Performance", "Persuasion", "Deception", "Insight"])
      pick(dialog, name);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const skills = useCharacterStore.getState().character?.character.skills ?? {};
    const expert = Object.entries(skills).filter(([, v]) => v === "expertise");
    expect(expert.map(([id]) => id).sort()).toEqual([
      "deception",
      "insight",
      "performance",
      "persuasion",
    ]);
    expect(owedNow()).toEqual([]);
  }, 15_000);

  it("a Wizard 5 adds 5 spells to the book, unprepared, and owes none", () => {
    const dialog = open("wizard-book-short");
    expect(
      within(dialog).getByText("Add 5 spells to your spellbook: they stay unprepared")
    ).toBeTruthy();
    // The long list opens on one spell level: show them all, then search each.
    fireEvent.click(within(dialog).getByRole("button", { name: "All" }));
    const search = within(dialog).getByRole("searchbox", { name: "Search spells" });
    const added = ["Burning Hands", "Charm Person", "Feather Fall", "Thunderwave"];
    for (const name of [...added, "Invisibility"]) {
      fireEvent.change(search, { target: { value: name } });
      pick(dialog, name);
    }
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const spells = useCharacterStore.getState().character?.character.spells ?? [];
    expect(spells.slice(-5)).toEqual(
      [
        "burning-hands",
        "charm-person",
        "feather-fall",
        "thunderwave",
        "invisibility",
      ].map((srdId) => ({ srdId, prepared: false }))
    );
    expect(owedNow()).toEqual([]);
  }, 15_000);
});
