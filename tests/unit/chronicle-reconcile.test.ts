/**
 * chronicle-reconcile — the PURE correlation layer of the auto-narrated combat epic
 * (Phase 1 single-target + Phase 2 multi-target fusion). Proves the deterministic,
 * never-fabricated fusion of the players' declared actions with the DM's observed HP
 * deltas:
 *
 *  SINGLE-target:
 *   - declared HIT + a matching pending HP drop ⇒ CONFIRMED auto-attributed line (amount =
 *     the DM's real delta);
 *   - declared MISS ⇒ a CERTAIN synthesized miss line (no HP);
 *   - ambiguous match (>1 declarer) ⇒ UNCERTAIN-marked, never dropped, never invented;
 *   - a declared hit with NO delta ⇒ NO line (never fabricate an amount);
 *   - a delta with NO declaration ⇒ stays PENDING (the Phase-0 one-tap fallback).
 *
 *  MULTI-target (Phase 2):
 *   - a declared AoE HIT + the several drops the DM applied ⇒ ONE fused `attack-multi`
 *     line carrying each struck target's REAL amount; the individual drops are consumed;
 *   - a declared target with NO in-window drop ⇒ OMITTED (never an invented number);
 *   - drops that can't cleanly match the set (over the instance bound, or a competing
 *     declaration) ⇒ UNCERTAIN, and the instance bound caps how many drops it may claim;
 *   - a multi MISS ⇒ ONE line naming the whole set, no amounts.
 */
import { describe, it, expect } from "vitest";
import {
  reconcileChronicle,
  flattenDeclarations,
  type DeclaredAction,
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
): DeclaredAction => ({ id, attackerId, targetIds: [targetId], outcome: "hit", round });
const miss = (
  id: string,
  attackerId: string,
  targetId: string,
  round: number
): DeclaredAction => ({ id, attackerId, targetIds: [targetId], outcome: "miss", round });
const multiHit = (
  id: string,
  attackerId: string,
  targetIds: string[],
  round: number,
  instances?: number
): DeclaredAction => ({
  id,
  attackerId,
  targetIds,
  outcome: "hit",
  round,
  ...(instances !== undefined ? { instances } : {}),
});

describe("reconcileChronicle — HIT auto-attribution (confirmed)", () => {
  it("a declared hit + a matching pending delta ⇒ CONFIRMED, amount = the DM's delta", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 2, 8)],
      [hit("mara:1", "pc-mara", "monster-1", 2)]
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
      [hit("mara:1", "pc-mara", "monster-1", 2)] // declared round 2, delta round 3
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
      [hit("mara:1", "pc-mara", "monster-1", 2)]
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
    const out = reconcileChronicle([], [miss("mara:1", "pc-mara", "monster-1", 2)]);
    expect(out).toHaveLength(1);
    expect(out[0]?.auto).toBe(true);
    expect(out[0]?.uncertain).toBeUndefined();
    expect(out[0]?.event).toEqual({
      kind: "attack-miss",
      id: "miss-mara:1",
      round: 2,
      attackerId: "pc-mara",
      targetId: "monster-1",
    });
  });
});

describe("reconcileChronicle — never fabricate", () => {
  it("a declared hit with NO delta produces NO line (amount is never invented)", () => {
    const out = reconcileChronicle([], [hit("mara:1", "pc-mara", "monster-1", 2)]);
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
      [hit("bren:1", "pc-bren", "monster-1", 2), hit("mara:1", "pc-mara", "monster-1", 2)]
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
      [hit("mara:1", "pc-mara", "monster-1", 2)]
    );
    // Only the first delta pairs (1:1); it is certain. The second stays pending.
    expect(out[0]?.auto).toBe(true);
    expect(out[0]?.uncertain).toBeUndefined();
    expect(out[0]?.event).toMatchObject({ attackerId: "pc-mara" });
    expect(out[1]?.auto).toBeUndefined();
    expect(out[1]?.event).not.toHaveProperty("attackerId");
  });

  it("repeated declarations by the SAME attacker never reopen 'who hit?'", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 2, 5), dmg("1", "monster-1", 2, 3)],
      [hit("mara:1", "pc-mara", "monster-1", 2), hit("mara:2", "pc-mara", "monster-1", 2)]
    );

    expect(out).toHaveLength(2);
    expect(out.every((line) => line.auto === true)).toBe(true);
    expect(out.every((line) => line.uncertain === undefined)).toBe(true);
    expect(
      out.every(
        (line) => line.event.kind === "hp-damage" && line.event.attackerId === "pc-mara"
      )
    ).toBe(true);
  });
});

