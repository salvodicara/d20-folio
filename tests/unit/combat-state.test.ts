/**
 * combat-state — the per-character combat-mutable state that gets ONE model home
 * (the `combat/state` subdoc). Two layers under test:
 *
 *  1. the PURE seam (`src/lib/combat-state.ts`): the initiative string↔number
 *     conversion, the session→CombatState projection, the parent-doc trio strip,
 *     and the two cheap change detectors the auto-save subscribers route on;
 *  2. the Firestore IO (`src/lib/combat-state-io.ts`) with Firebase fully mocked
 *     (no real rules — those ship in a later chunk): DEV_BYPASS no-ops, the
 *     merge write shape, and the absent-doc → `null` listener contract.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionState } from "@/types/character";
import type { CombatState } from "@/types/combat-state";
import {
  initiativeToNumber,
  initiativeToString,
  sessionToCombatState,
  omitCombatTrio,
  nonCombatSessionChanged,
  applyCombatToSession,
  defaultCombatState,
  reduceHpDelta,
  reduceDeathSave,
  reduceCondition,
  setHpAbsolute,
  setTempAbsolute,
  setInitiativeAbsolute,
} from "@/lib/combat-state";

function session(overrides: Partial<SessionState> = {}): SessionState {
  return {
    hp: { current: 20, temp: 4 },
    hitDice: { used: 1 },
    trackers: {},
    spellSlots: {},
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    concentration: "",
    initiative: "15",
    conditions: ["poisoned"],
    deathSucc: 1,
    deathFail: 2,
    inspiration: false,
    exhaustion: 0,
    pinnedActions: [],
    unpinnedActions: [],
    notes: "",
    logEntries: [],
    ...overrides,
  };
}

describe("combat-state — initiative conversion (cockpit string ↔ canonical number)", () => {
  it.each([
    ["", null],
    ["   ", null],
    ["15", 15],
    ["-3", -3],
    ["0", 0],
    ["not-a-number", null],
  ])("initiativeToNumber(%j) → %j", (input, expected) => {
    expect(initiativeToNumber(input)).toBe(expected);
  });

  it.each([
    [null, ""],
    [15, "15"],
    [0, "0"],
    [-3, "-3"],
  ])("initiativeToString(%j) → %j", (input, expected) => {
    expect(initiativeToString(input)).toBe(expected);
  });
});

describe("combat-state — session → CombatState projection", () => {
  it("projects the trio onto the canonical subdoc shape", () => {
    expect(sessionToCombatState(session())).toEqual<CombatState>({
      hp: { current: 20, temp: 4 },
      conditions: ["poisoned"],
      initiativeRoll: 15,
      deathSaves: { successes: 1, failures: 2 },
      round: 1,
    });
  });

  it("maps a blank initiative to canonical null", () => {
    expect(sessionToCombatState(session({ initiative: "" })).initiativeRoll).toBeNull();
  });
});

describe("combat-state — omitCombatTrio (the parent-doc serialization boundary)", () => {
  it("drops every combat-trio key, keeping every other serialized field", () => {
    const state = {
      hp: { current: 12, temp: 5 },
      conditions: ["poisoned"],
      initiative: "17",
      deathSucc: 1,
      deathFail: 2,
      currency: { gp: 5 },
      round: 3,
      notes: "keep me",
    };
    expect(omitCombatTrio(state)).toEqual({
      currency: { gp: 5 },
      round: 3,
      notes: "keep me",
    });
  });

  it("is a no-op on a state that already carries no combat trio (does not mutate input)", () => {
    const state = { currency: { gp: 5 }, round: 2 };
    const out = omitCombatTrio(state);
    expect(out).toEqual(state);
    expect(out).not.toBe(state); // returns a copy
  });
});

describe("combat-state — applyCombatToSession (the ONE trio-hydration merge)", () => {
  it("merges a combat subdoc's trio, clamping HP to the effective max + converting init", () => {
    const merged = applyCombatToSession(
      session({
        hp: { current: 1, temp: 1 },
        conditions: [],
        initiative: "",
        deathSucc: 0,
      }),
      {
        hp: { current: 999, temp: -5 }, // over-max + negative temp
        conditions: ["poisoned", "prone"],
        initiativeRoll: 18,
        deathSaves: { successes: 5, failures: 1 }, // over-3 success,
        round: 1,
      },
      30
    );
    expect(merged.hp).toEqual({ current: 30, temp: 0 }); // clamped to [0, 30] / floored
    expect(merged.conditions).toEqual(["poisoned", "prone"]);
    expect(merged.initiative).toBe("18"); // number → cockpit string
    expect(merged.deathSucc).toBe(3); // clamped to [0, 3]
    expect(merged.deathFail).toBe(1);
  });

  it("an ABSENT subdoc (null) defaults to FULL effective HP + empty trio, never 0", () => {
    const merged = applyCombatToSession(
      session({ hp: { current: 0, temp: 0 }, conditions: ["stunned"], deathSucc: 3 }),
      null,
      44
    );
    expect(merged.hp).toEqual({ current: 44, temp: 0 });
    expect(merged.conditions).toEqual([]);
    expect(merged.initiative).toBe("");
    expect(merged.deathSucc).toBe(0);
    expect(merged.deathFail).toBe(0);
  });

  it("preserves every NON-trio session field untouched", () => {
    const s = session({ notes: "keep me" });
    const merged = applyCombatToSession(s, null, 20);
    expect(merged.notes).toBe("keep me");
    expect(merged.hitDice).toBe(s.hitDice);
  });
});

const baseCombat: CombatState = {
  hp: { current: 18, temp: 5 },
  conditions: ["poisoned"],
  initiativeRoll: 12,
  deathSaves: { successes: 1, failures: 0 },
  round: 1,
};

// (The INIT-4 epoch gate is DELETED with the initiative SSOT: an encounter roll lives in
// the campaign's `encounterInit` table, which the DM resets atomically at fight start —
// a stale prior-fight roll is structurally impossible, no per-character stamp to gate.)

describe("combat-state — reduceHpDelta (the transactional HP read-modify-write math)", () => {
  it("damage absorbs temp first, then floors current at 0", () => {
    // temp 5 absorbs, 3 spills onto current 18 → 15; temp → 0.
    expect(reduceHpDelta(baseCombat, { kind: "damage", amount: 8 }, 20).hp).toEqual({
      current: 15,
      temp: 0,
    });
    // Massive hit floors current at 0 (never negative).
    expect(reduceHpDelta(baseCombat, { kind: "damage", amount: 99 }, 20).hp).toEqual({
      current: 0,
      temp: 0,
    });
  });

  it("heal clamps to the effective max and never touches temp", () => {
    expect(reduceHpDelta(baseCombat, { kind: "heal", amount: 4 }, 25).hp).toEqual({
      current: 22,
      temp: 5,
    });
    // Over-heal clamps to max.
    expect(reduceHpDelta(baseCombat, { kind: "heal", amount: 99 }, 20).hp.current).toBe(
      20
    );
  });

  it("leaves conditions / initiative / death saves untouched", () => {
    const next = reduceHpDelta(baseCombat, { kind: "damage", amount: 1 }, 20);
    expect(next.conditions).toBe(baseCombat.conditions);
    expect(next.initiativeRoll).toBe(12);
    expect(next.deathSaves).toBe(baseCombat.deathSaves);
  });

  it("healing FROM 0 HP resets death saves (RAW 2024 revive), so a revive can't keep marks", () => {
    const downed: CombatState = {
      hp: { current: 0, temp: 0 },
      conditions: ["prone"],
      initiativeRoll: 5,
      deathSaves: { successes: 1, failures: 2 },
      round: 1,
    };
    const next = reduceHpDelta(downed, { kind: "heal", amount: 6 }, 30);
    expect(next.hp.current).toBe(6);
    expect(next.deathSaves).toEqual({ successes: 0, failures: 0 });
    // Healing while still ALIVE (current > 0) never touches the (already-empty) saves.
    expect(reduceHpDelta(baseCombat, { kind: "heal", amount: 2 }, 30).deathSaves).toBe(
      baseCombat.deathSaves
    );
  });
});

describe("combat-state — reduceDeathSave (NESTED, capped [0,3])", () => {
  it("bumps the nested successes/failures by one", () => {
    expect(reduceDeathSave(baseCombat, "success").deathSaves).toEqual({
      successes: 2,
      failures: 0,
    });
    expect(reduceDeathSave(baseCombat, "failure").deathSaves).toEqual({
      successes: 1,
      failures: 1,
    });
  });

  it("caps at 3 (a 4th tick stays 3)", () => {
    const atThree: CombatState = {
      ...baseCombat,
      deathSaves: { successes: 3, failures: 3 },
    };
    expect(reduceDeathSave(atThree, "success").deathSaves.successes).toBe(3);
    expect(reduceDeathSave(atThree, "failure").deathSaves.failures).toBe(3);
  });
});

describe("combat-state — reduceCondition (idempotent + commutative)", () => {
  it("adds a new id, dedups an existing one (idempotent)", () => {
    expect(
      reduceCondition(baseCombat, { kind: "add", conditionId: "prone" }).conditions
    ).toEqual(["poisoned", "prone"]);
    // Already present → unchanged reference (no duplicate).
    expect(reduceCondition(baseCombat, { kind: "add", conditionId: "poisoned" })).toBe(
      baseCombat
    );
  });

  it("removes an id; removing an absent id is a no-op", () => {
    expect(
      reduceCondition(baseCombat, { kind: "remove", conditionId: "poisoned" }).conditions
    ).toEqual([]);
    expect(
      reduceCondition(baseCombat, { kind: "remove", conditionId: "stunned" }).conditions
    ).toEqual(["poisoned"]);
  });

  it("is commutative across two concurrent adds (order-independent set)", () => {
    const ab = reduceCondition(
      reduceCondition(baseCombat, { kind: "add", conditionId: "prone" }),
      { kind: "add", conditionId: "stunned" }
    );
    const ba = reduceCondition(
      reduceCondition(baseCombat, { kind: "add", conditionId: "stunned" }),
      { kind: "add", conditionId: "prone" }
    );
    expect([...ab.conditions].sort()).toEqual([...ba.conditions].sort());
  });
});

describe("combat-state — absolute setters (one field, clamped)", () => {
  it("setHpAbsolute clamps to [0, max] and leaves temp", () => {
    expect(setHpAbsolute(baseCombat, 99, 20).hp).toEqual({ current: 20, temp: 5 });
    expect(setHpAbsolute(baseCombat, -4, 20).hp).toEqual({ current: 0, temp: 5 });
  });

  it("setHpAbsolute from 0 → positive resets death saves (mirrors the cockpit setHP)", () => {
    const downed: CombatState = {
      ...baseCombat,
      hp: { current: 0, temp: 0 },
      deathSaves: { successes: 2, failures: 1 },
    };
    expect(setHpAbsolute(downed, 5, 20).deathSaves).toEqual({
      successes: 0,
      failures: 0,
    });
    // Setting an already-alive character keeps the (empty) saves untouched by reference.
    expect(setHpAbsolute(baseCombat, 10, 20).deathSaves).toBe(baseCombat.deathSaves);
  });

  it("setTempAbsolute floors at 0 and leaves current", () => {
    expect(setTempAbsolute(baseCombat, 9).hp).toEqual({ current: 18, temp: 9 });
    expect(setTempAbsolute(baseCombat, -2).hp).toEqual({ current: 18, temp: 0 });
  });

  it("setInitiativeAbsolute overwrites only the solo roll", () => {
    expect(setInitiativeAbsolute(baseCombat, 20).initiativeRoll).toBe(20);
    expect(setInitiativeAbsolute(baseCombat, null).initiativeRoll).toBeNull();
    expect(setInitiativeAbsolute(baseCombat, 20).hp).toBe(baseCombat.hp);
  });
});

describe("combat-state — defaultCombatState (the absent-subdoc full-HP seed)", () => {
  it("seeds full current HP at max, no temp / conditions / roll / death saves", () => {
    expect(defaultCombatState(30)).toEqual<CombatState>({
      hp: { current: 30, temp: 0 },
      conditions: [],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      round: 1,
    });
  });
});

describe("combat-state — nonCombatSessionChanged routes a transition to the right doc", () => {
  it("nonCombatSessionChanged: true iff a NON-trio field changed", () => {
    const a = session();
    expect(nonCombatSessionChanged(a, a)).toBe(false);
    expect(nonCombatSessionChanged(a, { ...a, notes: "x" })).toBe(true);
    expect(nonCombatSessionChanged(a, { ...a, trackers: { x: { used: 1 } } })).toBe(true);
    // A trio-ONLY change must NOT trigger a parent-doc save.
    expect(nonCombatSessionChanged(a, { ...a, hp: { current: 1, temp: 0 } })).toBe(false);
    expect(nonCombatSessionChanged(a, { ...a, conditions: ["prone"] })).toBe(false);
    expect(nonCombatSessionChanged(a, { ...a, initiative: "9" })).toBe(false);
    expect(nonCombatSessionChanged(a, { ...a, deathSucc: 3 })).toBe(false);
  });
});

// ── IO layer (Firebase mocked) ───────────────────────────────────────────────
//
// Every combat op persists through the OFFLINE-SAFE `setDoc(merge)` (NO transaction —
// a transaction requires a live server round-trip and rejects offline). `setDocMock`
// captures the payload so tests assert the field-locked whole-object shape.

const setDocMock = vi.fn(() => Promise.resolve());
let onSnapshotImpl: (
  ref: unknown,
  next: (snap: {
    exists: () => boolean;
    data: () => Record<string, unknown>;
    metadata: { hasPendingWrites: boolean };
  }) => void,
  err: (e: Error) => void
) => () => void = () => () => {};

/** The payload of the most recent `setDoc` (no non-null gymnastics). */
function lastSetPayload(): Record<string, unknown> {
  const call = setDocMock.mock.calls.at(-1);
  if (!call) throw new Error("setDoc was never called");
  return (call as unknown as [unknown, Record<string, unknown>])[1];
}

