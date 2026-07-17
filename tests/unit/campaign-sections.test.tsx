/**
 * Campaign hub sections — Party · Treasury · SharedNotes (Phase 5 · Part 2b).
 *
 * Party renders each member's identity HEAD from the denormalized `memberDetails`; the
 * live stat BODY loads each attached member's real doc (the in-hub live read, open to
 * every co-member after C5). Treasury + SharedNotes mutate `campaignStore` (the hub
 * debounce-persists those mutations through the 2a path). `@/lib/firebase` is mocked for
 * the pure-modules guard (the sections reach it transitively via `authStore`).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactElement } from "react";

vi.mock("@/lib/firebase", () => ({ db: {} }));
// Pin the dev-bypass OFF so these tests exercise the real (mocked-Firestore) paths
// regardless of a local `.env.local` (VITE_DEV_BYPASS_AUTH=true). Under bypass the
// member hooks resolve dev fixtures instead of the mocks below, and `useIsAdmin`
// returns true — both of which corrupt the "non-DM, non-admin member" premise these
// peer-read / dmOnly-filter assertions depend on. (Same pattern as campaign-hub.test.)
vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
// The Party's attach picker reads the current user's roster via useCharacters
// (a Firestore subscription) — mock it so these CI-pure tests never touch firebase.
vi.mock("@/hooks/useCharacters", () => ({
  useCharacters: () => ({ characters: [], loading: false, error: null }),
}));
// Resolve every member's full doc to the mock hero (no Firestore round-trip) so the
// live cards settle; mock the live `combat/state` listener absent (→ full HP).
vi.mock("@/lib/firestore", async (orig) => {
  const actual = await orig<typeof import("@/lib/firestore")>();
  const { MOCK_CHARACTER } = await import("@/lib/mock");
  return {
    ...actual,
    getFullCharacter: (_uid: string, id: string) =>
      Promise.resolve({ ...MOCK_CHARACTER, id }),
  };
});
vi.mock("@/lib/combat-state-io", () => ({
  subscribeCombatState: (_uid: string, _id: string, cb: (s: null) => void) => {
    cb(null);
    return () => {};
  },
  writeCombatState: () => {},
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: { user: { uid: string } }) => unknown) =>
    sel({ user: { uid: "u1" } }),
}));
// Deleting a shared note routes through the confirm dialog (CMP5); auto-confirm
// so the section test exercises the delete path without mounting ConfirmDialog.
vi.mock("@/stores/confirmStore", () => ({
  useConfirmStore: { getState: () => ({ confirm: () => Promise.resolve(true) }) },
}));
// SharedNotes opens a live notes subscription + writes per-note docs through
// campaign-io. These pure CI tests drive the `notes` slice directly, so stub the
// subscription hook to a no-op and the per-note writes to resolved no-ops (the
// optimistic store mutation is what the assertions observe).
vi.mock("@/features/campaigns/useCampaignNotesSubscription", () => ({
  useCampaignNotesSubscription: () => {},
}));
vi.mock("@/features/campaigns/campaign-io", async (orig) => {
  const actual = await orig<typeof import("@/features/campaigns/campaign-io")>();
  return {
    ...actual,
    setCampaignNote: vi.fn(() => Promise.resolve()),
    setCampaignNoteHidden: vi.fn(() => Promise.resolve()),
    deleteCampaignNote: vi.fn(() => Promise.resolve()),
  };
});

import { Party } from "@/features/campaigns/Party";
import { Treasury } from "@/features/campaigns/Treasury";
import { SharedNotes } from "@/features/campaigns/SharedNotes";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { makeDevCampaign, makeDevNotes } from "@/features/campaigns/dev-fixture";

beforeEach(() => {
  useCampaignStore.setState({
    campaign: makeDevCampaign("c1"),
    loading: false,
    error: null,
    // The two VISIBLE seeded notes (the pinned Morweth + the long rumor) — the
    // SharedNotes generic tests assume this two-note board.
    notes: makeDevNotes().filter((n) => !n.dmOnly),
    notesLoading: false,
    notesError: null,
  });
});

// Party now navigates (the DM "View sheet" entry point — T4), so it must render
// inside a router.
function renderRouted(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Party", () => {
  it("renders each member's identity head from memberDetails", () => {
    renderRouted(<Party />);
    expect(screen.getByText("Mara")).toBeInTheDocument();
    expect(screen.getByText("Bren")).toBeInTheDocument();
    expect(screen.getByText(/dungeon master/i)).toBeInTheDocument();
  });

  it("makes the CHARACTER name the predominant title, player name secondary, no handle (OWNER-10/11)", () => {
    renderRouted(<Party />);
    // The hero is the card's predominant title (where the player name used to sit)…
    expect(screen.getByText("Coralino di Sanvaldo")).toBeInTheDocument();
    // …the player's small Google name rides alongside, top-right…
    expect(screen.getByText("Mara")).toBeInTheDocument();
    // …and the dropped table handle (OWNER-11) no longer renders anywhere.
    expect(screen.queryByText("Mara the Bold")).not.toBeInTheDocument();
  });

  it("a non-DM member ALSO gets the live cards (C5 peer read), but no Run-encounter", async () => {
    // currentUid u1 is NOT the DM (dmUid stays mock-uid) and not admin. After C5 the
    // peer read is authorized, so a player now sees every teammate's LIVE card — the
    // collapsed Open-sheet stays hidden until expanded; the DM-only Run action is absent.
    renderRouted(<Party />);
    // The minimal resting card (CARD-6) shows the AC/HP cluster; passives are behind the
    // disclosure. Two attached members → two live AC chips.
    expect(await screen.findAllByLabelText(/^Armor Class:/)).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /open sheet/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /run encounter/i })
    ).not.toBeInTheDocument();
  });
});

describe("Treasury", () => {
  it("keeps the coins + Add/Take FIXED; only the ledger is the collapsible detail (bug C)", () => {
    const { container } = render(<Treasury />);
    const detail = container.querySelector(".section-detail");
    // The transaction ledger (the undo rows) is the collapsible DETAIL…
    const ledgerUndo = screen.getAllByRole("button", { name: /undo transaction/i })[0];
    expect(detail?.contains(ledgerUndo as Node)).toBe(true);
    // …while the Add/Take controls live in the FIXED panel OUTSIDE the detail, so a
    // collapsed Treasury still shows them (bug C: a folded section used to show
    // nothing). The opening tap is also OUTSIDE the detail.
    const addBtn = screen.getByRole("button", { name: /add coins/i });
    expect(detail?.contains(addBtn)).toBe(false);
    const takeBtn = screen.getByRole("button", { name: /take coins/i });
    expect(detail?.contains(takeBtn)).toBe(false);
  });

  it("an EMPTY ledger keeps the .section-card frame via an honest empty-state detail (owner bug)", () => {
    // Empty the pot + log: SectionPanel frames ONLY a truthy `detail`, so the empty
    // case must still supply one or the coins + buttons float frameless.
    const base = makeDevCampaign("c1");
    useCampaignStore.setState({
      campaign: {
        ...base,
        treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
        treasuryLog: [],
      },
    });
    const { container } = render(<Treasury />);
    // The honest empty sentence renders (no transactions) …
    const empty = screen.getByText(/no transactions yet/i);
    // … inside the carved .section-card frame (the fix — previously absent).
    const card = container.querySelector(".section-card");
    expect(card).not.toBeNull();
    expect(card?.contains(empty)).toBe(true);
    // The Add/Take controls still ride the FIXED panel inside the same frame.
    expect(card?.contains(screen.getByRole("button", { name: /add coins/i }))).toBe(true);
    expect(screen.queryByRole("button", { name: /undo transaction/i })).toBeNull();
  });

  it("adds coins via the fastest path: Add coins → amount → one commit", () => {
    render(<Treasury />);
    // Intent is declared by the opening tap (TREASURY-UX), so the disclosed form
    // has ONE commit button — also labeled "Add coins".
    fireEvent.click(screen.getByRole("button", { name: /add coins/i }));
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /add coins/i }));
    const c = useCampaignStore.getState().campaign;
    expect(c?.treasury.gp).toBe(155); // fixture 145 + 10
    expect(c?.treasuryLog.at(-1)).toMatchObject({
      amount: 10,
      currency: "gp",
      type: "add",
    });
  });

  it("clamps a take to the coin's balance — an overdraft is unreachable (rule 20)", () => {
    render(<Treasury />);
    fireEvent.click(screen.getByRole("button", { name: /take coins/i }));
    // Pick platinum (the fixture holds 2 pp) by tapping its metal token.
    fireEvent.click(screen.getByRole("button", { name: /pp/i }));
    const amount = screen.getByLabelText(/amount/i);
    // The stepper bounds typing to [1, balance]: typing 5 commits 2.
    fireEvent.change(amount, { target: { value: "5" } });
    expect(amount).toHaveAttribute("aria-valuenow", "2");
    expect(amount).toHaveAttribute("aria-valuemax", "2");
    fireEvent.click(screen.getByRole("button", { name: /take coins/i }));
    const c = useCampaignStore.getState().campaign;
    expect(c?.treasury.pp).toBe(0);
    // The ledger records the TRUTH (2 taken) — over-asking was never possible.
    expect(c?.treasuryLog.at(-1)).toMatchObject({
      amount: 2,
      currency: "pp",
      type: "remove",
    });
  });

  it("bounds the history to the latest 5 with View all (CAMPAIGN-NOTES pattern)", () => {
    render(<Treasury />);
    // The fixture seeds 8 entries — only the newest 5 render at rest.
    expect(screen.getAllByRole("button", { name: /undo transaction/i })).toHaveLength(5);
    expect(screen.queryByText(/goblin hoard/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view all \(8\)/i }));
    expect(screen.getAllByRole("button", { name: /undo transaction/i })).toHaveLength(8);
    expect(screen.getByText(/goblin hoard/i)).toBeInTheDocument();
    // Rows carry who + when (the trust meta for shared money).
    expect(screen.getAllByText(/mara ·/i).length).toBeGreaterThan(0);
  });

  it("undoing an OLD mid-history transaction deletes it AND reverses the coins", async () => {
    render(<Treasury />);
    const gpBefore = useCampaignStore.getState().campaign?.treasury.gp ?? 0;
    fireEvent.click(screen.getByRole("button", { name: /view all \(8\)/i }));
    // Newest-first: "Healing potions ×3" (−60 gp, a pre-existing fixture entry)
    // sits mid-history at display index 5. Undo is confirm-gated (auto-true mock).
    const undos = screen.getAllByRole("button", { name: /undo transaction/i });
    fireEvent.click(undos[5] as HTMLElement);
    await waitFor(() => {
      const c = useCampaignStore.getState().campaign;
      expect(c?.treasury.gp).toBe(gpBefore + 60); // the take returns to the pot
      expect(c?.treasuryLog).toHaveLength(7);
      expect(c?.treasuryLog.some((e) => e.note === "Healing potions ×3")).toBe(false);
    });
  });
});

describe("SharedNotes", () => {
  it("adds a shared note", () => {
    render(<SharedNotes />);
    // The add form is disclosed on demand (CMP5): open it, fill, then submit.
    fireEvent.click(screen.getByRole("button", { name: /add note/i }));
    fireEvent.change(screen.getByLabelText(/^title$/i), {
      target: { value: "Goblin ambush" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add note/i }));
    expect(
      useCampaignStore.getState().notes.some((n) => n.title === "Goblin ambush")
    ).toBe(true);
  });

  it("edits a shared note in place, preserving its id + pinned (CN1)", () => {
    render(<SharedNotes />);
    // The fixture seeds the pinned "Morweth the druid" + the long rumor note; the
    // pinned note sorts first, so its editor is the first edit button.
    fireEvent.click(
      screen.getAllByRole("button", { name: /edit note/i })[0] as HTMLElement
    );
    const content = screen.getByLabelText(/^note$/i);
    fireEvent.change(content, { target: { value: "Wants the missing shard back." } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    const note = useCampaignStore.getState().notes.find((n) => n.id === "note-morweth");
    expect(note?.content).toBe("Wants the missing shard back.");
    // Editing the text preserves the note's pinned state + identity.
    expect(note?.pinned).toBe(true);
    // No duplicate note was created (upsert by id).
    expect(useCampaignStore.getState().notes).toHaveLength(2);
  });

  it("removes a shared note after confirmation", async () => {
    render(<SharedNotes />);
    // Delete the first (pinned "Morweth the druid") note — confirms (auto-confirmed
    // by the mock above), then removes it and only it.
    fireEvent.click(
      screen.getAllByRole("button", { name: /remove note/i })[0] as HTMLElement
    );
    await waitFor(() => expect(useCampaignStore.getState().notes).toHaveLength(1));
    expect(useCampaignStore.getState().notes.some((n) => n.id === "note-morweth")).toBe(
      false
    );
  });

  it("CAMPAIGN-NOTES-UX — bounds the board to 5 notes (pinned first, then newest) behind View all", () => {
    const base = makeDevCampaign("c1");
    // 7 notes: the OLDEST one pinned (pins outrank recency), the rest unpinned
    // with ascending dates — so the at-a-glance board is the pin + the 4 freshest.
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `n${i}`,
      title: `Note ${i}`,
      content: "x",
      pinned: i === 0,
      createdBy: "u1",
      updatedAt: new Date(2026, 0, i + 1),
    }));
    useCampaignStore.setState({
      campaign: base,
      loading: false,
      error: null,
      notes: many,
      notesLoading: false,
      notesError: null,
    });
    render(<SharedNotes />);
    const titles = () =>
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles()).toEqual(["Note 0", "Note 6", "Note 5", "Note 4", "Note 3"]);
    // The long tail is behind "View all (7)" …
    expect(screen.queryByText("Note 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view all \(7\)/i }));
    expect(titles()).toHaveLength(7);
    // … and "Show less" folds it back.
    fireEvent.click(screen.getByRole("button", { name: /show less/i }));
    expect(titles()).toHaveLength(5);
  });

  it("CAMPAIGN-NOTES-UX — no Show-more affordance when nothing overflows (honest blank)", () => {
    // jsdom has no layout (every note measures 0 ≯ cap), which IS the short-note
    // case: the clamp must not render any affordance. The real overflow verdict
    // is pinned with mocked geometry in note-clamp.test.tsx.
    render(<SharedNotes />);
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });
});

// Content-sharing lens (SOFT model): a DM can hold a shared note hidden from
// players, then reveal it. The mocked uid is "u1"; the dev fixture's DM is
// "mock-uid" (so u1 renders as a plain member by default), and a campaign with
// `dmUid: "u1"` renders the DM view.
describe("SharedNotes — content-sharing lens", () => {
  const secretNote = {
    id: "note-secret",
    title: "The traitor",
    content: "Morweth is a spy.",
    pinned: false,
    createdBy: "u1",
    updatedAt: new Date(2026, 0, 5),
    dmOnly: true,
  };

  it("hides a dmOnly note from a non-DM member (absent from the list)", () => {
    const base = makeDevCampaign("c1"); // dmUid "mock-uid" ≠ the mocked uid "u1"
    // The server would never even SEND a player a hidden note (the rules gate); the
    // client filter here is the defense-in-depth second pass over the same absence.
    useCampaignStore.setState({
      campaign: base,
      loading: false,
      error: null,
      notes: [secretNote],
      notesLoading: false,
      notesError: null,
    });
    render(<SharedNotes />);
    expect(screen.queryByText("The traitor")).not.toBeInTheDocument();
    // …and the empty state stands in, since it was the only note.
    expect(screen.getByText(/no shared notes yet/i)).toBeInTheDocument();
  });

  it("shows the DM a dmOnly note with the Hidden badge + a reveal toggle", () => {
    const base = makeDevCampaign("c1");
    useCampaignStore.setState({
      campaign: { ...base, dmUid: "u1" },
      loading: false,
      error: null,
      notes: [secretNote],
      notesLoading: false,
      notesError: null,
    });
    render(<SharedNotes />);
    expect(screen.getByText("The traitor")).toBeInTheDocument();
    expect(screen.getByText(/hidden from players/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reveal to players/i })
    ).toBeInTheDocument();
  });

  it("hides a shared note when the DM taps the toggle (flips dmOnly)", () => {
    const base = makeDevCampaign("c1");
    const openNote = {
      id: "note-open",
      title: "Open lore",
      content: "Everyone may read this.",
      pinned: false,
      createdBy: "u1",
      updatedAt: new Date(2026, 0, 6),
      dmOnly: false,
    };
    useCampaignStore.setState({
      campaign: { ...base, dmUid: "u1" },
      loading: false,
      error: null,
      notes: [openNote],
      notesLoading: false,
      notesError: null,
    });
    render(<SharedNotes />);
    // Shared → the toggle offers "Hide from players"; tapping it sets dmOnly.
    fireEvent.click(screen.getByRole("button", { name: /hide from players/i }));
    const note = useCampaignStore.getState().notes.find((n) => n.id === "note-open");
    expect(note?.dmOnly).toBe(true);
    // Upsert by id: no duplicate, identity + content preserved.
    expect(useCampaignStore.getState().notes).toHaveLength(1);
    expect(note?.content).toBe("Everyone may read this.");
  });
});
