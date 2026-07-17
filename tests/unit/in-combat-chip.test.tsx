/**
 * InCombatStatus — the cockpit's own-turn campaign control (INIT-2 / TB1). It reads the
 * SHEET-scoped combat status ({@link useSheetCombat}, mocked here — the open-hero scoping is
 * unit-tested in turn-state.test.ts), so this unit isolates the
 * region's render responsibility: it surfaces the shared turn-advance controls ONLY on the
 * player's own turn and renders nothing otherwise. The ROUND + roll-to-total initiative are
 * owned by the turn meter (TB3/TB4), and the in-combat / your-turn / gathering DECORATIVE
 * badges AND the reciprocal hub link moved to the topbar combat pip (the single global combat
 * signal + the switch back to the encounter), so this region NO LONGER renders any of them.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useToastStore } from "@/stores/toastStore";

// A player advances the shared turn through advanceEncounterTurn — mock it (and firebase)
// so the unit suite stays CI-pure.
const { advanceEncounterTurn } = vi.hoisted(() => ({ advanceEncounterTurn: vi.fn() }));
vi.mock("@/features/campaigns/campaign-io", () => ({ advanceEncounterTurn }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
// Drive the SHEET-scoped combat status directly. InCombatStatus reads `useSheetCombat`
// (the open-hero-scoped seam); the scoping itself is unit-tested in turn-state.test.ts, so
// here we mock the seam to isolate this region's own render responsibility.
const { useSheetCombat } = vi.hoisted(() => ({ useSheetCombat: vi.fn() }));
vi.mock("@/features/character/center/turn-state", () => ({ useSheetCombat }));

import { InCombatStatus } from "@/features/campaigns/in-combat-chip";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import { useAuthStore } from "@/stores/authStore";
import type { EncounterState } from "@/types/campaign";

function encounter(): EncounterState {
  return {
    round: 2,
    currentCombatantId: "pc-u1",
    epoch: 1,
    status: "active",
    combatants: [{ kind: "pc", id: "pc-u1", memberUid: "u1", characterId: "char-mara" }],
  };
}

/** A GlobalCombat status for the open PC, parameterised by turn/gathering state. */
function gc(over: Partial<GlobalCombat> = {}): GlobalCombat {
  return {
    campaignId: "camp-1",
    encounter: encounter(),
    view: {
      currentId: "pc-other",
      rows: [],
      turnOrderIds: ["pc-u1", "pc-other"],
    },
    myId: "pc-u1",
    characterId: "char-mara",
    gathering: false,
    isMyTurn: false,
    initiativeBonus: 3,
    initiativeRoll: null,
    round: 2,
    ...over,
  };
}

function renderRegion() {
  return render(
    <MemoryRouter>
      <InCombatStatus />
    </MemoryRouter>
  );
}

beforeEach(() => {
  advanceEncounterTurn.mockReset();
  useSheetCombat.mockReset();
  useAuthStore.setState({ user: { uid: "u1" } as never });
});

describe("InCombatStatus", () => {
  it("renders nothing on another combatant's turn (the pip carries the signal + hub link)", () => {
    useSheetCombat.mockReturnValue(gc());
    const { container } = renderRegion();
    // The former reciprocal hub link / "in combat" badge moved to the topbar combat pip
    // (the single global signal + switch), so this region shows nothing when it isn't the
    // player's own turn.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next turn/i })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("TB3 — never renders a round badge (the turn meter owns the single round)", () => {
    useSheetCombat.mockReturnValue(gc({ isMyTurn: true }));
    renderRegion();
    // The round lives on the Play-tab turn meter (ThisTurnTracker), not here — so no
    // duplicate "Round N" can disagree with it.
    expect(screen.queryByText(/round 2/i)).not.toBeInTheDocument();
  });

  it("surfaces the own-turn advance controls — but NOT the dropped your-turn badge", () => {
    useSheetCombat.mockReturnValue(gc({ isMyTurn: true }));
    renderRegion();
    // The decorative "Your turn" cue now lives on the topbar pip (the single signal); the
    // region no longer duplicates it. The own-turn advance controls stay (the action surface).
    expect(screen.queryByText(/your turn/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next turn/i })).toBeInTheDocument();
  });

  it("renders nothing before turns begin (gathering — the pip carries the signal)", () => {
    useSheetCombat.mockReturnValue(gc({ gathering: true, isMyTurn: false }));
    const { container } = renderRegion();
    // The gathering signal + the hub link moved to the pip — the region drops the decorative
    // chip, the link, AND the advance controls (not the player's turn yet).
    expect(screen.queryByText(/gathering/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next turn/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("a FAILED turn-advance shows the HONEST turn message, never the DM-access toast", async () => {
    // The turn pointer is a CAMPAIGN-doc write, NOT the per-hero combat-state subdoc, so a
    // failure here must never surface the "DM access out of date" message (which would
    // mislabel a transient turn-advance error as a stale dmReaders grant).
    const showToast = vi.fn();
    useToastStore.setState({ showToast });
    advanceEncounterTurn.mockRejectedValueOnce(new Error("network"));
    useSheetCombat.mockReturnValue(gc({ isMyTurn: true }));
    renderRegion();
    fireEvent.click(screen.getByRole("button", { name: /next turn/i }));
    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    const message = (showToast.mock.calls.at(0)?.[0] as { message: string } | undefined)
      ?.message;
    expect(message).toMatch(/advance the turn/i);
    expect(message).not.toMatch(/DM access/i);
  });

  it("renders nothing when the character is in no running encounter", () => {
    useSheetCombat.mockReturnValue(null);
    renderRegion();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("passes the CAS expected-pointer (view.currentId) to the advance transaction", () => {
    advanceEncounterTurn.mockReturnValue(new Promise(() => {}));
    useSheetCombat.mockReturnValue(gc({ isMyTurn: true }));
    renderRegion();
    fireEvent.click(screen.getByRole("button", { name: /next turn/i }));
    expect(advanceEncounterTurn).toHaveBeenCalledWith(
      "camp-1",
      "next",
      { uid: "u1", isDm: false },
      "pc-other" // the pointer the player saw — the transaction's CAS guard
    );
  });

  it("disarms while an advance is in flight — a rapid second click fires no second write", () => {
    // A never-settling promise keeps the advance PENDING; the disarm must block the
    // second click (the UX half of the double-click turn-skip fix).
    advanceEncounterTurn.mockReturnValue(new Promise(() => {}));
    useSheetCombat.mockReturnValue(gc({ isMyTurn: true }));
    renderRegion();
    const next = screen.getByRole("button", { name: /next turn/i });
    fireEvent.click(next);
    expect(next).toBeDisabled();
    fireEvent.click(next);
    expect(advanceEncounterTurn).toHaveBeenCalledTimes(1);
  });
});