vi.mock("firebase/firestore", () => ({
  doc: (...segments: unknown[]) => ({ path: segments.slice(1).join("/") }),
  setDoc: (...args: unknown[]) => setDocMock(...(args as [])),
  onSnapshot: (ref: unknown, next: unknown, err: unknown) =>
    onSnapshotImpl(
      ref,
      next as (s: {
        exists: () => boolean;
        data: () => Record<string, unknown>;
        metadata: { hasPendingWrites: boolean };
      }) => void,
      err as (e: Error) => void
    ),
  // NB: NO `runTransaction` export — the offline bug was that a transaction rejects
  // offline; the fix uses only `setDoc`. If any op still reached for a transaction it
  // would throw here (undefined), so these tests pin the offline-queueable primitive.
  serverTimestamp: () => "server-ts",
}));
vi.mock("@/lib/firebase", () => ({ db: { _type: "firestore" } }));
const devBypass = { value: false };
vi.mock("@/lib/dev-bypass", () => ({
  get DEV_BYPASS_AUTH() {
    return devBypass.value;
  },
}));

import {
  writeCombatState,
  subscribeCombatState,
  combatStateRef,
  applyHpDelta,
  tickDeathSave,
  setCombatCondition,
  setCombatTempHp,
} from "@/lib/combat-state-io";

