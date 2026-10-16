/**
 * Spell durations on the clock: a held Concentration and a lit spell state lapse when
 * their duration has passed, whether as combat rounds (End Turn), a declared stretch of
 * time (`time-passes`) or a rest. Cases are real spells and their printed durations:
 * Bane (Concentration, up to 1 minute), Detect Magic (Concentration, up to 10 minutes),
 * Mage Armor (8 hours), Hex (1 hour; 8 hours from a level 3 slot), Continual Flame
 * (until dispelled).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { combatEventToPlayEvent } from "@/lib/session-log/character-events";
import { passTime } from "@/lib/play/time";
import { setActiveState } from "@/lib/play/states";
import {
  concentrationBudgetRounds,
  concentrationTimerKey,
  spellDurationRounds,
} from "@/lib/spell-duration";
import { resolveActiveStatesEndingOnRest } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc, SessionState } from "@/types/character";
import { conc } from "./__helpers__/concentration";
import { makeCharacterDoc } from "./_helpers";

const SPELLS = ["bane", "detect-magic", "mage-armor", "hex", "continual-flame"];

function caster(session: Partial<SessionState> = {}): CharacterDoc {
  return makeCharacterDoc(
    {
      classes: [{ classId: "wizard", level: 9 }],
      spells: SPELLS.map((srdId) => ({ srdId, prepared: true })),
      spellSlots: [
        { level: 1, total: 4 },
        { level: 3, total: 3 },
      ],
    },
    { hp: { current: 40, temp: 0 }, ...session }
  );
}

/** A wizard wearing Mage Armor on themself, lit as a cast lights it. */
function armored(): CharacterDoc {
  const doc = caster();
  const session = setActiveState(doc, "spell-mage-armor", true, 0);
  if (!session) throw new Error("Mage Armor did not light");
  return { ...doc, session };
}

const minutes = (doc: CharacterDoc, n: number): CharacterDoc =>
  applySheetEvent(doc, { kind: "time-passes", minutes: n }) ?? doc;

const store = () => useCharacterStore.getState();

describe("the clock budget of a spell", () => {
  it("reads the structured duration: rounds, minutes, hours; none for until dispelled", () => {
    const duration = (id: string) => {
      const spell = getSpellById(id);
      if (!spell) throw new Error(id);
      return spellDurationRounds(spell.duration);
    };
    expect(duration("bane")).toBe(10);
    expect(duration("detect-magic")).toBe(100);
    expect(duration("mage-armor")).toBe(4_800);
    expect(duration("continual-flame")).toBeNull();
    expect(duration("fireball")).toBeNull();
    expect(duration("creation")).toBeNull();
  });

  it("a slot that lengthens the spell lengthens its Concentration (Hex at level 3)", () => {
    expect(concentrationBudgetRounds("hex", 1)).toBe(600);
    expect(concentrationBudgetRounds("hex", 3)).toBe(4_800);
    expect(concentrationBudgetRounds("", undefined)).toBeNull();
  });
});

describe("Bane (Concentration, up to 1 minute)", () => {
  beforeEach(() => {
    useUndoStore.setState({ characterId: null, past: [], future: [] });
  });

  it("ends after 10 rounds of End Turn, not 9", () => {
    store().setCharacter(caster({ concentration: conc("bane") }));
    for (let round = 1; round <= 9; round++) store().advanceEffectTimers(round);
    expect(store().character?.session.concentration).toBe(conc("bane"));
    store().advanceEffectTimers(10);
    expect(store().character?.session.concentration).toBe("");
  });

  it("lit on yourself too, it ends once: its state's countdown already ends it", () => {
    const doc = caster({ concentration: conc("bane") });
    const session = setActiveState(doc, "spell-bane", true, 0);
    if (!session) throw new Error("Bane did not light");
    store().setCharacter({ ...doc, session });
    for (let round = 1; round <= 9; round++) store().advanceEffectTimers(round);
    const { expired } = store().advanceEffectTimers(10);
    expect(expired.map((effect) => effect.activeKey)).toEqual(["spell-bane"]);
    expect(store().character?.session.concentration).toBe("");
  });

  it("ends when a minute passes", () => {
    const doc = caster({ concentration: conc("bane") });
    expect(minutes(doc, 1).session.concentration).toBe("");
  });

  it("a minute counts the rounds already gone (5 rounds, then 1 minute)", () => {
    store().setCharacter(caster({ concentration: conc("bane") }));
    for (let round = 1; round <= 5; round++) store().advanceEffectTimers(round);
    const after = store().character;
    if (!after) throw new Error("no character");
    expect(after.session.effectTimers?.[concentrationTimerKey("bane")]?.roundsLeft).toBe(
      5
    );
    expect(minutes(after, 1).session.concentration).toBe("");
  });
});

