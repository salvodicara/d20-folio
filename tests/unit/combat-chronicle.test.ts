/**
 * combat-chronicle — the PURE recorders that append {@link CombatChronicleEvent}s to
 * an encounter's ephemeral feed. No Firebase, so a plain unit suite. Pins the FACTS:
 *  - each seam derives the right event (damage/heal with amount + post-HP + target;
 *    down when HP crosses 0; condition gain/loss; miss/pass);
 *  - the NEVER-GUESS-ATTACKER rule (a damage event carries an attacker ONLY when one
 *    is passed / tapped) and the NEVER-AUTO-MISS rule (a miss/pass exists only when
 *    explicitly recorded) — both mutation-proven;
 *  - the events ride the STATE (the budget discipline — no Firebase here to write to);
 *  - the outcome inference (victory only when every monster is down).
 */
import { describe, it, expect } from "vitest";
import {
  appendEvent,
  recordMonsterHp,
  recordMonsterDamage,
  recordPcHp,
  recordCondition,
  setEventAttacker,
  skipEventAttacker,
  undoHpEvent,
  undoConditionEvent,
  inferOutcome,
} from "@/features/campaigns/combat-chronicle";
import {
  startEncounter,
  addMonster,
  setHp,
  toggleCondition,
  setMonsterTempHp,
} from "@/features/campaigns/encounter";
import type { EncounterState } from "@/types/campaign";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A one-PC encounter (mara) + three independently targetable Goblins. */
function fight(): EncounterState {
  const base = startEncounter({ mara: { characterId: "char-mara" } }, ["mara"], 100);
  return addMonster(base, {
    name: "Goblin",
    ac: 13,
    maxHp: 7,
    count: 3,
    initiative: 12,
  });
}

const events = (s: EncounterState) => s.events ?? [];
const last = (s: EncounterState) => events(s)[events(s).length - 1];

// ─── appendEvent — the feed writer ───────────────────────────────────────────

describe("appendEvent — stamps a stable id + the current round", () => {
  it("assigns the append index as id and the state round, in order", () => {
    let s = fight();
    s = appendEvent(s, { kind: "down", targetId: "monster-1" });
    s = appendEvent(s, { kind: "down", targetId: "pc-mara" });
    expect(events(s).map((e) => e.id)).toEqual(["0", "1"]);
    expect(events(s).every((e) => e.round === 1)).toBe(true);
  });

  it("is additive — a fresh encounter has no events field until one is recorded", () => {
    expect(fight().events).toBeUndefined();
  });
});

// ─── Monster HP → events ─────────────────────────────────────────────────────

describe("recordMonsterHp — derives damage/heal + down", () => {
  it("damage: amount = HP lost, current = post-HP, target = the monster id", () => {
    const s = recordMonsterHp(fight(), "monster-1", 0, 3); // 7 → 3
    expect(last(s)).toMatchObject({
      kind: "hp-damage",
      targetId: "monster-1",
      amount: 4,
      current: 3,
      max: 7,
    });
    // NEVER-GUESS: no attacker unless one is passed.
    expect(last(s)).not.toHaveProperty("attackerId");
  });

  it("attributes the attacker ONLY when passed", () => {
    const s = recordMonsterHp(fight(), "monster-1", 0, 3, "pc-mara");
    expect(last(s)).toMatchObject({ kind: "hp-damage", attackerId: "pc-mara" });
  });

  it("heal: a positive delta records hp-heal, never down", () => {
    let s = setHp(fight(), "monster-1", 0, 2); // wound first (no event)
    s = recordMonsterHp(s, "monster-1", 0, 6); // 2 → 6
    expect(last(s)).toMatchObject({ kind: "hp-heal", amount: 4, current: 6 });
  });

  it("emits DOWN when that creature crosses to zero", () => {
    const s = recordMonsterHp(fight(), "monster-1", 0, 0);
    expect(last(s)).toMatchObject({ kind: "down", targetId: "monster-1" });
  });

  it("a no-change edit (clamp no-op) records nothing", () => {
    const s = recordMonsterHp(fight(), "monster-1", 0, 7); // already 7
    expect(s.events).toBeUndefined();
  });
});

