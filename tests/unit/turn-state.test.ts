/**
 * turn-state — the ONE turn seam's pure resolver ({@link resolveTurnState}).
 *
 * Pure (no React, no Firebase), so this is a plain unit suite. It locks the headline
 * REGRESSION for the owner's live "round 6, 7, 8…" bug: in a campaign encounter the round
 * the sheet SHOWS is the SHARED encounter round, NEVER the private solo `combatStore.round`
 * that used to drift while the encounter doc stayed at round 1. Also covers the four
 * derived phases (solo / gathering / my-turn / waiting) + the current-actor label.
 */
import { describe, it, expect } from "vitest";
import { resolveTurnState, sheetEncounter } from "@/features/character/center/turn-state";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import type { EncounterView } from "@/features/campaigns/encounter-view";

/** A minimal EncounterView carrying only the fields `resolveTurnState` reads. */
function view(over: Partial<EncounterView> = {}): EncounterView {
  return {
    rows: [
      { id: "pc-me", kind: "pc", name: "Mara" } as EncounterView["rows"][number],
      {
        id: "monster-1",
        kind: "monster",
        name: "Goblin",
      } as EncounterView["rows"][number],
    ],
    turnOrderIds: ["pc-me", "monster-1"],
    currentId: "pc-me",
    ...over,
  };
}

/** A GlobalCombat status for the open PC, parameterised by turn/round/gathering state. */
function gc(over: Partial<GlobalCombat> = {}): GlobalCombat {
  return {
    campaignId: "camp-1",
    encounter: {} as GlobalCombat["encounter"],
    view: view(),
    myId: "pc-me",
    characterId: "char-me",
    gathering: false,
    isMyTurn: true,
    initiativeBonus: 2,
    initiativeRoll: 14,
    round: 5,
    ...over,
  };
}

describe("resolveTurnState — solo play (no encounter)", () => {
  it("uses the local solo round, is always my turn, phase 'solo'", () => {
    expect(resolveTurnState(null, 3)).toEqual({
      round: 3,
      isMyTurn: true,
      phase: "solo",
      currentActorName: null,
    });
  });
});

describe("resolveTurnState — in a campaign encounter", () => {
  it("REGRESSION: the round shown is the SHARED encounter round, never the private solo counter", () => {
    // The encounter is at round 5; the stale private solo counter is 99. The seam shows the
    // SHARED 5 — the "round 6, 7, 8…" drift bug is unrepresentable (the sheet can't read a
    // private counter that diverges from the encounter).
    expect(resolveTurnState(gc({ round: 5 }), 99).round).toBe(5);
  });

  it("phase 'my-turn' + the current actor name when the pointer is on my PC", () => {
    const st = resolveTurnState(gc({ isMyTurn: true }), 1);
    expect(st).toMatchObject({
      isMyTurn: true,
      phase: "my-turn",
      currentActorName: "Mara",
    });
  });

  it("phase 'waiting' + the OTHER actor's name when it is someone else's turn", () => {
    const st = resolveTurnState(
      gc({ isMyTurn: false, view: view({ currentId: "monster-1" }) }),
      1
    );
    expect(st).toMatchObject({
      isMyTurn: false,
      phase: "waiting",
      currentActorName: "Goblin",
    });
  });

  it("phase 'gathering' before turns begin (no current actor surfaced)", () => {
    const st = resolveTurnState(
      gc({ gathering: true, isMyTurn: false, view: view({ currentId: null }) }),
      1
    );
    expect(st).toMatchObject({ phase: "gathering", currentActorName: null });
  });
});

// CHARACTER SCOPING — the shell status is keyed on the USER's uid (whichever hero is in the
// fight), NOT the open sheet. `sheetEncounter` gates it to the open hero, so a DIFFERENT hero
// of the same user reads solo even while another of their heroes is in a live encounter.
describe("sheetEncounter — scope the shell status to the OPEN hero", () => {
  it("returns the status when the open hero IS the encounter's PC", () => {
    const status = gc({ characterId: "char-me" });
    expect(sheetEncounter(status, "char-me")).toBe(status);
  });

  it("returns null for a DIFFERENT hero of the same user (pure solo — no fight chrome)", () => {
    expect(sheetEncounter(gc({ characterId: "char-me" }), "char-other-hero")).toBeNull();
  });

  it("returns null when no character is open (off-cockpit) or no encounter", () => {
    expect(sheetEncounter(gc({ characterId: "char-me" }), null)).toBeNull();
    expect(sheetEncounter(null, "char-me")).toBeNull();
  });
});
