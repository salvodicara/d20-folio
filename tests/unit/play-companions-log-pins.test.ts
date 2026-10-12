/** The companion, familiar, pin and log transitions in `lib/play` (pure: session in, next out). */
import { describe, expect, it } from "vitest";
import {
  dismissFamiliar,
  setCompanionHp,
  setCompanionVariant,
  setFamiliarDismissed,
  summonFamiliar,
} from "@/lib/play/companions";
import { amendLogEntry, appendLogEntry, MAX_LOG, removeLogEntry } from "@/lib/play/log";
import { togglePinnedAction } from "@/lib/play/pins";
import { FIND_FAMILIAR_SPELL_ID } from "@/lib/familiar-ids";
import type { LogEntry, SessionState } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";

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

describe("companions", () => {
  it("sets a companion's HP, never below 0", () => {
    expect(setCompanionHp(session(), "wolf", 7).companionHp).toEqual({
      wolf: { current: 7 },
    });
    expect(setCompanionHp(session(), "wolf", -3).companionHp).toEqual({
      wolf: { current: 0 },
    });
  });

  it("a new variant resets that companion's HP and keeps the others", () => {
    const next = setCompanionVariant(
      session({ companionHp: { beast: { current: 3 }, drake: { current: 9 } } }),
      "beast",
      "sea"
    );
    expect(next.companionVariant).toEqual({ beast: "sea" });
    expect(next.companionHp).toEqual({ drake: { current: 9 } });
  });

  it("summons the familiar at full HP, at least 1", () => {
    const next = summonFamiliar(session(), "owl", "fey", 0);
    expect(next.familiar).toEqual({ monsterId: "owl", creatureType: "fey" });
    expect(next.companionHp).toEqual({ [FIND_FAMILIAR_SPELL_ID]: { current: 1 } });
  });

  it("toggles the familiar's pocket dimension; nothing without a familiar", () => {
    const summoned = summonFamiliar(session(), "owl", "fey", 1);
    const away = setFamiliarDismissed(summoned, true);
    expect(away?.familiar).toEqual({
      monsterId: "owl",
      creatureType: "fey",
      dismissed: true,
    });
    expect(setFamiliarDismissed(away ?? summoned, false)?.familiar).toEqual({
      monsterId: "owl",
      creatureType: "fey",
    });
    expect(setFamiliarDismissed(session(), true)).toBeNull();
  });

  it("ending the familiar drops it and its HP only", () => {
    const summoned = summonFamiliar(
      session({ companionHp: { wolf: { current: 4 } } }),
      "owl",
      "fey",
      1
    );
    const next = dismissFamiliar(summoned);
    expect(next && "familiar" in next).toBe(false);
    expect(next?.companionHp).toEqual({ wolf: { current: 4 } });
    expect(dismissFamiliar(session())).toBeNull();
  });
});

describe("pins", () => {
  it("a default-pinned card toggles in the unpinned list", () => {
    const off = togglePinnedAction(session(), "longsword", true);
    expect(off.unpinnedActions).toEqual(["longsword"]);
    expect(togglePinnedAction(off, "longsword", true).unpinnedActions).toEqual([]);
    expect(off.pinnedActions).toEqual([]);
  });

  it("any other card toggles in the pinned list", () => {
    const on = togglePinnedAction(session(), "fireball", false);
    expect(on.pinnedActions).toEqual(["fireball"]);
    expect(togglePinnedAction(on, "fireball", false).pinnedActions).toEqual([]);
    expect(on.unpinnedActions).toEqual([]);
  });
});

describe("log", () => {
  const event = (amount: number): CombatEvent =>
    ({ kind: "hp-damage", amount }) as unknown as CombatEvent;
  const entry = (id: string, amount = 1): LogEntry => ({
    id,
    ts: 0,
    event: event(amount),
  });

  it("appends and keeps only the last MAX_LOG entries", () => {
    let log: LogEntry[] = [];
    for (let i = 0; i < MAX_LOG + 3; i++) log = appendLogEntry(log, entry(`e${i}`));
    expect(log).toHaveLength(MAX_LOG);
    expect(log[0]?.id).toBe("e3");
    expect(log.at(-1)?.id).toBe(`e${MAX_LOG + 2}`);
  });

  it("removes one entry; null when it is not there", () => {
    expect(removeLogEntry([entry("a"), entry("b")], "a")).toEqual([entry("b")]);
    expect(removeLogEntry([entry("a")], "z")).toBeNull();
  });

  it("amends one entry's event and leaves the rest", () => {
    expect(amendLogEntry([entry("a", 1), entry("b", 2)], "b", event(5))).toEqual([
      entry("a", 1),
      entry("b", 5),
    ]);
  });
});