describe("reconcileChronicle — feed order (round-grouped, stable)", () => {
  it("miss lines slot into their round after the stored beats", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 1), dmg("1", "monster-1", 2)],
      [miss("mara:9", "pc-mara", "monster-1", 1)]
    );
    expect(out.map((r) => [r.event.round, r.event.kind])).toEqual([
      [1, "hp-damage"], // round-1 stored beat
      [1, "attack-miss"], // round-1 miss slots after it
      [2, "hp-damage"], // round-2 beat
    ]);
  });
});

describe("reconcileChronicle — MULTI-target fusion (Phase 2)", () => {
  it("a 3-target AoE HIT + 3 matching drops ⇒ ONE line with the 3 REAL amounts", () => {
    const out = reconcileChronicle(
      [
        dmg("0", "monster-1", 2, 22),
        dmg("1", "monster-2", 2, 22),
        dmg("2", "monster-3", 2, 11),
      ],
      [multiHit("cor:5", "pc-cor", ["monster-1", "monster-2", "monster-3"], 2, 3)]
    );
    // The three individual drops are FUSED into one summary line — never double-rendered.
    expect(out).toHaveLength(1);
    expect(out[0]?.auto).toBe(true);
    expect(out[0]?.uncertain).toBeUndefined();
    expect(out[0]?.event).toEqual({
      kind: "attack-multi",
      id: "multi-cor:5",
      round: 2,
      attackerId: "pc-cor",
      targetIds: ["monster-1", "monster-2", "monster-3"],
      amounts: [
        { targetId: "monster-1", amount: 22 },
        { targetId: "monster-2", amount: 22 },
        { targetId: "monster-3", amount: 11 },
      ],
    });
  });

  it("3 targets declared but only 2 drops ⇒ binds the 2, third OMITTED (not fabricated)", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 2, 22), dmg("1", "monster-2", 2, 18)],
      [multiHit("cor:5", "pc-cor", ["monster-1", "monster-2", "monster-3"], 2, 3)]
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.uncertain).toBeUndefined(); // a missing target is normal, not ambiguous
    expect(out[0]?.event).toMatchObject({
      kind: "attack-multi",
      amounts: [
        { targetId: "monster-1", amount: 22 },
        { targetId: "monster-2", amount: 18 },
      ],
    });
    // monster-3 (declared, no drop) never appears in the amounts — no invented number.
    const multi = out[0]?.event;
    if (multi?.kind !== "attack-multi") throw new Error("expected attack-multi");
    expect(multi.amounts.some((a) => a.targetId === "monster-3")).toBe(false);
  });

  it("the instance bound caps how many drops fuse; extra drops stay PENDING + mark UNCERTAIN", () => {
    // instances = 2, but THREE pending drops fall on the declared set this round.
    const out = reconcileChronicle(
      [
        dmg("0", "monster-1", 2, 10),
        dmg("1", "monster-1", 2, 10),
        dmg("2", "monster-2", 2, 5),
      ],
      [multiHit("cor:5", "pc-cor", ["monster-1", "monster-2"], 2, 2)]
    );
    // The fused line claims only the FIRST 2 (both on monster-1 = 20) — bound respected.
    const fused = out.find((r) => r.event.kind === "attack-multi");
    expect(fused?.uncertain).toBe(true); // more drops than the action can own
    if (fused?.event.kind !== "attack-multi") throw new Error("expected attack-multi");
    expect(fused.event.amounts).toEqual([{ targetId: "monster-1", amount: 20 }]);
    // The un-claimed 3rd drop (monster-2, 5) survives as its own PENDING line — never lost.
    const leftover = out.find((r) => r.event.kind === "hp-damage" && r.event.id === "2");
    expect(leftover?.auto).toBeUndefined();
    expect(leftover?.event).not.toHaveProperty("attackerId");
  });

  it("a competing declaration on a shared target/round marks the fused line UNCERTAIN", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 2, 22), dmg("1", "monster-2", 2, 11)],
      [
        multiHit("cor:5", "pc-cor", ["monster-1", "monster-2"], 2, 2),
        hit("bren:1", "pc-bren", "monster-1", 2), // another attacker claims monster-1
      ]
    );
    const fused = out.find((r) => r.event.kind === "attack-multi");
    expect(fused?.uncertain).toBe(true);
  });

  it("a multi-target MISS ⇒ ONE line naming the whole set, NO amounts", () => {
    const out = reconcileChronicle(
      [],
      [
        {
          id: "cor:5",
          attackerId: "pc-cor",
          targetIds: ["monster-1", "monster-2"],
          outcome: "miss",
          round: 2,
          instances: 3,
        },
      ]
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.event).toEqual({
      kind: "attack-multi",
      id: "multi-cor:5",
      round: 2,
      attackerId: "pc-cor",
      targetIds: ["monster-1", "monster-2"],
      amounts: [],
    });
  });

  it("a multi HIT that landed NO drop yet ⇒ NO line (never fabricate)", () => {
    const out = reconcileChronicle(
      [],
      [multiHit("cor:5", "pc-cor", ["monster-1", "monster-2"], 2, 3)]
    );
    expect(out).toEqual([]);
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

  it("keeps the target SET together, derives pc-<uid> ids + a stable (uid, action) id", () => {
    const out = flattenDeclarations({
      mara: state([{ id: "1", targetIds: ["monster-0"], outcome: "hit", round: 2 }]),
      cor: state([
        {
          id: "5",
          targetIds: ["monster-0", "monster-1"],
          outcome: "hit",
          round: 3,
          instances: 3,
        },
      ]),
      bren: state([{ id: "3", targetIds: ["monster-1"], outcome: "miss", round: 2 }]),
      absent: null,
      loading: undefined,
    });
    expect(out).toEqual([
      {
        id: "mara:1",
        attackerId: "pc-mara",
        targetIds: ["monster-0"],
        outcome: "hit",
        round: 2,
      },
      {
        id: "cor:5",
        attackerId: "pc-cor",
        targetIds: ["monster-0", "monster-1"],
        outcome: "hit",
        round: 3,
        instances: 3, // the multi-instance drop bound rides the flattened declaration
      },
      {
        id: "bren:3",
        attackerId: "pc-bren",
        targetIds: ["monster-1"],
        outcome: "miss",
        round: 2,
      },
    ]);
  });
});

