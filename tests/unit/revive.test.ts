/**
 * Bringing a dead creature back (SRD 5.2.1 Revivify: "A creature you touch that has
 * died within the last minute revives with 1 Hit Point"; Raise Dead within 10 days;
 * Resurrection within a century, True Resurrection two). The tray applies the
 * spell's `revive` outcome: to me through a sheet event, to another PC through the
 * cross-device write, to a living target never.
 */
import { describe, expect, it } from "vitest";

import { getSpellById } from "@/data/spells";
import { defaultCombatState, reduceRevive } from "@/lib/combat-state";
import { reviveCharacter, reviveEligibility } from "@/lib/play/revive";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

const dead = (): CharacterDoc =>
  makeCharacterDoc(
    {},
    {
      hp: { current: 0, temp: 0 },
      deathFail: 3,
      deathSucc: 1,
      conditions: ["unconscious"],
      death: { minutesSince: 0 },
    }
  );

describe("reviving me", () => {
  it("a dead character comes back with the spell's Hit Points, the death cleared", () => {
    const back = reviveCharacter(dead(), 1);
    expect(back?.session.hp.current).toBe(1);
    expect(back?.session.deathFail).toBe(0);
    expect(back?.session.deathSucc).toBe(0);
    expect(back?.session.conditions).not.toContain("unconscious");
    expect(back?.session.death).toBeUndefined();
  });

  it("all of them, never above the maximum", () => {
    const doc = dead();
    const back = reviveCharacter(doc, 9999);
    expect(back?.session.hp.current).toBe(doc.character.hp.max);
  });

  it("a living character needs nothing", () => {
    expect(reviveCharacter(makeCharacterDoc(), 1)).toBeNull();
  });
});

describe("reviving another PC (the cross-device write)", () => {
  it("only a dead one: HP set, death saves and Unconscious cleared", () => {
    const state = {
      ...defaultCombatState(30),
      hp: { current: 0, temp: 0 },
      deathSaves: { successes: 0, failures: 3 },
      conditions: ["unconscious", "prone"],
    };
    expect(reduceRevive(state, 1, 30)).toMatchObject({
      hp: { current: 1, temp: 0 },
      deathSaves: { successes: 0, failures: 0 },
      conditions: ["prone"],
    });
    const alive = defaultCombatState(30);
    expect(reduceRevive(alive, 1, 30)).toBe(alive);
  });
});

describe("who the spell can still reach", () => {
  const revivify = 1;
  it("alive: not needed", () => {
    expect(reviveEligibility(makeCharacterDoc(), revivify)).toEqual({ kind: "alive" });
  });

  it("dead within the window, or past it, by the game time since", () => {
    expect(reviveEligibility(dead(), revivify)).toEqual({
      kind: "dead",
      minutesSince: 0,
      within: true,
    });
    const doc = dead();
    const later = { ...doc, session: { ...doc.session, death: { minutesSince: 2 } } };
    expect(reviveEligibility(later, revivify)).toEqual({
      kind: "dead",
      minutesSince: 2,
      within: false,
    });
  });

  it("dead with no record of when: the table decides", () => {
    const doc = dead();
    const unknown = { ...doc, session: { ...doc.session, death: undefined } };
    expect(reviveEligibility(unknown, revivify)).toEqual({ kind: "dead", within: null });
  });

  it("each spell carries its window", () => {
    expect(getSpellById("revivify")?.revives).toMatchObject({ withinMinutes: 1 });
    expect(getSpellById("raise-dead")?.revives).toMatchObject({ withinMinutes: 14400 });
  });
});

describe("the store: a revive is one undoable step", () => {
  it("revives, and the undo puts the death back", async () => {
    const { useCharacterStore } = await import("@/stores/characterStore");
    useCharacterStore.getState().setCharacter(dead());
    const undo = useCharacterStore.getState().dispatch({ kind: "revive", hitPoints: 1 });
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(1);
    undo?.();
    expect(useCharacterStore.getState().character?.session.deathFail).toBe(3);
    expect(useCharacterStore.getState().character?.session.death).toEqual({
      minutesSince: 0,
    });
    useCharacterStore.getState().setCharacter(null);
  });

  it("a minute of game time later, Revivify no longer reaches", async () => {
    const { passTime } = await import("@/lib/play/time");
    const later = passTime(dead(), 2);
    expect(later?.session.death).toEqual({ minutesSince: 2 });
    expect(later && reviveEligibility(later, 1)).toMatchObject({ within: false });
  });
});
