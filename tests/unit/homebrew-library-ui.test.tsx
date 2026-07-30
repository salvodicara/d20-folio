/**
 * The homebrew-library SURFACE — the Add-X modals' "Custom" tab (`CustomTabBody`).
 *
 * THE MODEL: custom IS the library. There is no save gesture and no manager page;
 * the tab is the whole surface, so these thin render tests pin its four jobs:
 *
 *  1. LIST → DETAIL → ADD — only the modal's kinds; tapping a row opens the shared
 *     picker detail (the SRD flow), whose footer lands the entry through the character
 *     store's commit path (create-form defaults re-seeded) and closes the modal;
 *  2. CREATE — an EMPTY library opens straight on the create form (a blank list is a
 *     dead end) with the one line that says creations are kept; a non-empty one
 *     swaps list ↔ form through the Create bar and Back;
 *  3. EDIT / DELETE — the row's cluster (edit · delete) plus the detail's Add are the
 *     whole CRUD:
 *     the pencil reopens the SAME form prefilled and commits an id-keyed update that
 *     never touches the character; the trash is the ONLY delete, behind the house
 *     confirm, and it STICKS (nothing re-adds an entry on a re-render);
 *  4. SEARCH — filters the rows.
 *
 * Plus the AUTO-UPSERT seams that fill the library in the first place: a create form
 * commit, a sheet-side edit of an existing homebrew row, the RENAME that must MOVE an
 * entry rather than strand a ghost under the old name, and the at-cap outcomes (a
 * refused CREATE says so; a refused per-keystroke EDIT stays silent).
 *
 * The store's write seam is injected, so a spy stands in for `library-io`: these tests
 * exercise the surface, never Firestore.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";

import { AddItemModal } from "@/components/sheet/AddItemModal";
import { InventoryTab } from "@/features/character/center/tabs/InventoryTab";
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
import { FREE_TIER_LIMITS } from "@/lib/limits";
import { MOCK_CHARACTER } from "@/lib/mock";
import type {
  CharacterDoc,
  CustomEquipment,
  CustomSpell,
  CustomWeapon,
} from "@/types/character";

const NOW = 1_700_000_000_000;

const CUSTOM_GEAR: CustomEquipment = {
  custom: true,
  name: "Ember Wand",
  description: "A charred rowan wand.",
  equipped: true,
  quantity: 2,
  notes: "found in the barrow",
};

const CUSTOM_WEAPON: CustomWeapon = {
  custom: true,
  name: "Bramble Spear",
  quantity: 4,
  damageDie: "1d8",
  damageType: "slashing",
  attackStat: "STR",
  properties: "Thrown (20/60)",
  description: "A blackthorn haft, iron-shod.",
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

    // The SRD flow: TAP the row → the detail → Add from its footer.
    fireEvent.click(within(dialog).getByRole("button", { name: "Ember Wand" }));
    expect(within(dialog).getByText("A charred rowan wand.")).toBeInTheDocument();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Add to Character|Add to character/i })
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

describe("the Custom tab — the detail leg (the SRD flow)", () => {
  it("shows the entry's key facts, and Back returns to the list", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.weapons = [];
    loadCharacter(doc);
    seedLibrary([entry({ kind: "weapon", item: CUSTOM_WEAPON })]);
    const dialog = openCustomTab();

    fireEvent.click(within(dialog).getByRole("button", { name: "Bramble Spear" }));
    // The shared picker detail scaffold: the kind eyebrow, the meta grid, the prose.
    expect(within(dialog).getByText("Damage Die")).toBeInTheDocument();
    expect(within(dialog).getByText("1d8 Slashing")).toBeInTheDocument();
    expect(within(dialog).getByText("Attack Stat")).toBeInTheDocument();
    expect(within(dialog).getByText("Properties")).toBeInTheDocument();
    expect(within(dialog).getByText("Thrown (20/60)")).toBeInTheDocument();
    expect(within(dialog).getByText("A blackthorn haft, iron-shod.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Back$/i }));
    expect(
      within(dialog).getByRole("button", { name: "Bramble Spear" })
    ).toBeInTheDocument();
    expect(useCharacterStore.getState().character?.character.weapons).toEqual([]);
  });

  it("names the open entry in the modal title, and reverts on Back", () => {
    loadCharacter();
    seedLibrary([entry({ kind: "weapon", item: CUSTOM_WEAPON })]);
    const dialog = openCustomTab();
    // The tab's own label names the dialog while the list is showing…
    expect(screen.getByRole("dialog", { name: "Custom" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Bramble Spear" }));
    // …and the open homebrew names it while its detail is read — the SAME swap the
    // SRD leg of this modal performs (intra-modal consistency).
    expect(screen.getByRole("dialog", { name: "Bramble Spear" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /^Back$/i }));
    expect(screen.getByRole("dialog", { name: "Custom" })).toBeInTheDocument();
  });

  it("its footer Add lands the entry on the character's own array", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.weapons = [];
    loadCharacter(doc);
    seedLibrary([entry({ kind: "weapon", item: CUSTOM_WEAPON })]);
    const onClose = vi.fn();
    const dialog = openCustomTab(onClose);

    fireEvent.click(within(dialog).getByRole("button", { name: "Bramble Spear" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Add to Character/i }));

    const landed = useCharacterStore.getState().character?.character.weapons ?? [];
    expect(landed.map((w) => ("custom" in w ? w.name : w.srdId))).toEqual([
      "Bramble Spear",
    ]);
    // Landing re-seeds the create-form default, never the saved copy's count.
    expect(landed[0]?.quantity).toBe(1);
    expect(onClose).toHaveBeenCalled();
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

describe("custom IS the library — the auto-upsert seams", () => {
  it("a CREATE lands on the sheet AND is kept in the library, with no second toast", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [];
    loadCharacter(doc);
    seedLibrary([]); // empty → the tab opens on the create form
    const dialog = openCustomTab();

    fireEvent.change(within(dialog).getByPlaceholderText(/Item name/i), {
      target: { value: "Tinder Pouch" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Create Equipment$/i }));

    // On the sheet…
    const landed = useCharacterStore.getState().character?.character.equipment ?? [];
    expect(landed.map((i) => ("custom" in i ? i.name : i.srdId))).toEqual([
      "Tinder Pouch",
    ]);
    // …and kept, as a stripped template.
    const entries = useLibraryStore.getState().entries;
    expect(entries.map(libraryEntryName)).toEqual(["Tinder Pouch"]);
    const kept = entries[0]?.item as CustomEquipment;
    expect(kept.quantity).toBeUndefined();
    expect(kept.equipped).toBeUndefined();
    expect(persistMock).toHaveBeenCalled();
    // The creation itself is the feedback — no library toast narrating bookkeeping.
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("an EDIT on the sheet updates the kept entry IN PLACE (same id)", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [{ ...CUSTOM_GEAR }];
    loadCharacter(doc);
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    const originalId = useLibraryStore.getState().entries[0]?.id;
    useUIStore.setState({ sheetMode: "edit" });

    render(<InventoryTab />);
    fireEvent.click(screen.getByRole("button", { name: /Expand: Ember Wand/i }));
    const card = screen.getByText("Ember Wand").closest("article");
    expect(card).not.toBeNull();
    if (!card) return;
    const description = within(card).getByPlaceholderText(/description/i);
    fireEvent.blur(description, { target: { value: "Rewound with copper wire." } });

    const entries = useLibraryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(originalId);
    expect((entries[0]?.item as CustomEquipment).description).toBe(
      "Rewound with copper wire."
    );
  });

  it("an SRD row's edit never touches the library", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [{ srdId: "crowbar", quantity: 1 }];
    loadCharacter(doc);
    seedLibrary([]);
    useUIStore.setState({ sheetMode: "edit" });

    render(<InventoryTab />);
    fireEvent.click(screen.getByRole("button", { name: /Expand: Crowbar/i }));
    const card = screen.getByText("Crowbar").closest("article");
    expect(card).not.toBeNull();
    if (!card) return;
    fireEvent.blur(within(card).getByPlaceholderText(/notes/i), {
      target: { value: "bent" },
    });
    expect(useLibraryStore.getState().entries).toEqual([]);
    expect(persistMock).not.toHaveBeenCalled();
  });
});

describe("a rename MOVES the entry, never duplicates it", () => {
  it("drops the old-named entry when a homebrew row is renamed on the sheet", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [{ ...CUSTOM_GEAR }];
    loadCharacter(doc);
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    useUIStore.setState({ sheetMode: "edit" });

    render(<InventoryTab />);
    fireEvent.click(screen.getByRole("button", { name: /Expand: Ember Wand/i }));
    const card = screen.getByText("Ember Wand").closest("article");
    expect(card).not.toBeNull();
    if (!card) return;
    const nameField = within(card).getByPlaceholderText("Name");
    fireEvent.blur(nameField, { target: { value: "Cinder Wand" } });

    // ONE entry, under the NEW name: the ghost under the old name is gone.
    expect(useLibraryStore.getState().entries.map(libraryEntryName)).toEqual([
      "Cinder Wand",
    ]);
  });

  it("leaves the entry alone when an edit does NOT touch the name", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [{ ...CUSTOM_GEAR }];
    loadCharacter(doc);
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    const originalId = useLibraryStore.getState().entries[0]?.id;
    useUIStore.setState({ sheetMode: "edit" });

    render(<InventoryTab />);
    fireEvent.click(screen.getByRole("button", { name: /Expand: Ember Wand/i }));
    const card = screen.getByText("Ember Wand").closest("article");
    expect(card).not.toBeNull();
    if (!card) return;
    fireEvent.blur(within(card).getByPlaceholderText(/description/i), {
      target: { value: "Rewound with copper wire." },
    });

    const entries = useLibraryStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(originalId);
    expect(libraryEntryName(entries[0] as LibraryEntry)).toBe("Ember Wand");
  });
});

describe("at the free-tier cap", () => {
  /** A full library of equipment entries (the item modal's kind). */
  function seedFullLibrary(): void {
    seedLibrary(
      Array.from({ length: FREE_TIER_LIMITS.libraryEntries }, (_, i) =>
        entry({ kind: "equipment", item: { ...CUSTOM_GEAR, name: `Kept ${i}` } })
      )
    );
  }

  it("a CREATE still lands on the sheet, and SAYS the library could not keep it", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [];
    loadCharacter(doc);
    seedFullLibrary();

    const dialog = openCustomTab();
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Create Custom Equipment/i })
    );
    fireEvent.change(within(dialog).getByPlaceholderText(/Item name/i), {
      target: { value: "Tinder Pouch" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Create Equipment$/i }));

    // The sheet always wins: the item is there…
    const landed = useCharacterStore.getState().character?.character.equipment ?? [];
    expect(landed.map((i) => ("custom" in i ? i.name : i.srdId))).toEqual([
      "Tinder Pouch",
    ]);
    // …and the refusal is spoken, not swallowed.
    expect(useLibraryStore.getState().entries).toHaveLength(
      FREE_TIER_LIMITS.libraryEntries
    );
    expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(
      /your custom list is full \(100\)/i
    );
  });

  it("a refused per-keystroke EDIT stays silent and keeps the old entry", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [{ ...CUSTOM_GEAR, name: "Kept 0" }];
    loadCharacter(doc);
    seedFullLibrary();
    useUIStore.setState({ sheetMode: "edit" });

    render(<InventoryTab />);
    fireEvent.click(screen.getByRole("button", { name: /Expand: Kept 0/i }));
    const card = screen.getByText("Kept 0").closest("article");
    expect(card).not.toBeNull();
    if (!card) return;
    // A RENAME at the cap is an APPEND the cap refuses…
    fireEvent.blur(within(card).getByPlaceholderText("Name"), {
      target: { value: "Kept Nowhere" },
    });

    const names = useLibraryStore.getState().entries.map(libraryEntryName);
    expect(names).toHaveLength(FREE_TIER_LIMITS.libraryEntries);
    // …so the OLD entry must survive — dropping it would lose the template outright.
    expect(names).toContain("Kept 0");
    expect(names).not.toContain("Kept Nowhere");
    // No toast on a per-keystroke seam.
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});

