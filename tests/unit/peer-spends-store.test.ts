/**
 * The owner's sheet folds the spends ledger once
 * (docs/architecture/2026-11-cross-device-hits.md): the ward a DM's hit filled while
 * this device was away shows as used, a repeat snapshot changes nothing, and a
 * read-only viewer never folds. The ledger belongs to the character, not to a fight,
 * so it folds the same with no encounter running.
 */
import { beforeEach, describe, expect, it } from "vitest";

import type { PeerSpend } from "@/lib/play/peer-spends";
import { useCharacterStore } from "@/stores/characterStore";

import { makeCharacterDoc } from "./_helpers";

const store = () => useCharacterStore.getState();
const ward: PeerSpend = { id: "a", kind: "tracker", trackerId: "ward", amount: 10 };
const dodge: PeerSpend = { id: "b", kind: "state-end", key: "dodge" };

function load(readonly = false): void {
  const doc = makeCharacterDoc({}, { trackers: {}, activeFeatures: ["dodge"] });
  doc.id = `spends-${Math.random().toString(36).slice(2)}`;
  useCharacterStore.setState({ character: doc, readonly, loading: false, error: null });
}

describe("the owner's sheet folds the ledger", () => {
  beforeEach(() => useCharacterStore.setState({ character: null }));

  it("applies each entry once and returns them for removal", () => {
    load();
    expect(store().foldPeerSpends([ward, dodge])).toEqual([ward, dodge]);
    expect(store().character?.session.trackers.ward?.used).toBe(10);
    expect(store().character?.session.activeFeatures).not.toContain("dodge");
    // The same snapshot again (the removal not landed yet): nothing applies twice.
    store().foldPeerSpends([ward, dodge]);
    expect(store().character?.session.trackers.ward?.used).toBe(10);
  });

  it("an entry appended after the fold folds on the next snapshot", () => {
    load();
    store().foldPeerSpends([ward]);
    const later: PeerSpend = { id: "c", kind: "tracker", trackerId: "ward", amount: 3 };
    expect(store().foldPeerSpends([ward, later])).toEqual([ward, later]);
    expect(store().character?.session.trackers.ward?.used).toBe(13);
  });

  it("once removed from the ledger, its id is pruned from the sheet", () => {
    load();
    store().foldPeerSpends([ward]);
    const later: PeerSpend = { id: "c", kind: "tracker", trackerId: "ward", amount: 3 };
    store().foldPeerSpends([later]);
    expect(store().character?.session.foldedPeerSpends).toEqual(["c"]);
  });

  it("a read-only viewer never folds", () => {
    load(true);
    expect(store().foldPeerSpends([ward])).toEqual([]);
    expect(store().character?.session.trackers.ward).toBeUndefined();
  });
});
