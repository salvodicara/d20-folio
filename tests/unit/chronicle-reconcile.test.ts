/**
 * chronicle-reconcile — the PURE correlation layer of the auto-narrated combat epic.
 * Proves the deterministic, never-fabricated fusion of the players' declared attacks with
 * the DM's observed HP deltas:
 *
 *  - declared HIT + a matching pending HP drop ⇒ CONFIRMED auto-attributed line (amount =
 *    the DM's real delta);
 *  - declared MISS ⇒ a CERTAIN synthesized miss line (no HP);
 *  - ambiguous match (>1 declarer) ⇒ UNCERTAIN-marked, never dropped, never invented;
 *  - a declared hit with NO delta ⇒ NO line (never fabricate an amount);
 *  - a delta with NO declaration ⇒ stays PENDING (the Phase-0 one-tap fallback).
 */
import { describe, it, expect } from "vitest";
import {
  reconcileChronicle,
  flattenDeclarations,
  type DeclaredAttack,
} from "@/features/campaigns/chronicle-reconcile";
import type { CombatChronicleEvent } from "@/types/combat-chronicle";
import type { CombatState } from "@/types/combat-state";

/** A pending (un-attributed) monster damage event (narrowed to the hp-damage variant so
 *  a test can spread it and add `attackerId`/`attackerSkipped`). */
const dmg = (
  id: string,
  targetId: string,
  round: number,
  amount = 8
): Extract<CombatChronicleEvent, { kind: "hp-damage" }> => ({
  id,
  round,
  kind: "hp-damage",
  targetId,
  amount,
  current: 4,
  max: 12,
});

const hit = (
  id: string,
  attackerId: string,
  targetId: string,
  round: number
): DeclaredAttack => ({
  id,
  attackerId,
  targetId,
  outcome: "hit",
  round,
});
const miss = (
  id: string,
  attackerId: string,
  targetId: string,
  round: number
): DeclaredAttack => ({ id, attackerId, targetId, outcome: "miss", round });

describe("reconcileChronicle — HIT auto-attribution (confirmed)", () => {
  it("a declared hit + a matching pending delta ⇒ CONFIRMED, amount = the DM's delta", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 2, 8)],
      [hit("mara:1:monster-1", "pc-mara", "monster-1", 2)]
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.auto).toBe(true);
    expect(out[0]?.uncertain).toBeUndefined();
    expect(out[0]?.event).toMatchObject({
      kind: "hp-damage",
      attackerId: "pc-mara",
      amount: 8, // the DM's real delta, never invented
    });
  });

  it("only matches within the SAME (target, round) — a mismatched round stays pending", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 3)],
      [hit("mara:1:monster-1", "pc-mara", "monster-1", 2)] // declared round 2, delta round 3
    );
    // The delta is untouched (still pending); the round-2 hit found no delta → NO line.
    expect(out).toHaveLength(1);
    expect(out[0]?.auto).toBeUndefined();
    expect(out[0]?.event).not.toHaveProperty("attackerId");
  });

  it("a DM-attributed (or skipped) delta is NOT re-claimed by the auto layer", () => {
    const already: CombatChronicleEvent = {
      ...dmg("0", "monster-1", 2),
      attackerId: "pc-bren",
    };
    const skipped: CombatChronicleEvent = {
      ...dmg("1", "monster-1", 2),
      attackerSkipped: true,
    };
    const out = reconcileChronicle(
      [already, skipped],
      [hit("mara:1:monster-1", "pc-mara", "monster-1", 2)]
    );
    // Neither stored event is touched; the hit had no PENDING delta → no new line.
    expect(out).toHaveLength(2);
    expect(out[0]?.event).toMatchObject({ attackerId: "pc-bren" });
    expect(out[1]?.event).toMatchObject({ attackerSkipped: true });
    expect(out.every((r) => !r.auto)).toBe(true);
  });
});

describe("reconcileChronicle — MISS (certain, no HP)", () => {
  it("a declared miss ⇒ a CERTAIN synthesized attack-miss line", () => {
    const out = reconcileChronicle(
      [],
      [miss("mara:1:monster-1", "pc-mara", "monster-1", 2)]
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.auto).toBe(true);
    expect(out[0]?.uncertain).toBeUndefined();
    expect(out[0]?.event).toEqual({
      kind: "attack-miss",
      id: "miss-mara:1:monster-1",
      round: 2,
      attackerId: "pc-mara",
      targetId: "monster-1",
    });
  });
});