describe("the row action cluster", () => {
  it("is the row itself plus edit · delete — no add glyph (Add lives in the detail)", () => {
    loadCharacter();
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    const dialog = openCustomTab();
    const row = within(dialog).getByText("Ember Wand").closest("li");
    expect(row).not.toBeNull();
    if (!row) return;
    const labels = within(row)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Ember Wand", // the row itself — tapping it opens the detail
      "Edit Ember Wand",
      "Delete Ember Wand from your custom list",
    ]);
  });

  it("the management glyphs never trigger the row's tap", () => {
    loadCharacter();
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    const dialog = openCustomTab();
    // Pencil → the FORM leg (not the detail leg).
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit Ember Wand" }));
    expect(
      within(dialog).getByRole("button", { name: /Save changes/i })
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /Add to Character|Add to character/i })
    ).toBeNull();
  });
});

describe("edit-in-place — the pencil completes CRUD", () => {
  it("reopens the SAME form prefilled and updates the entry, keeping its id", () => {
    loadCharacter();
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    const originalId = useLibraryStore.getState().entries[0]?.id;
    const dialog = openCustomTab();

    fireEvent.click(within(dialog).getByRole("button", { name: "Edit Ember Wand" }));
    // Prefilled from the entry…
    const nameField = within(dialog).getByPlaceholderText(/Item name/i);
    expect(nameField).toHaveValue("Ember Wand");
    // …and the CTA is a SAVE, not a create.
    expect(
      within(dialog).queryByRole("button", { name: /^Create Equipment$/i })
    ).toBeNull();

    fireEvent.change(nameField, { target: { value: "Cinder Wand" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/i }));

    const entries = useLibraryStore.getState().entries;
    expect(entries).toHaveLength(1);
    // A RENAME through the pencil is id-keyed: same entry, new name, no ghost.
    expect(entries[0]?.id).toBe(originalId);
    expect(libraryEntryName(entries[0] as LibraryEntry)).toBe("Cinder Wand");
    expect(persistMock).toHaveBeenCalled();
    // Back on the list, showing the new name.
    expect(within(dialog).getByText("Cinder Wand")).toBeInTheDocument();
  });

  it("never touches the character's own items", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.equipment = [{ ...CUSTOM_GEAR }];
    loadCharacter(doc);
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    const before = useCharacterStore.getState().character?.character.equipment;
    const dialog = openCustomTab();

    fireEvent.click(within(dialog).getByRole("button", { name: "Edit Ember Wand" }));
    fireEvent.change(within(dialog).getByPlaceholderText(/Item name/i), {
      target: { value: "Cinder Wand" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/i }));

    // The sheet copy is independent of the template (one-way, by design).
    expect(useCharacterStore.getState().character?.character.equipment).toBe(before);
  });

  it("round-trips a TRACKED item: the form reopens on its mode, and Save keeps it", () => {
    loadCharacter();
    // The sheet item carries the authored mode + a per-character count; only the
    // count is play state, so only it is stripped on the way in.
    seedLibrary([
      entry({
        kind: "equipment",
        item: { ...CUSTOM_GEAR, name: "Healer's Kit", tracked: true, quantity: 7 },
      }),
    ]);
    const dialog = openCustomTab();
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit Healer's Kit" }));

    // The mode survived the save, so the form opens ON it (not reset to "None").
    const trackUses = within(dialog).getByRole("checkbox", { name: /Track uses/i });
    expect(trackUses).toBeChecked();

    fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/i }));
    const kept = useLibraryStore.getState().entries[0]?.item as CustomEquipment;
    expect(kept.tracked).toBe(true);
    expect(kept.quantity).toBeUndefined();
  });

  it("Back leaves the entry untouched", () => {
    loadCharacter();
    seedLibrary([entry({ kind: "equipment", item: CUSTOM_GEAR })]);
    const dialog = openCustomTab();
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit Ember Wand" }));
    fireEvent.change(within(dialog).getByPlaceholderText(/Item name/i), {
      target: { value: "Discarded" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /Back/i }));

    expect(useLibraryStore.getState().entries.map(libraryEntryName)).toEqual([
      "Ember Wand",
    ]);
    expect(persistMock).not.toHaveBeenCalled();
  });
});
