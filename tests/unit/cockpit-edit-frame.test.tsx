/**
 * Cockpit edit-frame wiring (#60): the design-source amber EDITING frame is
 * activated by emitting the `.content` class + setting `data-mode="edit"` on the
 * center content column ONLY in edit mode. The old sticky "Editing" banner is
 * DELETED — the resting edit signifier is now the in-place amber EditingPill (no
 * layout shift). This renders the real `CharacterCockpit` (Firebase + the
 * subscription mocked so it stays CI-pure) and asserts the surface attribute +
 * the pill state flip with `uiStore.sheetMode`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/hooks/useCharacterSubscription", () => ({
  useCharacterSubscription: () => {},
}));

import { CharacterCockpit } from "@/features/character/CharacterCockpit";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { MOCK_CHARACTER } from "@/lib/mock";

function renderCockpit() {
  return render(
    <MemoryRouter initialEntries={["/characters/mock-1"]}>
      <Routes>
        <Route path="/characters/:characterId" element={<CharacterCockpit />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("cockpit edit-frame wiring (#60)", () => {
  beforeEach(() => {
    useUIStore.setState({ sheetMode: "play" });
    useCharacterStore.setState({
      character: { ...MOCK_CHARACTER },
      loading: false,
      error: null,
    });
  });

  it("play mode: center column carries `.content` but no data-mode; the Signet rests as the seal coin", () => {
    const { container } = renderCockpit();
    const surface = container.querySelector(".content");
    expect(surface).not.toBeNull();
    expect(surface).not.toHaveAttribute("data-mode");
    // jsdom is a coarse/compact home, so the mobile Signet renders. At rest it is
    // the seal coin ("Sheet tools", not pressed) — no "editing" cue is present.
    expect(
      screen.queryByRole("button", { name: /done editing/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^sheet tools$/i, pressed: false })
    ).toBeInTheDocument();
  });

  it("edit mode: center column gets data-mode='edit' and the Signet coin lights to the pressed 'Done editing' exit", () => {
    useUIStore.setState({ sheetMode: "edit" });
    const { container } = renderCockpit();
    const surface = container.querySelector(".content");
    expect(surface).toHaveAttribute("data-mode", "edit");
    // The old sticky "changes save automatically" banner is gone — the resting
    // edit signifier is the fob family's lit amber ✎ coin (the Signet here),
    // flipped to the pressed "Done editing" one-tap exit.
    expect(screen.queryByText(/changes save automatically/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^done editing$/i, pressed: true })
    ).toBeInTheDocument();
  });
});
