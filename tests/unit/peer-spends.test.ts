/**
 * The spends ledger for a hit from another device
 * (docs/architecture/2026-11-cross-device-hits.md). The hit's writer appends what
 * the hit spent on the target's sheet; every reader folds the pending entries; the
 * owner folds them into its sheet once, by id.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({}));

import { parsePeerSpends } from "@/lib/peer-spends-io";

import {
  foldPeerSpends,
  invertPeerSpends,
  pendingPeerSpends,
  PEER_SPENDS_CAP,
  type PeerSpend,
} from "@/lib/play/peer-spends";
import { sessionToCombatState } from "@/lib/combat-state";
import { peerHit } from "@/lib/play/peer-damage";
import type { CharacterDoc, CustomFeature, SessionState } from "@/types/character";

import { customInstanceId } from "./__helpers__/custom-items";

import { makeCharacterDoc } from "./_helpers";

const session = (extra: Partial<SessionState> = {}): SessionState =>
  makeCharacterDoc(
    {},
    { trackers: { ward: { used: 2 } }, activeFeatures: ["dodge"], ...extra }
  ).session;

const ward: PeerSpend = { id: "a", kind: "tracker", trackerId: "ward", amount: 10 };
const dodge: PeerSpend = { id: "b", kind: "state-end", key: "dodge" };

describe("folding the ledger into a sheet", () => {
  it("fills the pool and ends the state", () => {
    const folded = foldPeerSpends(session(), [ward, dodge]);
    expect(folded.trackers.ward?.used).toBe(12);
    expect(folded.activeFeatures).not.toContain("dodge");
  });

  it("skips entries the sheet already folded, so a repeat fold changes nothing", () => {
    const once = foldPeerSpends(session(), [ward, dodge]);
    const twice = foldPeerSpends(once, [ward, dodge]);
    expect(twice.trackers.ward?.used).toBe(12);
    expect(once.foldedPeerSpends).toEqual(["a", "b"]);
  });

  it("an undo's inverse nets to nothing, before or after the owner folded", () => {
    const inverse = invertPeerSpends([ward, dodge], (n) => `undo-${n}`);
    const together = foldPeerSpends(session(), [ward, dodge, ...inverse]);
    expect(together.trackers.ward?.used).toBe(2);
    expect(together.activeFeatures).toContain("dodge");
    const afterFold = foldPeerSpends(foldPeerSpends(session(), [ward, dodge]), inverse);
    expect(afterFold.trackers.ward?.used).toBe(2);
    expect(afterFold.activeFeatures).toContain("dodge");
  });

  it("a pool never goes below empty", () => {
    const inverse = invertPeerSpends([ward], () => "x");
    expect(
      foldPeerSpends(session({ trackers: {} }), inverse).trackers.ward
    ).toBeUndefined();
  });
});

describe("pending entries", () => {
  it("are those the sheet has not folded yet", () => {
    const folded = foldPeerSpends(session(), [ward]);
    expect(pendingPeerSpends(folded, [ward, dodge])).toEqual([dodge]);
  });

  it("the cap leaves room for a long session without the owner online", () => {
    expect(PEER_SPENDS_CAP).toBeGreaterThanOrEqual(128);
  });
});

describe("a hit from another device, with the ledger", () => {
  const wardFeature: CustomFeature = {
    custom: true,
    title: "Ward",
    emoji: "*",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    trackers: [{ id: "ward", label: "Ward", total: "15", recovery: "long-rest" }],
    grants: [{ type: "damage-absorb-pool", trackerId: "ward" }],
    instanceId: customInstanceId("ward-peer"),
  };
  const warded = (): CharacterDoc => {
    const doc = makeCharacterDoc({}, { hp: { current: 30, temp: 5 } });
    return {
      ...doc,
      character: { ...doc.character, hp: { max: 30 }, features: [wardFeature] },
    };
  };
  const ids = () => {
    let n = 0;
    return () => `e${++n}`;
  };

  it("the ward takes the hit and the hit records the ward's use", () => {
    const doc = warded();
    const hit = peerHit(doc, sessionToCombatState(doc.session), [], 10, {}, ids());
    expect(hit.state.hp).toEqual({ current: 30, temp: 5 });
    expect(hit.spends).toEqual([
      { id: "e1", kind: "tracker", trackerId: "ward", amount: 10 },
    ]);
  });

  it("a second hit reads the pending entry: the ward holds only what is left", () => {
    const doc = warded();
    const first = peerHit(doc, sessionToCombatState(doc.session), [], 10, {}, ids());
    const second = peerHit(doc, first.state, first.spends, 10, {}, ids());
    // 5 into the ward, 5 temporary.
    expect(second.state.hp).toEqual({ current: 30, temp: 0 });
    expect(second.spends[0]).toMatchObject({ kind: "tracker", amount: 5 });
  });

  it("a claimed Uncanny Dodge is used by the first hit only", () => {
    const base = makeCharacterDoc(
      { classId: "rogue", level: 5, features: [{ srdId: "rogue-uncanny-dodge" }] },
      { hp: { current: 40, temp: 0 }, activeFeatures: ["rogue-uncanny-dodge"] }
    );
    const doc = { ...base, character: { ...base.character, hp: { max: 40 } } };
    const first = peerHit(doc, sessionToCombatState(doc.session), [], 20, {}, ids());
    expect(first.state.hp.current).toBe(30);
    expect(first.spends).toContainEqual(
      expect.objectContaining({ kind: "state-end", key: "rogue-uncanny-dodge" })
    );
    const second = peerHit(doc, first.state, first.spends, 20, {}, ids());
    expect(second.state.hp.current).toBe(10);
  });

  it("a full ledger: the hit still lands, without the stages, and says so", () => {
    const doc = warded();
    const full: PeerSpend[] = Array.from({ length: PEER_SPENDS_CAP }, (_, i) => ({
      id: `old-${i}`,
      kind: "state-restore" as const,
      key: "x",
    }));
    const hit = peerHit(doc, sessionToCombatState(doc.session), full, 10, {}, ids());
    expect(hit.ledgerFull).toBe(true);
    expect(hit.spends).toEqual([]);
    expect(hit.state.hp).toEqual({ current: 25, temp: 0 });
  });
});

describe("Concentration entries", () => {
  it("are read from the ledger and inverted by an undo", () => {
    const end = { id: "e", kind: "concentration-end", spell: "haste" } as const;
    expect(
      parsePeerSpends({ entries: [end, { id: "x", kind: "concentration-end" }] })
    ).toEqual([end]);
    expect(invertPeerSpends([end], () => "r")).toEqual([
      { id: "r", kind: "concentration-restore", spell: "haste" },
    ]);
  });
});