// ─── Phase 3: AREA SAVE fusion (Fireball class) ──────────────────────────────

/** An area save-for-half declaration (Fireball class) — no attack roll, `save: true`. */
const saveDecl = (
  id: string,
  attackerId: string,
  targetIds: string[],
  round: number
): DeclaredAction => ({ id, attackerId, targetIds, outcome: "hit", round, save: true });

/** A DM-booked condition-gain event. */
const cond = (
  id: string,
  targetId: string,
  round: number,
  conditionId = "prone"
): CombatChronicleEvent => ({ id, round, kind: "condition-gain", targetId, conditionId });

/** A single-target hit that DECLARES an applied-condition rider (Topple → prone). */
const riderHit = (
  id: string,
  attackerId: string,
  targetId: string,
  round: number,
  riders: string[]
): DeclaredAction => ({
  id,
  attackerId,
  targetIds: [targetId],
  outcome: "hit",
  round,
  riders,
});

describe("reconcileChronicle — AREA SAVE fusion (Phase 3)", () => {
  it("some targets damaged (DM's real numbers), an un-dropped target logged as RESISTED", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 1, 22), dmg("1", "monster-2", 1, 11)],
      [saveDecl("mara:1", "pc-mara", ["monster-1", "monster-2", "monster-3"], 1)]
    );
    const save = out.find((r) => r.event.kind === "attack-save");
    expect(save).toBeDefined();
    if (save?.event.kind !== "attack-save") throw new Error("not a save line");
    expect(save.auto).toBe(true);
    expect(save.event.attackerId).toBe("pc-mara");
    // The DM's real per-target numbers — never invented.
    expect(save.event.amounts).toEqual([
      { targetId: "monster-1", amount: 22 },
      { targetId: "monster-2", amount: 11 },
    ]);
    // The declared target with no drop saved for no damage — positively logged.
    expect(save.event.resisted).toEqual(["monster-3"]);
    // The individual drops are FUSED — they no longer render as their own lines.
    expect(out.filter((r) => r.event.kind === "hp-damage")).toHaveLength(0);
  });

  it("every declared target damaged ⇒ resisted is EMPTY", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 1, 20), dmg("1", "monster-2", 1, 18)],
      [saveDecl("mara:1", "pc-mara", ["monster-1", "monster-2"], 1)]
    );
    const save = out.find((r) => r.event.kind === "attack-save");
    if (save?.event.kind !== "attack-save") throw new Error("not a save line");
    expect(save.event.amounts).toEqual([
      { targetId: "monster-1", amount: 20 },
      { targetId: "monster-2", amount: 18 },
    ]);
    expect(save.event.resisted).toEqual([]);
  });

  it("a save spell with NO drops yet ⇒ NO line (never fabricate resisted)", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-9", 2, 8)], // a drop in a DIFFERENT round — untouched
      [saveDecl("mara:1", "pc-mara", ["monster-1", "monster-2"], 1)]
    );
    expect(out.some((r) => r.event.kind === "attack-save")).toBe(false);
    // The unrelated drop stays pending (its own line), never claimed by the save.
    expect(out.filter((r) => r.event.kind === "hp-damage")).toHaveLength(1);
  });

  it("sums MULTIPLE drops the DM applied to one target within the round", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 1, 10), dmg("1", "monster-1", 1, 12)],
      [saveDecl("mara:1", "pc-mara", ["monster-1", "monster-2"], 1)]
    );
    const save = out.find((r) => r.event.kind === "attack-save");
    if (save?.event.kind !== "attack-save") throw new Error("not a save line");
    expect(save.event.amounts).toEqual([{ targetId: "monster-1", amount: 22 }]);
    expect(save.event.resisted).toEqual(["monster-2"]);
  });

  it("only claims drops in the SAME round — a later round's drop stays pending", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 1, 22), dmg("1", "monster-1", 2, 9)],
      [saveDecl("mara:1", "pc-mara", ["monster-1"], 1)]
    );
    const save = out.find((r) => r.event.kind === "attack-save");
    if (save?.event.kind !== "attack-save") throw new Error("not a save line");
    expect(save.event.amounts).toEqual([{ targetId: "monster-1", amount: 22 }]);
    // The round-2 drop is untouched.
    const pending = out.filter((r) => r.event.kind === "hp-damage");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.event.round).toBe(2);
  });

  it("a competing declaration on a shared target ⇒ UNCERTAIN", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 1, 22)],
      [
        saveDecl("mara:1", "pc-mara", ["monster-1", "monster-2"], 1),
        hit("bren:1", "pc-bren", "monster-1", 1),
      ]
    );
    const save = out.find((r) => r.event.kind === "attack-save");
    expect(save?.uncertain).toBe(true);
  });

  it("a lone save spell with no competitor is CERTAIN (no uncertain marker)", () => {
    const out = reconcileChronicle(
      [dmg("0", "monster-1", 1, 22)],
      [saveDecl("mara:1", "pc-mara", ["monster-1"], 1)]
    );
    const save = out.find((r) => r.event.kind === "attack-save");
    expect(save?.uncertain).toBeUndefined();
  });
});

