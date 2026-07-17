/**
 * encounter — the PURE group-initiative reducers (in-hub tracker). Pure (no Firebase),
 * so this is a plain unit suite. After the single-source reshape a PC combatant is a
 * PURE REFERENCE (uid + character id) — its statline is read LIVE elsewhere — so the
 * reducers here own MONSTER state, the table membership, and the STABLE current-turn
 * pointer. Exercises: pure-ref seeding, monster token seeding + HP clamp, the
 * monster-only edits (PC branch is a no-op), `sortByInitiative` (null-last, tie-stable),
 * id-based turn advance/prev with round wrap both ways, condition toggle, remove +
 * pointer repoint, the hidden flag, end, and the monster `isDown` helper.
 */
import { describe, it, expect } from "vitest";
import {
  startEncounter,
  addMonster,
  removeCombatant,
  setHidden,
  setInitiative,
  setMonsterNotes,
  setRevealed,
  applyHp,
  setHp,
  toggleCondition,
  advanceTurn,
  beginEncounterTurns,
  freezeOrder,
  prevTurn,
  reorderCombatant,
  endEncounter,
  sortByInitiative,
  isDown,
  pcEncounterCampaignId,
  uidEncounterCampaignId,
  viewerActiveEncounters,
  type EncounterPcSeed,
} from "@/features/campaigns/encounter";
import type {
  CampaignDoc,
  EncounterState,
  EncounterPc,
  EncounterMonster,
} from "@/types/campaign";
import { assertNonEmptyString } from "@/lib/non-empty-string";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function seed(characterId = "char-mara"): EncounterPcSeed {
  return { characterId };
}

/** A two-PC encounter (mara, bren) for the turn-order / edit tests. */
function twoPcs(): EncounterState {
  return startEncounter(
    { mara: seed("char-mara"), bren: seed("char-bren") },
    ["mara", "bren"],
    100
  );
}

const pc = (s: EncounterState, id: string): EncounterPc => {
  const c = s.combatants.find((x): x is EncounterPc => x.id === id && x.kind === "pc");
  if (!c) throw new Error(`no pc ${id}`);
  return c;
};
const monster = (s: EncounterState, id: string): EncounterMonster => {
  const c = s.combatants.find(
    (x): x is EncounterMonster => x.id === id && x.kind === "monster"
  );
  if (!c) throw new Error(`no monster ${id}`);
  return c;
};

function goblins(state = twoPcs(), over: Partial<Parameters<typeof addMonster>[1]> = {}) {
  return addMonster(state, {
    name: "Goblin",
    ac: 13,
    maxHp: 7,
    count: 3,
    initiative: 12,
    ...over,
  });
}

// ─── startEncounter ──────────────────────────────────────────────────────────

describe("startEncounter — seed PC REFERENCES (no statline copy)", () => {
  it("seeds a pure reference: kind/id/memberUid/characterId and NOTHING else", () => {
    const state = startEncounter({ mara: seed() }, ["mara"], 100);
    expect(state.round).toBe(1);
    expect(state.status).toBe("active");
    expect(state.epoch).toBe(100); // the per-encounter stamp
    // Starts in the GATHERING-INITIATIVE phase (no current turn until the DM begins).
    expect(state.currentCombatantId).toBeNull();
    const c = pc(state, "pc-mara");
    expect(c).toEqual({
      kind: "pc",
      id: "pc-mara",
      memberUid: "mara",
      characterId: "char-mara",
    });
    // The single-source guard: no copied statline fields leak onto the reference.
    for (const k of ["name", "ac", "maxHp", "currentHp", "initiative", "conditions"]) {
      expect(c).not.toHaveProperty(k);
    }
  });

  it("follows uidsInOrder, skips a uid with no seed, no turn until begun", () => {
    const state = startEncounter(
      { mara: seed("char-mara"), bren: seed("char-bren") },
      ["bren", "mara", "ghost"],
      100
    );
    expect(state.combatants.map((c) => c.id)).toEqual(["pc-bren", "pc-mara"]);
    expect(state.currentCombatantId).toBeNull(); // gathering initiative
  });

  it("an empty table has a null current pointer", () => {
    const state = startEncounter({}, [], 100);
    expect(state.combatants).toHaveLength(0);
    expect(state.currentCombatantId).toBeNull();
  });
});

describe("freezeOrder — snapshot the turn order onto the doc", () => {
  it("sets `order` to the live ids, filtering out any that no longer exist, without moving the pointer", () => {
    const state = goblins(); // two PCs + Goblin (monster-1); gathering (current null)
    const frozen = freezeOrder(state, ["monster-1", "pc-mara", "ghost-99", "pc-bren"]);
    // "ghost-99" isn't a combatant → dropped so the frozen order carries no dangling id.
    expect(frozen.order).toEqual(["monster-1", "pc-mara", "pc-bren"]);
    // Purely records the sequence — the current-turn pointer is untouched.
    expect(frozen.currentCombatantId).toBe(state.currentCombatantId);
  });
});

