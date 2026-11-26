/**
 * «Aggiungi oggetto» on the Play inventory (#1230, D&D Beyond's «Manage Inventory»:
 * search the catalogue, Add per row): the same catalogue and search as the Compendium
 * (`itemsSpec`), one tap adds one (stacking onto a twin), and undo takes it back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayAddItem } from "@/domains/play/ui/PlayAddItem";
import i18n from "@/i18n";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

const live = () => useCharacterStore.getState().character as CharacterDoc;
const torches = () =>
  live().character.equipment.filter((r) => !("custom" in r) && r.srdId === "torch");

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  useUndoStore.getState().clear();
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.equipment = [{ srdId: "torch", quantity: 2, tracked: true }];
  useCharacterStore.setState({ character: doc, loading: false, error: null });
});

describe("«Add item»", () => {
  it("finds an item by name and adds one, stacking onto the same item", () => {
    render(<PlayAddItem locale="en" onClose={() => undefined} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), {
      target: { value: "torch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add: Torch" }));
    expect(torches().map((r) => r.quantity)).toEqual([3]);
  });

  it("undo takes the added item back", () => {
    render(<PlayAddItem locale="en" onClose={() => undefined} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), {
      target: { value: "rope" },
    });
    const before = live().character.equipment.length;
    fireEvent.click(
      screen.getAllByRole("button", { name: /^Add: .*Rope/ })[0] as HTMLElement
    );
    expect(live().character.equipment.length).toBe(before + 1);
    expect(useUndoStore.getState().undo()).toBe(true);
    expect(live().character.equipment.length).toBe(before);
  });

  it("says so when nothing matches", () => {
    render(<PlayAddItem locale="en" onClose={() => undefined} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), {
      target: { value: "zzzzqqq" },
    });
    expect(screen.getByText("Nothing matches.")).toBeTruthy();
  });
});

describe("«Custom item» (D&D Beyond's custom item: name, quantity, weight, cost, notes)", () => {
  const customs = () => live().character.equipment.filter((r) => "custom" in r);

  function openCustom(locale: "en" | "it" = "en", onClose = () => undefined) {
    if (locale === "it") void i18n.changeLanguage("it");
    render(<PlayAddItem locale={locale} onClose={onClose} />);
    fireEvent.click(
      screen.getByRole("tab", {
        name: locale === "it" ? "Oggetto personalizzato" : "Custom item",
      })
    );
  }

  afterEach(() => void i18n.changeLanguage("en"));

  it("adds the item with its quantity, weight, cost and notes, and closes", () => {
    const onClose = vi.fn();
    openCustom("en", onClose);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Lucky stone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "One more" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Weight each (lb)" }), {
      target: { value: "0.5" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Cost each (gp)" }), {
      target: { value: "25" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "Warm to the touch." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to inventory" }));
    expect(customs()).toEqual([
      expect.objectContaining({
        name: "Lucky stone",
        quantity: 2,
        description: "Warm to the touch.",
        mechanics: { weight: 0.5, price: "25 GP" },
      }),
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it("asks for a name and a number, and adds nothing until they are right", () => {
    openCustom();
    fireEvent.change(screen.getByRole("textbox", { name: "Weight each (lb)" }), {
      target: { value: "heavy" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to inventory" }));
    expect(screen.getByText("Give it a name.")).toBeTruthy();
    expect(screen.getByText("Write a number, such as 2 or 0.5.")).toBeTruthy();
    expect(customs()).toEqual([]);
  });

  it("undo takes the custom item back", () => {
    openCustom();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Lucky stone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to inventory" }));
    expect(customs()).toHaveLength(1);
    expect(useUndoStore.getState().undo()).toBe(true);
    expect(customs()).toEqual([]);
  });

  it("speaks Italian, with the weight in kilograms", () => {
    openCustom("it");
    expect(screen.getByRole("textbox", { name: "Nome" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Peso l'uno (kg)" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Costo l'uno (mo)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Aggiungi all'inventario" })).toBeTruthy();
  });
});
