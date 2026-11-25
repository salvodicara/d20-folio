/**
 * «Gestisci incantesimi» also adds spells (#1230, D&D Beyond's «Manage Spells»: one
 * window to learn and to prepare). The «Add» tab lists the Compendium's spells for the
 * character's own class (add mode); one tap adds the spell, a spell already on the
 * sheet says so, and undo takes the add back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import { fireEvent, render, screen, within } from "@testing-library/react";

import { PlayAddSpell } from "@/domains/play/ui/PlayAddSpell";
import i18n from "@/i18n";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const live = () => useCharacterStore.getState().character as CharacterDoc;
const ids = () => live().character.spells.map((s) => ("srdId" in s ? s.srdId : "custom"));

beforeEach(() => {
  useUndoStore.getState().clear();
  const doc = makeCharacterDoc({ classId: "wizard", level: 3 });
  doc.character.spells = [{ srdId: "magic-missile", prepared: true }];
  doc.character.spellSlots = [
    { level: 1, total: 4 },
    { level: 2, total: 2 },
  ];
  useCharacterStore.setState({ character: doc, loading: false, error: null });
});

const search = (q: string) =>
  fireEvent.change(screen.getByRole("searchbox", { name: "Search spells" }), {
    target: { value: q },
  });

describe("adding a spell from «Manage spells»", () => {
  it("adds a spell from the class list, and undo takes it back", () => {
    render(<PlayAddSpell locale="en" />);
    search("shield");
    fireEvent.click(screen.getByRole("button", { name: "Add: Shield" }));
    expect(ids()).toEqual(["magic-missile", "shield"]);
    expect(useUndoStore.getState().undo()).toBe(true);
    expect(ids()).toEqual(["magic-missile"]);
  });

  it("a spell already on the sheet cannot be added twice", () => {
    render(<PlayAddSpell locale="en" />);
    search("magic missile");
    expect(screen.queryByRole("button", { name: "Add: Magic Missile" })).toBeNull();
    expect(screen.getByText("Already yours")).toBeTruthy();
  });

  it("offers only the levels the character can cast, and says so", () => {
    render(<PlayAddSpell locale="en" />);
    search("fireball");
    expect(screen.queryByRole("button", { name: "Add: Fireball" })).toBeNull();
    expect(screen.getByText("Up to level 2: the spells you can cast.")).toBeTruthy();
    search("misty step");
    expect(screen.getByRole("button", { name: "Add: Misty Step" })).toBeTruthy();
  });
});

describe("«Custom spell» (D&D Beyond's homebrew spell fields, Foundry's spell sheet)", () => {
  const customs = () => live().character.spells.filter((s) => "custom" in s);
  const open = (locale: "en" | "it" = "en") => {
    render(<PlayAddSpell locale={locale} />);
    fireEvent.click(
      screen.getByRole("button", {
        name: locale === "it" ? "Incantesimo personalizzato" : "Custom spell",
      })
    );
  };
  const press = (group: string, name: string) =>
    fireEvent.click(
      within(screen.getByRole("group", { name: group })).getByRole("button", { name })
    );

  afterEach(() => void i18n.changeLanguage("en"));

  it("adds the homebrew spell with every field, back to the list, and undo takes it back", () => {
    open();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Ember Ward" },
    });
    press("Level", "Level 2");
    press("School", "Abjuration");
    press("Casting Time", "Bonus Action");
    fireEvent.change(screen.getByRole("textbox", { name: "Range" }), {
      target: { value: "Self" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Duration" }), {
      target: { value: "1 minute" },
    });
    press("Components", "Material");
    fireEvent.change(screen.getByRole("textbox", { name: "Material" }), {
      target: { value: "a pinch of ash" },
    });
    press("Properties", "Concentration");
    press("Properties", "Ritual");
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "A ward of embers." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add the spell" }));
    expect(customs()).toEqual([
      expect.objectContaining({
        name: "Ember Ward",
        level: 2,
        school: "abjuration",
        castingTime: "bonus",
        range: "Self",
        duration: "1 minute",
        components: { v: true, s: true, m: true, material: "a pinch of ash" },
        concentration: true,
        mechanics: { ritual: true },
        description: "A ward of embers.",
        prepared: true,
      }),
    ]);
    // back on the list
    expect(screen.getByRole("searchbox", { name: "Search spells" })).toBeTruthy();
    expect(useUndoStore.getState().undo()).toBe(true);
    expect(customs()).toEqual([]);
  });

  it("asks for a name and adds nothing without one", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Add the spell" }));
    expect(screen.getByText("Give it a name.")).toBeTruthy();
    expect(customs()).toEqual([]);
  });

  it("a cantrip offers no Ritual", () => {
    open();
    press("Level", "Cantrip");
    expect(
      within(screen.getByRole("group", { name: "Properties" })).queryByRole("button", {
        name: "Ritual",
      })
    ).toBeNull();
  });

  it("speaks Italian", async () => {
    await i18n.changeLanguage("it");
    open("it");
    expect(screen.getByRole("textbox", { name: "Nome" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Scuola" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Gittata" })).toHaveProperty(
      "value",
      "18 metri"
    );
    expect(screen.getByRole("button", { name: "Aggiungi l'incantesimo" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Torna all'elenco" }));
    expect(screen.getByRole("searchbox")).toBeTruthy();
  });
});

describe("«Copy into your spellbook» (D&D Beyond's Manage Spells for a Wizard)", () => {
  // A Wizard 3 whose book is full (6 + 2 × 2 = 10 levelled Wizard spells).
  const BOOK = [
    "magic-missile",
    "shield",
    "mage-armor",
    "sleep",
    "detect-magic",
    "burning-hands",
    "feather-fall",
    "thunderwave",
    "misty-step",
    "web",
  ];
  const rowOf = (name: string) =>
    screen.getByText(name, { selector: ".f-row-t" }).closest(".f-add-row") as HTMLElement;
  const load = (gp: number) => {
    const doc = live();
    useCharacterStore.setState({
      character: {
        ...doc,
        character: { ...doc.character, spells: BOOK.map((srdId) => ({ srdId })) },
        session: { ...doc.session, currency: { pp: 0, gp, ep: 0, sp: 0, cp: 0 } },
      },
    });
  };

  it("a spell outside the full book is copied at its cost: 2 hours and 50 gp a level, and undo gives it all back", () => {
    load(200);
    render(<PlayAddSpell locale="en" />);
    search("invisibility");
    expect(rowOf("Invisibility").textContent).toContain("Level 2 · copy: 4 h, 100 gp");
    fireEvent.click(
      screen.getByRole("button", { name: "Copy into your spellbook: Invisibility" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy and pay 100 gp" }));
    expect(ids().at(-1)).toBe("invisibility");
    expect(live().session.currency.gp).toBe(100);
    expect(useUndoStore.getState().undo()).toBe(true);
    expect(ids()).toEqual(BOOK);
    expect(live().session.currency.gp).toBe(200);
  });

  it("when the purse is short it says so, and copying anyway leaves the coins", () => {
    load(30);
    render(<PlayAddSpell locale="en" />);
    search("invisibility");
    fireEvent.click(
      screen.getByRole("button", { name: "Copy into your spellbook: Invisibility" })
    );
    expect(screen.queryByRole("button", { name: "Copy and pay 100 gp" })).toBeNull();
    expect(screen.getByText("Your gold and platinum don't cover it.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy without paying" }));
    expect(ids().at(-1)).toBe("invisibility");
    expect(live().session.currency.gp).toBe(30);
  });

  it("while the book owes free picks, the spell is simply added", () => {
    render(<PlayAddSpell locale="en" />);
    search("invisibility");
    expect(screen.getByRole("button", { name: "Add: Invisibility" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Copy into your spellbook/ })).toBeNull();
  });

  it("speaks Italian", async () => {
    await i18n.changeLanguage("it");
    load(200);
    render(<PlayAddSpell locale="it" />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "invisibilità" },
    });
    expect(rowOf("Invisibilità").textContent).toContain(
      "Livello 2 · copia: 4 ore, 100 mo"
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Copia nel libro: Invisibilità" })
    );
    expect(screen.getByRole("button", { name: "Copia e paga 100 mo" })).toBeTruthy();
  });
});