describe("beginEncounterTurns — leave the gathering phase", () => {
  it("freezes the order AND points the turn at its top; idempotent + tolerant", () => {
    const gathering = twoPcs();
    expect(gathering.currentCombatantId).toBeNull();
    const begun = beginEncounterTurns(gathering, ["pc-bren", "pc-mara"]);
    expect(begun.currentCombatantId).toBe("pc-bren"); // top of the order
    expect(begun.order).toEqual(["pc-bren", "pc-mara"]); // FROZEN onto the doc
    // Re-pressing once turns have begun is a no-op (never re-freezes the running fight).
    expect(beginEncounterTurns(begun, ["pc-mara", "pc-bren"])).toBe(begun);
    // Empty order is a tolerant no-op (nothing to begin — stays gathering, order unset).
    expect(beginEncounterTurns(gathering, [])).toBe(gathering);
  });
});

// ─── addMonster ──────────────────────────────────────────────────────────────

describe("addMonster — token seeding (genuine encounter state)", () => {
  it("seeds `count` tokens each at full maxHp with a typed initiative", () => {
    const m = monster(goblins(), "monster-1");
    expect(m.kind).toBe("monster");
    expect(m.name).toBe("Goblin");
    expect(m.tokens).toEqual([7, 7, 7]);
    expect(m.maxHp).toBe(7);
    expect(m.initiative).toBe(12);
    // No notes passed → no `notes` field stored (doc stays minimal).
    expect(m).not.toHaveProperty("notes");
  });

  it("stores trimmed `notes` only when non-empty", () => {
    expect(
      monster(goblins(twoPcs(), { notes: "  Ambush from the trees  " }), "monster-1")
        .notes
    ).toBe("Ambush from the trees");
    expect(monster(goblins(twoPcs(), { notes: "   " }), "monster-1")).not.toHaveProperty(
      "notes"
    );
  });

  it("accepts a blank initiative and floors count to 1", () => {
    const m = monster(
      addMonster(twoPcs(), {
        name: "Ogre",
        ac: 11,
        maxHp: 59,
        count: 0,
        initiative: null,
      }),
      "monster-1"
    );
    expect(m.tokens).toEqual([59]);
    expect(m.initiative).toBeNull();
  });

  it("appends a mid-combat reinforcement to the FROZEN order (never orphaned)", () => {
    // Turns have begun (order frozen) → a monster added now must join the turn order.
    const begun = beginEncounterTurns(twoPcs(), ["pc-mara", "pc-bren"]);
    const after = goblins(begun, { count: 1 });
    expect(after.order).toEqual(["pc-mara", "pc-bren", "monster-1"]);
    // Before turns begin (no/empty order), adding leaves the order unset (set fresh at Begin).
    expect(goblins(twoPcs(), { count: 1 }).order).toBeUndefined();
  });

  it("assigns collision-free monster ids across adds (no RNG)", () => {
    let s = goblins(twoPcs(), { count: 1 });
    s = addMonster(s, { name: "Wolf", ac: 13, maxHp: 11, count: 1, initiative: 8 });
    expect(s.combatants.filter((c) => c.kind === "monster").map((c) => c.id)).toEqual([
      "monster-1",
      "monster-2",
    ]);
    s = removeCombatant(s, "monster-1");
    s = addMonster(s, { name: "Bear", ac: 12, maxHp: 34, count: 1, initiative: 6 });
    expect(s.combatants.filter((c) => c.kind === "monster").map((c) => c.id)).toEqual([
      "monster-2",
      "monster-3",
    ]);
  });
});

// ─── Monster HP edits (clamp) + PC no-op ──────────────────────────────────────

describe("applyHp / setHp — monster token clamp to [0, maxHp]; PC is a no-op", () => {
  it.each([
    [-5, 0],
    [3, 3],
    [100, 7],
  ])("setHp on a monster token to %i (maxHp 7) → %i", (value, expected) => {
    const state = setHp(goblins(), "monster-1", 1, value);
    expect(monster(state, "monster-1").tokens).toEqual([7, expected, 7]);
  });

  it("applyHp targets the right monster token and leaves siblings untouched", () => {
    const state = applyHp(goblins(), "monster-1", 2, -7); // kill the third token
    expect(monster(state, "monster-1").tokens).toEqual([7, 7, 0]);
  });

  it("an out-of-range token index is a no-op (immutably copies)", () => {
    const state = goblins(twoPcs(), { count: 2 });
    expect(monster(setHp(state, "monster-1", 9, 0), "monster-1").tokens).toEqual([7, 7]);
  });

  it("a PC HP edit is a no-op — live HP lives in the combat/state subdoc", () => {
    const state = twoPcs();
    expect(setHp(state, "pc-mara", 0, 5)).toEqual(state);
    expect(applyHp(state, "pc-mara", 0, -5)).toEqual(state);
    // The reference is untouched (no currentHp ever materializes).
    expect(pc(setHp(state, "pc-mara", 0, 5), "pc-mara")).not.toHaveProperty("currentHp");
  });

  it("a missing combatant id leaves state untouched (same reference)", () => {
    const state = twoPcs();
    expect(applyHp(state, "nope", 0, -5)).toBe(state);
  });
});

