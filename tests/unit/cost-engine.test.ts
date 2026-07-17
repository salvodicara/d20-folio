/**
 * Combat cost engine — planCommit (pure) + applyCommitOps (reverse-applier).
 * Pins every CostSpec → CommitOp mapping and confirms undo restores state.
 */
import { describe, expect, it, vi } from "vitest";
import {
  planCommit,
  applyCommitOps,
  type CommitStore,
  type CostSpec,
} from "@/lib/cost-engine";
import type { StoredConcentration } from "@/types/ids";
import { conc } from "./__helpers__/concentration";

describe("planCommit — CostSpec → CommitOp", () => {
  it("spell-slot uses minLevel by default, upcasts to slotLevel", () => {
    expect(planCommit({ kind: "spell-slot", minLevel: 1 })).toEqual([
      { op: "spend-spell-slot", level: 1 },
    ]);
    expect(planCommit({ kind: "spell-slot", minLevel: 1 }, { slotLevel: 3 })).toEqual([
      { op: "spend-spell-slot", level: 3 },
    ]);
  });

  it("never spends a slot below minLevel even if a lower slotLevel is passed", () => {
    expect(planCommit({ kind: "spell-slot", minLevel: 3 }, { slotLevel: 1 })).toEqual([
      { op: "spend-spell-slot", level: 3 },
    ]);
  });

  it("tracker uses amount (default 1) or the overriding trackerAmount", () => {
    expect(planCommit({ kind: "tracker", trackerId: "rage" })).toEqual([
      { op: "spend-tracker", trackerId: "rage", amount: 1 },
    ]);
    expect(
      planCommit({ kind: "tracker", trackerId: "ki", amount: 2 }, { trackerAmount: 5 })
    ).toEqual([{ op: "spend-tracker", trackerId: "ki", amount: 5 }]);
  });

  it("free-cast and signature spend one charge of their tracker", () => {
    expect(planCommit({ kind: "free-cast", sourceId: "fey-touched" })).toEqual([
      { op: "spend-tracker", trackerId: "fey-touched", amount: 1 },
    ]);
    expect(planCommit({ kind: "signature", trackerId: "wizard-signature" })).toEqual([
      { op: "spend-tracker", trackerId: "wizard-signature", amount: 1 },
    ]);
  });

  it("equipment spends the item; mastery/ritual/none cost nothing", () => {
    expect(planCommit({ kind: "equipment", key: "healing-potion" })).toEqual([
      { op: "spend-equipment", key: "healing-potion" },
    ]);
    expect(planCommit({ kind: "mastery" })).toEqual([]);
    expect(planCommit({ kind: "ritual" })).toEqual([]);
    expect(planCommit({ kind: "none" })).toEqual([]);
  });

  it("appends a concentration op when the action starts concentration", () => {
    expect(
      planCommit(
        { kind: "spell-slot", minLevel: 1 },
        { startsConcentration: conc("bless") }
      )
    ).toEqual([
      { op: "spend-spell-slot", level: 1 },
      { op: "set-concentration", spell: conc("bless") },
    ]);
    // concentration can ride a no-cost cast too (a cantrip-like ritual)
    expect(
      planCommit({ kind: "none" }, { startsConcentration: conc("guidance") })
    ).toEqual([{ op: "set-concentration", spell: conc("guidance") }]);
  });
});

function mockStore() {
  const store: CommitStore & { conc: StoredConcentration } = {
    conc: "",
    useSpellSlot: vi.fn(),
    restoreSpellSlot: vi.fn(),
    useTracker: vi.fn(),
    restoreTracker: vi.fn(),
    useEquipmentItem: vi.fn(),
    restoreEquipmentItem: vi.fn(),
    getConcentration: vi.fn(() => store.conc),
    setConcentration: vi.fn((s: StoredConcentration) => {
      store.conc = s;
    }),
  };
  return store;
}

describe("applyCommitOps — apply + reverse-applier", () => {
  it("spends a slot and the reverse restores it", () => {
    const store = mockStore();
    const undo = applyCommitOps([{ op: "spend-spell-slot", level: 2 }], store);
    // The pactMagic flag is threaded through (undefined = the normal/shared pool).
    expect(store.useSpellSlot).toHaveBeenCalledWith(2, undefined);
    undo();
    expect(store.restoreSpellSlot).toHaveBeenCalledWith(2, undefined);
  });

  it("spends a tracker amount and reverses the same amount", () => {
    const store = mockStore();
    const undo = applyCommitOps(
      [{ op: "spend-tracker", trackerId: "lay-on-hands", amount: 10 }],
      store
    );
    expect(store.useTracker).toHaveBeenCalledWith("lay-on-hands", 10);
    undo();
    expect(store.restoreTracker).toHaveBeenCalledWith("lay-on-hands", 10);
  });

  it("snapshots prior concentration and restores it on undo", () => {
    const store = mockStore();
    store.conc = conc("hex");
    const undo = applyCommitOps(
      [{ op: "set-concentration", spell: conc("bless") }],
      store
    );
    expect(store.conc).toBe(conc("bless"));
    undo();
    expect(store.conc).toBe(conc("hex")); // restored to the spell that was active before
  });

  it("reverses multiple ops in reverse order", () => {
    const store = mockStore();
    const order: string[] = [];
    store.restoreSpellSlot = vi.fn(() => order.push("slot"));
    store.restoreTracker = vi.fn(() => order.push("tracker"));
    const undo = applyCommitOps(
      [
        { op: "spend-spell-slot", level: 1 },
        { op: "spend-tracker", trackerId: "x", amount: 1 },
      ],
      store
    );
    undo();
    expect(order).toEqual(["tracker", "slot"]); // reverse of apply order
  });

  it("end-to-end: plan a Smite-style slot + concentration, then undo cleanly", () => {
    const store = mockStore();
    store.conc = "";
    const cost: CostSpec = { kind: "spell-slot", minLevel: 1 };
    const ops = planCommit(cost, {
      slotLevel: 2,
      startsConcentration: conc("hold-person"),
    });
    const undo = applyCommitOps(ops, store);
    expect(store.useSpellSlot).toHaveBeenCalledWith(2, undefined);
    expect(store.conc).toBe(conc("hold-person"));
    undo();
    expect(store.restoreSpellSlot).toHaveBeenCalledWith(2, undefined);
    expect(store.conc).toBe("");
  });
});
