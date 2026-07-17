/**
 * Sessions section (Phase 5 · Part 2b).
 *
 * One-shot list (mocked io) + optimistic create. `@/lib/firebase` is mocked for
 * the pure-modules guard (reached transitively via the mocked `campaign-io`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SessionLogDoc } from "@/types/campaign";

const { listMock, createMock, updateMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  createMock: vi.fn(),
  updateMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({
  listSessions: listMock,
  createSession: createMock,
  updateSession: updateMock,
  deleteSession: vi.fn(),
}));

import { Sessions } from "@/features/campaigns/Sessions";

function session(id: string, label: string): SessionLogDoc {
  return {
    id,
    label,
    notes: "",
    date: new Date(0),
    recapRequested: false,
    recapRequestedBy: null,
    recapRequestedAt: null,
    logs: {},
    generatedRecap: null,
    addedToChronicle: false,
  };
}

beforeEach(() => {
  listMock.mockReset().mockResolvedValue([]);
  createMock.mockReset().mockResolvedValue("new-session-id");
  updateMock.mockClear();
});

describe("Sessions", () => {
  it("lists sessions from the one-shot fetch", async () => {
    listMock.mockResolvedValue([session("s1", "Session 1")]);
    render(<Sessions campaignId="c1" />);
    expect(await screen.findByText("Session 1")).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith("c1");
  });

  it("shows the empty state when there are none", async () => {
    render(<Sessions campaignId="c1" />);
    expect(await screen.findByText(/no sessions logged yet/i)).toBeInTheDocument();
  });

  it("creates a session and shows it optimistically", async () => {
    render(<Sessions campaignId="c1" />);
    await screen.findByText(/no sessions logged yet/i);
    fireEvent.click(screen.getByRole("button", { name: /new session/i }));
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({ label: "Session 1" })
      )
    );
    expect(await screen.findByText("Session 1")).toBeInTheDocument();
  });

  it("expands to a read view and persists the summary on Save (D28 accordion)", async () => {
    listMock.mockResolvedValue([session("s1", "Session 1")]);
    render(<Sessions campaignId="c1" />);
    await screen.findByText("Session 1");
    // Collapsed: the editor is not mounted until the row is expanded.
    expect(screen.queryByLabelText(/session summary/i)).not.toBeInTheDocument();
    // Expand the row, then reveal the editor on intent.
    fireEvent.click(screen.getByRole("button", { name: /show session details/i }));
    fireEvent.click(screen.getByRole("button", { name: /add a summary/i }));
    const notes = await screen.findByLabelText(/session summary/i);
    fireEvent.change(notes, { target: { value: "Slew the goblin boss." } });
    // typing alone does not write — Save is the single commit point
    expect(updateMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updateMock).toHaveBeenCalledWith("c1", "s1", {
      notes: "Slew the goblin boss.",
    });
  });

  it("CAMPAIGN-NOTES-UX — bounds the list to the latest 5 sessions behind View all", async () => {
    // Newest first (the io contract): Sessions 7…1. At a glance only the latest
    // 5 show; the archive sits behind "View all (7)" and folds back.
    listMock.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => session(`s${7 - i}`, `Session ${7 - i}`))
    );
    render(<Sessions campaignId="c1" />);
    await screen.findByText("Session 7");
    expect(screen.getByText("Session 3")).toBeInTheDocument();
    expect(screen.queryByText("Session 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view all \(7\)/i }));
    expect(screen.getByText("Session 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show less/i }));
    expect(screen.queryByText("Session 1")).not.toBeInTheDocument();
  });

  it("renders an existing summary as block markdown when expanded", async () => {
    listMock.mockResolvedValue([
      { ...session("s1", "Session 1"), notes: "### The bridge\n\n- found a door" },
    ]);
    render(<Sessions campaignId="c1" />);
    await screen.findByText("Session 1");
    fireEvent.click(screen.getByRole("button", { name: /show session details/i }));
    // The ### becomes a heading (not literal text); the bullet becomes a list item.
    expect(
      await screen.findByRole("heading", { name: "The bridge" })
    ).toBeInTheDocument();
    expect(screen.getByText("found a door").closest("li")).toBeInTheDocument();
  });
});
