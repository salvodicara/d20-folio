/**
 * Regression — Combat-store sync on async character load + cross-client resync.
 *
 * **Original bug:** the combat page used `useEffect(…, [])` (mount-only) to hydrate
 * `combatStore.round` and `combatStore.initiative` from the persisted character. Because
 * the payload arrives asynchronously from Firestore, a freshly-mounted page rendered with
 * `character === null`, the effect fired once with nothing to hydrate, and the persisted
 * state was silently lost on reload mid-combat.
 *
 * **Fix:** the effect depends on `[character]` and routes through the shared
 * `syncCombatFromSession` policy. Both the SOLO `round` and the initiative ROLL now live in
 * the `combat/state` subdoc (round moved there as its sole persisted home; the session no
 * longer carries it), so they share ONE policy keyed off the hydrated subdoc values
 * (`characterStore.combatRound` + the reconciled `session.initiative`): a FRESH character
 * resets + seeds both; a LATER snapshot of the SAME character RECONCILES both from the
 * subdoc (issue #41 — a remote roll re-syncs; and, crucially, the subdoc landing AFTER the
 * char doc lands its round on the next snapshot). This test drives that exact exported
 * policy (not a mirror) so it pins the real code.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useCombatStore } from "@/stores/combatStore";
import { syncCombatFromSession } from "@/features/character/center/combat-hydration";

/**
 * Thin wrapper around the real policy that tracks the "already hydrated" id the way
 * `TurnEconomyProvider`'s ref does, so each `arrive` reads like one Firestore snapshot.
 * `round` is the value hydrated from the `combat/state` subdoc (`characterStore.combatRound`).
 */
function makeArriver() {
  let hydratedId: string | null = null;
  return function arrive(id: string, round: number, init: string): boolean {
    const fresh = syncCombatFromSession(id, round, init, hydratedId);
    if (fresh) hydratedId = id;
    return fresh;
  };
}

describe("Combat sync — async character arrival", () => {
  beforeEach(() => {
    useCombatStore.getState().endCombat();
  });

  it("hydrates from the subdoc round + initiative on first arrival of a character", () => {
    const arrive = makeArriver();
    expect(arrive("char-1", 5, "Lyra +3")).toBe(true);
    expect(useCombatStore.getState().round).toBe(5);
    expect(useCombatStore.getState().initiative).toBe("Lyra +3");
  });

  it("RECONCILES the round from a later subdoc snapshot of the SAME character (the ordering fix)", () => {
    const arrive = makeArriver();
    // Char doc lands first with an absent subdoc → round 1.
    arrive("char-1", 1, "");
    expect(useCombatStore.getState().round).toBe(1);
    // The subdoc then lands carrying the persisted round 3 (mid-combat). Round now lives in
    // the subdoc, so — like initiative — it reconciles onto the open sheet on this snapshot,
    // instead of the old parent-doc hydrate-once that lost a late subdoc's round.
    expect(arrive("char-1", 3, "")).toBe(false);
    expect(useCombatStore.getState().round).toBe(3);
  });

  it("DOES hydrate again when switching to a different character", () => {
    const arrive = makeArriver();
    arrive("char-1", 5, "Lyra +3");
    // No manual reset — switching characters resets automatically.
    expect(arrive("char-2", 3, "Bron +1")).toBe(true);
    expect(useCombatStore.getState().round).toBe(3);
    expect(useCombatStore.getState().initiative).toBe("Bron +1");
  });

  it("character switch resets in-memory round even if character B's subdoc round is 1", () => {
    const arrive = makeArriver();
    arrive("char-A", 5, "Lyra +3");
    expect(useCombatStore.getState().round).toBe(5);
    expect(arrive("char-B", 1, "")).toBe(true);
    // Round MUST come back to 1 for the fresh character.
    expect(useCombatStore.getState().round).toBe(1);
    expect(useCombatStore.getState().initiative).toBe("");
  });

  it("does not overwrite an in-flight in-memory round at first arrival", () => {
    const arrive = makeArriver();
    // Player started a fresh combat (round=1, init="") and the subdoc payload arrives still
    // showing the defaults — no round/init change.
    expect(arrive("char-1", 1, "")).toBe(true);
    expect(useCombatStore.getState().round).toBe(1);
    expect(useCombatStore.getState().initiative).toBe("");
  });

  it("hydrates round but skips initiative if only round is set", () => {
    const arrive = makeArriver();
    expect(arrive("char-1", 7, "")).toBe(true);
    expect(useCombatStore.getState().round).toBe(7);
    expect(useCombatStore.getState().initiative).toBe("");
  });
});

describe("Combat sync — remote reconcile (issue #41)", () => {
  beforeEach(() => {
    useCombatStore.getState().endCombat();
  });

  it("reconciles a REMOTE initiative change on the SAME character; an unchanged round survives", () => {
    const arrive = makeArriver();
    arrive("char-1", 1, "10"); // fresh fight, player rolled 10
    useCombatStore.getState().setRound(4); // local round bookkeeping advances
    // The DM re-rolls this player's initiative remotely → the reconciled session (via
    // combat/state → hydrateCombatState) carries 18; the subdoc's round still reads 4 (the
    // player's own latest, since every whole-object combat write includes it). Both reconcile.
    expect(arrive("char-1", 4, "18")).toBe(false); // not a fresh hydration
    expect(useCombatStore.getState().initiative).toBe("18"); // store reflects the remote roll
    expect(useCombatStore.getState().round).toBe(4); // round unchanged (subdoc carried 4)
  });

  it("a remote CLEAR (new encounter epoch) reconciles the store back to empty", () => {
    const arrive = makeArriver();
    arrive("char-1", 1, "15");
    expect(arrive("char-1", 1, "")).toBe(false);
    expect(useCombatStore.getState().initiative).toBe("");
  });

  it("an unchanged resync does NOT churn the store initiative", () => {
    const arrive = makeArriver();
    arrive("char-1", 1, "12");
    // A local edit ahead of the (equal) session value must not be reverted.
    useCombatStore.getState().setInitiative("12");
    expect(arrive("char-1", 1, "12")).toBe(false);
    expect(useCombatStore.getState().initiative).toBe("12");
  });
});
