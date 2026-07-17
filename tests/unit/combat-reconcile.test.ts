/**
 * combat-reconcile — the PURE derivation the shell combat producer publishes, and the
 * SOURCE-level regression for the owner's "your turn FLICKERS on End Turn" bug.
 *
 * A single-frame flash is a render-timing artifact (jsdom can't show it — that's the
 * `turn-indicator-flicker.spec.ts` e2e's job), but its ROOT CAUSE is a data-flow one: the
 * producer used to co-publish `status` (from the live campaign read) and `pip` (from the
 * shared-campaigns query) as INDEPENDENTLY-timed halves, so a lagging listener could
 * republish an advanced status beside a stale "your turn" pip — or revert the whole optimistic
 * hand-off. These pure tests lock the invariant that makes that unrepresentable: the pip's
 * primary turn-phase is ONE derivation from `status`, and the turn never regresses below an
 * in-flight optimistic advance. A regression here (reverting to the two-source publish) fails
 * deterministically, without needing the browser.
 */
import { describe, it, expect } from "vitest";
import {
  advanceGlobalCombat,
  syncPipToStatus,
  pendingApplies,
  reconcileCombatPublish,
} from "@/features/campaigns/combat-reconcile";
import type {
  GlobalCombat,
  PipModel,
  PendingTurn,
} from "@/features/campaigns/global-combat-context";
import type { EncounterState } from "@/types/campaign";
import type { EncounterView } from "@/features/campaigns/encounter-view";

/** A begun encounter whose FROZEN order runs my PC → a goblin; the pointer sits on me. */
function encounter(over: Partial<EncounterState> = {}): EncounterState {
  return {
    round: 5,
    currentCombatantId: "pc-me",
    order: ["pc-me", "monster-1"],
    epoch: 1,
    status: "active",
    combatants: [
      { kind: "pc", id: "pc-me", memberUid: "me", characterId: "char-me" },
      {
        kind: "monster",
        id: "monster-1",
        name: "Goblin",
        ac: 13,
        initiative: 10,
        conditions: [],
        maxHp: 7,
        tokens: [7],
      },
    ],
    ...over,
  };
}

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