// ─── Initiative (monster) + sortByInitiative ──────────────────────────────────

describe("setInitiative (monster) + sortByInitiative", () => {
  it("rounds a typed monster value and clears with null; a PC is a no-op", () => {
    let state = goblins();
    state = setInitiative(state, "monster-1", 17.6);
    expect(monster(state, "monster-1").initiative).toBe(18);
    state = setInitiative(state, "monster-1", null);
    expect(monster(state, "monster-1").initiative).toBeNull();
    // PC initiative is read live, so the reducer never writes it.
    expect(setInitiative(twoPcs(), "pc-mara", 15)).toEqual(twoPcs());
  });

  it("sortByInitiative orders DESC with blanks last + a deterministic id tiebreak", () => {
    // Live `{ id, initiative }` items — PC init comes live, monster from the doc.
    const order = sortByInitiative([
      { id: "a", initiative: 12 },
      { id: "b", initiative: null },
      { id: "c", initiative: 20 },
      { id: "d", initiative: 12 }, // tie with a → id tiebreak keeps a < d
      { id: "e", initiative: null }, // both-null → id tiebreak keeps b < e
    ]);
    expect(order.map((o) => o.id)).toEqual(["c", "a", "d", "b", "e"]);
  });

  it("sortByInitiative is a TOTAL order — the id tiebreak ignores input order", () => {
    // Input order is REVERSED vs id order; the tiebreak must still sort by id (no
    // reliance on V8 stability / the random Firestore key-iteration order) so the
    // turn order never churns render-to-render.
    const equal = sortByInitiative([
      { id: "z", initiative: 10 },
      { id: "m", initiative: 10 },
      { id: "a", initiative: 10 },
    ]);
    expect(equal.map((o) => o.id)).toEqual(["a", "m", "z"]);
    const blanks = sortByInitiative([
      { id: "z", initiative: null },
      { id: "a", initiative: null },
    ]);
    expect(blanks.map((o) => o.id)).toEqual(["a", "z"]);
  });

  it("does not mutate the input array", () => {
    const items = [
      { id: "a", initiative: 1 },
      { id: "b", initiative: 9 },
    ];
    const before = items.slice();
    sortByInitiative(items);
    expect(items).toEqual(before);
  });
});

// ─── Turn order — id-based pointer ────────────────────────────────────────────

describe("advanceTurn / prevTurn — step the FROZEN order, round wrap both directions", () => {
  // A begun two-PC encounter with the order frozen onto the doc (the single home advance
  // reads from — no caller-supplied order any more).
  const begun = (current = "pc-mara", round = 1): EncounterState => ({
    ...twoPcs(),
    order: ["pc-mara", "pc-bren"],
    currentCombatantId: current,
    round,
  });

  it("advances along the frozen `order`, then increments the round and wraps to the first", () => {
    let state = begun();
    state = advanceTurn(state);
    expect(state).toMatchObject({ currentCombatantId: "pc-bren", round: 1 });
    state = advanceTurn(state); // past the last → round 2, wrap to first
    expect(state).toMatchObject({ currentCombatantId: "pc-mara", round: 2 });
  });

  it("steps back, wrapping to the last and decrementing the round", () => {
    let state = begun("pc-bren", 3);
    state = prevTurn(state);
    expect(state).toMatchObject({ currentCombatantId: "pc-mara", round: 3 });
    state = prevTurn(state); // from the first → last, round decrements
    expect(state).toMatchObject({ currentCombatantId: "pc-bren", round: 2 });
  });

  it("prevTurn floors the round at 1", () => {
    const state = prevTurn(begun("pc-mara", 1));
    expect(state).toMatchObject({ currentCombatantId: "pc-bren", round: 1 });
  });

  it("advance/prev are no-ops when the order is unset/empty (turns not begun)", () => {
    const gathering = twoPcs(); // no `order` field yet
    expect(advanceTurn(gathering)).toBe(gathering);
    expect(prevTurn(gathering)).toBe(gathering);
    const emptyOrder: EncounterState = { ...twoPcs(), order: [] };
    expect(advanceTurn(emptyOrder)).toBe(emptyOrder);
    expect(prevTurn(emptyOrder)).toBe(emptyOrder);
  });

  it("DEAD-MONSTER SKIP: advancing passes over a fully-defeated monster, never a PC", () => {
    // Order pc-mara → Goblin(monster-1, all tokens dead) → pc-bren. From pc-mara, advance
    // skips the corpse and lands on pc-bren (combat doesn't pause on a dead monster).
    let state = goblins(twoPcs(), { count: 1, initiative: 12 });
    state = setHp(state, "monster-1", 0, 0); // kill the lone token
    state = {
      ...state,
      order: ["pc-mara", "monster-1", "pc-bren"],
      currentCombatantId: "pc-mara",
    };
    expect(advanceTurn(state)).toMatchObject({
      currentCombatantId: "pc-bren",
      round: 1,
    });
  });

  it("a downed PC is NEVER skipped — it still takes its turn (death saves)", () => {
    // The reducer can't see PC HP (it lives in the combat/state subdoc), so a PC is never
    // in the skip set: advancing always lands on the next PC in order, downed or not.
    const state: EncounterState = {
      ...twoPcs(),
      order: ["pc-mara", "pc-bren"],
      currentCombatantId: "pc-mara",
    };
    expect(advanceTurn(state).currentCombatantId).toBe("pc-bren");
  });

  it("an all-dead-monster order self-limits to a no-op (no infinite loop)", () => {
    // Two dead Goblins, no live target → advance returns the same state rather than looping.
    let state = startEncounter({}, [], 100);
    state = addMonster(state, { name: "G1", ac: 13, maxHp: 7, count: 1, initiative: 5 });
    state = addMonster(state, { name: "G2", ac: 13, maxHp: 7, count: 1, initiative: 4 });
    state = setHp(state, "monster-1", 0, 0);
    state = setHp(state, "monster-2", 0, 0);
    state = {
      ...state,
      order: ["monster-1", "monster-2"],
      currentCombatantId: "monster-1",
    };
    expect(advanceTurn(state)).toBe(state);
  });

  it("a live reorder does NOT change whose turn it is (id pointer over the frozen order)", () => {
    // The frozen order is locked at Begin-turns; a later live initiative change never moves
    // the pointer — only an explicit step does.
    const state = begun("pc-bren");
    expect(advanceTurn(state).currentCombatantId).toBe("pc-mara"); // bren → next in order
    expect(state.currentCombatantId).toBe("pc-bren"); // pointer itself never mutated
  });
});

