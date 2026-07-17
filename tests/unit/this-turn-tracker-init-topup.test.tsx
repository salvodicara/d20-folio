/**
 * ThisTurnTracker — B26 (re-pinned on the initiative SSOT): the S4 initiative-tracker
 * top-up must fire on the FIRST roll of a NEW encounter, even when a stale SOLO roll
 * lingers in `combatStore.initiative`.
 *
 * Under the SSOT model the encounter roll's ONE home is the campaign's `encounterInit`
 * table (surfaced to the sheet as `status.initiativeRoll` via the shell global-combat
 * status), so "first roll of THIS fight" is judged off THAT (`gc.initiativeRoll ===
 * null`) — never off the solo combat-store string, which may legitimately still hold a
 * prior solo roll. The commit itself must route to `setEncounterInitiative` (the
 * campaign doc) and must NOT touch the solo store (no dual home).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";

const { setEncounterInitiative } = vi.hoisted(() => ({
  setEncounterInitiative: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/firebase", () => ({}));
// The encounter roll-commit seam (dynamically imported by the tracker) — mocked so the
// unit stays CI-pure AND so the write target is assertable.
vi.mock("@/features/campaigns/campaign-io", () => ({ setEncounterInitiative }));

import { ThisTurnTracker } from "@/features/character/center/ThisTurnTracker";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import {
  useCombatStatusStore,
  type GlobalCombat,
} from "@/features/campaigns/global-combat-context";
import { MOCK_CHARACTER } from "@/lib/mock";

/** A Monk (L15) with Perfect Focus, its Focus-point tracker drained to 0 remaining
 *  (used: 15) — the exact fixture `character-store-rest.test.ts` proves refills to a
 *  floor of 4 (used 11) when the top-up actually fires. */
function loadMonkWithDrainedFocus(soloInitiative: string): void {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.classes = [{ classId: "monk", level: 15 }];
  doc.character.features = [{ srdId: "monk-focus" }, { srdId: "monk-perfect-focus" }];
  doc.session.trackers = { "monk-focus": { used: 15 } };
  // The session's SOLO roll — `syncCombatFromSession` reconciles `combatStore.initiative`
  // from this on every snapshot, so the seed must live here to be the ground truth.
  doc.session.initiative = soloInitiative;
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

/** The shell status for an OPEN-hero encounter still gathering, viewer NOT yet rolled
 *  (an empty `encounterInit` row → `initiativeRoll: null`). */
function gatheringStatus(): GlobalCombat {
  const myId = "pc-u1";
  return {
    campaignId: "camp-1",
    encounter: {
      round: 1,
      currentCombatantId: null,
      epoch: 5,
      status: "active",
      combatants: [
        { kind: "pc", id: myId, memberUid: "u1", characterId: MOCK_CHARACTER.id },
      ],
    },
    view: { rows: [], turnOrderIds: [], currentId: null },
    myId,
    characterId: MOCK_CHARACTER.id,
    gathering: true,
    isMyTurn: false,
    initiativeBonus: 2,
    initiativeRoll: null,
    round: 1,
  };
}

function mount(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <ThisTurnTracker />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

describe("ThisTurnTracker — S4 top-up on the first ENCOUNTER roll (B26, SSOT)", () => {
  beforeEach(() => {
    setEncounterInitiative.mockClear();
    useCombatStore.setState({
      round: 1,
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      // A lingering SOLO roll — never cleared because no `endCombat()` fired between
      // the solo roll and the DM's fresh encounter on this same open character.
      initiative: "15",
      movementUsedFt: 0,
    });
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useCombatStatusStore.setState({ status: gatheringStatus(), pip: null });
  });

  it("tops up Perfect Focus on the first encounter roll despite the stale solo roll, and writes the CAMPAIGN table", async () => {
    loadMonkWithDrainedFocus("15"); // a lingering SOLO roll from an earlier solo fight
    const view = mount();
    // Open the shared InitVital editor and commit a FRESH roll for this fight. The editor
    // FLOATS in a popover (portaled to the document body), so its input is read from
    // `document`; the resting `.vital-init` chip (the trigger) stays in the container.
    fireEvent.click(view.container.querySelector(".vital-init") as HTMLElement);
    const input = document.querySelector(".init-edit-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "18" } });
    fireEvent.keyDown(input, { key: "Enter" });
    // Perfect Focus refills to the floor of 4 (15 total − 4 = used 11) — proof the
    // top-up genuinely fired, not merely that the roll committed.
    expect(
      useCharacterStore.getState().character?.session.trackers["monk-focus"]
    ).toEqual({ used: 11 });
    // The roll went to the campaign's encounterInit row (the SSOT)…
    await waitFor(() =>
      expect(setEncounterInitiative).toHaveBeenCalledWith("camp-1", "u1", 18)
    );
    // …and NOT to the solo combat store (no dual home — the stale solo roll survives
    // untouched, exactly as a separate fact should).
    expect(useCombatStore.getState().initiative).toBe("15");
  });

  it("SOLO (no encounter status): the roll writes the combat store, never the campaign seam", () => {
    useCombatStatusStore.setState({ status: null, pip: null });
    loadMonkWithDrainedFocus(""); // solo roll starts blank (the solo empty-gate path)
    const view = mount();
    fireEvent.click(view.container.querySelector(".vital-init") as HTMLElement);
    const input = document.querySelector(".init-edit-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "18" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useCombatStore.getState().initiative).toBe("18");
    expect(setEncounterInitiative).not.toHaveBeenCalled();
    // The top-up fires on the first solo roll too.
    expect(
      useCharacterStore.getState().character?.session.trackers["monk-focus"]
    ).toEqual({ used: 11 });
  });
});