function gc(over: Partial<GlobalCombat> = {}): GlobalCombat {
  return {
    campaignId: "camp-1",
    encounter: encounter(),
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

/** The topbar pip: the viewer's PC fight (`camp-1`) as the primary + an unrelated second. */
function pipModel(primaryState: PipModel["entries"][number]["state"]): PipModel {
  return {
    primaryId: "camp-1",
    entries: [
      {
        campaignId: "camp-1",
        campaignName: "Camp",
        role: "pc",
        state: primaryState,
        round: 5,
        heroName: "Mara",
        characterId: "char-me",
        actorName: primaryState === "actor-turn" ? "Goblin" : null,
      },
      {
        campaignId: "camp-2",
        campaignName: "Other",
        role: "pc",
        state: "actor-turn",
        round: 3,
        heroName: "Bren",
        characterId: "char-bren",
        actorName: "Ogre",
      },
    ],
  };
}

const pending: PendingTurn = {
  campaignId: "camp-1",
  epoch: 1,
  fromId: "pc-me",
  fromRound: 5,
};

describe("advanceGlobalCombat — optimistic turn hand-off", () => {
  it("flips isMyTurn → false and moves the pointer to the next combatant", () => {
    const next = advanceGlobalCombat(gc());
    expect(next.encounter.currentCombatantId).toBe("monster-1");
    expect(next.isMyTurn).toBe(false);
    expect(next.view.currentId).toBe("monster-1"); // the view pointer stays in sync
  });

  it("wraps the round + returns to my turn when I am the only live combatant", () => {
    const solo = encounter({
      order: ["pc-me"],
      combatants: [{ kind: "pc", id: "pc-me", memberUid: "me", characterId: "char-me" }],
    });
    const next = advanceGlobalCombat(gc({ encounter: solo, round: 5 }));
    expect(next.encounter.currentCombatantId).toBe("pc-me");
    expect(next.isMyTurn).toBe(true);
    expect(next.round).toBe(6); // wrapped past the last → next round
  });
});

describe("syncPipToStatus — the pip's primary phase is ONE derivation from status", () => {
  it("re-reduces ONLY the matching row to actor-turn + the next actor, leaving others intact", () => {
    const advanced = advanceGlobalCombat(gc());
    const next = syncPipToStatus(pipModel("your-turn"), advanced);
    expect(next?.entries[0]).toMatchObject({
      campaignId: "camp-1",
      state: "actor-turn",
      actorName: "Goblin",
    });
    // A DIFFERENT fight's row is never touched by my advance (no cross-encounter bleed).
    expect(next?.entries[1]).toEqual(pipModel("your-turn").entries[1]);
  });

  it("THE FIX: an advanced status forces the STALE 'your turn' pip row to actor-turn (no flash)", () => {
    // The status-first race: status has advanced but the pip source is still stale (your-turn).
    // Deriving the row from status makes the stale-half publish yield actor-turn, never a flash.
    const advanced = advanceGlobalCombat(gc());
    const next = syncPipToStatus(pipModel("your-turn"), advanced);
    expect(next?.entries[0]?.state).toBe("actor-turn");
  });

  it("reflects my-turn / gathering back onto the row", () => {
    expect(syncPipToStatus(pipModel("actor-turn"), gc())?.entries[0]?.state).toBe(
      "your-turn"
    );
    const gathering = gc({
      gathering: true,
      isMyTurn: false,
      encounter: encounter({ currentCombatantId: null }),
      view: view({ currentId: null }),
    });
    expect(syncPipToStatus(pipModel("actor-turn"), gathering)?.entries[0]?.state).toBe(
      "gathering"
    );
  });

  it("NEVER overrides a needs-roll row (roll-state owns that phase, not the turn pointer)", () => {
    const advanced = advanceGlobalCombat(gc());
    const next = syncPipToStatus(pipModel("needs-roll"), advanced);
    expect(next?.entries[0]?.state).toBe("needs-roll");
  });

  it("is a no-op on a null pip", () => {
    expect(syncPipToStatus(null, gc())).toBeNull();
  });
});

describe("pendingApplies — the optimistic hand-off is still in flight", () => {
  it("true while the live read still shows the exact pointer we advanced FROM", () => {
    expect(pendingApplies(gc(), pending)).toBe(true);
  });

  it("false once the real read moved off that pointer (the advance LANDED)", () => {
    const landed = gc({ encounter: encounter({ currentCombatantId: "monster-1" }) });
    expect(pendingApplies(landed, pending)).toBe(false);
  });

  it("false when the round advanced (a later WRAP back onto my own turn is not 'pending')", () => {
    const wrapped = gc({ round: 6, encounter: encounter({ round: 6 }) });
    expect(pendingApplies(wrapped, pending)).toBe(false);
  });

  it("false for a different epoch, campaign, or when either side is null", () => {
    expect(pendingApplies(gc({ encounter: encounter({ epoch: 2 }) }), pending)).toBe(
      false
    );
    expect(pendingApplies(gc({ campaignId: "other" }), pending)).toBe(false);
    expect(pendingApplies(null, pending)).toBe(false);
    expect(pendingApplies(gc(), null)).toBe(false);
  });
});

describe("reconcileCombatPublish — one consistent, non-regressing publish", () => {
  it("status-first race: advanced status + STALE your-turn pip → BOTH read actor-turn", () => {
    const advanced = advanceGlobalCombat(gc());
    const { status, pip } = reconcileCombatPublish(
      advanced,
      pipModel("your-turn"),
      pending
    );
    expect(status?.isMyTurn).toBe(false);
    expect(pip?.entries[0]?.state).toBe("actor-turn"); // was the flash
  });

  it("stale-echo race: a pre-advance status while the write is in flight stays advanced", () => {
    // A peer combat-state echo re-runs the status memo with the STALE (still-my-turn) read
    // before the turn write lands. Without the guard this reverted the pip to your-turn.
    const { status, pip } = reconcileCombatPublish(gc(), pipModel("your-turn"), pending);
    expect(status?.encounter.currentCombatantId).toBe("monster-1"); // held advanced
    expect(status?.isMyTurn).toBe(false);
    expect(pip?.entries[0]?.state).toBe("actor-turn");
  });

  it("no pending: publishes the real read verbatim (pip primary still synced to status)", () => {
    const { status, pip } = reconcileCombatPublish(gc(), pipModel("actor-turn"), null);
    expect(status?.isMyTurn).toBe(true); // genuinely my turn — not advanced away
    expect(pip?.entries[0]?.state).toBe("your-turn"); // synced to the (my-turn) status
  });

  it("once the advance LANDS the guard is inert (no double-step)", () => {
    const landed = gc({
      isMyTurn: false,
      encounter: encounter({ currentCombatantId: "monster-1" }),
      view: view({ currentId: "monster-1" }),
    });
    const { status } = reconcileCombatPublish(landed, pipModel("actor-turn"), pending);
    // The pointer stays on the goblin — pendingApplies is false, so advanceGlobalCombat does
    // NOT fire a SECOND step past it.
    expect(status?.encounter.currentCombatantId).toBe("monster-1");
  });

  it("passes a null status/pip straight through", () => {
    expect(reconcileCombatPublish(null, null, null)).toEqual({ status: null, pip: null });
    expect(reconcileCombatPublish(null, pipModel("gathering"), pending).pip).toEqual(
      pipModel("gathering")
    );
  });
});