// ─── reorderCombatant — DM drag-to-reorder the frozen order ───────────────────

describe("reorderCombatant — move within the FROZEN order, pointer pinned", () => {
  // A begun encounter with a 4-id frozen order; current sits on b (so we can prove the
  // pointer never moves under a reorder).
  const begun = (): EncounterState => ({
    ...startEncounter({}, [], 100),
    combatants: [
      { kind: "pc", id: "a", memberUid: "a", characterId: "ca" },
      { kind: "pc", id: "b", memberUid: "b", characterId: "cb" },
      { kind: "pc", id: "c", memberUid: "c", characterId: "cc" },
      { kind: "pc", id: "d", memberUid: "d", characterId: "cd" },
    ],
    order: ["a", "b", "c", "d"],
    currentCombatantId: "b",
  });

  it.each<[string, string | null, string[]]>([
    // [moved, before, expected order]
    ["d", "a", ["d", "a", "b", "c"]], // drag d up to the very top
    ["a", "c", ["b", "a", "c", "d"]], // drag a down to just before c
    ["a", null, ["b", "c", "d", "a"]], // drop a at the END (beforeId null)
    ["c", "b", ["a", "c", "b", "d"]], // swap c just ahead of b
  ])("moves %s before %s → %j (current stays b)", (moved, before, expected) => {
    const next = reorderCombatant(begun(), moved, before);
    expect(next.order).toEqual(expected);
    // The pointer is PINNED — reordering never changes whose turn it is.
    expect(next.currentCombatantId).toBe("b");
  });

  it("is a no-op (same reference) for an absent id, a self-drop, or an unfrozen order", () => {
    const state = begun();
    expect(reorderCombatant(state, "ghost", "a")).toBe(state); // moved not in order
    expect(reorderCombatant(state, "a", "ghost")).toBe(state); // target not in order
    expect(reorderCombatant(state, "a", "a")).toBe(state); // self-drop
    // Dropping onto its own current slot is a no-op (b is already before c).
    expect(reorderCombatant(state, "b", "c")).toBe(state);
    // Before turns begin (no order) there's nothing to reorder.
    const gathering: EncounterState = { ...state, order: undefined };
    expect(reorderCombatant(gathering, "a", "b")).toBe(gathering);
  });
});

// ─── removeCombatant — pointer repoint ────────────────────────────────────────