const COMBAT: CombatState = {
  hp: { current: 9, temp: 2 },
  conditions: ["prone"],
  initiativeRoll: 14,
  deathSaves: { successes: 1, failures: 0 },
  round: 1,
};

beforeEach(() => {
  setDocMock.mockClear();
  setDocMock.mockImplementation(() => Promise.resolve());
  devBypass.value = false;
  onSnapshotImpl = () => () => {};
});

describe("combat-state-io — write (last-write-wins overwrite)", () => {
  it("writes the trio + a server timestamp, OVERWRITING the subdoc", async () => {
    await writeCombatState("u1", "c1", COMBAT);
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const [ref, payload, options] = setDocMock.mock.calls[0] as unknown as [
      { path: string },
      Record<string, unknown>,
      { merge: boolean },
    ];
    expect(ref.path).toBe("users/u1/characters/c1/combat/state");
    expect(payload).toMatchObject({
      hp: { current: 9, temp: 2 },
      conditions: ["prone"],
      initiativeRoll: 14,
      deathSaves: { successes: 1, failures: 0 },
      updatedAt: "server-ts",
    });
    expect(options).toBeUndefined(); // OVERWRITE (no merge) — drops stray/legacy keys
  });

  it("is a no-op under DEV_BYPASS (optimistic in-memory update only)", async () => {
    devBypass.value = true;
    await writeCombatState("u1", "c1", COMBAT);
    expect(setDocMock).not.toHaveBeenCalled();
  });
});

