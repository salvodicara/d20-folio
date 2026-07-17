import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useCombatStore, type SelectedAction } from "@/stores/combatStore";
import { useCharacterStore } from "@/stores/characterStore";

const s = () => useCombatStore.getState();
const act = (id: string, slot: SelectedAction["slot"]): SelectedAction => ({
  id,
  name: id,
  slot,
});

beforeEach(() =>
  useCombatStore.setState({
    round: 1,
    initiative: "",
    selected: { action: [], bonus: [], free: [] },
    budget: { action: 1, bonus: 1 },
    attackBudget: 1,
    attacksUsed: 0,
    attackSwingIds: [],
    reactionUsed: false,
    reactionUsedId: null,
    movementUsedFt: 0,
    dashesThisTurn: 0,
    spellSlotCastsThisTurn: 0,
  })
);

/** The localized "Attack" group entry the provider passes into commitAttackSwing. */
const attackGroup = (): SelectedAction => ({
  id: "attack-group",
  name: "Attack",
  slot: "action",
  isAttackGroup: true,
});

describe("combatStore", () => {
  it("setRound / setInitiative", () => {
    s().setRound(3);
    s().setInitiative("18");
    expect(s().round).toBe(3);
    expect(s().initiative).toBe("18");
  });

  // RA-09 — a committed Dash extends the turn's movement budget by one Speed. The
  // store tracks the count; ThisTurnTracker derives the budget = speed × (1+count).
  describe("RA-09 Dash movement extension", () => {
    it("commitDash increments the per-turn count; its restore decrements it", () => {
      expect(s().dashesThisTurn).toBe(0);
      const restore = s().commitDash();
      expect(s().dashesThisTurn).toBe(1);
      // A second Dash (rare) stacks a second Speed's worth.
      s().commitDash();
      expect(s().dashesThisTurn).toBe(2);
      // Undo of the first commit steps back to 1 (a mis-tap is recoverable).
      restore();
      expect(s().dashesThisTurn).toBe(1);
    });

    it("the restore never drives the count below 0", () => {
      const restore = s().commitDash();
      restore();
      restore();
      expect(s().dashesThisTurn).toBe(0);
    });

    it.each([
      ["endTurn", () => s().endTurn()],
      ["resetTurn", () => s().resetTurn()],
      ["endCombat", () => s().endCombat()],
    ])("%s resets the Dash count to 0 (turn-scoped)", (_label, boundary) => {
      s().commitDash();
      s().commitDash();
      expect(s().dashesThisTurn).toBe(2);
      boundary();
      expect(s().dashesThisTurn).toBe(0);
    });
  });

  // RA-08 — the one-spell-slot-per-turn advisory counter.
  describe("RA-08 spell-slot-cast advisory counter", () => {
    it("commitSpellSlotCast increments; its restore decrements (never below 0)", () => {
      expect(s().spellSlotCastsThisTurn).toBe(0);
      const restore = s().commitSpellSlotCast();
      s().commitSpellSlotCast();
      expect(s().spellSlotCastsThisTurn).toBe(2);
      restore();
      expect(s().spellSlotCastsThisTurn).toBe(1);
      restore();
      restore();
      expect(s().spellSlotCastsThisTurn).toBe(0);
    });

    it.each([
      ["endTurn", () => s().endTurn()],
      ["resetTurn", () => s().resetTurn()],
      ["endCombat", () => s().endCombat()],
    ])("%s resets the slot-cast count to 0 (turn-scoped)", (_label, boundary) => {
      s().commitSpellSlotCast();
      s().commitSpellSlotCast();
      expect(s().spellSlotCastsThisTurn).toBe(2);
      boundary();
      expect(s().spellSlotCastsThisTurn).toBe(0);
    });
  });

  it("selectAction appends into its economy slot (default budget 1 = one occupant)", () => {
    expect(s().selectAction(act("attack", "action"))).toBe(true);
    expect(s().selected.action.map((a) => a.id)).toEqual(["attack"]);
    // At budget 1 a second action does NOT fit (the caller frees the slot first).
    expect(s().selectAction(act("dash", "action"))).toBe(false);
    expect(s().selected.action.map((a) => a.id)).toEqual(["attack"]);
    expect(s().selectAction(act("misty-step", "bonus"))).toBe(true);
    expect(s().selected.bonus.map((a) => a.id)).toEqual(["misty-step"]);
  });

  it("a re-commit of the same id is idempotent (never double-listed)", () => {
    expect(s().selectAction(act("attack", "action"))).toBe(true);
    expect(s().selectAction(act("attack", "action"))).toBe(false);
    expect(s().selected.action).toHaveLength(1);
  });

  it("B6 — a raised budget lets a SECOND action fit the slot ('Action 1/2')", () => {
    s().setBudget({ action: 2, bonus: 1 });
    expect(s().selectAction(act("attack", "action"))).toBe(true);
    expect(s().selectAction(act("action-surge-attack", "action"))).toBe(true);
    expect(s().selected.action.map((a) => a.id)).toEqual([
      "attack",
      "action-surge-attack",
    ]);
    // The slot is now full at budget 2 — a third does not fit.
    expect(s().selectAction(act("third", "action"))).toBe(false);
    expect(s().selected.action).toHaveLength(2);
  });

  it("B6 — the free slot is uncapped regardless of budget", () => {
    expect(s().selectAction(act("surge", "free"))).toBe(true);
    expect(s().selectAction(act("second-free", "free"))).toBe(true);
    expect(s().selected.free).toHaveLength(2);
  });

  it("setBudget no-ops when unchanged", () => {
    let ticks = 0;
    const unsub = useCombatStore.subscribe(() => (ticks += 1));
    s().setBudget({ action: 1, bonus: 1 }); // same as initial
    expect(ticks).toBe(0);
    s().setBudget({ action: 2, bonus: 1 });
    expect(ticks).toBe(1);
    unsub();
  });

  it("deselectSlot clears a specific slot", () => {
    s().selectAction(act("attack", "action"));
    s().deselectSlot("action");
    expect(s().selected.action).toEqual([]);
  });

  it("deselectAction finds the slot by id; unknown id is a no-op", () => {
    s().selectAction(act("attack", "action"));
    s().selectAction(act("step", "bonus"));
    s().deselectAction("step");
    expect(s().selected.bonus).toEqual([]);
    expect(s().selected.action.map((a) => a.id)).toEqual(["attack"]);
    expect(() => s().deselectAction("does-not-exist")).not.toThrow();
    expect(s().selected.action.map((a) => a.id)).toEqual(["attack"]);
  });

  it("deselectAction removes only the named action from a multi-occupant slot", () => {
    s().setBudget({ action: 2, bonus: 1 });
    s().selectAction(act("attack", "action"));
    s().selectAction(act("surge-attack", "action"));
    s().deselectAction("attack");
    expect(s().selected.action.map((a) => a.id)).toEqual(["surge-attack"]);
  });

  it("useReaction / resetReaction toggle reactionUsed AND record the occupant id", () => {
    s().useReaction("shield");
    expect(s().reactionUsed).toBe(true);
    // CTA grammar — the spending reaction's id is the group's ring occupant.
    expect(s().reactionUsedId).toBe("shield");
    s().resetReaction();
    expect(s().reactionUsed).toBe(false);
    expect(s().reactionUsedId).toBeNull();
  });

  it("resetTurn clears selections + budget + reaction but keeps the round", () => {
    s().setRound(4);
    s().setBudget({ action: 2, bonus: 1 });
    s().selectAction(act("attack", "action"));
    s().useReaction("shield");
    s().resetTurn();
    expect(s().round).toBe(4);
    expect(s().selected.action).toEqual([]);
    expect(s().budget).toEqual({ action: 1, bonus: 1 });
    expect(s().reactionUsed).toBe(false);
  });

  // `resetTurn` re-arms the economy at TURN-START in an encounter (the provider fires it
  // when the shared pointer lands on this PC): it clears THIS turn's economy + refills
  // movement while leaving the round AND the initiative roll UNTOUCHED. That last part is
  // load-bearing: the round/initiative auto-save subscription (TurnEconomyProvider) fires
  // ONLY when one of those changes, so an untouched initiative means a turn-start re-arm
  // never echoes a null roll into the shared `combat/state` subdoc.
  it("resetTurn is TURN-scoped: re-arms economy + movement, never the round or initiative", () => {
    s().setRound(6);
    s().setInitiative("17");
    s().setBudget({ action: 2, bonus: 1 });
    s().selectAction(act("attack", "action"));
    s().selectAction(act("dash", "bonus"));
    s().useReaction("shield");
    s().setMovementUsed(15);

    s().resetTurn();

    // Re-armed: every slot open, budget back to default, reaction refreshed, movement refilled.
    expect(s().selected.action).toEqual([]);
    expect(s().selected.bonus).toEqual([]);
    expect(s().budget).toEqual({ action: 1, bonus: 1 });
    expect(s().reactionUsed).toBe(false);
    expect(s().movementUsedFt).toBe(0);
    // Untouched: the round counter and the initiative roll (never a shared write, never a
    // round advance — unlike End Turn, which advances).
    expect(s().round).toBe(6);
    expect(s().initiative).toBe("17");
  });

  // End Combat (the solo band button, behind a confirm) returns combat to baseline:
  // round → 1, economy re-armed, movement refilled, initiative cleared — the exact
  // scope the confirm body states. It touches ONLY combat-turn state (the Action Log,
  // conditions, concentration, HP, and death saves live in the character store, so
  // they are untouched by construction — asserted at the render layer).
  it("endCombat returns combat to baseline: round 1, economy re-armed, movement full, initiative empty", () => {
    s().setRound(7);
    s().setInitiative("20");
    s().setBudget({ action: 2, bonus: 1 });
    s().selectAction(act("attack", "action"));
    s().selectAction(act("dash", "bonus"));
    s().useReaction("shield");
    s().setMovementUsed(20);
    s().endCombat();
    expect(s().round).toBe(1);
    expect(s().initiative).toBe("");
    expect(s().selected.action).toEqual([]);
    expect(s().selected.bonus).toEqual([]);
    expect(s().budget).toEqual({ action: 1, bonus: 1 });
    expect(s().reactionUsed).toBe(false);
    expect(s().movementUsedFt).toBe(0);
  });

  it("endTurn is pure bookkeeping: advances round, clears the turn + budget, refreshes reaction", () => {
    s().setBudget({ action: 2, bonus: 1 });
    s().selectAction(act("attack", "action"));
    s().selectAction(act("step", "bonus"));
    s().useReaction("shield");
    // Immediate-commit model: endTurn returns nothing (resources already spent).
    expect(s().endTurn()).toBeUndefined();
    expect(s().round).toBe(2);
    expect(s().selected.action).toEqual([]);
    expect(s().selected.bonus).toEqual([]);
    expect(s().budget).toEqual({ action: 1, bonus: 1 });
    expect(s().reactionUsed).toBe(false);
  });

  // ATTACK-PIPS — the Extra-Attack economy: an Attack action holds `attackBudget`
  // swings; each weapon/War-Magic swing rides one pip, a completed action claims
  // one Action slot, Action Surge opens a second.
  describe("attack pips", () => {
    it("setAttackBudget is a no-op when unchanged (never churns the store)", () => {
      s().setAttackBudget(2);
      expect(s().attackBudget).toBe(2);
      const before = s();
      s().setAttackBudget(2);
      expect(s()).toBe(before); // same object reference — no set() fired
    });

    it("GUARD CASE — at attackBudget 1 commitAttackSwing is inert (returns null)", () => {
      s().setAttackBudget(1);
      expect(s().commitAttackSwing(attackGroup(), "longsword")).toBeNull();
      expect(s().attacksUsed).toBe(0);
      expect(s().selected.action).toEqual([]);
    });

    it("first swing claims an Action slot; the rest ride it (budget 2)", () => {
      s().setAttackBudget(2);
      // Swing 1 — starts the Attack action, claims the slot.
      expect(s().commitAttackSwing(attackGroup(), "longsword")).toBe("new-group");
      expect(s().attacksUsed).toBe(1);
      expect(s().selected.action).toHaveLength(1);
      expect(s().selected.action[0]?.isAttackGroup).toBe(true);
      // Swing 2 — rides the open action, no new slot.
      expect(s().commitAttackSwing(attackGroup(), "longsword")).toBe("rode");
      expect(s().attacksUsed).toBe(2);
      expect(s().selected.action).toHaveLength(1);
      // Swing 3 — the action is spent and no 2nd Action slot exists → rejected.
      expect(s().commitAttackSwing(attackGroup(), "longsword")).toBeNull();
      expect(s().attacksUsed).toBe(2);
    });

    it("Action Surge (budget.action 2) opens a SECOND Attack action's pips", () => {
      s().setAttackBudget(2);
      s().setBudget({ action: 2, bonus: 1 });
      expect(s().commitAttackSwing(attackGroup(), "longsword")).toBe("new-group"); // 1st action, swing 1
      expect(s().commitAttackSwing(attackGroup(), "longsword")).toBe("rode"); //     swing 2
      expect(s().commitAttackSwing(attackGroup(), "longsword")).toBe("new-group"); // 2nd action, swing 1
      expect(s().commitAttackSwing(attackGroup(), "longsword")).toBe("rode"); //     swing 2
      expect(s().attacksUsed).toBe(4);
      expect(s().selected.action.filter((a) => a.isAttackGroup)).toHaveLength(2);
      // Both Attack actions spent → a 5th swing is rejected.
      expect(s().commitAttackSwing(attackGroup(), "longsword")).toBeNull();
    });

    it("undo decrements the count and releases the slot only across a budget multiple", () => {
      s().setAttackBudget(2);
      s().commitAttackSwing(attackGroup(), "longsword"); // swing 1 → claims slot
      s().commitAttackSwing(attackGroup(), "longsword"); // swing 2 → rides
      expect(s().selected.action).toHaveLength(1);
      // Undo swing 2 — rode, so the slot stays claimed.
      s().undoAttackSwing();
      expect(s().attacksUsed).toBe(1);
      expect(s().selected.action).toHaveLength(1);
      // Undo swing 1 — crosses back over 0, releasing the Attack action slot.
      s().undoAttackSwing();
      expect(s().attacksUsed).toBe(0);
      expect(s().selected.action).toHaveLength(0);
    });

    it("undo is order-independent — never strands a group entry", () => {
      s().setAttackBudget(2);
      s().setBudget({ action: 2, bonus: 1 });
      // Two full Attack actions (4 swings, 2 group entries).
      s().commitAttackSwing(attackGroup(), "longsword");
      s().commitAttackSwing(attackGroup(), "longsword");
      s().commitAttackSwing(attackGroup(), "longsword");
      s().commitAttackSwing(attackGroup(), "longsword");
      expect(s().selected.action.filter((a) => a.isAttackGroup)).toHaveLength(2);
      // Undo three swings — the group entries reconcile to ceil(1/2) = 1.
      s().undoAttackSwing();
      s().undoAttackSwing();
      s().undoAttackSwing();
      expect(s().attacksUsed).toBe(1);
      expect(s().selected.action.filter((a) => a.isAttackGroup)).toHaveLength(1);
    });

    it("deselectSlot('action') resets the swing counter with the released groups", () => {
      // Regression (review finding): re-arming the Action coin (deselectSlot) used
      // to strand attacksUsed, so the coin re-opened with fully-lit pips and the
      // next swing drifted the counter.
      s().setAttackBudget(2);
      s().commitAttackSwing(attackGroup(), "longsword");
      s().commitAttackSwing(attackGroup(), "longsword");
      expect(s().attacksUsed).toBe(2);
      s().deselectSlot("action");
      expect(s().attacksUsed).toBe(0);
      expect(s().selected.action).toEqual([]);
      // The next swing starts a FRESH Attack action (claims a slot, count 1).
      expect(s().commitAttackSwing(attackGroup(), "longsword")).toBe("new-group");
      expect(s().attacksUsed).toBe(1);
    });

    it("deselectSlot('bonus') leaves the swing counter untouched", () => {
      s().setAttackBudget(2);
      s().commitAttackSwing(attackGroup(), "longsword");
      s().deselectSlot("bonus");
      expect(s().attacksUsed).toBe(1);
    });

    it("resetTurn / endTurn / endCombat clear the swing count and budget", () => {
      s().setAttackBudget(3);
      s().commitAttackSwing(attackGroup(), "longsword");
      s().resetTurn();
      expect(s().attacksUsed).toBe(0);
      expect(s().attackBudget).toBe(1);

      s().setAttackBudget(3);
      s().commitAttackSwing(attackGroup(), "longsword");
      s().endTurn();
      expect(s().attacksUsed).toBe(0);
      expect(s().attackBudget).toBe(1);

      s().setAttackBudget(3);
      s().commitAttackSwing(attackGroup(), "longsword");
      s().endCombat();
      expect(s().attacksUsed).toBe(0);
      expect(s().attackBudget).toBe(1);
    });

    // CTA grammar (owner 2026-07-11) — the Attack group's OCCUPANT ledger: which
    // attack card(s) rode a swing keep the gold ring once the action is fully
    // spent. Every committed swing pushes its card id; every undo pops the last.
    it("attackSwingIds records the swung card ids and pops them on undo", () => {
      s().setAttackBudget(2);
      s().commitAttackSwing(attackGroup(), "longsword"); // swing 1
      s().commitAttackSwing(attackGroup(), "dagger"); //    swing 2 (multi-weapon)
      // Both weapons that consumed a swing are occupants of the spent Attack action.
      expect(s().attackSwingIds).toEqual(["longsword", "dagger"]);
      s().undoAttackSwing();
      expect(s().attackSwingIds).toEqual(["longsword"]);
      s().undoAttackSwing();
      expect(s().attackSwingIds).toEqual([]);
    });

    it("re-arming the Action coin clears the swing occupant ledger", () => {
      s().setAttackBudget(2);
      s().commitAttackSwing(attackGroup(), "longsword");
      expect(s().attackSwingIds).toEqual(["longsword"]);
      s().deselectSlot("action");
      expect(s().attackSwingIds).toEqual([]);
    });

    it("resetTurn / endTurn / endCombat clear the swing occupant ledger", () => {
      for (const clear of ["resetTurn", "endTurn", "endCombat"] as const) {
        s().setAttackBudget(2);
        s().commitAttackSwing(attackGroup(), "longsword");
        expect(s().attackSwingIds).toEqual(["longsword"]);
        s()[clear]();
        expect(s().attackSwingIds).toEqual([]);
      }
    });
  });

  // CTA grammar — the Reaction group's occupant id is turn-scoped like the rest
  // of the economy: every re-arm path clears it alongside `reactionUsed`.
  it("resetTurn / endTurn / endCombat clear reactionUsedId with reactionUsed", () => {
    for (const clear of ["resetTurn", "endTurn", "endCombat"] as const) {
      s().useReaction("counterspell");
      expect(s().reactionUsedId).toBe("counterspell");
      s()[clear]();
      expect(s().reactionUsed).toBe(false);
      expect(s().reactionUsedId).toBeNull();
    }
  });

  // P10 GLASS CASE — on a read-only sheet (member/DM/admin viewer) every
  // PLAYER-driven combat mutator is a no-op, while the hydration/display
  // setters stay open so the viewer can mirror the member's persisted state.
  describe("read-only backstop", () => {
    afterEach(() => useCharacterStore.setState({ readonly: false }));

    it("blocks every player-driven mutator while the sheet is read-only", () => {
      useCharacterStore.setState({ readonly: true });
      expect(s().selectAction(act("attack", "action"))).toBe(false);
      expect(s().selected.action).toEqual([]);
      s().useReaction("shield");
      expect(s().reactionUsed).toBe(false);
      s().setMovementUsed(15);
      expect(s().movementUsedFt).toBe(0);
      s().endTurn();
      expect(s().round).toBe(1);
      // ATTACK-PIPS — a swing commit / undo is likewise a no-op for a viewer.
      useCombatStore.setState({ attackBudget: 2 });
      expect(s().commitAttackSwing(attackGroup(), "longsword")).toBeNull();
      expect(s().attacksUsed).toBe(0);
    });

    it("keeps the hydration setters open (the viewer mirrors persisted state)", () => {
      useCharacterStore.setState({ readonly: true });
      s().setRound(7);
      s().setInitiative("15");
      expect(s().round).toBe(7);
      expect(s().initiative).toBe("15");
    });
  });
});
