/**
 * Rituals on the new Play (the code-check of the live sheets, 2026-11-12; pattern
 * source: the classic SpellCard's «Rituale» beside «Lancia»). A Ritual needs no slot,
 * so its button is never greyed out by spent slots; a prepared Ritual spell can still
 * be cast as a Ritual; Find Familiar cast as a Ritual asks its form first.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import i18n from "@/i18n";
import { PlayCentre } from "@/domains/play/ui/PlayCentre";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { makeCharacterDoc } from "./_helpers";

const live = () => {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
};

function mount() {
  render(
    <MemoryRouter>
      <TurnEconomyProvider renderPrompts={false}>
        <PlayCentre doc={live()} locale="en" />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("tab", { name: /spells/i }));
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  // jsdom has no modal <dialog>: open it in place.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  useCombatStore.getState().endCombat();
  const doc = makeCharacterDoc({ classId: "wizard", level: 5 });
  doc.id = "wiz";
  doc.character.spells = [
    { srdId: "detect-magic", prepared: true },
    { srdId: "identify" },
  ];
  doc.character.spellSlots = [
    { level: 1, total: 4 },
    { level: 2, total: 3 },
    { level: 3, total: 2 },
  ];
  // Every slot spent.
  doc.session.spellSlots = { "1": { used: 4 }, "2": { used: 3 }, "3": { used: 2 } };
  doc.session.logEntries = [];
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
});

describe("rituals on the new Play", () => {
  it("an unprepared Ritual spell casts as a Ritual with every slot spent", async () => {
    mount();
    const ritual = screen.getByRole("button", { name: "Ritual: Identify" });
    expect(ritual).not.toBeDisabled();
    fireEvent.click(ritual);
    await waitFor(() =>
      expect(live().session.logEntries.some((e) => e.event.kind === "action-use")).toBe(
        true
      )
    );
  });

  it("a prepared Ritual spell offers «Ritual» beside «Cast»", () => {
    mount();
    expect(screen.getByRole("button", { name: "Ritual: Detect Magic" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /^(Cast|Used): Detect Magic/ })
    ).toBeTruthy();
  });

  it("Find Familiar cast as a Ritual asks its form first, as the cast does", async () => {
    const doc = live();
    doc.character.spells = [...doc.character.spells, { srdId: "find-familiar" }];
    useCharacterStore.setState({ character: { ...doc } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Ritual: Find Familiar" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    // Nothing is cast until a form is picked.
    expect(live().session.logEntries).toEqual([]);
  });
});
