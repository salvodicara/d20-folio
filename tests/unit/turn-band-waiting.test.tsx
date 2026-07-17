/**
 * ThisTurnTracker — the solo↔encounter turn-band precedence (owner-ratified 2026-07-03).
 *
 * The `.turn` grid carries `data-phase` (drives the dim/inert CSS) whenever the OPEN hero is a
 * combatant in its encounter, and End Turn goes inert off your own turn:
 *   • solo (no encounter)          → no `data-phase`, End Turn live, End Combat PRESENT.
 *   • encounter, someone else's turn (`waiting`) → `data-phase="waiting"`, End Turn inert.
 *   • encounter, before turns begin (`gathering`) → `data-phase="gathering"`, End Turn inert.
 * End Combat is SOLO ONLY — the DM ends encounters from the hub — so it is ABSENT in an
 * encounter and PRESENT in solo play.
 *
 * CHARACTER SCOPING: the shell status is keyed on the USER's uid (whichever hero is in the
 * fight), NOT the open sheet. So a DIFFERENT hero of the same user reads the status as absent —
 * pure solo (own round, End Combat present, no waiting/gathering chrome) even while another of
 * the user's heroes sits in a live encounter. The band gates on `gc.characterId === open id`.
 *
 * Pure render-wiring over the shell combat-status store. (The CSS dim + the WAITING reaction
 * carve-out are visual and verified in real Chromium — jsdom cannot read stylesheet opacity;
 * these render tests pin the `data-phase` + End Turn/End Combat facts that DRIVE that CSS.)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
// The shared InitVital routes through combat-state-io → Firebase; mock it so this unit stays
// CI-pure (env keys unset). The stores drive every assertion — no real write is made.
vi.mock("@/lib/firebase", () => ({}));
import { ThisTurnTracker } from "@/features/character/center/ThisTurnTracker";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import type { EncounterView } from "@/features/campaigns/encounter-view";
import { MOCK_CHARACTER } from "@/lib/mock";

/** The open hero's id (MOCK_CHARACTER) — the status must name THIS hero for the band to
 *  read as in-combat; a mismatch is the character-scoping (solo) case. */
const OPEN_ID = MOCK_CHARACTER.id;

/** A shell status for the open hero, parameterised by turn phase via `currentId` (whose turn
 *  it is; `null` = gathering). `characterId` defaults to the open hero (the in-combat case). */
function statusFor(
  over: Partial<Omit<GlobalCombat, "view">> & { currentId?: string | null } = {}
): GlobalCombat {
  const { currentId = "monster-1", ...rest } = over;
  const view: EncounterView = {
    rows: [
      { id: "pc-me", kind: "pc", name: "Mara" } as EncounterView["rows"][number],
      {
        id: "monster-1",
        kind: "monster",
        name: "Goblin",
      } as EncounterView["rows"][number],
    ],
    turnOrderIds: ["pc-me", "monster-1"],
    currentId,
  };
  return {
    campaignId: "camp-1",
    encounter: { currentCombatantId: currentId } as GlobalCombat["encounter"],
    view,
    myId: "pc-me",
    characterId: OPEN_ID,
    gathering: currentId === null,
    isMyTurn: currentId === "pc-me",
    initiativeBonus: 2,
    initiativeRoll: 14,
    round: 5,
    ...rest,
  };
}

