/**
 * combat-resilience — the "paused for weeks" guarantee (spec §9 reload-mid-combat).
 *
 * The killer feature: a campaign fight can be left mid-combat and resumed — days or weeks
 * later, on a fresh reload — with the EXACT same state. This proves it as a test by
 * round-tripping an in-combat encounter + its PCs' `combat/state` subdocs through the REAL
 * (de)serialization the app uses, then asserting the resumed state is byte-identical:
 *
 *  - the campaign ENCOUNTER (round · frozen `order` · `currentCombatantId` · epoch · every
 *    monster's token HP / conditions / hidden flag) round-trips through `timestampsToDates`
 *    — the SAME deep-walk read transform `toCampaignDoc` applies to a live campaign snapshot
 *    (`campaign-io.ts`) — over a JSON store/reload (Firestore persists the encounter as a
 *    plain object, no Timestamps);
 *  - each PC's `combat/state` subdoc (HP · temp · conditions · initiative roll + epoch ·
 *    death saves) round-trips through the REAL projection + hydration seam
 *    (`sessionToCombatState` → JSON store → `applyCombatToSession`) — the exact functions the
 *    cockpit writes (`replaceTrio`) and reads (`hydrateCombatState`) the subdoc with.
 *
 * Pure + Firebase-free: it never imports `combat-state-io` / `campaign-io` (which pull
 * `@/lib/firebase`), only the pure model seams — so it runs in CI with no API key, and
 * exercises the actual math, not a hand-rolled copy.
 */
import { describe, it, expect } from "vitest";
import {
  startEncounter,
  beginEncounterTurns,
  advanceTurn,
  addMonster,
  setHidden,
  setHp,
  toggleCondition,
} from "@/features/campaigns/encounter";
import { sessionToCombatState, applyCombatToSession } from "@/lib/combat-state";
import { timestampsToDates } from "@/lib/timestamps-to-dates";
import type { EncounterState } from "@/types/campaign";
import type { CombatState } from "@/types/combat-state";
import type { SessionState } from "@/types/character";

/** A faithful model of a Firestore store→reload: serialize to JSON (Firestore persists the
 *  combat docs as plain objects, no Timestamps) and apply the SAME `timestampsToDates`
 *  deep-walk the live read boundary (`toCampaignDoc` / the doc subscriptions) runs. */
function reload<T>(value: T): T {
  return timestampsToDates(JSON.parse(JSON.stringify(value)) as T);
}

/** A minimal-but-valid {@link SessionState} (only the trio is asserted on). */
function session(overrides: Partial<SessionState> = {}): SessionState {
  return {
    hp: { current: 20, temp: 0 },
    hitDice: { used: 0 },
    trackers: {},
    spellSlots: {},
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    concentration: "",
    initiative: "",
    conditions: [],
    deathSucc: 0,
    deathFail: 0,
    inspiration: false,
    exhaustion: 0,
    pinnedActions: [],
    unpinnedActions: [],
    notes: "",
    logEntries: [],
    ...overrides,
  };
}

/**
 * Build a realistic IN-COMBAT encounter through the REAL reducers (never hand-rolled):
 * a 4-way fight, turns begun (order frozen), advanced past round 1, a goblin group with one
 * token dead + one wounded + Prone, a HIDDEN ambush monster, and a mid-fight reinforcement.
 */
function inCombatEncounter(): EncounterState {
  let enc = startEncounter(
    { mara: { characterId: "char-mara" }, bren: { characterId: "char-bren" } },
    ["mara", "bren"],
    1_717_000_000_000 // the per-encounter epoch (a fixed monotonic stamp)
  );
  enc = addMonster(enc, {
    name: "Goblin",
    ac: 13,
    maxHp: 7,
    count: 3,
    initiative: 12,
    notes: "flanks the casters",
  });
  enc = addMonster(enc, { name: "Shadow", ac: 12, maxHp: 16, count: 1, initiative: 18 });
  enc = setHidden(enc, "monster-2", true); // a staged ambush
  // Begin turns — freeze the order (hidden combatant included; hidden is display-only).
  enc = beginEncounterTurns(enc, ["monster-2", "pc-mara", "monster-1", "pc-bren"]);
  enc = advanceTurn(enc); // monster-2 → pc-mara
  enc = advanceTurn(enc); // pc-mara → monster-1
  // Wound the goblins: token 1 killed, token 0 at 4 HP, the group is Prone.
  enc = setHp(enc, "monster-1", 1, 0);
  enc = setHp(enc, "monster-1", 0, 4);
  enc = toggleCondition(enc, "monster-1", "prone");
  // A reinforcement wolf arrives mid-fight (auto-slots onto the frozen order as monster-3).
  enc = addMonster(enc, { name: "Wolf", ac: 13, maxHp: 11, count: 1, initiative: 7 });
  enc = advanceTurn(enc); // monster-1 → pc-bren
  enc = advanceTurn(enc); // pc-bren → monster-3 (the reinforcement)
  enc = advanceTurn(enc); // monster-3 → wrap → round 2, back to monster-2
  return enc;
}

