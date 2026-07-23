/**
 * RosterPage + CharacterCard — the real "My Characters" roster (Phase 6).
 *
 * Verifies the four roster states, the Create CTA → /characters/new, and that a
 * card's primary activation opens the cockpit at /characters/:id (the cockpit
 * URL — tabs are in-view state, NOT a /combat sub-route). `useCharacters` (the
 * roster's ONLY data path) is mocked so the test never touches Firestore.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { CharacterDoc } from "@/types/character";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { RosterCharacterDoc } from "@/lib/character-cache";

type RosterResult = {
  // The roster reads the SRD-free PROJECTION (Layer 2), not the full CharacterDoc.
  characters: RosterCharacterDoc[];
  loading: boolean;
  error: string | null;
};

// Hoisted alongside the vi.mock factories (the factories run on the hoisted
// ESM imports below, before any non-hoisted const would initialize).
const { navigateMock, useCharactersMock, actionsMock, loadExampleMock, isAdminState } =
  vi.hoisted(() => ({
    navigateMock: vi.fn(),
    useCharactersMock: vi.fn<() => RosterResult>(),
    // The card's data hook is mocked so these CharacterCard tests stay PURE VIEW
    // tests — they assert the menu dispatches to the hook; the hook's own logic
    // is covered in use-roster-actions.test.tsx.
    actionsMock: {
      exportJson: vi.fn(() => Promise.resolve()),
      clone: vi.fn(() => Promise.resolve()),
      retire: vi.fn(() => Promise.resolve()),
      restore: vi.fn(() => Promise.resolve()),
      remove: vi.fn(() => Promise.resolve()),
    },
    // Page-level admin "Load example" action + the admin gate (both mocked so the
    // RosterPage tests can flip admin on/off without touching env or Firestore).
    loadExampleMock: vi.fn(() => Promise.resolve()),
    isAdminState: { value: false },
  }));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/hooks/useCharacters", () => ({
  useCharacters: () => useCharactersMock(),
}));

vi.mock("@/features/roster/use-roster-actions", () => ({
  useRosterActions: () => actionsMock,
  useLoadExample: () => loadExampleMock,
}));

vi.mock("@/hooks/useIsAdmin", () => ({
  useIsAdmin: () => isAdminState.value,
}));

// `useCharacters` is mocked, so Firestore is never touched at runtime — but the
// pure-modules guard scans the static import graph (RosterPage → useCharacters →
// firestore → firebase). Mocking the firebase entrypoint keeps the CI-safety
// guard green (no auth/invalid-api-key on key-less CI).
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { RosterPage } from "@/features/roster/RosterPage";
import { CharacterCard } from "@/features/roster/CharacterCard";
import { rosterProjectionFromDoc, cacheToRosterDoc } from "@/lib/character-cache";

/** Project the canonical mock down to the roster's SRD-free {@link RosterCharacterDoc}
 *  shape — the EXACT type the real `useCharacters` subscription streams. */
function makeDoc(overrides: Partial<CharacterDoc> = {}): RosterCharacterDoc {
  return rosterProjectionFromDoc({ ...MOCK_CHARACTER, id: "mock-1", ...overrides });
}

beforeEach(() => {
  navigateMock.mockReset();
  useCharactersMock.mockReset();
  actionsMock.exportJson.mockClear();
  actionsMock.clone.mockClear();
  actionsMock.retire.mockClear();
  actionsMock.restore.mockClear();
  actionsMock.remove.mockClear();
  loadExampleMock.mockClear();
  isAdminState.value = false;
});

