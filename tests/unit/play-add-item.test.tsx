/**
 * «Aggiungi oggetto» on the Play inventory (#1230, D&D Beyond's «Manage Inventory»:
 * search the catalogue, Add per row): the same catalogue and search as the Compendium
 * (`itemsSpec`), one tap adds one (stacking onto a twin), and undo takes it back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import { fireEvent, render, screen } from "@testing-library/react";

import { PlayAddItem } from "@/domains/play/ui/PlayAddItem";
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
    render(<PlayAddItem onClose={() => undefined} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), {
      target: { value: "torch" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add: Torch" }));
    expect(torches().map((r) => r.quantity)).toEqual([3]);
  });

  it("undo takes the added item back", () => {
    render(<PlayAddItem onClose={() => undefined} />);
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
    render(<PlayAddItem onClose={() => undefined} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search items" }), {
      target: { value: "zzzzqqq" },
    });
    expect(screen.getByText("Nothing matches.")).toBeTruthy();
  });
});