describe("removeCombatant", () => {
  it("drops the combatant and repoints the current pointer to the next survivor", () => {
    const state = { ...twoPcs(), currentCombatantId: "pc-mara" };
    const after = removeCombatant(state, "pc-mara");
    expect(after.combatants.map((c) => c.id)).toEqual(["pc-bren"]);
    expect(after.currentCombatantId).toBe("pc-bren"); // stepped to the survivor
  });

  it("leaves the pointer alone when a NON-current combatant is removed", () => {
    const state = { ...twoPcs(), currentCombatantId: "pc-mara" };
    expect(removeCombatant(state, "pc-bren").currentCombatantId).toBe("pc-mara");
  });

  it("nulls the pointer when the table empties", () => {
    let state = startEncounter({ mara: seed() }, ["mara"], 100);
    state = removeCombatant(state, "pc-mara");
    expect(state.combatants).toHaveLength(0);
    expect(state.currentCombatantId).toBeNull();
  });

  it("is a no-op (same reference) for an unknown id", () => {
    const state = twoPcs();
    expect(removeCombatant(state, "nope")).toBe(state);
  });

  it("splices the removed id out of the FROZEN order and repoints within it", () => {
    // Order pc-mara → monster-1 → pc-bren, current on the monster about to be removed.
    let state = goblins(twoPcs(), { count: 1 });
    state = {
      ...state,
      order: ["pc-mara", "monster-1", "pc-bren"],
      currentCombatantId: "monster-1",
    };
    const after = removeCombatant(state, "monster-1");
    expect(after.order).toEqual(["pc-mara", "pc-bren"]); // no dangling id in the order
    // The survivor that inherits the removed slot (now index 1) becomes current.
    expect(after.currentCombatantId).toBe("pc-bren");
  });

  it("bumps the round when removing the current combatant wraps the pointer to the top (B17)", () => {
    // Order pc-mara → monster-1, current on the LAST slot (monster-1) — removing it
    // wraps the pointer to the top exactly like advanceTurn's last→first step, which
    // increments the round. The round counter must not under-count that lap.
    let state = goblins(twoPcs(), { count: 1 });
    state = {
      ...state,
      order: ["pc-mara", "monster-1"],
      currentCombatantId: "monster-1",
      round: 3,
    };
    const after = removeCombatant(state, "monster-1");
    expect(after.order).toEqual(["pc-mara"]);
    expect(after.currentCombatantId).toBe("pc-mara"); // wraps to the top
    expect(after.round).toBe(4); // ...and the wrap counts as a new round
  });
});

// ─── Hidden (DM ambush) ───────────────────────────────────────────────────────

describe("setHidden — DM ambush flag", () => {
  it("toggles the hidden flag on a monster", () => {
    let state = goblins();
    state = setHidden(state, "monster-1", true);
    expect(monster(state, "monster-1").hidden).toBe(true);
    state = setHidden(state, "monster-1", false);
    expect(monster(state, "monster-1").hidden).toBe(false);
  });

  it("is a no-op (same reference) for an unknown id", () => {
    const state = twoPcs();
    expect(setHidden(state, "nope", true)).toBe(state);
  });
});

// ─── Reveal HP (CARD-5) ───────────────────────────────────────────────────────

describe("setRevealed — DM reveal-exact-HP flag (monster-only)", () => {
  it("toggles the revealed flag on a monster", () => {
    let state = goblins();
    state = setRevealed(state, "monster-1", true);
    expect(monster(state, "monster-1").revealed).toBe(true);
    state = setRevealed(state, "monster-1", false);
    expect(monster(state, "monster-1").revealed).toBe(false);
  });

  it("a PC is a no-op — a PC always sees its own exact HP", () => {
    const state = twoPcs();
    expect(setRevealed(state, "pc-mara", true)).toEqual(state);
  });
});

// ─── Conditions (monster) ─────────────────────────────────────────────────────

describe("toggleCondition — monster condition IDs; PC is a no-op", () => {
  it("adds then removes a condition id on a monster, deduped", () => {
    let state = goblins();
    state = toggleCondition(state, "monster-1", "prone");
    expect(monster(state, "monster-1").conditions).toEqual(["prone"]);
    state = toggleCondition(state, "monster-1", "poisoned");
    expect(monster(state, "monster-1").conditions).toEqual(["prone", "poisoned"]);
    state = toggleCondition(state, "monster-1", "prone");
    expect(monster(state, "monster-1").conditions).toEqual(["poisoned"]);
  });

  it("a PC condition toggle is a no-op — conditions live in the combat/state subdoc", () => {
    const state = twoPcs();
    expect(toggleCondition(state, "pc-mara", "prone")).toEqual(state);
  });
});

// ─── DM free-text notes (monster) ─────────────────────────────────────────────

describe("setMonsterNotes — DM free-text; minimal storage; PC is a no-op", () => {
  it("sets notes on a monster, and whitespace-only clears the field (no empty string)", () => {
    let state = goblins();
    state = setMonsterNotes(
      state,
      "monster-1",
      "Casts fireball; 3 legendary resistances"
    );
    expect(monster(state, "monster-1").notes).toBe(
      "Casts fireball; 3 legendary resistances"
    );
    state = setMonsterNotes(state, "monster-1", "   ");
    expect(monster(state, "monster-1")).not.toHaveProperty("notes");
  });

  it("a PC is a no-op — only monsters carry notes", () => {
    const state = twoPcs();
    expect(setMonsterNotes(state, "pc-mara", "anything")).toEqual(state);
  });
});

// ─── endEncounter + isDown ────────────────────────────────────────────────────

