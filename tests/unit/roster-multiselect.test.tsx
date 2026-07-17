/**
 * Roster multi-select → bulk delete (owner 2026-06-07).
 *
 * Integration over the real RosterPage + useRosterSelection + useRosterBulkActions +
 * RosterBulkBar + CharacterCard: entering selection mode reveals the checkboxes and
 * the floating bar, tapping cards toggles them, Select-all selects the view, and the
 * Delete action confirms then dispatches the bulk orchestrator with exactly the chosen
 * ids and leaves selection mode. `useCharacters` (data) and `deleteCharactersAndDetach`
 * (engine) are mocked; the confirm dialog is driven via the real confirm store.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { CharacterDoc } from "@/types/character";
import { MOCK_CHARACTER } from "@/lib/mock";

type RosterResult = {
  characters: CharacterDoc[];
  loading: boolean;
  error: string | null;
};

const { navigateMock, useCharactersMock, deleteCharactersMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useCharactersMock: vi.fn<() => RosterResult>(),
  deleteCharactersMock: vi.fn(() => Promise.resolve({ deleted: 0, failed: 0 })),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("@/hooks/useCharacters", () => ({ useCharacters: () => useCharactersMock() }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => false }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: { user: { uid: string } }) => unknown) =>
    selector({ user: { uid: "u1" } }),
}));
vi.mock("@/features/roster/delete-character", () => ({
  deleteCharactersAndDetach: deleteCharactersMock,
  deleteCharacterAndDetach: vi.fn(() => Promise.resolve()),
}));

import { RosterPage } from "@/features/roster/RosterPage";
import { useConfirmStore } from "@/stores/confirmStore";

function doc(id: string, name: string): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    id,
    character: { ...MOCK_CHARACTER.character, name: assertNonEmptyString(name) },
  };
}

function renderRoster() {
  return render(
    <MemoryRouter>
      <RosterPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  deleteCharactersMock.mockReset().mockResolvedValue({ deleted: 2, failed: 0 });
  useConfirmStore.setState({ open: false, options: null, _resolve: null });
  useCharactersMock.mockReturnValue({
    characters: [doc("a", "Lyra Voss"), doc("b", "Borin Stonefist")],
    loading: false,
    error: null,
  });
});

describe("roster multi-select", () => {
  it("the Select button enters selection mode (bar + checkboxes appear, navigation suppressed)", () => {
    const { container } = renderRoster();
    // Not selecting yet: cards are "Open …" navigators, no bar.
    expect(screen.getByRole("button", { name: /open lyra voss/i })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /selection actions/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Select" }));

    // Selecting: the floating bar shows the teaching zero-state, and cards are now
    // toggles. (Empty selection reads "Select characters", not a dead "0 selected".)
    const bar = screen.getByRole("region", { name: /selection actions/i });
    expect(within(bar).getByText(/select characters/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select lyra voss/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open lyra voss/i })).toBeNull();
    // The brass selection checkbox mirrors are rendered.
    expect(container.querySelectorAll(".ch-select").length).toBe(2);
  });

  it("tapping a card toggles it (count + aria-pressed), Select-all selects the view", () => {
    renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Select" }));

    const lyra = screen.getByRole("button", { name: /select lyra voss/i });
    fireEvent.click(lyra);
    expect(lyra).toHaveAttribute("aria-pressed", "true");
    const bar = screen.getByRole("region", { name: /selection actions/i });
    expect(within(bar).getByText(/1 selected/i)).toBeInTheDocument();

    fireEvent.click(within(bar).getByRole("button", { name: /select all/i }));
    expect(within(bar).getByText(/2 selected/i)).toBeInTheDocument();
  });

  it("Delete confirms then bulk-deletes exactly the selected ids and exits selection", async () => {
    renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    const bar = screen.getByRole("region", { name: /selection actions/i });

    // Select all, then Delete.
    fireEvent.click(within(bar).getByRole("button", { name: /select all/i }));
    fireEvent.click(within(bar).getByRole("button", { name: /^delete$/i }));

    // The confirm dialog is pending — approve it via the shared store.
    await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
    await act(async () => {
      useConfirmStore.getState().respond(true);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(deleteCharactersMock).toHaveBeenCalledWith("u1", ["a", "b"])
    );
    // Selection mode exits once the delete settles (the bar is gone).
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: /selection actions/i })).toBeNull()
    );
  });

  it("cancelling the confirm does NOT delete and stays in selection mode", async () => {
    renderRoster();
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    const bar = screen.getByRole("region", { name: /selection actions/i });
    fireEvent.click(screen.getByRole("button", { name: /select lyra voss/i }));
    fireEvent.click(within(bar).getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
    await act(async () => {
      useConfirmStore.getState().respond(false);
      await Promise.resolve();
    });

    expect(deleteCharactersMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: /selection actions/i })
    ).toBeInTheDocument();
  });
});
