/**
 * Phase 4 — action-economy parity.
 *
 * Phase 4 promoted the turn meter out of the Play tab into the center
 * `ThisTurnTracker`, so the meter (End Turn) and the Play-tab action cards
 * (commit) now dispatch through ONE shared `TurnEconomyProvider`. That provider
 * is the single source of the commit/undo orchestration — it was LIFTED verbatim
 * out of `PlayTab`, so by construction the center tracker and the cards drive the
 * identical `combatStore` / `characterStore` transitions.
 *
 * This test pins those transitions at the store layer — independent of which
 * surface triggered them — and proves the shipped immediate-commit path is
 * equivalent to the serializable `cost-engine` primitive (`planCommit` →
 * `applyCommitOps`), modelled on `cost-engine.test.ts`'s `mockStore()` but run
 * against the REAL `characterStore` so the parity is end-to-end:
 *
 *  1. cost-engine drives the real store: a slot+concentration commit deducts the
 *     slot + sets concentration; its reverse-applier restores both exactly.
 *  2. a tracker commit deducts the tracker; its reverse restores it.
 *  3. combatStore turn state: a commit fills the matching economy slot, undo
 *     clears it, and End Turn is pure bookkeeping (round +1, slots cleared,
 *     reaction refreshed, movement reset).
 *  4. EQUIVALENCE: the UI's hand-written immediate-commit sequence
 *     (`useSpellSlot` + `setConcentration`) leaves the store in the SAME state as
 *     `cost-engine`'s `applyCommitOps` for the same logical cost — so neither the
 *     center tracker nor the cards can diverge from the engine model.
 *
 * Pure stores + lib (no Firebase env needed); mirrors `cost-engine.test.ts`.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { planCommit, applyCommitOps, type CommitStore } from "@/lib/cost-engine";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore, type SelectedAction } from "@/stores/combatStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterData } from "@/types/character";
import type { StoredConcentration } from "@/types/ids";
import { conc } from "./__helpers__/concentration";

/** Seed the character store with a fresh clone of the canonical mock. */
function loadMock(): void {
  useCharacterStore.setState({
    character: structuredClone(MOCK_CHARACTER),
    loading: false,
    error: null,
  });
}

const cs = () => useCharacterStore.getState();
const slotUsed = (level: number): number =>
  cs().character?.session.spellSlots[String(level)]?.used ?? 0;
const trackerUsed = (id: string): number =>
  cs().character?.session.trackers[id]?.used ?? 0;
const concentration = (): StoredConcentration =>
  cs().character?.session.concentration ?? "";

/**
 * A `CommitStore` backed by the REAL `characterStore` — the faithful model of
 * the UI's immediate-commit path (the provider's `commitAction` calls the same
 * store actions; equipment is reversed via an array snapshot, as the UI does).
 */
function makeCommitStore(): CommitStore {
  let equipSnapshot: CharacterData["equipment"] | null = null;
  return {
    useSpellSlot: (l) => cs().useSpellSlot(l),
    restoreSpellSlot: (l) => cs().restoreSpellSlot(l),
    useTracker: (id, a) => cs().useTracker(id, a),
    restoreTracker: (id, a) => cs().restoreTracker(id, a),
    useEquipmentItem: (k) => {
      equipSnapshot = cs().character?.character.equipment ?? null;
      cs().useEquipmentItem(k);
    },
    restoreEquipmentItem: () => {
      const doc = cs().character;
      if (doc && equipSnapshot) {
        cs().setCharacter({
          ...doc,
          character: { ...doc.character, equipment: equipSnapshot },
        });
      }
    },
    getConcentration: () => concentration(),
    setConcentration: (s) => cs().setConcentration(s),
  };
}

