/**
 * EncounterCustomMonsters — creating saves a reusable template, then its LIVE detail
 * owns portrait customization and the explicit add-to-encounter commit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

// The surface transitively imports Firebase (party-encounter → firestore); stub it so
// the CI-safety guard passes (mirrors party-encounter.test.tsx).
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/dm-readers", () => ({
  recomputeDmReadersForChars: vi.fn(() => Promise.resolve()),
}));

import { EncounterCustomMonsters } from "@/features/campaigns/encounter-custom-monsters";
import { useLibraryStore } from "@/stores/libraryStore";
import type { MonsterInput } from "@/features/campaigns/encounter";

beforeEach(() => {
  // Hydrate the library LOADED with a no-op persist, so saves actually land in memory.
  useLibraryStore.getState().reset();
  useLibraryStore.getState().hydrate([], vi.fn());
});

function createBandit(): void {
  fireEvent.change(screen.getByLabelText("Monster name"), {
    target: { value: "Bandit" },
  });
  fireEvent.change(screen.getByLabelText("Type"), { target: { value: "humanoid" } });
  fireEvent.click(screen.getByRole("button", { name: "Save and customize" }));
}

describe("EncounterCustomMonsters", () => {
  it("saves first, then adds the live portrait-bearing template", () => {
    const onAdd = vi.fn<(input: MonsterInput) => void>();
    render(<EncounterCustomMonsters onAdd={onAdd} />);

    // An empty library opens on the create form.
    createBandit();

    // Saving opens the live detail; placement remains an explicit second commit so the
    // DM can add/crop the portrait first.
    expect(onAdd).not.toHaveBeenCalled();
    const saved = useLibraryStore.getState().entries;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.kind).toBe("monster");
    expect(saved[0]?.kind === "monster" && saved[0].item.name).toBe("Bandit");
    const id = saved[0]?.id;
    if (!id) throw new Error("saved monster id missing");
    act(() => {
      useLibraryStore.getState().setEntryPortrait(id, {
        portraitUrl: "https://example.test/bandit.jpeg",
        portraitCrop: { x: 5, y: 6, width: 70, height: 70 },
      });
    });
    fireEvent.click(screen.getByRole("button", { name: "Add monster" }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Bandit",
        creatureType: "humanoid",
        count: 1,
        portraitUrl: "https://example.test/bandit.jpeg",
        portraitCrop: { x: 5, y: 6, width: 70, height: 70 },
      })
    );
  });

  it("lists a saved monster and re-adds it from its detail", () => {
    const onAdd = vi.fn<(input: MonsterInput) => void>();
    render(<EncounterCustomMonsters onAdd={onAdd} />);
    createBandit();
    fireEvent.click(screen.getByRole("button", { name: "Add monster" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    // The row is in the list; open its detail and add again.
    fireEvent.click(screen.getByRole("button", { name: "Bandit" }));
    const addButtons = screen.getAllByRole("button", { name: /add monster/i });
    fireEvent.click(addButtons[addButtons.length - 1] as HTMLElement);

    // onAdd fires only from the detail's explicit placement action.
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Bandit", initiative: null })
    );
  });
});
