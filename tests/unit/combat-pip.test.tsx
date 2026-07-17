/**
 * CombatPip — the topbar combat indicator (spec §5). It renders off the ONE light shell
 * store ({@link useCombatStatusStore}, driven here directly as the producer does), so this
 * unit isolates the pip's render responsibility:
 *
 *   • every state EXCEPT needs-roll is a PORTRAIT-SOCKET split switch — a pure-status
 *     left segment + a navigating destination chip (the party glyph, or the hero's
 *     portrait seal) that is the ONLY interactive element;
 *   • the loud RED needs-roll pip is the ONE exception: an ACTION that opens an inline
 *     {@link InitVital} roll-to-total popover (roll from anywhere) — NO `→ {dest}` arrow,
 *     committing the viewer's own row of the campaign's `encounterInit` table through
 *     `setEncounterInitiative` (mocked; the initiative SSOT — a single campaign-doc
 *     field-path write, no combat subdoc, no HP base, no max-HP hydration gate). The
 *     defensive null-status path degrades to the plain switch.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";

// The roll-COMMIT module is dynamically imported on commit — mock it (and firebase) so the
// unit suite stays CI-pure (never loads the firebase/engine graph).
const { setEncounterInitiative } = vi.hoisted(() => ({
  setEncounterInitiative: vi.fn(),
}));
vi.mock("@/features/campaigns/campaign-io", () => ({ setEncounterInitiative }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { CombatPip } from "@/app/shell/CombatPip";
import {
  useCombatStatusStore,
  type GlobalCombat,
  type PipModel,
  type PipState,
  type PipEntry,
} from "@/features/campaigns/global-combat-context";
import { useAuthStore } from "@/stores/authStore";

/** The live status that BACKS a needs-roll pip (init bonus / raw roll). */
function gc(over: Partial<GlobalCombat> = {}): GlobalCombat {
  return {
    campaignId: "mock-1",
    encounter: {
      round: 1,
      currentCombatantId: null,
      epoch: 7,
      status: "active",
      combatants: [{ kind: "pc", id: "pc-u1", memberUid: "u1", characterId: "char-x" }],
    },
    view: { rows: [], turnOrderIds: [], currentId: null },
    myId: "pc-u1",
    characterId: "char-x",
    gathering: true,
    isMyTurn: false,
    initiativeBonus: 3,
    initiativeRoll: null,
    round: 1,
    ...over,
  };
}

/** A single-entry pip model in `state` (the viewer's own PC fight `mock-1`). */
function pip(state: PipState, over: Partial<PipEntry> = {}): PipModel {
  return {
    entries: [
      {
        campaignId: "mock-1",
        campaignName: "The Starless Keep",
        role: "pc",
        state,
        round: 1,
        heroName: "Coralino",
        characterId: "char-x",
        actorName: null,
        ...over,
      },
    ],
    primaryId: "mock-1",
  };
}

function renderPip(path = "/characters/char-x") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CombatPip />
    </MemoryRouter>
  );
}

beforeEach(() => {
  setEncounterInitiative.mockReset();
  useCombatStatusStore.setState({ status: null, pip: null });
  useAuthStore.setState({ user: { uid: "u1" } as never });
});

