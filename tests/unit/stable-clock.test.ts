/**
 * Stable at 0 HP (2024): three successes make you Stable, and after 1d4 hours you
 * regain 1 HP (the table rolls the hours). The sheet keeps the game minutes since,
 * moved by passing time, and drops them once the character is up again.
 */
import { describe, expect, it } from "vitest";

import { reducePcDamage } from "@/lib/combat-transition";
import { healBy, setDeathSaves } from "@/lib/play/vitals";
import { passTime, stableMinutes } from "@/lib/play/time";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const dying = (): CharacterDoc =>
  makeCharacterDoc(
    {},
    { hp: { current: 0, temp: 0 }, conditions: ["unconscious"], deathSucc: 2 }
  );

function stabilised(): CharacterDoc {
  const doc = dying();
  const result = setDeathSaves(doc, 3, 0);
  if (!result) throw new Error("not stabilised");
  return { ...doc, session: result.session };
}

describe("the Stable clock", () => {
  it("starts at the third success and runs with the game clock", () => {
    const stable = stabilised();
    expect(stableMinutes(stable.session)).toBe(0);
    const later = passTime(stable, 90);
    expect(later && stableMinutes(later.session)).toBe(90);
  });

  it("stops counting once the character is up again", () => {
    const healed = healBy(stabilised(), 1);
    if (!healed) throw new Error("not healed");
    expect(stableMinutes(healed)).toBeUndefined();
  });

  it("survives a save and a reload", () => {
    const stable = stabilised();
    const reloaded = stateToSession(
      JSON.parse(JSON.stringify(sessionToState(stable.session))) as Record<
        string,
        unknown
      >
    );
    expect(reloaded.stableSince).toBe(0);
  });
});

describe("knocking out", () => {
  const hit = (attackMode: "melee" | "ranged", knockOut: boolean, amount = 12) =>
    reducePcDamage({
      state: {
        hp: { current: 5, temp: 0, max: 20 },
        conditions: [],
        deathSaves: { successes: 0, failures: 0 },
      },
      intake: { stage: "resolved", amount },
      hit: { attacker: null, attackMode },
      knockOut,
    });

  it("a melee knock-out leaves 1 HP and Unconscious, no death saves", () => {
    const result = hit("melee", true);
    expect(result.state.hp.current).toBe(1);
    expect(result.state.conditions).toEqual(["unconscious"]);
    expect(result.crossedZero).toBe(false);
    expect(result.state.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("not from range, and not when the hit doesn't drop it", () => {
    expect(hit("ranged", true).state.hp.current).toBe(0);
    expect(hit("melee", true, 3).state).toMatchObject({
      hp: { current: 2 },
      conditions: [],
    });
  });

  it("massive damage doesn't kill a knocked-out creature: it never reaches 0", () => {
    expect(hit("melee", true, 40)).toMatchObject({
      instantDeath: false,
      state: { hp: { current: 1 } },
    });
  });
});