describe("Detect Magic (Concentration, up to 10 minutes)", () => {
  beforeEach(() => {
    useUndoStore.setState({ characterId: null, past: [], future: [] });
  });

  it("survives 5 minutes and ends at 10", () => {
    const fiveIn = minutes(caster({ concentration: conc("detect-magic") }), 5);
    expect(fiveIn.session.concentration).toBe(conc("detect-magic"));
    expect(
      fiveIn.session.effectTimers?.[concentrationTimerKey("detect-magic")]?.roundsLeft
    ).toBe(50);
    expect(minutes(fiveIn, 5).session.concentration).toBe("");
  });

  it("ends on a Short Rest (1 hour)", () => {
    const doc = caster({ concentration: conc("detect-magic") });
    expect(resolveActiveStatesEndingOnRest(doc, "short")).toContain(
      concentrationTimerKey("detect-magic")
    );
    store().setCharacter(doc);
    store().shortRest();
    expect(store().character?.session.concentration).toBe("");
  });

  it("the time-passes event is undoable through the store", () => {
    store().setCharacter(caster({ concentration: conc("detect-magic") }));
    const undo = store().dispatch({ kind: "time-passes", minutes: 10 });
    expect(store().character?.session.concentration).toBe("");
    undo?.();
    expect(store().character?.session.concentration).toBe(conc("detect-magic"));
  });
});

describe("Hex from a level 3 slot (8 hours)", () => {
  it("outlasts a Short Rest", () => {
    const doc = caster({ concentration: conc("hex"), concentrationCastLevel: 3 });
    expect(resolveActiveStatesEndingOnRest(doc, "short")).not.toContain(
      concentrationTimerKey("hex")
    );
    expect(minutes(doc, 60).session.concentration).toBe(conc("hex"));
  });
});

describe("Mage Armor (8 hours)", () => {
  beforeEach(() => {
    useUndoStore.setState({ characterId: null, past: [], future: [] });
  });

  it("survives a Short Rest and ends on a Long Rest", () => {
    store().setCharacter(armored());
    store().shortRest();
    expect(store().character?.session.activeFeatures).toContain("spell-mage-armor");
    store().longRest();
    expect(store().character?.session.activeFeatures).not.toContain("spell-mage-armor");
  });

  it("survives 7 hours and ends at 8", () => {
    const sevenIn = minutes(armored(), 7 * 60);
    expect(sevenIn.session.activeFeatures).toContain("spell-mage-armor");
    expect(sevenIn.session.effectTimers?.["spell-mage-armor"]?.roundsLeft).toBe(600);
    expect(minutes(sevenIn, 60).session.activeFeatures).not.toContain("spell-mage-armor");
  });
});

describe("a duration the clock never ends", () => {
  it("Continual Flame (until dispelled) has no budget and nothing ends by time", () => {
    expect(concentrationBudgetRounds("continual-flame", undefined)).toBeNull();
    const doc = caster({ concentration: conc("continual-flame") });
    expect(passTime(doc, 30 * 24 * 60)).toBeNull();
  });
});

describe("the time-passes log line", () => {
  it("reaches the session log as a time-passes play event", () => {
    expect(
      combatEventToPlayEvent({ kind: "time-passes", minutes: 10 }, "pc-ivo")
    ).toEqual({ kind: "time-passes", minutes: 10, actor: "pc-ivo" });
  });
});
