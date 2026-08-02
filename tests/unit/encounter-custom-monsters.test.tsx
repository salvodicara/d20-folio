/**
 * EncounterCustomMonsters (Part A) — the wiring test: creating a custom monster SAVES
 * it to the library AND adds it to the encounter, and a saved monster is re-addable from
 * the list. The persistence math itself is pinned in `library*.test.ts`; this pins that
 * the Custom tab is wired to it (rule 13 — one thin render test per surface).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

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
  useLibraryStore.getState().hydrate([], {}, vi.fn());
});

function createBandit(): void {
  fireEvent.change(screen.getByLabelText("Monster name"), {
    target: { value: "Bandit" },
  });
  fireEvent.change(screen.getByLabelText("Type"), { target: { value: "humanoid" } });
  fireEvent.click(screen.getByRole("button", { name: "Add monster" }));
}

describe("EncounterCustomMonsters", () => {
  it("creating a custom monster SAVES it to the library AND adds it to the encounter", () => {
    const onAdd = vi.fn<(input: MonsterInput) => void>();
    render(<EncounterCustomMonsters onAdd={onAdd} />);

    // An empty library opens on the create form.
    createBandit();

    // Added to the encounter with the built input…
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Bandit", creatureType: "humanoid", count: 1 })
    );
    // …and saved to the library as a `monster` entry.
    const saved = useLibraryStore.getState().entries;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.kind).toBe("monster");
    expect(saved[0]?.kind === "monster" && saved[0].item.name).toBe("Bandit");
  });

  it("lists a saved monster and re-adds it from its detail", () => {
    const onAdd = vi.fn<(input: MonsterInput) => void>();
    render(<EncounterCustomMonsters onAdd={onAdd} />);
    createBandit(); // now the library has one monster → the list shows it

    // The row is in the list; open its detail and add again.
    fireEvent.click(screen.getByRole("button", { name: "Bandit" }));
    const addButtons = screen.getAllByRole("button", { name: /add monster/i });
    fireEvent.click(addButtons[addButtons.length - 1] as HTMLElement);

    // onAdd fired twice: once on create, once on the re-add from the list.
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Bandit", initiative: null })
    );
  });
});
