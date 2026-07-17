/**
 * Roster multi-select → bulk Export / Retire / Restore (owner 2026-06-07).
 *
 * Integration over the real RosterPage + useRosterBulkActions + RosterBulkBar: the
 * action set is CONTEXTUAL (Retire shows only with active characters selected, Restore
 * only with retired/dead ones), Export packs the whole selection into a re-importable
 * zip, and Retire/Restore flip exactly the relevant subset. The engine seams
 * (`downloadCharactersZip`, `setCharactersStatus`, the delete orchestrator) are mocked,
 * so it never touches Firebase.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { CharacterDoc } from "@/types/character";
import type { RosterCharacterDoc } from "@/lib/character-cache";
import { MOCK_CHARACTER } from "@/lib/mock";

type RosterResult = {
  // The roster reads the SRD-free PROJECTION (Layer 2), not the full CharacterDoc.
  characters: RosterCharacterDoc[];
  loading: boolean;
  error: string | null;
};

const { useCharactersMock, downloadZipMock, setStatusMock, getFullMock } = vi.hoisted(
  () => ({
    useCharactersMock: vi.fn<() => RosterResult>(),
    downloadZipMock:
      vi.fn<(docs: readonly CharacterDoc[]) => Promise<{ portraitsDropped: number }>>(),
    setStatusMock:
      vi.fn<
        (
          uid: string,
          ids: string[],
          status: string
        ) => Promise<{ changed: number; failed: number }>
      >(),
    // Bulk export re-reads each FULL character (the list is a projection, #106).
    getFullMock: vi.fn<(uid: string, id: string) => Promise<CharacterDoc | null>>(),
  })
);

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock("@/hooks/useCharacters", () => ({ useCharacters: () => useCharactersMock() }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => false }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (s: { user: { uid: string } }) => unknown) =>
    selector({ user: { uid: "u1" } }),
}));
vi.mock("@/features/roster/delete-character", () => ({
  deleteCharactersAndDetach: vi.fn(() => Promise.resolve({ deleted: 0, failed: 0 })),
  deleteCharacterAndDetach: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/roster/bulk-status", () => ({ setCharactersStatus: setStatusMock }));
// `getFullCharacter` is the on-demand FULL re-read the bulk export now uses (#106).
vi.mock("@/lib/firestore", () => ({ getFullCharacter: getFullMock }));
// Lazy-imported inside exportAll — the mock module resolves the dynamic import.
vi.mock("@/lib/character-io", () => ({ downloadCharactersZip: downloadZipMock }));

import { RosterPage } from "@/features/roster/RosterPage";
import { rosterProjectionFromDoc } from "@/lib/character-cache";

/** The roster list item — the SRD-free PROJECTION the real subscription streams. */
function doc(
  id: string,
  name: string,
  status: CharacterDoc["status"]
): RosterCharacterDoc {
  return rosterProjectionFromDoc({
    ...MOCK_CHARACTER,
    id,
    status,
    character: { ...MOCK_CHARACTER.character, name: assertNonEmptyString(name) },
  });
}

function renderWith(characters: RosterCharacterDoc[]) {
  useCharactersMock.mockReturnValue({ characters, loading: false, error: null });
  render(
    <MemoryRouter>
      <RosterPage />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: "Select" }));
  const bar = screen.getByRole("region", { name: /selection actions/i });
  fireEvent.click(within(bar).getByRole("button", { name: /select all/i }));
  return bar;
}

beforeEach(() => {
  downloadZipMock.mockReset().mockResolvedValue({ portraitsDropped: 0 });
  setStatusMock.mockReset().mockResolvedValue({ changed: 2, failed: 0 });
  useCharactersMock.mockReset();
  // The bulk export re-reads each full character by id; return a faithful full doc.
  getFullMock
    .mockReset()
    .mockImplementation((_uid, id) => Promise.resolve({ ...MOCK_CHARACTER, id }));
});

describe("roster bulk Export / Retire / Restore", () => {
  it("an active selection offers Export + Retire + Delete (no Restore)", () => {
    const bar = renderWith([
      doc("a", "Lyra Voss", "active"),
      doc("b", "Borin Stonefist", "active"),
    ]);
    expect(within(bar).getByRole("button", { name: /^export$/i })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /^retire$/i })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: /^restore$/i })).toBeNull();
  });

  it("a retired/dead selection offers Export + Restore + Delete (no Retire)", () => {
    const bar = renderWith([
      doc("a", "Lyra Voss", "retired"),
      doc("b", "Borin Stonefist", "dead"),
    ]);
    expect(within(bar).getByRole("button", { name: /^export$/i })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /^restore$/i })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: /^retire$/i })).toBeNull();
  });

  it("a mixed selection offers BOTH Retire and Restore (each acts on its subset)", () => {
    const bar = renderWith([
      doc("a", "Lyra Voss", "active"),
      doc("b", "Borin Stonefist", "retired"),
    ]);
    expect(within(bar).getByRole("button", { name: /^retire$/i })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /^restore$/i })).toBeInTheDocument();
  });

  it("Export packs the whole selection into a zip", async () => {
    const bar = renderWith([
      doc("a", "Lyra Voss", "active"),
      doc("b", "Borin Stonefist", "active"),
    ]);
    fireEvent.click(within(bar).getByRole("button", { name: /^export$/i }));
    await waitFor(() => expect(downloadZipMock).toHaveBeenCalledTimes(1));
    // Each selected id is re-read to its FULL character before zipping (#106 — the
    // roster list is a projection; serializing it directly would truncate).
    expect(getFullMock).toHaveBeenCalledWith("u1", "a");
    expect(getFullMock).toHaveBeenCalledWith("u1", "b");
    const docs = downloadZipMock.mock.calls[0]?.[0] ?? [];
    expect([...docs].map((d) => d.id).sort()).toEqual(["a", "b"]);
    // Export is read-only → stays in selection mode.
    expect(
      screen.getByRole("region", { name: /selection actions/i })
    ).toBeInTheDocument();
  });

  it("Retire flips only the active subset and exits selection", async () => {
    const bar = renderWith([
      doc("a", "Lyra Voss", "active"),
      doc("b", "Borin Stonefist", "retired"),
    ]);
    fireEvent.click(within(bar).getByRole("button", { name: /^retire$/i }));
    await waitFor(() =>
      expect(setStatusMock).toHaveBeenCalledWith("u1", ["a"], "retired")
    );
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: /selection actions/i })).toBeNull()
    );
  });
});