function mount() {
  return render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <ThisTurnTracker />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

const endTurnBtn = (c: HTMLElement) => c.querySelector<HTMLButtonElement>(".endturn");
const endCombatBtn = (c: HTMLElement) =>
  c.querySelector<HTMLButtonElement>(".end-combat");
const band = (c: HTMLElement) => c.querySelector<HTMLElement>(".turn");

describe("ThisTurnTracker — solo↔encounter band precedence", () => {
  beforeEach(() => {
    useCombatStore.setState({
      round: 1,
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      initiative: "",
      movementUsedFt: 0,
    });
    useCharacterStore.setState({
      character: structuredClone(MOCK_CHARACTER),
      loading: false,
      error: null,
    });
  });
  afterEach(() => useCombatStatusStore.getState().set(null, null));

  it("solo (no encounter): no phase, End Turn enabled, End Combat present", () => {
    useCombatStatusStore.getState().set(null, null); // not in combat
    const { container } = mount();
    expect(band(container)?.getAttribute("data-phase")).toBeNull();
    expect(endTurnBtn(container)?.disabled).toBe(false);
    expect(endCombatBtn(container)).not.toBeNull();
  });

  it("encounter, NOT my turn: band `waiting`, End Turn inert, End Combat absent", () => {
    useCombatStatusStore.getState().set(statusFor(), null);
    const { container } = mount();
    expect(band(container)?.getAttribute("data-phase")).toBe("waiting");
    expect(endTurnBtn(container)?.disabled).toBe(true);
    expect(endCombatBtn(container)).toBeNull();
  });

  it("encounter, GATHERING (before turns begin): band `gathering`, End Turn inert, End Combat absent", () => {
    useCombatStatusStore.getState().set(statusFor({ currentId: null }), null);
    const { container } = mount();
    expect(band(container)?.getAttribute("data-phase")).toBe("gathering");
    // No turn to end yet — the one call to action is rolling initiative.
    expect(endTurnBtn(container)?.disabled).toBe(true);
    expect(endCombatBtn(container)).toBeNull();
  });

  it("encounter, MY turn: band `my-turn`, End Turn live, End Combat absent", () => {
    useCombatStatusStore.getState().set(statusFor({ currentId: "pc-me" }), null);
    const { container } = mount();
    expect(band(container)?.getAttribute("data-phase")).toBe("my-turn");
    expect(endTurnBtn(container)?.disabled).toBe(false);
    expect(endCombatBtn(container)).toBeNull();
  });

  it("CHARACTER SCOPING: a status for a DIFFERENT hero of the same user → pure solo band", () => {
    // Another of the user's heroes is in the fight (status.characterId ≠ the open hero); this
    // sheet must read solo — no waiting/gathering chrome, End Combat present, End Turn live.
    useCombatStatusStore
      .getState()
      .set(statusFor({ characterId: "some-other-hero" }), null);
    const { container } = mount();
    expect(band(container)?.getAttribute("data-phase")).toBeNull();
    expect(endTurnBtn(container)?.disabled).toBe(false);
    expect(endCombatBtn(container)).not.toBeNull();
  });

  it("encounter ENDED → the sheet returns to SOLO AT BASELINE (round 1, economy re-armed, initiative cleared)", () => {
    // The open hero is mid-fight on its own turn, having acted (dirty economy).
    useCombatStatusStore.getState().set(statusFor({ currentId: "pc-me" }), null);
    const { container } = mount();
    act(() => {
      useCombatStore.setState({
        round: 6,
        initiative: "17",
        movementUsedFt: 20,
        reactionUsed: true,
        selected: {
          action: [{ id: "x", name: "X", slot: "action" }],
          bonus: [],
          free: [],
        },
      });
    });
    // The DM ends the encounter (or removes this PC) → the shell status drops to absent.
    act(() => useCombatStatusStore.getState().set(null, null));
    const s = useCombatStore.getState();
    expect(s.round).toBe(1);
    expect(s.initiative).toBe("");
    expect(s.movementUsedFt).toBe(0);
    expect(s.reactionUsed).toBe(false);
    expect(s.selected.action).toHaveLength(0);
    // The band reverts cleanly to solo — no stuck waiting/gathering state, End Combat back.
    expect(band(container)?.getAttribute("data-phase")).toBeNull();
    expect(endCombatBtn(container)).not.toBeNull();
  });

  it("ending ANOTHER hero's fight leaves THIS open (non-encounter) sheet untouched", () => {
    // A different hero of the same user is in the fight; this open hero was solo throughout.
    useCombatStatusStore
      .getState()
      .set(statusFor({ characterId: "some-other-hero" }), null);
    mount();
    act(() => {
      useCombatStore.setState({ round: 3, movementUsedFt: 10 });
    });
    // That other fight ends → status drops. This sheet never matched, so no baseline reset
    // clobbers its own local combat state.
    act(() => useCombatStatusStore.getState().set(null, null));
    expect(useCombatStore.getState().round).toBe(3);
    expect(useCombatStore.getState().movementUsedFt).toBe(10);
  });

  it("the reaction coin is present in every encounter phase (its board cards stay spendable off-turn)", () => {
    // The RAW off-turn reaction carve-out is a CSS treatment (verified in Chromium); here we
    // pin that the reaction economy token is rendered in the band so it can carry it.
    useCombatStatusStore.getState().set(statusFor(), null);
    const { container } = mount();
    expect(container.querySelector('.econ-tok[data-kind="reaction"]')).not.toBeNull();
  });
});
