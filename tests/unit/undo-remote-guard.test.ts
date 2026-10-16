/**
 * The undo stack survives another device's write (owner 2026-10-16, golden rule 5).
 * A DM or another player writing this character's combat vitals (HP, conditions,
 * death saves, inspiration) no longer wipes the player's history. Instead every entry
 * already on the stack remembers which vitals were changed remotely, and undoing it
 * REFUSES only when its reversal would also overwrite one of those changes. Entries
 * that touch nothing remote (slots, trackers, casts) stay undoable; entries made after
 * the remote write are unguarded; solo play behaves exactly as before.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import { setPlayLogSink, useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast, useUndoStore } from "@/stores/undoStore";

function load(): void {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.logEntries = [];
  doc.session.concentration = "";
  doc.session.conditions = [];
  doc.session.hp = { current: 20, temp: 0 };
  doc.character.hp = { ...doc.character.hp, max: 40 };
  doc.session.deathSucc = 0;
  doc.session.deathFail = 0;
  doc.session.spellSlots = { "1": { used: 0 } };
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
  useUndoStore.getState().clear(doc.id);
}

const store = () => useCharacterStore.getState();
const session = () => {
  const doc = store().character;
  if (!doc) throw new Error("no character");
  return doc.session;
};

/** A remote write as the subscription applies it: the vitals change, then the fence marks. */
function remoteWrite(
  change: (s: ReturnType<typeof session>) => Partial<ReturnType<typeof session>>,
  roots: string[]
): void {
  const doc = store().character;
  if (!doc) throw new Error("no character");
  useCharacterStore.setState({
    character: { ...doc, session: { ...doc.session, ...change(doc.session) } },
  });
  useUndoStore.getState().markRemoteTouched(roots);
}

function heal(amount: number): void {
  registerUndoableToast({ message: "heal" }, () => store().applyHealing(amount), {
    turnScoped: false,
  });
}

/** An entry whose reversal writes ONLY the current HP (no conditions, no death saves). */
function setHpUndoable(next: number): void {
  const prev = session().hp.current;
  registerUndoableToast(
    { message: "set hp" },
    () => {
      store().setHP(next);
      return () => store().setHP(prev);
    },
    { turnScoped: false }
  );
}

function spendSlot(): void {
  registerUndoableToast(
    { message: "slot" },
    () => {
      store().useSpellSlot(1);
      return () => store().restoreSpellSlot(1);
    },
    { turnScoped: false }
  );
}

beforeEach(() => {
  setPlayLogSink(null);
  load();
});

describe("undo after another device wrote this character", () => {
  it("solo play: undoing a heal works exactly as before", () => {
    heal(7);
    expect(session().hp.current).toBe(27);
    expect(useUndoStore.getState().undo()).toBe(true);
    expect(session().hp.current).toBe(20);
    expect(session().logEntries).toEqual([]);
  });

  it("refuses to undo a heal over the DM's later damage, keeping the DM's HP and the log", () => {
    heal(7);
    remoteWrite((s) => ({ hp: { ...s.hp, current: 15 } }), ["hp"]);

    expect(useUndoStore.getState().undo()).toBe(false);
    expect(session().hp.current).toBe(15);
    expect(session().logEntries.map((e) => e.event.kind)).toEqual(["hp-heal"]);
    // The refused entry stays on the stack, still refusing.
    expect(useUndoStore.getState().past).toHaveLength(1);
    expect(useUndoStore.getState().undo()).toBe(false);
  });

  it("a refused undo leaves the campaign session log exactly as it was", () => {
    const heard: string[] = [];
    setPlayLogSink({
      added: (_id, entry) => heard.push(`+${entry.event.kind}`),
      removed: () => heard.push("-"),
      corrected: () => {},
    });
    store().applyDamage(1); // an older line that must not be re-announced
    heal(7);
    remoteWrite((s) => ({ hp: { ...s.hp, current: 15 } }), ["hp"]);
    heard.length = 0;

    expect(useUndoStore.getState().undo()).toBe(false);
    // The undo dropped its heal line (one removal), and the put-back re-adds exactly it.
    expect(heard).toEqual(["-", "+hp-heal"]);
  });

  it("still undoes a slot spend after the DM's damage, leaving the DM's HP alone", () => {
    spendSlot();
    remoteWrite((s) => ({ hp: { ...s.hp, current: 12 } }), ["hp"]);

    expect(useUndoStore.getState().undo()).toBe(true);
    expect(session().spellSlots["1"]?.used ?? 0).toBe(0);
    expect(session().hp.current).toBe(12);
  });

  it("a DM condition blocks undoing a heal whose reversal would also drop it", () => {
    heal(7);
    remoteWrite((s) => ({ conditions: [...s.conditions, "poisoned"] }), ["conditions"]);

    expect(useUndoStore.getState().undo()).toBe(false);
    expect(session().conditions).toEqual(["poisoned"]);
    expect(session().hp.current).toBe(27);
  });

  it("a DM condition does not block undoing a change that only touches HP", () => {
    setHpUndoable(30);
    remoteWrite((s) => ({ conditions: [...s.conditions, "poisoned"] }), ["conditions"]);

    expect(useUndoStore.getState().undo()).toBe(true);
    expect(session().hp.current).toBe(20);
    expect(session().conditions).toEqual(["poisoned"]);
  });

  it("two remote writes in a row add up", () => {
    setHpUndoable(30);
    remoteWrite((s) => ({ conditions: [...s.conditions, "poisoned"] }), ["conditions"]);
    remoteWrite((s) => ({ hp: { ...s.hp, current: 25 } }), ["hp"]);

    expect(useUndoStore.getState().undo()).toBe(false);
    expect(session().hp.current).toBe(25);
    expect(session().conditions).toEqual(["poisoned"]);
  });

  it("a refused undo leaves nothing to redo and changes nothing", () => {
    heal(7);
    remoteWrite((s) => ({ hp: { ...s.hp, current: 15 } }), ["hp"]);
    const before = structuredClone(session());

    expect(useUndoStore.getState().undo()).toBe(false);
    expect(useUndoStore.getState().redo()).toBe(false);
    expect(session()).toEqual(before);
  });

  it("an action made after the remote write is undoable as usual", () => {
    remoteWrite((s) => ({ hp: { ...s.hp, current: 15 } }), ["hp"]);
    heal(5);

    expect(useUndoStore.getState().undo()).toBe(true);
    expect(session().hp.current).toBe(15);
  });
});