describe("RosterPage", () => {
  function renderRoster() {
    return render(
      <MemoryRouter>
        <RosterPage />
      </MemoryRouter>
    );
  }

  it("renders a folio card per character (name + class + level)", () => {
    useCharactersMock.mockReturnValue({
      characters: [makeDoc()],
      loading: false,
      error: null,
    });
    const { container } = renderRoster();

    expect(screen.getByText("Lyra Voss")).toBeInTheDocument();
    // The card's primary action is a button whose accessible name carries the name.
    expect(screen.getByRole("button", { name: /open lyra voss/i })).toBeInTheDocument();
    // Class + level live in the `.ch-sub` lemma.
    const sub = container.querySelector(".ch-sub");
    expect(sub?.textContent).toMatch(/Bard/);
    expect(sub?.textContent).toMatch(/9/);
  });

  it("mounts the realm's own backdrop (--app-bg-art → the Hall of Heroes plate) and clears it on unmount", () => {
    useCharactersMock.mockReturnValue({
      characters: [makeDoc()],
      loading: false,
      error: null,
    });
    const { unmount } = renderRoster();
    expect(document.documentElement.style.getPropertyValue("--app-bg-art")).toBe(
      "var(--asset-roster-scene)"
    );
    unmount();
    expect(document.documentElement.style.getPropertyValue("--app-bg-art")).toBe("");
  });

  it("seats the crest watermark in its header — the frontispiece on a standard-field masthead (DESIGN.md §13)", () => {
    // The roster is a framed masthead on the standard app field, so it carries the
    // engraved brand crest as its frontispiece watermark (the art-backed campaign
    // hub is the one masthead that omits it). This pins the live opt-in.
    useCharactersMock.mockReturnValue({
      characters: [makeDoc()],
      loading: false,
      error: null,
    });
    const { container } = renderRoster();
    expect(container.querySelector(".page-head-crest")).not.toBeNull();
    expect(container.querySelector(".page-head.has-crest")).not.toBeNull();
  });

  it("shows the runic empty state with a Create CTA when there are no characters", () => {
    useCharactersMock.mockReturnValue({ characters: [], loading: false, error: null });
    renderRoster();

    // The title emphasises "folio" via an <em>, so the text spans nodes — match
    // on the heading's accessible name (which concatenates them).
    expect(
      screen.getByRole("heading", { name: /your folio awaits/i })
    ).toBeInTheDocument();
    // The welcome ACTS: a Create CTA lives in the header AND inside the hero
    // itself (the empty state is the surface — P8), both on the wizard route.
    const creates = screen.getAllByRole("button", { name: /create character/i });
    expect(creates.length).toBe(2);
    const inHero = creates[creates.length - 1];
    if (!inHero) throw new Error("empty-state Create CTA missing");
    fireEvent.click(inHero);
    expect(navigateMock).toHaveBeenCalledWith("/characters/new");
    // …and TEACHES: the blurb reassures (guided, no rulebook) and the note lays
    // out the journey, derived from the create.step* keys the wizard's stepper
    // itself uses (rule 6 — one step name, one key).
    expect(screen.getByText(/no rulebook needed/i)).toBeInTheDocument();
    expect(
      screen.getByText(/class · species · background · abilities · review/i)
    ).toBeInTheDocument();
  });

  it("the Create CTA navigates to the creation wizard", () => {
    // Populated state → only the header Create CTA matches (cards expose
    // "Open <name>" buttons), so this is an unambiguous single target.
    useCharactersMock.mockReturnValue({
      characters: [makeDoc()],
      loading: false,
      error: null,
    });
    renderRoster();

    fireEvent.click(screen.getByRole("button", { name: /create character/i }));
    expect(navigateMock).toHaveBeenCalledWith("/characters/new");
  });

  it("while characters load: header up, the unified loader (delayed), and NO empty-folio flash", () => {
    useCharactersMock.mockReturnValue({ characters: [], loading: true, error: null });
    renderRoster();
    // The page header is already up (the persistent chrome)…
    expect(screen.getByRole("heading", { name: /your characters/i })).toBeInTheDocument();
    // …the loader is delayed (so a warm load shows nothing — no flash), and crucially
    // the "empty folio" state never flashes while the subscription is still settling
    // (it's gated on a settled, genuinely-empty roster).
    expect(screen.queryByText(/your folio awaits/i)).toBeNull();
  });

  it("renders a friendly error state on failure", () => {
    useCharactersMock.mockReturnValue({ characters: [], loading: false, error: "boom" });
    renderRoster();
    expect(screen.getByText(/couldn.t load your characters/i)).toBeInTheDocument();
  });

  it("filters the grid by name/class and shows an honest-blank on no match (H3)", () => {
    const lyra = makeDoc();
    const thorin = makeDoc({
      id: "mock-2",
      character: {
        ...MOCK_CHARACTER.character,
        name: assertNonEmptyString("Thorin"),
        classes: [{ classId: "fighter", level: 5 }],
      },
    });
    // The filter only appears past the small-roster threshold (a handful scans fine
    // without it), so pad with distinct-named wizards to cross it.
    const padding = Array.from({ length: 5 }, (_, i) =>
      makeDoc({
        id: `pad-${i}`,
        character: {
          ...MOCK_CHARACTER.character,
          name: assertNonEmptyString(`Pad ${i}`),
          classes: [{ classId: "wizard", level: 5 }],
        },
      })
    );
    useCharactersMock.mockReturnValue({
      characters: [lyra, thorin, ...padding],
      loading: false,
      error: null,
    });
    renderRoster();

    // Both cards visible at rest.
    expect(screen.getByRole("button", { name: /open lyra voss/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open thorin/i })).toBeInTheDocument();

    // Filtering by class narrows to the matching card.
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "fighter" } });
    expect(
      screen.queryByRole("button", { name: /open lyra voss/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open thorin/i })).toBeInTheDocument();

    // A non-matching query yields the honest-blank "no match" state.
    fireEvent.change(search, { target: { value: "zzzznope" } });
    expect(screen.getByText(/no characters match/i)).toBeInTheDocument();
  });

  it("hides the admin 'Load example' button for non-admins", () => {
    isAdminState.value = false;
    useCharactersMock.mockReturnValue({
      characters: [makeDoc()],
      loading: false,
      error: null,
    });
    renderRoster();
    expect(
      screen.queryByRole("button", { name: /load example/i })
    ).not.toBeInTheDocument();
  });

  it("shows the admin 'Load example' button for the admin and dispatches the action", () => {
    isAdminState.value = true;
    useCharactersMock.mockReturnValue({
      characters: [makeDoc()],
      loading: false,
      error: null,
    });
    renderRoster();

    const btn = screen.getByRole("button", { name: /load example/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(loadExampleMock).toHaveBeenCalledTimes(1);
  });
});