describe("recordMonsterDamage — Temporary HP is part of the same damage transaction", () => {
  it("absorbs Temporary HP first and records the landed total", () => {
    const withTemp = setMonsterTempHp(fight(), "monster-1", 5);
    const damaged = recordMonsterDamage(withTemp, "monster-1", 0, 8);
    expect(damaged.combatants.find((c) => c.id === "monster-1")).toMatchObject({
      tokens: [4],
    });
    expect(damaged.combatants.find((c) => c.id === "monster-1")).not.toHaveProperty(
      "tempHp"
    );
    expect(last(damaged)).toMatchObject({
      kind: "hp-damage",
      amount: 8,
      tempAbsorbed: 5,
      current: 4,
    });
  });

  it("undo restores both ordinary and Temporary HP exactly", () => {
    const withTemp = setMonsterTempHp(fight(), "monster-1", 5);
    const damaged = recordMonsterDamage(withTemp, "monster-1", 0, 8);
    const restored = undoHpEvent(damaged, "0");
    expect(restored.combatants.find((c) => c.id === "monster-1")).toMatchObject({
      tokens: [7],
      tempHp: 5,
    });
    expect(restored.events).toEqual([]);
  });
});

// ─── PC HP → events (HP lives in the subdoc; caller passes pre/post) ──────────

describe("recordPcHp — appends from the caller's pre/post HP", () => {
  it("damage below 0 crossing records hp-damage + down", () => {
    const s = recordPcHp(fight(), {
      targetId: "pc-mara",
      kind: "damage",
      amount: 12,
      preCurrent: 9,
      postCurrent: 0,
      max: 22,
    });
    expect(events(s).map((e) => e.kind)).toEqual(["hp-damage", "down"]);
    expect(events(s)[0]).toMatchObject({ amount: 12, current: 0, max: 22 });
  });

  it("damage NOT crossing 0 records no down", () => {
    const s = recordPcHp(fight(), {
      targetId: "pc-mara",
      kind: "damage",
      amount: 4,
      preCurrent: 9,
      postCurrent: 5,
      max: 22,
    });
    expect(events(s).map((e) => e.kind)).toEqual(["hp-damage"]);
  });

  it("a 0-amount edit records nothing", () => {
    expect(
      recordPcHp(fight(), {
        targetId: "pc-mara",
        kind: "heal",
        amount: 0,
        preCurrent: 5,
        postCurrent: 5,
        max: 22,
      }).events
    ).toBeUndefined();
  });
});

// ─── Conditions ──────────────────────────────────────────────────────────────

describe("recordCondition", () => {
  it("condition gain + loss carry the target + condition id", () => {
    let s = recordCondition(fight(), "pc-mara", "frightened", true);
    expect(last(s)).toMatchObject({
      kind: "condition-gain",
      targetId: "pc-mara",
      conditionId: "frightened",
    });
    s = recordCondition(s, "pc-mara", "frightened", false);
    expect(last(s)).toMatchObject({ kind: "condition-loss" });
  });

  it("the feed records ONLY what LANDED — an ordinary damage edit adds no other kind", () => {
    // The chronicle is the deterministic record of what landed (no miss/pass logging):
    // a damage edit records exactly one hp-damage (+ any down), nothing speculative.
    const s = recordMonsterHp(fight(), "monster-1", 0, 3);
    expect(events(s).map((e) => e.kind)).toEqual(["hp-damage"]);
  });
});

// ─── Attribution editing (one-tap / skip) ────────────────────────────────────

describe("setEventAttacker / skipEventAttacker", () => {
  it("setEventAttacker attributes a pending damage event", () => {
    let s = recordMonsterHp(fight(), "monster-1", 0, 3); // event id "0"
    s = setEventAttacker(s, "0", "pc-mara");
    expect(s.events?.[0]).toMatchObject({ attackerId: "pc-mara" });
  });

  it("skipEventAttacker resolves as unattributed (flag set, no attacker)", () => {
    let s = recordMonsterHp(fight(), "monster-1", 0, 3);
    s = skipEventAttacker(s, "0");
    expect(s.events?.[0]).toMatchObject({ attackerSkipped: true });
    expect(s.events?.[0]).not.toHaveProperty("attackerId");
  });

  it("attribution is a no-op on a non-damage event", () => {
    let s = recordCondition(fight(), "monster-1", "prone", true); // id "0"
    s = setEventAttacker(s, "0", "pc-mara");
    expect(s.events?.[0]).not.toHaveProperty("attackerId");
  });
});

