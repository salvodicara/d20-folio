/**
 * BioTab — Elven Lineage (E16) + name-editor de-duplication (E13)
 *
 * Covers the lineage creation-bundle surface on the Lore page:
 *  • Play mode shows the CHOSEN lineage label inline (mock seeds High Elf).
 *  • Edit mode renders the lineage picker; picking an option persists the
 *    choice through `setGrantBundleChoice` into `session.grantBundleChoices`,
 *    marks the option pressed, and the play view then reflects the new label.
 *  • The unchosen state shows the gentle `lore.lineageNotChosen` prompt.
 *  • The name is edited ONLY in the sheet header — the Lore page no longer
 *    renders a duplicate name <input> in edit mode (E13).
 *
 * Uses MOCK_CHARACTER (Lyra Voss, Elf Bard 9) whose session is seeded with the
 * High-Elf lineage so the POPULATED state is exercised by default.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// BioTab → usePortraitCrop transitively imports Firebase (@/lib/firestore,
// @/lib/storage). Mock them so the test never loads Firebase — CI runs with
// VITE_FIREBASE_API_KEY unset and would otherwise crash at module load
// (enforced by tests/unit/pure-modules-guard.test.ts). We exercise no portrait
// behaviour here, so empty stubs suffice.
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/lib/firestore", () => ({ updateCharacter: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  uploadPortrait: vi.fn(),
  deletePortrait: vi.fn(),
  compressImage: vi.fn(),
}));

import { BioTab } from "@/features/character/center/tabs/BioTab";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

function load(doc: CharacterDoc = structuredClone(MOCK_CHARACTER)): void {
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BioTab />
    </MemoryRouter>
  );
}

describe("BioTab — Elven Lineage (E16)", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
  });
  afterEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    vi.restoreAllMocks();
  });

  it("mock seeds the High-Elf lineage so play mode shows the chosen label", () => {
    load();
    renderPage();
    // The bundle label + the chosen option both render in the play-mode block.
    expect(screen.getByText(/Elven Lineage/i)).toBeInTheDocument();
    expect(screen.getByText("High Elf")).toBeInTheDocument();
    // The seed reaches the store via the session field.
    expect(
      useCharacterStore.getState().character?.session.grantBundleChoices?.["elf-lineage"]
    ).toBe("high-elf");
  });

  it("shows the gentle not-chosen prompt when no lineage is picked", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.session.grantBundleChoices = {};
    load(doc);
    renderPage();
    // Play mode surfaces the prompt instead of a label.
    expect(screen.getByText(/No lineage chosen/i)).toBeInTheDocument();
    expect(screen.queryByText("High Elf")).not.toBeInTheDocument();
  });

  it("picking a lineage in edit mode persists the choice + play view reflects it", () => {
    // Start with no lineage so the change is unambiguous.
    const doc = structuredClone(MOCK_CHARACTER);
    doc.session.grantBundleChoices = {};
    load(doc);
    useUIStore.setState({ sheetMode: "edit" });
    const { rerender } = renderPage();

    // Edit mode renders the lineage as a simple Select (consistent with race/class).
    const select = screen.getByRole("combobox", { name: /Elven Lineage/i });
    expect(select).toHaveValue("");

    fireEvent.change(select, { target: { value: "wood-elf" } });

    // The choice persisted through the store action into the session.
    expect(
      useCharacterStore.getState().character?.session.grantBundleChoices?.["elf-lineage"]
    ).toBe("wood-elf");
    // The Select now reflects the choice.
    expect(screen.getByRole("combobox", { name: /Elven Lineage/i })).toHaveValue(
      "wood-elf"
    );

    // Switch to play mode — the chosen label is now shown inline.
    useUIStore.setState({ sheetMode: "play" });
    rerender(
      <MemoryRouter>
        <BioTab />
      </MemoryRouter>
    );
    expect(screen.getByText("Wood Elf")).toBeInTheDocument();
  });
});

describe("BioTab — notes de-duplication (#104 follow-up)", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
  });
  afterEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    vi.restoreAllMocks();
  });

  // `session.notes` is now edited ONLY on the right-rail post-it (`RailNotes`),
  // reachable on every viewport. The Bio tab must NOT render a second editor for
  // the same field (golden rules 6 + 19). The mock seeds a known notes string;
  // assert no Bio field carries it, in BOTH play and edit mode (the old Bio
  // editor was always-on, so it would have surfaced regardless of mode).
  const NOTES = MOCK_CHARACTER.session.notes;

  it.each(["play", "edit"] as const)(
    "renders no session-notes editor in %s mode (rail owns notes)",
    (mode) => {
      load();
      useUIStore.setState({ sheetMode: mode });
      renderPage();
      // No textbox is seeded with the notes value (the old editor bound to it).
      expect(screen.queryByDisplayValue(NOTES)).not.toBeInTheDocument();
      // No element echoes the notes prose either (a read-only fallback).
      expect(screen.queryByText(NOTES)).not.toBeInTheDocument();
    }
  );
});

describe("BioTab — single name editor (E13)", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
  });
  afterEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    vi.restoreAllMocks();
  });

  it("does not render a name text input in edit mode (header owns the name)", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    // The name still renders as a heading…
    const heading = screen.getByRole("heading", { name: "Lyra Voss" });
    expect(heading).toBeInTheDocument();
    // …but there is no editable field carrying the name value.
    const nameInputs = screen
      .queryAllByRole("textbox")
      .filter((el) => (el as HTMLInputElement).value === "Lyra Voss");
    expect(nameInputs).toHaveLength(0);
    // The quote field (the other EditableInput) is still editable.
    expect(
      within(document.body).getByDisplayValue(
        "Every silence hides a song; I just have to find it."
      )
    ).toBeInTheDocument();
  });
});

describe("BioTab — background select binds to the stable id (golden rule 7)", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "edit" });
  });
  afterEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    vi.restoreAllMocks();
  });

  it("displays the stored id-form background (was: first option shown for every live doc)", () => {
    // Every live doc stores the background ID ("criminal") — the select must
    // resolve it and show "Criminal", never silently fall to the first option.
    load();
    renderPage();
    const select = screen.getByRole("combobox", { name: /background/i });
    expect(select).toHaveValue("criminal");
    // getByDisplayValue resolves a <select> by its SELECTED option's text.
    expect(screen.getByDisplayValue("Criminal")).toBe(select);
  });

  it("emits the background ID on change (never a display name)", () => {
    load();
    renderPage();
    const select = screen.getByRole("combobox", { name: /background/i });
    fireEvent.change(select, { target: { value: "sage" } });
    expect(useCharacterStore.getState().character?.character.background).toBe("sage");
    // The dependent origin-feat pick resets with the background (atomic write).
    expect(useCharacterStore.getState().character?.character.bgFeat).toBe("");
  });

  it("tolerates a legacy EN-name value by resolving it to its id option", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.background = "Criminal";
    load(doc);
    renderPage();
    const select = screen.getByRole("combobox", { name: /background/i });
    expect(select).toHaveValue("criminal");
    expect(screen.getByDisplayValue("Criminal")).toBe(select);
  });
});

describe("BioTab — empty portrait + empty lore (P4 pass)", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
  });
  afterEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    vi.restoreAllMocks();
  });

  it("play mode without a portrait shows the monogram fallback, never a dead button", () => {
    load(); // mock has portraitUrl: null
    renderPage();
    // No portrait control pretends to be tappable…
    expect(
      screen.queryByRole("button", { name: /view portrait/i })
    ).not.toBeInTheDocument();
    // …the shared Portrait monogram fallback renders instead (Lyra → "L").
    expect(document.querySelector(".av-fallback")?.textContent).toBe("L");
  });

  it("edit mode without a portrait keeps the add-photo affordance", () => {
    load();
    useUIStore.setState({ sheetMode: "edit" });
    renderPage();
    expect(screen.getByRole("button", { name: /edit portrait/i })).toBeInTheDocument();
  });

  it("the empty lore state teaches AND acts — its Edit action flips to edit mode", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    doc.character.lore = {
      ...doc.character.lore,
      traits: "",
      ideals: "",
      bonds: "",
      flaws: "",
      backstory: "",
      age: "",
      height: "",
      weight: "",
      eyes: "",
      hair: "",
      skin: "",
    };
    load(doc);
    renderPage();
    expect(screen.getByText(/no lore written yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit/i }));
    expect(useUIStore.getState().sheetMode).toBe("edit");
  });
});