describe("endEncounter + isDown", () => {
  it("endEncounter returns null", () => {
    expect(endEncounter()).toBeNull();
  });

  it("isDown: a monster is down only when EVERY token is dead", () => {
    let state = goblins(twoPcs(), { count: 2 });
    state = setHp(state, "monster-1", 0, 0);
    expect(isDown(monster(state, "monster-1"))).toBe(false); // one token still alive
    state = setHp(state, "monster-1", 1, 0);
    expect(isDown(monster(state, "monster-1"))).toBe(true);
  });
});

// ─── INVARIANT — the encounter lifecycle never touches PC combat state ────────────

describe("HP-never-resets invariant — the WHOLE lifecycle leaves every PC reference untouched", () => {
  // A PC's HP / temp / conditions / death saves / initiative live ONLY in its combat/state
  // subdoc — NEVER on the encounter doc — so by CONSTRUCTION no encounter reducer can read
  // or write them. This proves it EXHAUSTIVELY across the entire lifecycle (the spec §9
  // "HP-never-resets" invariant): every transition — start · begin-turns · advance · wrap ·
  // prev · DM reorder · mid-fight reinforcement · remove · end — leaves each PC combatant
  // BYTE-IDENTICAL to its pure-reference seed, and a hard monster edit (HP to 0 + a
  // condition) mid-fight never bleeds onto a PC. The real "PC HP survives" guarantee is the
  // combat/state round-trip in combat-resilience.test.ts; this proves the encounter doc
  // CANNOT be the thing that resets it.
  const seedRef = (id: string): EncounterPc => ({
    kind: "pc",
    id,
    memberUid: id.replace("pc-", ""),
    characterId: `char-${id.replace("pc-", "")}`,
  });
  const PC_IDS = ["pc-mara", "pc-bren"] as const;
  // Every combat-mutable fact that lives in the subdoc — none may EVER appear on a PC ref.
  const STATLINE_KEYS = [
    "hp",
    "temp",
    "currentHp",
    "conditions",
    "initiative",
    "deathSaves",
  ];

  /** Assert every PC combatant is still its bare seed reference — no statline materialized. */
  function expectPcsPristine(state: EncounterState) {
    for (const id of PC_IDS) {
      const ref = pc(state, id);
      expect(ref).toEqual(seedRef(id));
      for (const k of STATLINE_KEYS) expect(ref).not.toHaveProperty(k);
    }
  }

  it("start · begin · advance · wrap · prev · reorder · reinforce · remove · end — PCs never mutate", () => {
    let state = twoPcs();
    expectPcsPristine(state); // after startEncounter
    state = beginEncounterTurns(state, ["pc-mara", "pc-bren"]);
    expectPcsPristine(state); // after begin-turns (order frozen, pointer set)
    state = advanceTurn(state); // mara → bren
    state = advanceTurn(state); // wrap → round 2, back to mara
    expect(state.round).toBe(2);
    expectPcsPristine(state); // after advance + wrap (round++)
    state = prevTurn(state); // step back to bren (round 1 again)
    expectPcsPristine(state); // after prev (round--)
    // A reinforcement mid-fight, edited HARD to 0 HP + a condition — must NOT bleed to a PC.
    state = goblins(state, { count: 1, initiative: 30 });
    state = setHp(state, "monster-1", 0, 0);
    state = toggleCondition(state, "monster-1", "prone");
    expect(isDown(monster(state, "monster-1"))).toBe(true);
    expectPcsPristine(state); // a monster wipe never touches a PC
    // DM drag-reorder, then advance over the now-dead reinforcement.
    state = reorderCombatant(state, "pc-mara", null); // mara to the end
    state = advanceTurn(state);
    expectPcsPristine(state); // after reorder + advance
    state = removeCombatant(state, "monster-1");
    expectPcsPristine(state); // after remove
    // Ending the encounter clears the whole field — it never writes any PC state back.
    expect(endEncounter()).toBeNull();
  });
});

// ─── INVARIANT — frozen-order integrity (spec §9) ─────────────────────────────────