describe("reconcileChronicle — CONDITION-RIDER correlation (Phase 3)", () => {
  it("credits a DM condition to the caster whose action RIDER applies it (same target+round)", () => {
    const out = reconcileChronicle(
      [cond("0", "monster-1", 2, "prone")],
      [riderHit("mara:1", "pc-mara", "monster-1", 2, ["prone"])]
    );
    const line = out.find((r) => r.event.kind === "condition-gain");
    if (line?.event.kind !== "condition-gain") throw new Error("no condition line");
    expect(line.event.attackerId).toBe("pc-mara");
    expect(line.auto).toBe(true);
    expect(line.uncertain).toBeUndefined();
  });

  it("a condition with NO matching declaration stays a PLAIN logged line", () => {
    const out = reconcileChronicle(
      [cond("0", "monster-1", 2, "poisoned")],
      [riderHit("mara:1", "pc-mara", "monster-1", 2, ["prone"])] // rider is prone, not poisoned
    );
    const line = out.find((r) => r.event.kind === "condition-gain");
    if (line?.event.kind !== "condition-gain") throw new Error("no condition line");
    expect(line.event.attackerId).toBeUndefined();
    expect(line.auto).toBeUndefined();
  });

  it("never credits from mere co-occurrence — a hit with no rider leaves the condition plain", () => {
    const out = reconcileChronicle(
      [cond("0", "monster-1", 2, "prone")],
      [hit("mara:1", "pc-mara", "monster-1", 2)] // declared, but no rider
    );
    const line = out.find((r) => r.event.kind === "condition-gain");
    if (line?.event.kind !== "condition-gain") throw new Error("no condition line");
    expect(line.event.attackerId).toBeUndefined();
  });

  it("a different round breaks the correlation", () => {
    const out = reconcileChronicle(
      [cond("0", "monster-1", 3, "prone")],
      [riderHit("mara:1", "pc-mara", "monster-1", 2, ["prone"])]
    );
    const line = out.find((r) => r.event.kind === "condition-gain");
    if (line?.event.kind !== "condition-gain") throw new Error("no condition line");
    expect(line.event.attackerId).toBeUndefined();
  });

  it("two casters with the same rider on the target ⇒ UNCERTAIN provenance", () => {
    const out = reconcileChronicle(
      [cond("0", "monster-1", 2, "prone")],
      [
        riderHit("mara:1", "pc-mara", "monster-1", 2, ["prone"]),
        riderHit("bren:1", "pc-bren", "monster-1", 2, ["prone"]),
      ]
    );
    const line = out.find((r) => r.event.kind === "condition-gain");
    if (line?.event.kind !== "condition-gain") throw new Error("no condition line");
    expect(line.event.attackerId).toBe("pc-bren"); // stable byId pick (bren:1 < mara:1)
    expect(line.uncertain).toBe(true);
  });
});

describe("flattenDeclarations — carries the Phase-3 save + rider fields", () => {
  it("threads `save` and `riders` from the ring onto the flattened declaration", () => {
    const states: Record<string, CombatState> = {
      mara: {
        hp: { current: 10, temp: 0 },
        conditions: [],
        initiativeRoll: null,
        deathSaves: { successes: 0, failures: 0 },
        round: 1,
        recentActions: [
          {
            id: "1",
            targetIds: ["monster-1", "monster-2"],
            outcome: "hit",
            round: 1,
            save: true,
          },
          {
            id: "2",
            targetIds: ["monster-3"],
            outcome: "hit",
            round: 1,
            riders: ["prone"],
          },
        ],
      },
    };
    expect(flattenDeclarations(states)).toEqual([
      {
        id: "mara:1",
        attackerId: "pc-mara",
        targetIds: ["monster-1", "monster-2"],
        outcome: "hit",
        round: 1,
        save: true,
      },
      {
        id: "mara:2",
        attackerId: "pc-mara",
        targetIds: ["monster-3"],
        outcome: "hit",
        round: 1,
        riders: ["prone"],
      },
    ]);
  });
});