describe("reload-mid-combat resilience — the encounter survives a serialize → reload cycle", () => {
  it("round, frozen order, current turn, epoch, and every monster's HP/conditions are byte-identical", () => {
    const before = inCombatEncounter();
    // Sanity: we are genuinely mid-combat (advanced past round 1, a frozen order, a live pointer).
    expect(before.round).toBe(2);
    expect(before.currentCombatantId).toBe("monster-2");
    expect(before.order).toEqual([
      "monster-2",
      "pc-mara",
      "monster-1",
      "pc-bren",
      "monster-3", // the reinforcement auto-slotted onto the frozen order
    ]);

    const after = reload(before);

    // The WHOLE encounter is identical — nothing drifts across a reload.
    expect(after).toEqual(before);
    // Spelled out for the spec's exact promise (round · order · whose-turn · epoch).
    expect(after.round).toBe(before.round);
    expect(after.order).toEqual(before.order);
    expect(after.currentCombatantId).toBe(before.currentCombatantId);
    expect(after.epoch).toBe(before.epoch);
    // The wounded goblin group survives with its exact token HP + condition + the hidden flag.
    const goblin = after.combatants.find((c) => c.id === "monster-1");
    expect(goblin).toMatchObject({ tokens: [4, 0, 7], conditions: ["prone"] });
    const ambush = after.combatants.find((c) => c.id === "monster-2");
    expect(ambush).toMatchObject({ hidden: true });
  });
});

describe("reload-mid-combat resilience — every PC's combat/state survives byte-identical", () => {
  // Each live PC's combat/state subdoc, varied to exercise every field.
  const maraState: CombatState = {
    hp: { current: 6, temp: 3 }, // wounded, with a temp-HP pool
    conditions: ["poisoned", "frightened"],
    initiativeRoll: 17,
    deathSaves: { successes: 0, failures: 0 },
    round: 1,
  };
  const brenState: CombatState = {
    hp: { current: 0, temp: 0 }, // DOWN — mid death-saves
    conditions: [],
    initiativeRoll: 4,
    deathSaves: { successes: 1, failures: 2 },
    round: 1,
  };
  const PC_STATES: Record<string, CombatState> = {
    "char-mara": maraState,
    "char-bren": brenState,
  };

  it("HP, temp, conditions, the solo roll, and death saves all round-trip unchanged", () => {
    for (const [charId, state] of Object.entries(PC_STATES)) {
      const after = reload(state);
      expect(after).toEqual(state); // byte-identical subdoc
      // (Encounter rolls live on the campaign's `encounterInit` table now, so a reload
      // resumes them from the campaign doc — nothing here to survive.)
      // Sanity per char so a regression names the offender.
      expect(after.deathSaves).toEqual(state.deathSaves);
      expect(charId).toMatch(/^char-/);
    }
  });

  it("hydrating the reloaded subdoc reproduces the EXACT sheet trio (the resumed cockpit)", () => {
    // The resumed sheet hydrates a fresh session from the reloaded subdoc via the REAL
    // `applyCombatToSession` — the same call the cockpit's `hydrateCombatState` makes — so
    // the player sees the identical HP / temp / conditions / initiative / death saves.
    const maxHp = 24;
    const mara = applyCombatToSession(session(), reload(maraState), maxHp);
    expect(mara.hp).toEqual({ current: 6, temp: 3 });
    expect(mara.conditions).toEqual(["poisoned", "frightened"]);
    expect(mara.initiative).toBe("17"); // canonical number → cockpit string
    expect(mara.deathSucc).toBe(0);
    expect(mara.deathFail).toBe(0);

    const bren = applyCombatToSession(session(), reload(brenState), maxHp);
    expect(bren.hp).toEqual({ current: 0, temp: 0 });
    expect(bren.deathSucc).toBe(1);
    expect(bren.deathFail).toBe(2); // a downed PC resumes mid-death-saves, never reset
  });

  it("the full session → subdoc → reload → session loop is a fixpoint for the trio", () => {
    // The complete persistence loop: a live session's trio is PROJECTED to the subdoc
    // (`sessionToCombatState`, what `replaceTrio` writes), stored, reloaded, and HYDRATED
    // back (`applyCombatToSession`, what the subscription reads) — the trio is unchanged.
    const maxHp = 30;
    const live = session({
      hp: { current: 11, temp: 5 },
      conditions: ["prone", "grappled"],
      initiative: "13",
      deathSucc: 2,
      deathFail: 1,
    });
    const resumed = applyCombatToSession(
      session(),
      reload(sessionToCombatState(live)),
      maxHp
    );
    expect(resumed.hp).toEqual({ current: 11, temp: 5 });
    expect(resumed.conditions).toEqual(["prone", "grappled"]);
    expect(resumed.initiative).toBe("13");
    expect(resumed.deathSucc).toBe(2);
    expect(resumed.deathFail).toBe(1);
  });
});