describe("CharacterCard", () => {
  function renderCard(doc: RosterCharacterDoc) {
    return render(
      <MemoryRouter>
        <CharacterCard character={doc} />
      </MemoryRouter>
    );
  }

  it("opens the cockpit at /characters/:id on activation (no /combat segment)", () => {
    renderCard(makeDoc({ id: "abc-123" }));
    fireEvent.click(screen.getByRole("button", { name: /open lyra voss/i }));
    expect(navigateMock).toHaveBeenCalledWith("/characters/abc-123");
  });

  it("renders the HP bar for an active character", () => {
    renderCard(makeDoc({ status: "active" }));
    expect(screen.getByRole("img", { name: /hit points/i })).toBeInTheDocument();
  });

  it("first-paints the HP fill only once hydrated — no full-HP placeholder, honest blank meanwhile", () => {
    // Root cause of the owner's thrice-reported roster slide: the parent docs land at
    // the full-HP placeholder `cacheToRosterDoc` seeds, then the `combat/state` subdoc
    // folds the real HP a beat later. Gating the fill on `hpReady` means an un-hydrated
    // tile renders NO `.hp-fill` (so it can never mount at 100% then slide down) — only
    // the recessed track (no layout shift) — and shows the honest "—" blank instead of
    // a wrong full-HP number.
    const { container, rerender } = render(
      <MemoryRouter>
        <CharacterCard character={makeDoc()} hpReady={false} />
      </MemoryRouter>
    );
    expect(container.querySelector(".ch-hp .hp-bar")).toBeTruthy();
    expect(container.querySelector(".ch-hp .hp-fill")).toBeNull();
    expect(container.querySelector(".ch-hp-label .hl-num")?.textContent).toBe("—");

    // Once hydrated the fill MOUNTS at the REAL width (Lyra is 38/62 → 61%) and the
    // number reads the real value — a fresh mount, never a transition from a placeholder.
    rerender(
      <MemoryRouter>
        <CharacterCard character={makeDoc()} hpReady={true} />
      </MemoryRouter>
    );
    const fill = container.querySelector(".ch-hp .hp-fill");
    expect(fill).toBeTruthy();
    expect((fill as HTMLElement).style.getPropertyValue("--w")).toBe("61%");
    expect(container.querySelector(".ch-hp-label .hl-num")?.textContent).toBe("38 / 62");
  });

  it("dims a non-active character, drops the HP bar, and flags a fallen hero", () => {
    const { container } = renderCard(makeDoc({ status: "dead" }));
    expect(container.querySelector(".ch-card.retired")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /hit points/i })).not.toBeInTheDocument();
    expect(screen.getByText(/fallen in battle/i)).toBeInTheDocument();
  });

  it("names a RETIRED hero's state on the tile (dimming alone reads as a bug)", () => {
    const { container } = renderCard(makeDoc({ status: "retired" }));
    expect(container.querySelector(".ch-card.retired")).toBeTruthy();
    expect(screen.getByText(/^retired$/i)).toBeInTheDocument();
    // A living retiree is never marked fallen.
    expect(screen.queryByText(/fallen in battle/i)).not.toBeInTheDocument();
  });

  it("flags a character who DIED IN PLAY (3 failed death saves) as fallen, even while status:active", () => {
    // Root-cause regression (owner 2026-06-07): a real death lives in
    // `session.deathFail`, NOT the `status` field — so the tile must DERIVE the
    // fallen state via `isCharacterDead`, not read `status` alone. Before the fix
    // this card stayed alive (HP bar shown, no skull) despite three failed saves.
    const { container } = renderCard(
      makeDoc({ status: "active", session: { ...MOCK_CHARACTER.session, deathFail: 3 } })
    );
    expect(screen.getByText(/fallen in battle/i)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /hit points/i })).not.toBeInTheDocument();
    expect(container.querySelector(".ch-card.retired")).toBeTruthy();
  });

  it("keeps a revived character (death saves reset) active with its HP bar", () => {
    // Reviving resets death saves, so the DERIVED fallen state clears with no
    // stored flag to undo — the tile is alive again.
    renderCard(
      makeDoc({ status: "active", session: { ...MOCK_CHARACTER.session, deathFail: 0 } })
    );
    expect(screen.getByRole("img", { name: /hit points/i })).toBeInTheDocument();
    expect(screen.queryByText(/fallen in battle/i)).not.toBeInTheDocument();
  });

  it("tags the portrait with the class domain pigment via data-class", () => {
    const { container } = renderCard(makeDoc());
    expect(container.querySelector('.ch-portrait[data-class="bard"]')).toBeTruthy();
  });

  it("surfaces AC + SPD + PB in the foot (#21), engine-derived for the canonical mock", () => {
    const { container } = renderCard(makeDoc());
    const foot = container.querySelector(".ch-foot");
    expect(foot).not.toBeNull();
    const f = within(foot as HTMLElement);
    // Three stat chips, not speed-only.
    expect(f.getByText("AC")).toBeInTheDocument();
    expect(f.getByText("SPD")).toBeInTheDocument();
    expect(f.getByText("PB")).toBeInTheDocument();
    // Derived through the same engine seam the cockpit uses — Lyra (Bard 9) is
    // AC 17, PB +4. (Pins the wiring to the canonical mock; a divergence here
    // means the roster glance no longer matches the sheet.)
    expect(f.getByText("17")).toBeInTheDocument();
    expect(f.getByText("+4")).toBeInTheDocument();
  });

  it("renders a degraded-but-safe tile for a partial / malformed doc (NEVER crashes)", () => {
    // Regression for the owner's permanent roster crash (2026-06-08): a doc
    // imported without its derived fields (`hp`, `class`/`classId`, `speed`) —
    // the exact shape a minimal export takes when persisted by a build that
    // didn't understand the format — used to throw "Cannot read properties of
    // undefined (reading 'max')" and white-screen the whole roster. The read
    // seam — here `cacheToRosterDoc` itself, the SAME projection the Firestore
    // listener builds — keeps the valid (non-empty) name and fills finite defaults
    // for hp/ac/speed, so the SRD-free card renders a safe tile (no HP bar, no class
    // pigment) instead. (A cache with NO valid name is rejected → null → skipped.)
    const partial = cacheToRosterDoc(
      "broken-1",
      { cache: { name: "Broken Hero" } }, // no ac/hp/speed/classes/raceId
      {
        createdAt: new Date(0),
        updatedAt: new Date(0),
        portraitUrl: null,
        portraitCrop: null,
        shareId: null,
        status: "active",
      }
    );
    // A valid cache name always yields a doc — narrow off `null`.
    if (!partial) throw new Error("expected a roster doc for a valid cache");

    expect(() => renderCard(partial)).not.toThrow();
    expect(screen.getByText("Broken Hero")).toBeInTheDocument();
    // hp.max is absent → conformed to 0 → the HP bar is hidden, not a crash.
    expect(screen.queryByRole("img", { name: /hit points/i })).not.toBeInTheDocument();
  });
});