describe("CombatPip", () => {
  it("renders the needs-roll pip as an inline roller, NOT a navigating switch", () => {
    useCombatStatusStore.setState({ status: gc(), pip: pip("needs-roll") });
    renderPip();
    // It's a BUTTON (opens the roller), never a destination link…
    const btn = screen.getByRole("button", { name: /roll your initiative/i });
    expect(btn.tagName).toBe("BUTTON");
    // …and it carries NO `→ {dest}` switch (the red pip ACTS, it doesn't switch).
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/party/i)).toBeNull();
  });

  it("opens the InitVital roll-to-total popover on tap (autoEdit d20 input + live math)", async () => {
    useCombatStatusStore.setState({ status: gc(), pip: pip("needs-roll") });
    renderPip();
    fireEvent.click(screen.getByRole("button", { name: /roll your initiative/i }));
    // autoEdit → the d20 input is mounted straight into the edit layout, with the live math
    // reading the override-first bonus (+3) before any roll is typed.
    const input = await screen.findByPlaceholderText("d20");
    expect(input).toBeInTheDocument();
    expect(screen.getByText(/\+3\s*=/)).toBeInTheDocument();
  });

  it("commits the typed d20 as the viewer's OWN encounterInit row (the initiative SSOT)", async () => {
    useCombatStatusStore.setState({ status: gc(), pip: pip("needs-roll") });
    renderPip();
    fireEvent.click(screen.getByRole("button", { name: /roll your initiative/i }));
    const input = await screen.findByPlaceholderText("d20");
    fireEvent.change(input, { target: { value: "15" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // The RAW roll (15) lands on the CAMPAIGN doc keyed by the viewer's uid — never the
    // derived total (golden rule 6), never a cross-user character/subdoc write. There is
    // NOTHING else to pass: no combat base, no epoch, no max HP (the deleted machinery).
    await waitFor(() =>
      expect(setEncounterInitiative).toHaveBeenCalledWith("mock-1", "u1", 15)
    );
  });

  it("renders every OTHER state as a PORTRAIT-SOCKET split switch — status carries NO destination text (P1)", () => {
    // your-turn off the sheet → the destination chip points at the group (party).
    useCombatStatusStore.setState({ status: null, pip: pip("your-turn") });
    renderPip("/characters/char-x");
    const link = screen.getByRole("link");
    // The ONLY interactive element is the destination CHIP (a link) — the status
    // segment is a decorative span (its content is restated in the chip's aria-label).
    expect(link).toHaveClass("cp-dest-chip");
    // A PLAIN navigation to the hub (owner 2026-07-11: the old `?scrollTo=party`
    // auto-scroll read as a jump; the pip now lands at the top like any push).
    expect(link).toHaveAttribute("href", "/campaigns/mock-1");
    // P1 anatomy — the status segment shows only the state word, never the destination;
    // the destination (party verb) lives solely on the chip.
    const status = document.querySelector(".cp-status");
    expect(status?.textContent).toMatch(/your turn/i);
    expect(status?.textContent).not.toMatch(/party/i);
    expect(link).toHaveTextContent(/party/i);
    // On the sheet the GROUP destination shows the party glyph — never a portrait seal.
    expect(link.querySelector(".cp-dest-portrait")).toBeNull();
    expect(screen.queryByRole("button", { name: /roll your initiative/i })).toBeNull();
  });

  it("flips to the hero sheet on the encounter — the chip wears the hero's portrait seal (no scrollTo)", () => {
    useCombatStatusStore.setState({ status: null, pip: pip("actor-turn") });
    renderPip("/campaigns/mock-1");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/characters/char-x");
    // The own-character destination WEARS a face: the Portrait seal (the light topbar
    // pip model carries no portrait URL, so the monogram fallback renders here).
    expect(link.querySelector(".cp-dest-portrait")).not.toBeNull();
    // "Open {firstName}" verb reuses the canonical campaigns string (i18n-dedup).
    expect(link).toHaveTextContent(/open coralino/i);
  });

  it("stays an inline roller with NO live status yet — never flashes the navigating switch (render-reconciled)", async () => {
    // RENDER-RECONCILED to the STATE, not the status: a needs-roll pip whose roll payload
    // hasn't landed still renders the RED roller trigger with NO `→ dest` arrow (it never
    // falls through to the navigating `<Link>` — the arrow-then-morph the prior fix was
    // rejected for). Tapping opens the popover in a pending beat, NOT a navigation.
    useCombatStatusStore.setState({ status: null, pip: pip("needs-roll") });
    renderPip();
    const btn = screen.getByRole("button", { name: /roll your initiative/i });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveAttribute("data-phase", "needs-roll");
    expect(screen.queryByRole("link")).toBeNull(); // no switch, no arrow
    fireEvent.click(btn);
    // The popover shows a busy pending spinner (role=status), not the d20 input yet.
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("d20")).toBeNull();
  });

  // (The old "hold the roller pending until maxHp hydrates" gate tests are gone WITH the
  // gate itself: a roll is now a single campaign-doc field write that touches no HP, so
  // there is no un-hydrated state it could corrupt — the hazard class is structural, not
  // guarded.)

  it("the multi-encounter chooser lands each row on a plain hub navigation", () => {
    // Each chooser row is a plain `/campaigns/<id>` navigation (owner 2026-07-11: no
    // `?scrollTo=party` auto-scroll — it lands at the top like the single-pip destination).
    const model: PipModel = {
      entries: [
        pip("your-turn").entries[0] as PipEntry,
        {
          campaignId: "mock-2",
          campaignName: "Shadows over Thornhollow",
          role: "pc",
          state: "actor-turn",
          round: 7,
          heroName: "Bren",
          characterId: "char-y",
          actorName: "Gorvek",
        },
      ],
      primaryId: "mock-1",
    };
    useCombatStatusStore.setState({ status: null, pip: model });
    renderPip();
    fireEvent.click(screen.getByRole("button", { name: /your other combats/i }));
    const rows = Array.from(document.querySelectorAll(".cp-row"));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.getAttribute("href")).toMatch(/^\/campaigns\/mock-[12]$/);
    }
  });

  it("fills the pending roller with the d20 input once the live status publishes", async () => {
    useCombatStatusStore.setState({ status: null, pip: pip("needs-roll") });
    renderPip();
    fireEvent.click(screen.getByRole("button", { name: /roll your initiative/i }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    // The status publishes atomically a beat later → the pending spinner reconciles into the
    // roll-to-total widget, no navigate, no re-open.
    act(() => {
      useCombatStatusStore.setState({ status: gc(), pip: pip("needs-roll") });
    });
    expect(await screen.findByPlaceholderText("d20")).toBeInTheDocument();
  });
});