describe("frozen-order integrity — order is DM-structural, the pointer is never dangling", () => {
  const ids = (s: EncounterState) => s.combatants.map((c) => c.id);

  /** The cross-cutting invariant: `order` is a duplicate-free SUBSET of the live
   *  combatants, and the current pointer (when set) names a REAL combatant. */
  function expectIntegrity(state: EncounterState) {
    const live = new Set(ids(state));
    const order = state.order ?? [];
    expect(new Set(order).size).toBe(order.length); // no duplicate ids in the frozen order
    for (const id of order) expect(live.has(id)).toBe(true); // every order id is a real combatant
    if (state.currentCombatantId !== null) {
      expect(live.has(state.currentCombatantId)).toBe(true); // pointer never dangles
    }
  }

  it("order is UNSET until Begin-turns; advance/prev change ONLY the pointer + round, never the order", () => {
    const gathering = twoPcs();
    expect(gathering.order).toBeUndefined(); // startEncounter never freezes the order
    const begun = beginEncounterTurns(gathering, ["pc-mara", "pc-bren"]);
    expect(begun.order).toEqual(["pc-mara", "pc-bren"]);
    // The single structural writer is Begin/freeze — a turn advance leaves `order` BY
    // REFERENCE untouched (the member turn-field write carries only currentCombatantId + round).
    const adv = advanceTurn(begun);
    expect(adv.order).toBe(begun.order); // same array reference
    expect(prevTurn(adv).order).toBe(begun.order);
  });

  it("advance steps within the order, wraps with round++, and keeps a real pointer every step", () => {
    let state: EncounterState = {
      ...twoPcs(),
      order: ["pc-mara", "pc-bren"],
      currentCombatantId: "pc-mara",
      round: 1,
    };
    const rounds: number[] = [];
    for (let i = 0; i < 5; i++) {
      expectIntegrity(state);
      expect(state.order).toContain(state.currentCombatantId); // current ∈ frozen order
      state = advanceTurn(state);
      rounds.push(state.round);
    }
    // mara→bren(r1) · wrap→mara(r2) · bren(r2) · wrap→mara(r3) · bren(r3)
    expect(rounds).toEqual([1, 2, 2, 3, 3]);
  });

  it("removeCombatant splices the order, reinforcement auto-slots it, reorder is a permutation", () => {
    const begun = beginEncounterTurns(twoPcs(), ["pc-mara", "pc-bren"]);
    // A mid-fight reinforcement auto-slots into the FROZEN order (never orphaned).
    const reinforced = goblins(begun, { count: 1, initiative: 5 });
    expect(reinforced.order).toEqual(["pc-mara", "pc-bren", "monster-1"]);
    expectIntegrity(reinforced);
    // Removing the current combatant splices BOTH membership and order; pointer repoints real.
    const removed = removeCombatant(
      { ...reinforced, currentCombatantId: "monster-1" },
      "monster-1"
    );
    expect(removed.order).toEqual(["pc-mara", "pc-bren"]);
    expect(ids(removed)).not.toContain("monster-1");
    expectIntegrity(removed);
    // DM reorder is a PERMUTATION of the same id set; it never moves the pointer.
    const moved = reorderCombatant(begun, "pc-mara", null); // mara to the end
    expect([...(moved.order ?? [])].sort()).toEqual([...(begun.order ?? [])].sort());
    expect(moved.currentCombatantId).toBe(begun.currentCombatantId);
    expectIntegrity(moved);
    // Before Begin-turns, adding a monster leaves the order UNSET (set fresh at Begin).
    expect(goblins(twoPcs(), { count: 1 }).order).toBeUndefined();
  });
});

// ─── pcEncounterCampaignId — the cockpit "in combat?" signal ──────────────────

describe("pcEncounterCampaignId", () => {
  /** A minimal campaign carrying only the fields the predicate reads. */
  function camp(
    id: string,
    encounter: EncounterState | null
  ): Pick<CampaignDoc, "id" | "encounter"> {
    return { id, encounter };
  }

  it("returns the campaign id when the character is a PC in an active encounter", () => {
    const campaigns = [camp("camp-1", twoPcs())];
    expect(pcEncounterCampaignId(campaigns, "char-mara")).toBe("camp-1");
  });

  it("returns null when the character is in no running encounter", () => {
    // A different character, an encounter without this PC, and a campaign with no
    // encounter at all — all yield null.
    const campaigns = [camp("camp-1", twoPcs()), camp("camp-2", null)];
    expect(pcEncounterCampaignId(campaigns, "char-stranger")).toBeNull();
  });

  it("ignores a monster combatant whose id collides with the character id", () => {
    // A monster is never a PC reference — matching is on the PC `characterId` only.
    const monsterOnly = goblins(
      {
        combatants: [],
        round: 1,
        currentCombatantId: null,
        epoch: 100,
        status: "active",
      },
      { count: 1 }
    );
    expect(pcEncounterCampaignId([camp("camp-1", monsterOnly)], "monster-1")).toBeNull();
  });

  it("returns null for an empty campaign list (solo player)", () => {
    expect(pcEncounterCampaignId([], "char-mara")).toBeNull();
  });
});

// ─── uidEncounterCampaignId — the shell PIP's "am I in combat?" signal ─────────

describe("uidEncounterCampaignId", () => {
  /** A minimal campaign carrying only the fields the predicate reads. */
  function camp(
    id: string,
    encounter: EncounterState | null
  ): Pick<CampaignDoc, "id" | "encounter"> {
    return { id, encounter };
  }

  it("resolves the campaign from the VIEWER'S uid — NOT any open character id", () => {
    // twoPcs seeds memberUid "mara"/"bren"; the pip keys on the auth uid, so no open
    // sheet (no characterId) is needed for the pip to light.
    const campaigns = [camp("camp-1", twoPcs())];
    expect(uidEncounterCampaignId(campaigns, "mara")).toBe("camp-1");
    expect(uidEncounterCampaignId(campaigns, "bren")).toBe("camp-1");
  });

  it("returns null when the uid owns no PC in any running encounter", () => {
    const campaigns = [camp("camp-1", twoPcs()), camp("camp-2", null)];
    expect(uidEncounterCampaignId(campaigns, "stranger")).toBeNull();
  });

  it("returns null for an empty campaign list (no membership yet)", () => {
    expect(uidEncounterCampaignId([], "mara")).toBeNull();
  });
});