describe("CharacterCard — row-actions menu", () => {
  function renderCard(doc: RosterCharacterDoc) {
    return render(
      <MemoryRouter>
        <CharacterCard character={doc} />
      </MemoryRouter>
    );
  }

  it("the kebab opens a menu with the four row-actions (active character)", () => {
    renderCard(makeDoc());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /export json/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /clone/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /retire/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /delete/i })).toBeInTheDocument();
    // Active → Retire, never Restore.
    expect(screen.queryByRole("menuitem", { name: /restore/i })).not.toBeInTheDocument();
  });

  it("shows Restore (not Retire) for a non-active character", () => {
    renderCard(makeDoc({ status: "retired" }));
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    expect(screen.getByRole("menuitem", { name: /restore/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /retire/i })).not.toBeInTheDocument();
  });

  it("disables the stretched open-button while the menu is open (no accidental nav)", () => {
    renderCard(makeDoc());
    const openBtn = screen.getByRole("button", { name: /open lyra voss/i });
    expect(openBtn).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    expect(openBtn).toBeDisabled();
  });

  it("swallows the dismiss-click that lands on the open-button (no navigation)", () => {
    const { container } = renderCard(makeDoc({ id: "nav-x" }));
    // Open the menu, then simulate the dismiss interaction: a press while the
    // menu is open ARMS the capture guard; the trailing click on the stretched
    // open-button must be swallowed so it can't navigate to the cockpit. (Radix
    // dismisses on pointerdown and re-enables the button before the click — this
    // guard, not `disabled`, is what makes the trailing click safe.)
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    const article = container.querySelector(".ch-card") as HTMLElement;
    fireEvent.pointerDown(article);
    fireEvent.click(screen.getByRole("button", { name: /open lyra voss/i }));
    expect(navigateMock).not.toHaveBeenCalled();
  });

  // Dismissal (Escape + outside-click) is now owned by the Radix Popover
  // primitive — it listens for `pointerdown`/`keydown` on the document and
  // portals the menu to <body>. Asserting that in JSDOM tests Radix internals,
  // not our code (and is brittle — Radix uses `pointerdown`, not `mousedown`).
  // The real behaviour, plus that the menu PORTALS out of the card's clip and a
  // card-body dismiss-click does NOT navigate, is covered against a real browser
  // in tests/e2e/character-list.spec.ts.

  it("dispatches each item to the data hook", () => {
    renderCard(makeDoc());

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /export json/i }));
    expect(actionsMock.exportJson).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /clone/i }));
    expect(actionsMock.clone).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /retire/i }));
    expect(actionsMock.retire).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /delete/i }));
    expect(actionsMock.remove).toHaveBeenCalledTimes(1);
  });
});