describe("reconcileChronicle — never fabricate", () => {
  it("a declared hit with NO delta produces NO line (amount is never invented)", () => {
    const out = reconcileChronicle(
      [],
      [hit("mara:1:monster-1", "pc-mara", "monster-1", 2)]
    );
    expect(out).toEqual([]);
  });

  it("a delta with NO declaration stays PENDING (the Phase-0 fallback is untouched)", () => {
    const out = reconcileChronicle([dmg("0", "monster-1", 2)], []);
    expect(out).toHaveLength(1);
    expect(out[0]?.auto).toBeUndefined();
    expect(out[0]?.event).not.toHaveProperty("attackerId");
  });
});

describe("reconcileChronicle — ambiguity ⇒ uncertain (never dropped/fabricated)", () => {
  it("two declarers on the same target/round ⇒ paired but UNCERTAIN-marked", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 2, 8), dmg("1", "monster-1", 2, 5)],
      [
        hit("bren:1:monster-1", "pc-bren", "monster-1", 2),
        hit("mara:1:monster-1", "pc-mara", "monster-1", 2),
      ]
    );
    expect(out).toHaveLength(2);
    // Both deltas are attributed (never dropped) with their REAL amounts, both uncertain.
    // Stable pairing by ascending declaration id (bren < mara).
    expect(out[0]?.event).toMatchObject({ amount: 8, attackerId: "pc-bren" });
    expect(out[1]?.event).toMatchObject({ amount: 5, attackerId: "pc-mara" });
    expect(out.every((r) => r.uncertain === true && r.auto === true)).toBe(true);
  });

  it("a SINGLE declarer with multiple deltas stays CERTAIN (one possible attacker)", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 2, 8), dmg("1", "monster-1", 2, 5)],
      [hit("mara:1:monster-1", "pc-mara", "monster-1", 2)]
    );
    // Only the first delta pairs (1:1); it is certain. The second stays pending.
    expect(out[0]?.auto).toBe(true);
    expect(out[0]?.uncertain).toBeUndefined();
    expect(out[0]?.event).toMatchObject({ attackerId: "pc-mara" });
    expect(out[1]?.auto).toBeUndefined();
    expect(out[1]?.event).not.toHaveProperty("attackerId");
  });
});

describe("reconcileChronicle — feed order (round-grouped, stable)", () => {
  it("miss lines slot into their round after the stored beats", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 1), dmg("1", "monster-1", 2)],
      [miss("mara:9:monster-1", "pc-mara", "monster-1", 1)]
    );
    expect(out.map((r) => [r.event.round, r.event.kind])).toEqual([
      [1, "hp-damage"], // round-1 stored beat
      [1, "attack-miss"], // round-1 miss slots after it
      [2, "hp-damage"], // round-2 beat
    ]);
  });
});

describe("flattenDeclarations — the per-member ring → declaration list", () => {
  const state = (recentActions: CombatState["recentActions"]): CombatState => ({
    hp: { current: 10, temp: 0 },
    conditions: [],
    initiativeRoll: null,
    deathSaves: { successes: 0, failures: 0 },
    round: 1,
    recentActions,
  });

  it("derives pc-<uid> attacker ids + a stable global id per (uid, action, target)", () => {
    const out = flattenDeclarations({
      mara: state([{ id: "1", targetIds: ["monster-0"], outcome: "hit", round: 2 }]),
      bren: state([{ id: "3", targetIds: ["monster-1"], outcome: "miss", round: 2 }]),
      absent: null,
      loading: undefined,
    });
    expect(out).toEqual([
      {
        id: "mara:1:monster-0",
        attackerId: "pc-mara",
        targetId: "monster-0",
        outcome: "hit",
        round: 2,
      },
      {
        id: "bren:3:monster-1",
        attackerId: "pc-bren",
        targetId: "monster-1",
        outcome: "miss",
        round: 2,
      },
    ]);
  });
});