// ─── viewerActiveEncounters — the topbar pip's multi-encounter resolver (spec §5) ──

describe("viewerActiveEncounters", () => {
  type FullCamp = Pick<
    CampaignDoc,
    "id" | "name" | "dmUid" | "memberDetails" | "encounter"
  >;
  /** A campaign with member snapshots so a PC actor's name resolves off the doc. */
  function full(over: Partial<FullCamp> = {}): FullCamp {
    return {
      id: "camp-1",
      name: "The Starless Keep",
      dmUid: "dm",
      memberDetails: {
        mara: {
          displayName: "Mara",
          characterId: "char-mara",
          role: "player",
          character: { name: assertNonEmptyString("Mara Quill") },
        },
        bren: {
          displayName: "Bren",
          characterId: "char-bren",
          role: "player",
          character: { name: assertNonEmptyString("Bren Ironbeard") },
        },
      },
      encounter: twoPcs(),
      ...over,
    };
  }
  /** The sole expected entry (the resolver yields one per matching campaign). */
  function one(out: ReturnType<typeof viewerActiveEncounters>) {
    const [e] = out;
    if (!e) throw new Error("expected exactly one encounter entry");
    return e;
  }

  it("returns a PC entry with the viewer's hero name + character id", () => {
    const e = one(viewerActiveEncounters([full()], "mara", false));
    expect(e).toMatchObject({
      campaignId: "camp-1",
      role: "pc",
      myCombatantId: "pc-mara",
      characterId: "char-mara",
      heroName: "Mara Quill",
      gathering: true, // twoPcs starts pre-Begin (currentCombatantId null)
      isMyTurn: false,
    });
  });

  it("flags my-turn + resolves a PC actor's name off the member snapshot", () => {
    const enc = { ...twoPcs(), currentCombatantId: "pc-bren" };
    const e = one(viewerActiveEncounters([full({ encounter: enc })], "mara", false));
    expect(e.isMyTurn).toBe(false);
    expect(e.gathering).toBe(false);
    // The pointer is on Bren — actorName is HIS hero name (from the snapshot).
    expect(e.actorName).toBe("Bren Ironbeard");
    // And from Bren's own view it IS his turn.
    const bren = one(viewerActiveEncounters([full({ encounter: enc })], "bren", false));
    expect(bren.isMyTurn).toBe(true);
  });

  it("gives a PC-less DM a one-way 'dm' entry (no hero, never my-turn)", () => {
    // The DM owns no PC in the encounter — they still get an entry to jump in.
    const e = one(viewerActiveEncounters([full()], "dm", false));
    expect(e.role).toBe("dm");
    expect(e.heroName).toBeNull();
    expect(e.characterId).toBeNull();
    expect(e.myCombatantId).toBeNull();
    expect(e.isMyTurn).toBe(false);
  });

  it("admin gets a dm-style entry even without DM standing or a PC", () => {
    const e = one(viewerActiveEncounters([full()], "stranger", true));
    expect(e.role).toBe("dm");
  });

  it("excludes a plain member with no PC, no DM, no admin", () => {
    expect(viewerActiveEncounters([full()], "stranger", false)).toEqual([]);
  });

  it("hides a hidden ambush monster's name from a non-DM, shows it to the DM", () => {
    const ambush = {
      ...twoPcs(),
      currentCombatantId: "monster-1",
      combatants: [
        ...twoPcs().combatants,
        {
          kind: "monster" as const,
          id: "monster-1",
          name: "Shadow",
          ac: 12,
          initiative: 18,
          conditions: [],
          maxHp: 16,
          tokens: [16],
          hidden: true,
        },
      ],
    };
    // Mara (a player) must NOT see the ambush actor's name.
    const mara = one(
      viewerActiveEncounters([full({ encounter: ambush })], "mara", false)
    );
    expect(mara.actorName).toBeNull();
    // The DM does.
    const dm = one(viewerActiveEncounters([full({ encounter: ambush })], "dm", false));
    expect(dm.actorName).toBe("Shadow");
  });

  it("lists EVERY active encounter the viewer is in (multi)", () => {
    const camp2 = full({
      id: "camp-2",
      name: "Lost Mine",
      encounter: { ...twoPcs(), epoch: 200 },
    });
    const out = viewerActiveEncounters([full(), camp2], "mara", false);
    expect(out.map((e) => e.campaignId)).toEqual(["camp-1", "camp-2"]);
  });

  it("skips campaigns with no running encounter", () => {
    expect(viewerActiveEncounters([full({ encounter: null })], "mara", false)).toEqual(
      []
    );
  });
});
