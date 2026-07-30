/**
 * The homebrew-library SURFACES (rung (a)) — the wiring between the cards, the
 * add-modal Library tab and the settings manager. The model's rules are pinned by
 * `library.test.ts`; these are the thin render tests for the seams:
 *
 *  1. SAVE — the custom row's card action promotes the STORED item (the button
 *     resolves it from the character at click time) and announces it;
 *  2. ADD — the shared `LibraryPickerBody` (one component behind all three modals)
 *     lists the matching kinds only, lands the entry through the character store's
 *     commit path, and closes its modal;
 *  3. MANAGE — the settings section lists every entry with its kind and deletes one
 *     through the house confirm store.
 *
 * The store's write seam is injected, so a spy stands in for `library-io`: these tests
 * exercise the surfaces, never Firestore.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// `authStore` type-imports firebase/auth (the SettingsPage identity card) and
// `lib/auth` owns the sign-out spy — the library itself needs NO Firebase mock: its
// write seam is INJECTED (`persist`), so the store and the cards are Firebase-free.
vi.mock("@/lib/firebase", () => ({ db: {}, auth: {}, storage: {} }));
vi.mock("@/lib/auth", () => ({ signOut: () => Promise.resolve() }));

import { AddItemModal } from "@/components/sheet/AddItemModal";
import { InventoryTab } from "@/features/character/center/tabs/InventoryTab";
import { SettingsPage } from "@/features/account/SettingsPage";
import { toLibraryEntry, type LibraryDraft, type LibraryEntry } from "@/lib/library";
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

function loadCharacter(doc: CharacterDoc): void {
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

beforeEach(() => {
  persistMock.mockClear();
  useLibraryStore.setState({ entries: [], loaded: false, persist: null });
  useCharacterStore.setState({ character: null, loading: false, error: null });
  useToastStore.setState({ toasts: [], timers: {} });
  useUIStore.setState({ sheetMode: "play" });
});

describe("save-to-library — the custom row's card action", () => {
  it("promotes the STORED custom item, strips its play state, and announces it", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [{ ...CUSTOM_GEAR }];
    loadCharacter(doc);
    seedLibrary([]);
    useUIStore.setState({ sheetMode: "edit" });

    render(
      <MemoryRouter>
        <InventoryTab />
      </MemoryRouter>
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Save Ember Wand to your library/i })
    );

    const entries = useLibraryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("equipment");
    const saved = entries[0]?.item as CustomEquipment;
    expect(saved.name).toBe("Ember Wand");
    // The template carries none of this character's play state.
    expect(saved.quantity).toBeUndefined();
    expect(saved.notes).toBeUndefined();
    expect(persistMock).toHaveBeenCalledWith(entries);
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(
      /Ember Wand saved to your library/i
    );
  });

  it("is offered ONLY for custom rows (an SRD item keeps just its own controls)", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [{ srdId: "crowbar", quantity: 1 }];
    loadCharacter(doc);
    seedLibrary([]);
    useUIStore.setState({ sheetMode: "edit" });

    render(
      <MemoryRouter>
        <InventoryTab />
      </MemoryRouter>
    );
    expect(screen.queryByRole("button", { name: /to your library/i })).toBeNull();
  });

  it("re-saving the same homebrew UPDATES its entry instead of duplicating it", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [{ ...CUSTOM_GEAR }];
    loadCharacter(doc);
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    const originalId = useLibraryStore.getState().entries[0]?.id;
    useUIStore.setState({ sheetMode: "edit" });

    render(
      <MemoryRouter>
        <InventoryTab />
      </MemoryRouter>
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Save Ember Wand to your library/i })
    );

    expect(useLibraryStore.getState().entries).toHaveLength(1);
    expect(useLibraryStore.getState().entries[0]?.id).toBe(originalId);
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(
      /updated in your library/i
    );
  });
});

describe("the Library tab — the shared picker body", () => {
  it("lists ONLY the modal's kinds and lands the entry on the character", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [];
    loadCharacter(doc);
    seedLibrary([
      entry({ kind: "equipment", item: CUSTOM_GEAR }),
      // A saved SPELL must NOT appear in the item modal's library tab.
      entry({ kind: "spell", item: CUSTOM_SPELL }),
    ]);
    const onClose = vi.fn();

    render(<AddItemModal open onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "My Library" }));

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

  it("teaches the empty library instead of showing a blank list", () => {
    loadCharacter(structuredClone(MOCK_CHARACTER));
    seedLibrary([]);
    render(<AddItemModal open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "My Library" }));
    expect(within(dialog).getByText(/Nothing in your library yet/i)).toBeInTheDocument();
  });

  it("filters by search", () => {
    loadCharacter(structuredClone(MOCK_CHARACTER));
    seedLibrary([
      entry({ kind: "equipment", item: CUSTOM_GEAR }),
      entry({ kind: "equipment", item: { ...CUSTOM_GEAR, name: "Bramble Cloak" } }),
    ]);
    render(<AddItemModal open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "My Library" }));
    const search = within(dialog).getAllByRole("searchbox").at(-1);
    expect(search).toBeDefined();
    if (!search) return;
    fireEvent.change(search, { target: { value: "bramble" } });
    expect(within(dialog).getByText("Bramble Cloak")).toBeInTheDocument();
    expect(within(dialog).queryByText("Ember Wand")).toBeNull();
  });
});

describe("the settings manager", () => {
  it("lists each entry with its kind and deletes one through the confirm store", async () => {
    seedLibrary([
      entry({ kind: "spell", item: CUSTOM_SPELL }),
      entry({ kind: "equipment", item: CUSTOM_GEAR }),
    ]);

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );
    expect(
      screen.getByRole("heading", { name: /homebrew library/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Hearthfire Bolt")).toBeInTheDocument();
    expect(screen.getByText("Ember Wand")).toBeInTheDocument();
    // Each row is labelled with its kind (the sheet's own section words).
    expect(screen.getByText("Spells")).toBeInTheDocument();
    expect(screen.getByText("Equipment")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Delete Ember Wand/i }));
    expect(useConfirmStore.getState().open).toBe(true);
    await act(async () => {
      useConfirmStore.getState().respond(true);
      await Promise.resolve();
    });

    const names = useLibraryStore.getState().entries.map((e) => e.kind);
    expect(names).toEqual(["spell"]);
    expect(persistMock).toHaveBeenCalled();
  });

  it("keeps the entry when the confirm is dismissed", async () => {
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("button", { name: /Delete Ember Wand/i }));
    await act(async () => {
      useConfirmStore.getState().respond(false);
      await Promise.resolve();
    });
    expect(useLibraryStore.getState().entries).toHaveLength(1);
    expect(persistMock).not.toHaveBeenCalled();
  });

  it("teaches the empty library", () => {
    seedLibrary([]);
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Nothing in your library yet/i)).toBeInTheDocument();
  });
});
