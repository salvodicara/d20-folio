/**
 * Cockpit loading / not-found guard (corrective-fix C2).
 *
 * `/characters/:characterId` matches ANY id, so a typo'd / deleted / unauthorized
 * id is a VALID route the path="*" 404 never catches. The subscription resolves it
 * to `{ character: null, loading: false }` (the store CLEARS `error` on
 * setCharacter(null), so the settled state is indistinguishable from the initial
 * pre-subscription frame by store fields alone). The cockpit must guard the render
 * BEFORE the HUD regions — render NOTHING while settling (app-shell model; skeletons
 * removed 2026-06-07), a recoverable not-found once settled with no document — and
 * must NEVER flash not-found before the doc arrives. A render-phase "booting" mask
 * holds the first frame as nothing until the subscription emits its first signal
 * (loading / a character / an error).
 *
 * Renders the real `CharacterCockpit` with Firebase + the subscription mocked (CI-
 * pure, same as cockpit-center-order); the store is driven directly to simulate the
 * subscription's transitions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
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
    <MemoryRouter initialEntries={["/characters/ghost-id"]}>
      <Routes>
        <Route path="/characters" element={<div>ROSTER ROUTE</div>} />
        <Route path="/characters/:characterId" element={<CharacterCockpit />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("cockpit loading / not-found guard", () => {
  beforeEach(() => {
    useUIStore.setState({ sheetMode: "play" });
  });

  it("on a fresh mount (subscription not yet resolved) shows the loader, never not-found or the HUD", () => {
    // The initial store state {character:null, loading:false, error:null} is the
    // SAME shape as settled-not-found; the mask must read it as "still booting"
    // (no signal emitted yet) → the FolioLoader (delayed), NOT not-found, NOT the HUD.
    useCharacterStore.setState({ character: null, loading: false, error: null });
    const { container } = renderCockpit();
    expect(screen.queryByText(/character not found/i)).toBeNull();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  it("while loading shows neither the HUD regions nor not-found", () => {
    useCharacterStore.setState({ character: null, loading: true, error: null });
    const { container } = renderCockpit();
    expect(container.querySelector('[role="tablist"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /back to your characters/i })).toBeNull();
    expect(screen.queryByText(/character not found/i)).toBeNull();
  });

  it("resolving to no document AFTER loading shows a recoverable not-found (no flash, no blank HUD)", () => {
    // Real transition: the subscription pulses loading=true, then resolves with no
    // document. During the loading pulse it must render nothing (never not-found),
    // and only once settled does the recoverable not-found appear.
    useCharacterStore.setState({ character: null, loading: true, error: null });
    const { container } = renderCockpit();
    expect(screen.queryByText(/character not found/i)).toBeNull();

    act(() => {
      useCharacterStore.setState({ character: null, loading: false, error: null });
    });

    expect(screen.getByText(/character not found/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /back to your characters/i })
    ).toBeInTheDocument();
    // The HUD regions never appear.
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  it("the not-found CTA returns to the roster", () => {
    useCharacterStore.setState({ character: null, loading: true, error: null });
    renderCockpit();
    act(() => {
      useCharacterStore.setState({ character: null, loading: false, error: null });
    });
    fireEvent.click(screen.getByRole("button", { name: /back to your characters/i }));
    expect(screen.getByText("ROSTER ROUTE")).toBeInTheDocument();
  });

  it("with a loaded character it renders the regions (the booting mask clears)", () => {
    useCharacterStore.setState({
      character: { ...MOCK_CHARACTER },
      loading: false,
      error: null,
    });
    const { container } = renderCockpit();
    expect(container.querySelector('[role="tablist"]')).not.toBeNull();
    expect(screen.queryByText(/character not found/i)).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