describe("combat-state-io — subscribe", () => {
  it("delivers a parsed CombatState for an existing doc", () => {
    const received: Array<CombatState | null> = [];
    onSnapshotImpl = (_ref, next) => {
      next({
        exists: () => true,
        data: () => ({
          hp: { current: 5, temp: 1 },
          conditions: ["stunned"],
          initiativeRoll: 11,
          deathSaves: { successes: 2, failures: 1 },
        }),
        // Real Firestore snapshots always carry `metadata` (the remote-fence reads
        // `hasPendingWrites`); the fake mirrors that shape.
        metadata: { hasPendingWrites: false },
      });
      return () => {};
    };
    subscribeCombatState("u1", "c1", (s) => received.push(s));
    expect(received[0]).toEqual<CombatState>({
      hp: { current: 5, temp: 1 },
      conditions: ["stunned"],
      initiativeRoll: 11,
      deathSaves: { successes: 2, failures: 1 },
      round: 1,
    });
  });

  it("delivers null for an ABSENT doc (caller defaults to full HP)", () => {
    const received: Array<CombatState | null> = [];
    onSnapshotImpl = (_ref, next) => {
      next({
        exists: () => false,
        data: () => ({}),
        metadata: { hasPendingWrites: false },
      });
      return () => {};
    };
    subscribeCombatState("u1", "c1", (s) => received.push(s));
    expect(received[0]).toBeNull();
  });

  it("opens NO real listener under DEV_BYPASS", () => {
    devBypass.value = true;
    const spy = vi.fn();
    onSnapshotImpl = () => {
      spy();
      return () => {};
    };
    const unsub = subscribeCombatState("u1", "c1", () => {});
    expect(spy).not.toHaveBeenCalled();
    expect(typeof unsub).toBe("function");
  });

  it("combatStateRef targets the canonical subdoc path", () => {
    expect(combatStateRef("u1", "c1")).toEqual({
      path: "users/u1/characters/c1/combat/state",
    });
  });
});

