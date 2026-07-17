/**
 * Chronicle section + chronicleStore (Phase 5 · Part 2b).
 *
 * The Chronicle READS the store (the scoped listener now lives in the HUB, whose
 * compose-once gate waits for the first snapshot — pinned in campaign-hub.test.tsx),
 * renders the shared text, and reflects local edits into `chronicleStore`; a Save
 * commits atomically through `commitChronicleEdit`. `@/lib/firebase` is mocked for
 * the guard.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const { subscribeMock } = vi.hoisted(() => {
  const subscribeMock = vi.fn(() => vi.fn());
  return { subscribeMock };
});

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: { user: { uid: string } }) => unknown) =>
    sel({ user: { uid: "u1" } }),
}));
vi.mock("@/features/campaigns/campaign-io", () => ({
  subscribeToChronicle: subscribeMock,
  // B18 — Save now commits atomically through this transaction; stub it resolving so the
  // draft-model Save flow (optimistic commitText → await → close editor) completes.
  commitChronicleEdit: vi.fn(() => Promise.resolve()),
}));

import { Chronicle } from "@/features/campaigns/Chronicle";
import { useChronicleStore } from "@/features/campaigns/chronicleStore";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { makeDevCampaign } from "@/features/campaigns/dev-fixture";

beforeEach(() => {
  subscribeMock.mockClear();
  useChronicleStore.setState({ chronicle: null, loading: false, error: null });
  useCampaignStore.setState({
    campaign: {
      ...makeDevCampaign("c1"),
      memberDetails: {
        // The mocked auth uid (u1) — a real display name so a byline showing it
        // verbatim (the bug) is distinguishable from the localized self label.
        u1: { displayName: "Salvatore", characterId: null, role: "dm" },
        "member-mara": { displayName: "Mara", characterId: null, role: "player" },
      },
    },
    loading: false,
    error: null,
  });
});

describe("Chronicle", () => {
  it("opens NO listener of its own — the hub owns the chronicle subscription (compose-once gate)", () => {
    render(<Chronicle campaignId="c1" campaignName="Test Campaign" />);
    // The listener moved to CampaignHubPage so the hub can hold its loader until
    // the chronicle's FIRST snapshot lands (the book-spread growing after paint
    // shoved every section below it). Pinned in campaign-hub.test.tsx; here the
    // section must stay a pure store READER.
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("renders the chronicle text from a snapshot", () => {
    const { container } = render(
      <Chronicle campaignId="c1" campaignName="Test Campaign" />
    );
    act(() =>
      useChronicleStore.getState().setChronicle({
        text: "Once upon a time",
        lastEditedBy: "u1",
        lastEditedAt: new Date(0),
        versions: [],
      })
    );
    // At rest the chronicle is a RENDERED reading view (#32), not a raw textarea;
    // the text shows as prose and the editor is revealed only on intent.
    expect(screen.getByText("Once upon a time")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    // CAMPAIGN-NOTES-UX — the chapter body sits inside the shared NoteClamp
    // reading bound, so one giant heading-less chapter can't swallow the hub.
    expect(container.querySelector(".chronicle-reader .note-clamp")).not.toBeNull();
    // The reading view offers a one-click export of the shared log as portable
    // markdown (it IS markdown) — present once there's a story to download.
    expect(screen.getByRole("button", { name: /^download$/i })).toBeInTheDocument();
  });

  it("commits the draft to the store on Save (D27 draft model — not on keystroke)", () => {
    render(<Chronicle campaignId="c1" campaignName="Test Campaign" />);
    // No story yet → no export affordance (Download lives only in the reading view).
    expect(screen.queryByRole("button", { name: /^download$/i })).not.toBeInTheDocument();
    // Empty chronicle → the empty state's "Write the first entry" reveals the editor.
    fireEvent.click(screen.getByRole("button", { name: /write the first entry/i }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "A new chapter" },
    });
    // D27 — typing fills a LOCAL draft; the store is untouched until Save.
    expect(useChronicleStore.getState().chronicle?.text ?? "").toBe("");
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(useChronicleStore.getState().chronicle?.text).toBe("A new chapter");
  });

  it("renders sub-headings and scene rules as block markdown, not literal text", () => {
    render(<Chronicle campaignId="c1" campaignName="Test Campaign" />);
    act(() =>
      useChronicleStore.getState().setChronicle({
        text: "Intro paragraph\n\n### A Scene\n\n---\n\n- one\n- two",
        lastEditedBy: "u1",
        lastEditedAt: new Date(0),
        versions: [],
      })
    );
    // The ### becomes a heading element (not the literal "### A Scene").
    const heading = screen.getByRole("heading", { name: "A Scene" });
    expect(heading).toBeInTheDocument();
    expect(screen.queryByText(/^###/)).not.toBeInTheDocument();
    // The list items render as list items.
    expect(screen.getByText("one").closest("li")).toBeInTheDocument();
  });

  // ── B32 — self-authored byline localization ─────────────────────────────────
  it("B32 — the byline reads the localized 'you' for the viewer's OWN last edit, never their raw account name", () => {
    render(<Chronicle campaignId="c1" campaignName="Test Campaign" />);
    act(() =>
      useChronicleStore.getState().setChronicle({
        text: "Once upon a time",
        lastEditedBy: "u1", // the mocked auth uid — the viewer themselves
        lastEditedAt: new Date(0),
        versions: [],
      })
    );
    expect(screen.getByText(/last written by you/i)).toBeInTheDocument();
    expect(screen.queryByText(/salvatore/i)).not.toBeInTheDocument();
  });

  it("a PEER's last edit still shows their real name (self-localization doesn't leak onto others)", () => {
    render(<Chronicle campaignId="c1" campaignName="Test Campaign" />);
    act(() =>
      useChronicleStore.getState().setChronicle({
        text: "Once upon a time",
        lastEditedBy: "member-mara",
        lastEditedAt: new Date(0),
        versions: [],
      })
    );
    expect(screen.getByText(/last written by mara/i)).toBeInTheDocument();
  });

  it("B32 — a self-authored VERSION in the history reads 'you' even though its stored snapshot name differs", () => {
    render(<Chronicle campaignId="c1" campaignName="Test Campaign" />);
    act(() =>
      useChronicleStore.getState().setChronicle({
        text: "Once upon a time",
        lastEditedBy: "member-mara",
        lastEditedAt: new Date(1),
        versions: [
          {
            timestamp: new Date(0),
            editedBy: "u1",
            // A name captured at a PAST commit — self-detection must override this
            // stored snapshot at render time (never bake "you" into Firestore, but
            // never show a stale/foreign name for the viewer's own past edit either).
            editedByName: "Salvatore",
            textSnapshot: "Once upon a time (draft)",
          },
        ],
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(screen.getByText(/^you$/i)).toBeInTheDocument();
    expect(screen.queryByText(/salvatore/i)).not.toBeInTheDocument();
  });
});

describe("chronicleStore", () => {
  it("setText creates a chronicle from null on the first edit", () => {
    useChronicleStore.setState({ chronicle: null, loading: false, error: null });
    useChronicleStore.getState().setText("hello", "u1");
    expect(useChronicleStore.getState().chronicle).toMatchObject({
      text: "hello",
      lastEditedBy: "u1",
    });
  });

  it("commitText snapshots the replaced text into the version history", () => {
    useChronicleStore.setState({
      chronicle: {
        text: "the old story",
        lastEditedBy: "u1",
        lastEditedAt: new Date("2026-01-01T00:00:00Z"),
        versions: [],
      },
      loading: false,
      error: null,
    });
    useChronicleStore
      .getState()
      .commitText("a fresh story", "u2", "Mara", new Date("2026-02-02T00:00:00Z"));
    const c = useChronicleStore.getState().chronicle;
    expect(c?.text).toBe("a fresh story");
    expect(c?.lastEditedBy).toBe("u2");
    expect(c?.versions[0]).toMatchObject({
      textSnapshot: "the old story",
      editedBy: "u1",
      editedByName: "Mara",
    });
  });

  it("commitText does not record a version for the first write (no prior text)", () => {
    useChronicleStore.setState({ chronicle: null, loading: false, error: null });
    useChronicleStore.getState().commitText("first entry", "u1", "", new Date());
    expect(useChronicleStore.getState().chronicle?.versions).toEqual([]);
  });
});