describe("Phase 4 economy parity — cost-engine drives the real characterStore", () => {
  beforeEach(() => {
    loadMock();
    useCombatStore.setState({
      round: 1,
      initiative: "",
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      movementUsedFt: 0,
    });
  });

  it("slot + concentration: applyCommitOps deducts then the reverse restores both", () => {
    const prevConc = concentration(); // mock concentrates on Hypnotic Pattern
    const before = slotUsed(1);
    const store = makeCommitStore();

    const ops = planCommit(
      { kind: "spell-slot", minLevel: 1 },
      { slotLevel: 1, startsConcentration: conc("bane") }
    );
    const undo = applyCommitOps(ops, store);

    expect(slotUsed(1)).toBe(before + 1);
    expect(concentration()).toBe(conc("bane"));

    undo();
    expect(slotUsed(1)).toBe(before);
    expect(concentration()).toBe(prevConc);
  });

  it("upcast: the slot spent is the chosen level, not the minimum", () => {
    const before = slotUsed(3);
    const store = makeCommitStore();
    const undo = applyCommitOps(
      planCommit({ kind: "spell-slot", minLevel: 1 }, { slotLevel: 3 }),
      store
    );
    expect(slotUsed(3)).toBe(before + 1);
    undo();
    expect(slotUsed(3)).toBe(before);
  });

  it("tracker: applyCommitOps deducts the tracker; the reverse restores it", () => {
    const before = trackerUsed("bard-bardic-inspiration");
    const store = makeCommitStore();
    const undo = applyCommitOps(
      planCommit({ kind: "tracker", trackerId: "bard-bardic-inspiration", amount: 1 }),
      store
    );
    expect(trackerUsed("bard-bardic-inspiration")).toBe(before + 1);
    undo();
    expect(trackerUsed("bard-bardic-inspiration")).toBe(before);
  });
});

describe("Phase 4 economy parity — combatStore turn-state transitions", () => {
  beforeEach(() => {
    useCombatStore.setState({
      round: 1,
      initiative: "",
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      movementUsedFt: 0,
    });
  });

  it("a commit fills the matching economy slot; undo clears it", () => {
    const selected: SelectedAction = {
      id: "spell-bane",
      name: "Bane",
      slot: "action",
      cost: { type: "spell-slot", key: 1 },
    };
    useCombatStore.getState().selectAction(selected);
    expect(useCombatStore.getState().selected.action[0]?.id).toBe("spell-bane");
    expect(useCombatStore.getState().selected.bonus).toEqual([]);

    // Tap-again undo (the provider's reverseSlot path → deselectAction).
    useCombatStore.getState().deselectAction("spell-bane");
    expect(useCombatStore.getState().selected.action).toEqual([]);
  });

  it("End Turn is pure bookkeeping: round +1, slots cleared, reaction + movement reset", () => {
    const store = useCombatStore.getState();
    store.setRound(5);
    store.selectAction({ id: "a", name: "Attack", slot: "action" });
    store.selectAction({ id: "b", name: "Bonus", slot: "bonus" });
    store.useReaction("test-reaction");
    store.setMovementUsed(15);

    store.endTurn();

    const after = useCombatStore.getState();
    expect(after.round).toBe(6);
    expect(after.selected.action).toEqual([]);
    expect(after.selected.bonus).toEqual([]);
    expect(after.reactionUsed).toBe(false);
    expect(after.movementUsedFt).toBe(0);
  });
});

describe("Phase 4 economy parity — the UI path equals the cost-engine model", () => {
  it("hand-written immediate-commit leaves the SAME store state as applyCommitOps", () => {
    // Path A — the UI's commitAction does exactly these store calls.
    loadMock();
    useCharacterStore.getState().useSpellSlot(2);
    useCharacterStore.getState().setConcentration(conc("hold-person"));
    const stateA = { used2: slotUsed(2), conc: concentration() };

    // Path B — the serializable cost-engine primitive, same logical cost.
    loadMock();
    applyCommitOps(
      planCommit(
        { kind: "spell-slot", minLevel: 2 },
        { slotLevel: 2, startsConcentration: conc("hold-person") }
      ),
      makeCommitStore()
    );
    const stateB = { used2: slotUsed(2), conc: concentration() };

    expect(stateB).toEqual(stateA);
  });
});