// ─── undoHpEvent — the DM's one-tap reversal (remediability) ──────────────────

describe("undoHpEvent — removes the line AND restores the monster's HP", () => {
  const monster = (s: EncounterState) => s.combatants.find((c) => c.id === "monster-1");

  it("undoing a damage event heals the amount back and drops the line", () => {
    let s = recordMonsterHp(fight(), "monster-1", 0, 3); // 7 → 3, event id "0", amount 4
    expect(monster(s)).toMatchObject({ tokens: [3] });
    s = undoHpEvent(s, "0");
    // The token is restored to full and the chronicle line is gone.
    expect(monster(s)).toMatchObject({ tokens: [7] });
    expect(s.events).toEqual([]);
  });

  it("undoing the killing blow revives the creature AND removes the trailing down line", () => {
    let s = recordMonsterHp(fight(), "monster-1", 0, 0); // id "0" damage + id "1" down
    expect(events(s).map((e) => e.kind)).toContain("down");
    s = undoHpEvent(s, "0");
    expect(monster(s)).toMatchObject({ tokens: [7] });
    expect(events(s).some((e) => e.kind === "down")).toBe(false);
    expect(events(s)).toEqual([]);
  });

  it("undoing a heal re-damages the amount off the group", () => {
    let s = recordMonsterHp(fight(), "monster-1", 0, 3); // damage 7→3 (id "0")
    s = recordMonsterHp(s, "monster-1", 0, 7); // heal 3→7 (id "1", amount 4)
    s = undoHpEvent(s, "1");
    expect(monster(s)).toMatchObject({ tokens: [3] });
    expect(events(s).map((e) => e.id)).toEqual(["0"]);
  });

  it("a PC HP event has no encounter HP to restore — it just clears its line", () => {
    let s = recordPcHp(fight(), {
      targetId: "pc-mara",
      kind: "damage",
      amount: 5,
      preCurrent: 20,
      postCurrent: 15,
      max: 20,
    });
    const before = s.combatants;
    s = undoHpEvent(s, "0");
    expect(s.events).toEqual([]);
    expect(s.combatants).toEqual(before); // monster tokens untouched
  });

  it("is a tolerant no-op on an unknown id or a non-HP event", () => {
    const dmg = recordMonsterHp(fight(), "monster-1", 0, 3);
    expect(undoHpEvent(dmg, "999")).toBe(dmg); // unknown id
    const cond = recordCondition(fight(), "monster-1", "prone", true);
    expect(undoHpEvent(cond, "0")).toBe(cond); // condition line, not HP
  });
});

describe("undoConditionEvent — removes the line AND reverses the monster condition", () => {
  it("undoes both a gain and a loss", () => {
    let gained = recordCondition(
      toggleCondition(fight(), "monster-1", "prone"),
      "monster-1",
      "prone",
      true
    );
    gained = undoConditionEvent(gained, "0");
    expect(gained.events).toEqual([]);
    expect(gained.combatants.find((c) => c.id === "monster-1")).toMatchObject({
      conditions: [],
    });

    let lost = toggleCondition(fight(), "monster-1", "prone");
    lost = recordCondition(
      toggleCondition(lost, "monster-1", "prone"),
      "monster-1",
      "prone",
      false
    );
    lost = undoConditionEvent(lost, "0");
    expect(lost.events).toEqual([]);
    expect(lost.combatants.find((c) => c.id === "monster-1")).toMatchObject({
      conditions: ["prone"],
    });
  });

  it("does not claim ownership of PC conditions", () => {
    const pc = recordCondition(fight(), "pc-mara", "prone", true);
    expect(undoConditionEvent(pc, "0")).toBe(pc);
  });
});

// ─── Outcome inference ───────────────────────────────────────────────────────

describe("inferOutcome — victory only when every monster is down", () => {
  it("neutral 'ended' while any monster stands", () => {
    expect(inferOutcome(fight())).toBe("ended");
  });

  it("victory when every monster is defeated", () => {
    let s = fight();
    for (const id of ["monster-1", "monster-1~2", "monster-1~3"]) s = setHp(s, id, 0, 0);
    expect(inferOutcome(s)).toBe("victory");
  });

  it("no monsters at all is neutral (never a false victory)", () => {
    const s = startEncounter({ mara: { characterId: "c" } }, ["mara"], 1);
    expect(inferOutcome(s)).toBe("ended");
  });
});
