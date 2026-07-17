/**
 * SnapshotsHistory — the cockpit's controlled version-history host (#14).
 * Proves the orchestration the container owns: the closed→open edge fetches the
 * list, "Save snapshot" writes a manual snapshot then refreshes, and the
 * firestore io + auth/character stores are mocked so it never touches
 * Firestore. (Restore/delete live in SnapshotsModal and are covered there.)
 */
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import i18n from "@/i18n";
import { MOCK_CHARACTER } from "@/lib/mock";

const { listMock, saveMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/lib/firestore", () => ({
  listCharacterSnapshots: listMock,
  saveCharacterSnapshot: saveMock,
  restoreCharacterSnapshot: vi.fn(),
  deleteCharacterSnapshot: vi.fn(),
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: { user: { uid: string } }) => unknown) =>
    sel({ user: { uid: "u1" } }),
}));
const charDoc = { ...MOCK_CHARACTER, id: "mock-1" };
vi.mock("@/stores/characterStore", () => ({
  useCharacterStore: (sel: (s: { character: typeof charDoc }) => unknown) =>
    sel({ character: charDoc }),
}));

import { SnapshotsHistory } from "@/features/character/SnapshotsHistory";

/** The header's controlled wiring in miniature: an "Open history" trigger
 *  driving the host's `open`/`onOpenChange` (the ⋯ overflow item's job). */
function Harness({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open history
      </button>
      <SnapshotsHistory open={open} onOpenChange={setOpen} />
    </>
  );
}

describe("SnapshotsHistory", () => {
  beforeEach(() => {
    listMock.mockReset().mockResolvedValue([]);
    saveMock.mockReset().mockResolvedValue("snap-1");
  });

  it("does not fetch while closed", () => {
    render(<Harness />);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("opens the modal and fetches the snapshot list on the closed→open edge", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /open history/i }));
    await waitFor(() => expect(listMock).toHaveBeenCalledWith("u1", "mock-1"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("saves a manual snapshot then refreshes the list", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /open history/i }));
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /save snapshot/i }));
    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith(
        "u1",
        "mock-1",
        expect.objectContaining({ reason: "manual" })
      )
    );
    // The save re-fetches the list so the new entry appears.
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  describe("snapshot rows say what they STORE (derived, never a stored label)", () => {
    afterEach(() => {
      void i18n.changeLanguage("en");
    });

    it("derives a localized multiclass class·level summary from the snapshot's own character data", async () => {
      await i18n.changeLanguage("it");
      listMock.mockResolvedValue([
        {
          id: "snap-mc",
          reason: "level-up",
          createdAt: new Date("2026-06-12T01:00:00Z"),
          character: {
            ...MOCK_CHARACTER.character,
            classes: [
              { classId: "rogue", level: 3 },
              { classId: "wizard", level: 2 },
            ],
          },
          session: MOCK_CHARACTER.session,
          // Old docs may still CARRY the stored EN label — it must never render
          // (rule 10: the derived summary fully supersedes it).
          label: "Pre level-up snapshot (Lv 4)",
        },
      ]);
      render(<Harness initialOpen />);
      // Derived AT RENDER, localized by id: "Ladro 3 · Mago 2 — Liv 5".
      expect(await screen.findByText("Ladro 3 · Mago 2 — Liv 5")).toBeInTheDocument();
      // The stored English label never appears in the IT UI.
      expect(screen.queryByText(/Pre level-up snapshot/)).not.toBeInTheDocument();
      // The timestamp follows the APP locale, not the browser's ("12 giu 2026",
      // never "Jun 12, 2026" inside the IT UI).
      expect(screen.getByText(/giu/)).toBeInTheDocument();
    });

    it("renders a compact single-class summary without the total-level suffix", async () => {
      await i18n.changeLanguage("it");
      listMock.mockResolvedValue([
        {
          id: "snap-sc",
          reason: "manual",
          createdAt: new Date("2026-06-12T01:00:00Z"),
          character: {
            ...MOCK_CHARACTER.character,
            classes: [{ classId: "barbarian", level: 4 }],
          },
          session: MOCK_CHARACTER.session,
        },
      ]);
      render(<Harness initialOpen />);
      expect(await screen.findByText("Barbaro 4")).toBeInTheDocument();
      expect(screen.queryByText(/— Liv/)).not.toBeInTheDocument();
    });
  });
});
