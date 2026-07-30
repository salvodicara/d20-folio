/**
 * The homebrew-library SURFACE — the Add-X modals' "Custom" tab (`CustomTabBody`).
 *
 * THE MODEL: custom IS the library. There is no save gesture and no manager page;
 * the tab is the whole surface, so these thin render tests pin its four jobs:
 *
 *  1. LIST — only the modal's kinds, landing an entry through the character store's
 *     commit path (with the create-form defaults re-seeded), then closing the modal;
 *  2. CREATE — an EMPTY library opens straight on the create form (a blank list is a
 *     dead end) with the one line that says creations are kept; a non-empty one
 *     swaps list ↔ form through the Create bar and Back;
 *  3. DELETE — the row's trash is the ONLY delete, behind the house confirm, and it
 *     STICKS (nothing re-adds an entry on a re-render);
 *  4. SEARCH — filters the rows.
 *
 * The store's write seam is injected, so a spy stands in for `library-io`: these tests
 * exercise the surface, never Firestore.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";

import { AddItemModal } from "@/components/sheet/AddItemModal";
import {
  libraryEntryName,
  toLibraryEntry,
  type LibraryDraft,
  type LibraryEntry,
} from "@/lib/library";
import { useCharacterStore } from "@/stores/characterStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useLibraryStore } from "@/stores/libraryStore";
import { useToastStore } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc, CustomEquipment, CustomSpell } from "@/types/character";

const NOW = 1_700_000_000_000;

const CUSTOM_GEAR: CustomEquipment = {
  custom: true,
  name: "Ember Wand",
  description: "A charred rowan wand.",
  equipped: true,
  quantity: 2,
  notes: "found in the barrow",
};

const CUSTOM_SPELL: CustomSpell = {
  custom: true,
  name: "Hearthfire Bolt",
  level: 2,
  school: "evocation",
  castingTime: "action",
  range: "60 feet",
  components: { v: true, s: true, m: false },
  duration: "Instantaneous",
  concentration: false,
  description: "A dart of banked embers.",
};

function entry(draft: LibraryDraft): LibraryEntry {
  return toLibraryEntry(draft, NOW);
}

/** The injected write seam — what `useLibrary` supplies in the app. */
const persistMock = vi.fn();

function seedLibrary(entries: LibraryEntry[]): void {
  useLibraryStore.setState({ entries, loaded: true, persist: persistMock });
}

function loadCharacter(doc: CharacterDoc = structuredClone(MOCK_CHARACTER)): void {
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

/** Open the item modal on its Custom tab and hand back the dialog. */
function openCustomTab(onClose: () => void = () => {}): HTMLElement {
  render(<AddItemModal open onClose={onClose} />);
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Custom" }));
  return dialog;
}

beforeEach(() => {
  persistMock.mockClear();
  useLibraryStore.setState({ entries: [], loaded: false, persist: null });
  useCharacterStore.setState({ character: null, loading: false, error: null });
  useToastStore.setState({ toasts: [], timers: {} });
  useUIStore.setState({ sheetMode: "play" });
});

describe("the Custom tab — the list half", () => {
  it("lists ONLY the modal's kinds and lands the entry on the character", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [];
    loadCharacter(doc);
    seedLibrary([
      entry({ kind: "equipment", item: CUSTOM_GEAR }),
      // A saved SPELL must NOT appear in the item modal's custom tab.
      entry({ kind: "spell", item: CUSTOM_SPELL }),
    ]);
    const onClose = vi.fn();

    const dialog = openCustomTab(onClose);
    expect(within(dialog).getByText("Ember Wand")).toBeInTheDocument();
    expect(within(dialog).queryByText("Hearthfire Bolt")).toBeNull();

    fireEvent.click(
      within(dialog).getByRole("button", { name: /Add Ember Wand from your library/i })
    );
    const landed = useCharacterStore.getState().character?.character.equipment ?? [];
    expect(landed).toHaveLength(1);
    const item = landed[0] as CustomEquipment;
    expect(item.name).toBe("Ember Wand");
    // Landing re-seeds the create-form defaults, never the previous owner's state.
    expect(item.quantity).toBe(1);
    expect(item.equipped).toBe(true);
    expect(item.notes).toBeUndefined();
    expect(onClose).toHaveBeenCalled();
  });

  it("filters by search", () => {
    loadCharacter();
    seedLibrary([
      entry({ kind: "equipment", item: CUSTOM_GEAR }),
      entry({ kind: "equipment", item: { ...CUSTOM_GEAR, name: "Bramble Cloak" } }),
    ]);
    const dialog = openCustomTab();
    const search = within(dialog).getAllByRole("searchbox").at(-1);
    expect(search).toBeDefined();
    if (!search) return;
    fireEvent.change(search, { target: { value: "bramble" } });
    expect(within(dialog).getByText("Bramble Cloak")).toBeInTheDocument();
    expect(within(dialog).queryByText("Ember Wand")).toBeNull();
  });
});

describe("the Custom tab — the create half", () => {
  it("opens straight on the create form (with the hint) when nothing is kept yet", () => {
    loadCharacter();
    seedLibrary([]);
    const dialog = openCustomTab();
    expect(
      within(dialog).getByText(/Anything you create is kept in your custom list/i)
    ).toBeInTheDocument();
    // The create form itself, not an empty list.
    expect(
      within(dialog).getByRole("button", { name: /Create Equipment/i })
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole("searchbox")).toBeNull();
  });

  it("swaps list → form on the Create bar and back again", () => {
    loadCharacter();
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    const dialog = openCustomTab();
    // The list is showing (the hint belongs to the empty state only).
    expect(within(dialog).getByText("Ember Wand")).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/Anything you create is kept/i)
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(dialog).getByRole("button", { name: /Create Custom Equipment/i })
    );
    expect(
      within(dialog).getByRole("button", { name: /^Create Equipment$/i })
    ).toBeInTheDocument();
    expect(within(dialog).queryByText("Ember Wand")).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /Back/i }));
    expect(within(dialog).getByText("Ember Wand")).toBeInTheDocument();
  });
});

describe("the Custom tab — delete", () => {
  it("deletes through the house confirm and STAYS deleted across a re-render", async () => {
    loadCharacter();
    seedLibrary([
      entry({ kind: "equipment", item: CUSTOM_GEAR }),
      entry({ kind: "equipment", item: { ...CUSTOM_GEAR, name: "Bramble Cloak" } }),
    ]);
    const dialog = openCustomTab();

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: /Delete Ember Wand from your custom list/i,
      })
    );
    expect(useConfirmStore.getState().open).toBe(true);
    await act(async () => {
      useConfirmStore.getState().respond(true);
      await Promise.resolve();
    });

    expect(useLibraryStore.getState().entries.map(libraryEntryName)).toEqual([
      "Bramble Cloak",
    ]);
    expect(persistMock).toHaveBeenCalled();
    expect(within(dialog).queryByText("Ember Wand")).toBeNull();

    // Nothing re-adds an entry: a fresh mount of the same surface still omits it.
    const second = openCustomTab();
    expect(within(second).queryByText("Ember Wand")).toBeNull();
  });

  it("keeps the entry when the confirm is dismissed", async () => {
    loadCharacter();
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    const dialog = openCustomTab();
    fireEvent.click(
      within(dialog).getByRole("button", {
        name: /Delete Ember Wand from your custom list/i,
      })
    );
    await act(async () => {
      useConfirmStore.getState().respond(false);
      await Promise.resolve();
    });
    expect(useLibraryStore.getState().entries).toHaveLength(1);
    expect(persistMock).not.toHaveBeenCalled();
  });
});
