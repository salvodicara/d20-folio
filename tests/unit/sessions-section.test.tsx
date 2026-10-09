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
const { logStore } = vi.hoisted(() => ({
  logStore: { recent: vi.fn(() => Promise.resolve([] as unknown[])) },
}));
vi.mock("@/features/campaigns/session-log-source", () => ({
  sessionLogStoreFor: () => logStore,
}));
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
  localStorage.clear();
  listMock.mockReset().mockResolvedValue([]);
  createMock.mockReset().mockResolvedValue("new-session-id");
  updateMock.mockClear();
  logStore.recent.mockReset().mockResolvedValue([]);
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

  it("opens the latest session rendered, and edits it in place with one click", async () => {
    listMock.mockResolvedValue([
      {
        ...session("s1", "Session 1"),
        notes: "### The bridge\n\nMet a **goblin scout**.",
      },
    ]);
    render(<Sessions campaignId="c1" openLatest />);
    // Read view: the markdown is rendered, never shown as source.
    expect(
      await screen.findByRole("heading", { name: "The bridge" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/###/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^session summary$/i)).not.toBeInTheDocument();
    // One click into the living document; autosave, no Save ceremony.
    fireEvent.click(screen.getByRole("button", { name: /edit session summary/i }));
    const notes = await screen.findByLabelText(/^session summary$/i);
    expect(notes).toHaveValue("### The bridge\n\nMet a **goblin scout**.");
    expect(notes).toHaveFocus();
    fireEvent.change(notes, { target: { value: "Slew the goblin boss." } });
    expect(localStorage.getItem("d20.sessionDraft.c1.s1")).toBe("Slew the goblin boss.");
    expect(updateMock).not.toHaveBeenCalled();
    fireEvent.blur(notes);
    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith("c1", "s1", {
        notes: "Slew the goblin boss.",
      })
    );
    // Back to the rendered page.
    expect(await screen.findByText("Slew the goblin boss.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^session summary$/i)).not.toBeInTheDocument();
  });

  it("opens an empty session straight into the editor (nothing to read yet)", async () => {
    listMock.mockResolvedValue([session("s1", "Session 1")]);
    render(<Sessions campaignId="c1" openLatest />);
    expect(await screen.findByLabelText(/^session summary$/i)).toHaveValue("");
  });

  it("restores a crash-safe local draft over the last confirmed remote summary", async () => {
    listMock.mockResolvedValue([
      { ...session("s1", "Session 1"), notes: "The party crossed the bridge." },
    ]);
    localStorage.setItem(
      "d20.sessionDraft.c1.s1",
      "The party crossed the bridge and met a scout."
    );
    render(<Sessions campaignId="c1" openLatest />);
    expect(
      await screen.findByText("The party crossed the bridge and met a scout.")
    ).toBeInTheDocument();
  });

  it("opens an archived session to its page, with delete as a document action", async () => {
    listMock.mockResolvedValue([
      { ...session("s1", "Session 1"), notes: "Original recap." },
    ]);
    render(<Sessions campaignId="c1" />);
    await screen.findByText("Session 1");
    fireEvent.click(screen.getByRole("button", { name: /show session details/i }));
    expect(await screen.findByText("Original recap.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /edit session summary/i }));
    expect(await screen.findByLabelText(/^session summary$/i)).toHaveValue(
      "Original recap."
    );
    expect(screen.getByRole("button", { name: /delete session/i })).toBeInTheDocument();
  });

  it("joins the same evening's automatic report to its session", async () => {
    listMock.mockResolvedValue([
      { ...session("s1", "Session 1"), date: new Date(2026, 9, 8, 21), notes: "Notes." },
    ]);
    logStore.recent.mockResolvedValue([
      {
        id: "2026-10-08",
        lastAt: 1,
        items: [
          {
            id: "a",
            by: "u",
            at: 1,
            type: "event",
            event: { kind: "rest", rest: "short" },
          },
        ],
      },
    ]);
    render(<Sessions campaignId="c1" openLatest />);
    fireEvent.click(await screen.findByRole("button", { name: /automatic report/i }));
    expect(await screen.findByRole("button", { name: /^copy$/i })).toBeInTheDocument();
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

  it("re-reads the evening reports each time the Journal is shown", async () => {
    listMock.mockResolvedValue([]);
    const { rerender } = render(<Sessions campaignId="c1" visible={false} />);
    await screen.findByText(/no sessions logged yet/i);
    // A fight is played while the Journal tab is hidden…
    logStore.recent.mockResolvedValue([
      {
        id: "2026-10-09",
        lastAt: 1,
        items: [
          {
            id: "a",
            by: "u",
            at: 1,
            type: "event",
            event: { kind: "rest", rest: "short" },
          },
        ],
      },
    ]);
    // …then the DM opens the Journal: the evening and its report are there.
    rerender(<Sessions campaignId="c1" visible />);
    expect(
      await screen.findByRole("button", { name: /automatic report/i })
    ).toBeInTheDocument();
  });
});
