/**
 * CommandPalette — "Ask the Folio" universal search (N-E / D16) + the original C7
 * gate behavior. An empty query is a Sections navigator (role-gated Admin entry,
 * aria-current on the active realm, bilingual filtering); a query fans out into
 * grouped results across the live CHARACTER roster and the whole SRD COMPENDIUM.
 * `useIsAdmin` + `useCharacters` are mocked; the compendium index is the real SRD.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, BrowserRouter, useLocation } from "react-router";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { __resetOverlayHistory } from "@/lib/overlay-history";

const { isAdminState, charsMock, listCampaignsMock, importTriggerMock, openReportMock } =
  vi.hoisted(() => ({
    isAdminState: { value: false },
    charsMock: vi.fn(),
    listCampaignsMock: vi.fn(),
    importTriggerMock: vi.fn(),
    openReportMock: vi.fn(),
  }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => isAdminState.value }));
vi.mock("@/hooks/useCharacters", () => ({ useCharacters: charsMock }));
// useIsAdmin/useCharacters are mocked, so the real authStore→firebase chain never
// runs; this satisfies the CI-safety pure-modules guard (static import-graph scan).
vi.mock("@/lib/firebase", () => ({}));
// The campaign index uses a one-shot fetch — mock it so the palette can index
// campaigns under test without Firestore.
vi.mock("@/features/campaigns/campaign-io", () => ({
  listSharedCampaigns: listCampaignsMock,
}));
vi.mock("@/features/roster/import-trigger", () => ({
  triggerCharacterImport: importTriggerMock,
}));
// The report action calls the shared after-paint launcher (which defers across
// animation frames, then pulls in html2canvas); mock it so the palette test
// stays pure + fast.
vi.mock("@/features/report/open-report", () => ({
  openReportAfterPaint: openReportMock,
}));

import { CommandPalette } from "@/app/shell/CommandPalette";
import { __resetPaletteRecents } from "@/app/shell/palette-recents";

const lyra = {
  id: "lyra-1",
  character: { name: "Lyra Voss", classes: [{ classId: "bard", level: 9 }] },
} as unknown;

// A tiny probe so a test can assert where a hit navigated (buttons, not links). It
// RENDERS the location as text (no render-phase global mutation), read via testid.
function LocationProbe() {
  const loc = useLocation();
  return <span data-testid="loc">{`${loc.pathname}${loc.search}`}</span>;
}

const locationText = () => screen.getByTestId("loc").textContent;

function renderPalette(path = "/characters") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CommandPalette open onOpenChange={() => {}} />
      <LocationProbe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  __resetPaletteRecents();
  isAdminState.value = false;
  charsMock.mockReturnValue({ characters: [lyra], loading: false, error: null });
  listCampaignsMock.mockResolvedValue([]);
  openReportMock.mockReset();
  importTriggerMock.mockReset();
  // Deterministic starting theme (the store is a singleton across tests).
  useUIStore.setState({ theme: "dark" });
  // No signed-in user by default → the campaign fetch is skipped.
  useAuthStore.setState({ user: null });
});

describe("CommandPalette — sections navigator (C7)", () => {
  it("hides the Admin entry for non-admins and shows it for admins", () => {
    renderPalette();
    expect(screen.queryByRole("option", { name: /admin/i })).not.toBeInTheDocument();

    isAdminState.value = true;
    renderPalette();
    expect(screen.getByRole("option", { name: /admin/i })).toBeInTheDocument();
  });

  it("filters sections by query (bilingual matcher)", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "compend" } });
    expect(screen.getByRole("option", { name: /compendium/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /campaigns/i })).not.toBeInTheDocument();
  });

  it("marks the current realm with aria-current", () => {
    renderPalette("/compendium");
    const current = screen.getByRole("option", { name: /compendium/i });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("option", { name: /characters/i })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("offers Legal as an (ungated) section so every routed surface is reachable (D7)", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "legal" } });
    expect(screen.getByRole("option", { name: /legal/i })).toBeInTheDocument();
  });
});

describe("CommandPalette — universal search (N-E)", () => {
  it("searches the whole compendium (bundled SRD)", async () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fireball" } });
    // The SRD compendium specs load lazily when the palette opens (#59/#78), so the
    // compendium hits appear once that dynamic import resolves. Give the dynamic
    // import a generous window — under the full sharded suite (cold transform cache)
    // it can resolve slower than findByText's 1000ms default, which made this flake.
    expect(
      await screen.findByText("Fireball", {}, { timeout: 5000 })
    ).toBeInTheDocument();
    expect(screen.getByText("Compendium")).toBeInTheDocument();
  });

  it("searches your characters and shows class · level", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "lyra" } });
    expect(screen.getByText("Characters")).toBeInTheDocument();
    expect(screen.getByText("Lyra Voss")).toBeInTheDocument();
    expect(screen.getByText(/Bard 9/i)).toBeInTheDocument();
  });

  it("finds a character by their CLASS, not only their name (§2.5)", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "bard" } });
    expect(screen.getByText("Lyra Voss")).toBeInTheDocument();
  });

  it("ranks compendium NAME matches above gloss-only matches", async () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fire" } });
    const named = await screen.findByText("Fire Bolt", {}, { timeout: 5000 });
    const options = screen.getAllByRole("option");
    const texts = options.map((o) => o.textContent);
    const nameIdx = texts.findIndex((t) => t.includes("Fire Bolt"));
    // Druidcraft only MENTIONS fire in its gloss — it must trail every "Fire …" name hit.
    const glossIdx = texts.findIndex((t) => t.includes("Druidcraft"));
    expect(named).toBeInTheDocument();
    expect(nameIdx).toBeGreaterThanOrEqual(0);
    if (glossIdx >= 0) expect(nameIdx).toBeLessThan(glossIdx);
  });

  it("deep-links a compendium hit to the entry's DETAIL page (?sel=)", async () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "fireball" } });
    // Wait for the lazily-loaded compendium specs before the hit appears (generous
    // window — the dynamic import can outlast findBy's 1000ms default under load).
    fireEvent.click(
      await screen.findByRole("option", { name: /^fireball/i }, { timeout: 5000 })
    );
    // Navigation is deferred two animation frames past the close (B21 — lets the
    // overlay-history sentinel retire before the route changes).
    await waitFor(() => expect(locationText()).toMatch(/^\/compendium\?/));
    expect(locationText()).toContain("type=spell");
    expect(locationText()).toContain("sel=");
    // …NOT the old list-seeding `?q=` form.
    expect(locationText()).not.toContain("q=");
  });
});

describe("CommandPalette — quick actions (OWN-25c)", () => {
  it("shows a bounded 'Quick actions' launcher on the empty palette; the rest reveals on type (OWN-33)", () => {
    renderPalette();
    // Bounded empty state: a "Quick actions" group with the curated picks, NOT the
    // full action list — so the launcher stays a fixed size as actions grow.
    expect(screen.getByText("Quick actions")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /create a character/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /create a campaign/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /report a bug or idea/i })
    ).toBeInTheDocument();
    // Theme + language are NOT in the bounded empty state…
    expect(
      screen.queryByRole("option", { name: /switch to (light|dark) theme/i })
    ).not.toBeInTheDocument();
    // …they reveal on type (the full Actions group fans out).
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "theme" } });
    expect(
      screen.getByRole("option", { name: /switch to (light|dark) theme/i })
    ).toBeInTheDocument();
  });

  it("surfaces a recently-used action in the empty launcher's Quick group (OWN-33)", () => {
    // Import isn't curated, so it's hidden on the empty palette… until it's used.
    renderPalette();
    expect(
      screen.queryByRole("option", { name: /import a character/i })
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "import" } });
    fireEvent.click(screen.getByRole("option", { name: /import a character/i }));
    // Re-open: the import action is now a recent → shown in the bounded empty state.
    renderPalette();
    expect(
      screen.getByRole("option", { name: /import a character/i })
    ).toBeInTheDocument();
  });

  it("the theme action toggles the stored theme in place", () => {
    renderPalette();
    expect(useUIStore.getState().theme).toBe("dark");
    // Theme reveals on type (bounded launcher); then toggling works in place.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "theme" } });
    fireEvent.click(screen.getByRole("option", { name: /switch to light theme/i }));
    expect(useUIStore.getState().theme).toBe("light");
  });

  it("the new-character action navigates to creation", async () => {
    renderPalette();
    fireEvent.click(screen.getByRole("option", { name: /create a character/i }));
    // Deferred two animation frames past the close (B21).
    await waitFor(() => expect(locationText()).toBe("/characters/new"));
  });

  it("filters actions by an EN/IT keyword", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "tema" } });
    // The Italian keyword surfaces the theme action even with an English UI label.
    expect(
      screen.getByRole("option", { name: /switch to (light|dark) theme/i })
    ).toBeInTheDocument();
    // …and not the language action.
    expect(
      screen.queryByRole("option", { name: /switch to (english|italian)/i })
    ).not.toBeInTheDocument();
  });

  it("offers a new-campaign action that deep-links the create modal", async () => {
    renderPalette();
    fireEvent.click(screen.getByRole("option", { name: /create a campaign/i }));
    // Deferred two animation frames past the close (B21).
    await waitFor(() => expect(locationText()).toBe("/campaigns?new=1"));
  });

  it("offers an import action that launches the shell-hosted file picker", () => {
    renderPalette();
    // Import reveals on type (not curated into the bounded empty launcher).
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "import" } });
    fireEvent.click(screen.getByRole("option", { name: /import a character/i }));
    expect(importTriggerMock).toHaveBeenCalledTimes(1);
  });

  it("offers a report action reachable by EN + IT keywords that opens the reporter", async () => {
    renderPalette();
    // The English label surfaces it…
    expect(
      screen.getByRole("option", { name: /report a bug or idea/i })
    ).toBeInTheDocument();
    // …and the Italian keyword "segnala" surfaces it even with the EN UI label.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "segnala" } });
    const opt = screen.getByRole("option", { name: /report a bug or idea/i });
    fireEvent.click(opt);
    // The run() hands off to the shared after-paint launcher.
    await waitFor(() => expect(openReportMock).toHaveBeenCalledTimes(1));
  });

  it("surfaces the report action for the keyword 'feature' too", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "feature" } });
    expect(
      screen.getByRole("option", { name: /report a bug or idea/i })
    ).toBeInTheDocument();
  });

  it("offers a shortcuts action (EN + IT keywords) that opens the shortcuts sheet (D7)", async () => {
    useUIStore.setState({ shortcutsOpen: false });
    renderPalette();
    // The Italian keyword "scorciatoie" surfaces it even under the EN UI label.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "scorciatoie" } });
    const opt = screen.getByRole("option", { name: /keyboard shortcuts/i });
    fireEvent.click(opt);
    // The run() opens the shared sheet (deferred a couple frames after the close).
    await waitFor(() => expect(useUIStore.getState().shortcutsOpen).toBe(true));
  });
});

describe("CommandPalette — keyboard navigation (OWN-28b)", () => {
  it("is a combobox controlling a listbox of options", () => {
    renderPalette();
    const box = screen.getByRole("combobox");
    expect(box).toHaveAttribute("aria-controls");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    // the first option is highlighted by default + pointed to by activedescendant.
    const first = screen.getAllByRole("option")[0];
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(box.getAttribute("aria-activedescendant")).toBe(first?.id);
  });

  it("Arrow Down moves the highlight and Enter fires the HIGHLIGHTED hit", async () => {
    renderPalette();
    const box = screen.getByRole("combobox");
    // Bounded empty palette (OWN-33): flat[0] = New Character (quick), flat[1] = New
    // Campaign (quick) — the curated Quick group leads, then the Sections.
    fireEvent.keyDown(box, { key: "ArrowDown" });
    const opts = screen.getAllByRole("option");
    expect(opts[1]).toHaveAttribute("aria-selected", "true");
    expect(opts[0]).toHaveAttribute("aria-selected", "false");
    expect(box.getAttribute("aria-activedescendant")).toBe(opts[1]?.id);
    fireEvent.keyDown(box, { key: "Enter" });
    // Deferred two animation frames past the close (B21).
    await waitFor(() => expect(locationText()).toBe("/campaigns?new=1"));
  });

  it("Arrow Up from the top wraps to the last option", () => {
    renderPalette();
    const box = screen.getByRole("combobox");
    const count = screen.getAllByRole("option").length;
    fireEvent.keyDown(box, { key: "ArrowUp" });
    const opts = screen.getAllByRole("option");
    expect(opts[count - 1]).toHaveAttribute("aria-selected", "true");
  });
});

describe("CommandPalette — coarse-pointer gate (touch)", () => {
  // The shortcuts sheet is a keyboard affordance; its `?` entry points must not
  // present on a touch device with no keyboard. jsdom's default matchMedia stub
  // reports a FINE pointer (matches: false), so we override it per-test to simulate
  // a coarse pointer, then restore it.
  const origMatchMedia = window.matchMedia;
  afterEach(() => {
    window.matchMedia = origMatchMedia;
  });
  function mockPointer(coarse: boolean) {
    window.matchMedia = (query: string) => ({
      matches: coarse && query.includes("coarse"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
  }

  it("shows the shortcuts action + footer chip on a FINE pointer (desktop)", () => {
    mockPointer(false);
    renderPalette();
    // The footer `? Shortcuts` chip is present on the empty palette…
    expect(screen.getByRole("button", { name: /shortcuts/i })).toBeInTheDocument();
    // …and the shortcuts action reveals on type.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "scorciatoie" } });
    expect(
      screen.getByRole("option", { name: /keyboard shortcuts/i })
    ).toBeInTheDocument();
  });

  it("hides every `?` shortcuts entry point on a COARSE pointer (touch)", () => {
    mockPointer(true);
    renderPalette();
    // No footer chip advertising the shortcuts sheet…
    expect(screen.queryByRole("button", { name: /shortcuts/i })).not.toBeInTheDocument();
    // …and the shortcuts action is gone even when explicitly searched.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "scorciatoie" } });
    expect(
      screen.queryByRole("option", { name: /keyboard shortcuts/i })
    ).not.toBeInTheDocument();
  });
});

describe("CommandPalette — campaign index (OWN-28c)", () => {
  it("indexes the player's campaigns and opens one on click", async () => {
    listCampaignsMock.mockResolvedValue([
      { id: "personal", name: "Personal" },
      { id: "camp-keep", name: "Curse of the Keep" },
    ]);
    useAuthStore.setState({ user: { uid: "u1" } as never });
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "keep" } });
    const hit = await screen.findByRole("option", { name: /curse of the keep/i });
    fireEvent.click(hit);
    // Deferred two animation frames past the close (B21).
    await waitFor(() => expect(locationText()).toBe("/campaigns/camp-keep"));
  });
});

describe("CommandPalette — overlay-history sentinel on select-then-navigate (B21)", () => {
  // This race only exists against the REAL browser history (Dialog's
  // `useOverlayBack` pushes/retires a sentinel on `window.history`), which
  // `MemoryRouter` never touches — so this one test uses `BrowserRouter` instead
  // of the file's usual `renderPalette` helper.
  it("retires the Back sentinel before navigating, leaving no dead history entry", async () => {
    __resetOverlayHistory();
    window.history.replaceState({ key: "b21-base" }, "", "/characters");
    const baseLength = window.history.length;

    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <CommandPalette open={open} onOpenChange={setOpen} />
          <LocationProbe />
        </>
      );
    }

    render(
      <BrowserRouter>
        <Harness />
      </BrowserRouter>
    );

    // "Create a campaign" is a curated quick action that navigates (`to`).
    fireEvent.click(screen.getByRole("option", { name: /create a campaign/i }));

    await waitFor(() => expect(locationText()).toBe("/campaigns?new=1"));
    // Let the two-rAF navigation deferral — and the sentinel's own async
    // `history.back()` traversal — fully settle.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // A clean close-then-navigate leaves exactly ONE new entry (the
    // destination). A stranded sentinel leaves TWO — the dead same-key clone of
    // /characters plus the destination — which is what forces a second Back
    // press to actually leave the page (B21).
    expect(window.history.length - baseLength).toBe(1);
  });
});
