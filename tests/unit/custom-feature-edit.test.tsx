/**
 * CustomFeatureForm — edit-in-place (U6).
 *
 * A homebrew feature must be CORRECTABLE after creation, not add-only. When the
 * form is handed `editFeature` + `editIndex` it pre-fills, swaps its CTA to "Save
 * changes", and writes back to `features[editIndex]` (preserving fields it doesn't
 * expose, like custom actions, and keeping a tracker's id so spent uses survive a
 * rename) instead of appending. Asserted via the characterStore (the write seam).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomFeatureForm } from "@/components/sheet/CustomCreationForms";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc, CustomFeature } from "@/types/character";

const HOMEBREW: CustomFeature = {
  custom: true,
  title: "Wild Surge",
  emoji: "sparkles",
  source: "Homebrew",
  tags: [],
  contentBlocks: [{ text: "A burst of raw magic.", type: "text" }],
  trackers: [
    { id: "custom-wild-surge", label: "Wild Surge", total: "3", recovery: "long-rest" },
  ],
  // A field the form does NOT expose — must survive an edit untouched.
  actions: [{ type: "bonus", label: "Surge", description: "A burst of raw magic." }],
};

function loadWithHomebrewAt(index: number): CharacterDoc {
  const base = structuredClone(MOCK_CHARACTER);
  // Splice the homebrew feature in at a known index.
  const features = [...base.character.features];
  features.splice(index, 0, structuredClone(HOMEBREW));
  const doc: CharacterDoc = {
    ...base,
    character: { ...base.character, features },
  };
  useCharacterStore.setState({ character: doc, loading: false, error: null });
  return doc;
}

beforeEach(() => {
  useCharacterStore.setState({ character: null, loading: false, error: null });
});

describe("CustomFeatureForm — edit mode (U6)", () => {
  it("pre-fills the existing values and offers a Save-changes CTA", () => {
    loadWithHomebrewAt(2);
    render(
      <CustomFeatureForm onCreated={vi.fn()} editFeature={HOMEBREW} editIndex={2} />
    );
    expect(screen.getByDisplayValue("Wild Surge")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A burst of raw magic.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    // It must NOT offer the create CTA in edit mode.
    expect(
      screen.queryByRole("button", { name: /create feature/i })
    ).not.toBeInTheDocument();
  });

  it("writes back to features[editIndex] in place (no append) and preserves unexposed fields", () => {
    loadWithHomebrewAt(2);
    const before = useCharacterStore.getState().character?.character.features.length ?? 0;
    render(
      <CustomFeatureForm onCreated={vi.fn()} editFeature={HOMEBREW} editIndex={2} />
    );
    fireEvent.change(screen.getByDisplayValue("Wild Surge"), {
      target: { value: "Wild Magic Surge" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    const features = useCharacterStore.getState().character?.character.features ?? [];
    // Same count — edited in place, not appended.
    expect(features.length).toBe(before);
    const edited = features[2];
    expect(edited && "custom" in edited && edited.title).toBe("Wild Magic Surge");
    // The unexposed `actions` field survived the edit.
    expect(edited && "custom" in edited && edited.actions?.[0]?.type).toBe("bonus");
    // The tracker kept its original id (so spent uses survive the rename).
    expect(edited && "custom" in edited && edited.trackers?.[0]?.id).toBe(
      "custom-wild-surge"
    );
  });

  it("still APPENDS when no edit target is given (create mode unchanged)", () => {
    const base = structuredClone(MOCK_CHARACTER);
    useCharacterStore.setState({ character: base, loading: false, error: null });
    const before = base.character.features.length;
    render(<CustomFeatureForm onCreated={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/feature name/i), {
      target: { value: "Brand New Trick" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create feature/i }));
    const features = useCharacterStore.getState().character?.character.features ?? [];
    expect(features.length).toBe(before + 1);
    const last = features[features.length - 1];
    expect(last && "custom" in last && last.title).toBe("Brand New Trick");
  });
});