describe("combat-state-io — base-reducing op helpers (offline-safe whole-object writes)", () => {
  const BASE: CombatState = {
    hp: { current: 20, temp: 3 },
    conditions: ["poisoned"],
    initiativeRoll: 14,
    deathSaves: { successes: 0, failures: 0 },
    round: 1,
  };

  /** Every op persists the EXACT field-locked shape via `setDoc(merge)` (no extra/missing
   *  keys) — the offline-queueable primitive, never a transaction. */
  function expectFieldLockedMerge(): void {
    const [, payload, options] = setDocMock.mock.calls.at(-1) as unknown as [
      unknown,
      Record<string, unknown>,
      { merge: boolean },
    ];
    expect(Object.keys(payload).sort()).toEqual([
      "conditions",
      "deathSaves",
      "hp",
      "initiativeRoll",
      "round",
      "updatedAt",
    ]);
    expect(payload.updatedAt).toBe("server-ts");
    expect(options).toBeUndefined(); // OVERWRITE (no merge) — drops stray/legacy keys
  }

  it("applyHpDelta reduces the given base and persists the FULL object via setDoc (overwrite)", async () => {
    await applyHpDelta("u1", "c1", BASE, { kind: "damage", amount: 7 }, 30);
    // The offline-queueable primitive was issued exactly once (NOT a transaction).
    expect(setDocMock).toHaveBeenCalledTimes(1);
    const payload = lastSetPayload();
    // temp 3 absorbs, 4 spills onto current 20 → 16; temp → 0.
    expect(payload.hp).toEqual({ current: 16, temp: 0 });
    expect(payload.conditions).toEqual(["poisoned"]);
    // Untouched fields (the roll) are PRESERVED, so an HP hit never clobbers a live roll.
    expect(payload.initiativeRoll).toBe(14);
    expectFieldLockedMerge();
  });

  it("REGRESSION (offline): the op DURABLY issues a setDoc even when the server write rejects — the edit is queued, not lost", async () => {
    // Simulate the write path being offline: the underlying firestore write would not
    // reach the server (its returned promise rejects). The FIX still ISSUES an
    // offline-queueable `setDoc` (Firestore records it in the local cache + replays on
    // reconnect) — the pre-fix `runTransaction` path never reached `setDoc` at all (and a
    // transaction rejects offline WITHOUT queuing), so the damage silently vanished.
    setDocMock.mockImplementationOnce(() => Promise.reject(new Error("unavailable")));
    await expect(
      applyHpDelta("u1", "c1", BASE, { kind: "damage", amount: 5 }, 30)
    ).rejects.toThrow("unavailable");
    // The durable write WAS issued (queued) with the reduced HP — the op did not silently
    // drop the edit onto a transaction that offline rejects before writing anything.
    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(lastSetPayload().hp).toEqual({ current: 18, temp: 0 });
  });

  it("a NULL base (ABSENT subdoc) seeds the full-HP default THEN applies the op", async () => {
    await applyHpDelta("u1", "c1", null, { kind: "damage", amount: 5 }, 24);
    // default full HP 24 → damage 5 → 19 (proves the absent-doc default-then-reduce, and a
    // FRESH write lands a rules-valid full shape).
    expect(lastSetPayload().hp).toEqual({ current: 19, temp: 0 });
    expectFieldLockedMerge();
  });

  // (setCombatInitiative is DELETED: an encounter roll is a campaign-doc field-path
  // write — `campaign-io.setEncounterInitiative` — never a whole-subdoc rewrite, so
  // "rolling clobbers a wound" is unrepresentable.)

  it("applyHpDelta heal clamps to the client-passed effectiveMaxHp", async () => {
    const low: CombatState = { ...BASE, hp: { current: 10, temp: 0 } };
    await applyHpDelta("u1", "c1", low, { kind: "heal", amount: 99 }, 18);
    expect((lastSetPayload().hp as { current: number }).current).toBe(18);
  });

  it("tickDeathSave bumps the NESTED count and caps at 3", async () => {
    const downed: CombatState = {
      ...BASE,
      hp: { current: 0, temp: 0 },
      deathSaves: { successes: 3, failures: 1 },
    };
    await tickDeathSave("u1", "c1", downed, "success", 20);
    expect(lastSetPayload().deathSaves).toEqual({ successes: 3, failures: 1 }); // capped
    expectFieldLockedMerge();
  });

  it("setCombatCondition add is idempotent and writes the full object", async () => {
    await setCombatCondition(
      "u1",
      "c1",
      BASE,
      { kind: "add", conditionId: "stunned" },
      20
    );
    expect(lastSetPayload().conditions).toEqual(["poisoned", "stunned"]);
  });

  it("setCombatTempHp sets temp and keeps current + the rest of the base", async () => {
    await setCombatTempHp("u1", "c1", BASE, 7, 20);
    const payload = lastSetPayload();
    expect(payload.hp).toEqual({ current: 20, temp: 7 });
    expect(payload.conditions).toEqual(["poisoned"]);
    expectFieldLockedMerge();
  });

  it("every op is a no-op under DEV_BYPASS (optimistic store only, no write)", async () => {
    devBypass.value = true;
    await applyHpDelta("u1", "c1", BASE, { kind: "damage", amount: 5 }, 20);
    await tickDeathSave("u1", "c1", BASE, "success", 20);
    await setCombatCondition("u1", "c1", BASE, { kind: "add", conditionId: "prone" }, 20);
    await setCombatTempHp("u1", "c1", BASE, 5, 20);
    expect(setDocMock).not.toHaveBeenCalled();
  });
});
