/**
 * A rest is undoable (owner 2026-10-16, golden rule 5): the rest dialog's confirm
 * registers ONE undo entry, advertised by the standard 5 s toast, that puts the
 * whole character back exactly as it was before the rest and takes the rest's log
 * lines back out, including the copies forwarded to the campaign session log. The
 * undo is causal: once anything changed after the rest, it refuses rather than
 * erase the newer change.
 */

import { afterEach, describe, expect, it } from "vitest";

import { restThroughWorld } from "@/features/character/rest-world-boundary";
import { WISH_STRESS_STATE, isWishStressed } from "@/lib/wish-state";
import { useAuthStore } from "@/stores/authStore";
import { setPlayLogSink, useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";
import type { User } from "firebase/auth";
import type { CharacterDoc } from "@/types/character";

const UID = "test-uid";

function armed(doc: CharacterDoc): void {
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
  useAuthStore.setState({ user: { uid: UID } as User });
  useUndoStore.getState().clear(doc.id);
}

function live(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("live character missing");
  return doc;
}

/** A wizard worn down by a long day: every long-rest recovery has work to do. */
function wornWizard(): CharacterDoc {
  const doc = makeCharacterDoc(
    {
      classId: "wizard",
      level: 5,
      equipment: [
        { srdId: "wand", charges: { current: 1, max: 7, recovery: "long-rest" } },
      ],
    },
    {
      hp: { current: 5, temp: 4 },
      exhaustion: 3,
      hitDice: { used: 3 },
      spellSlots: { "1": { used: 2 }, "2": { used: 1 } },
      fadingPenalties: { "raise-dead": 2 },
      hpMaxReduction: 4,
    }
  );
  doc.session.activeFeatures = [WISH_STRESS_STATE.activeKey];
  doc.session.trackers = { "arcane-recovery": { used: 1 } };
  return doc;
}

afterEach(() => {
  setPlayLogSink(null);
  useCharacterStore.setState({ character: null });
  useAuthStore.setState({ user: null });
  useUndoStore.getState().clear(null);
  useToastStore.setState({ toasts: [] });
});

describe("undoing a rest", () => {
  it("puts a long-rested character back exactly as before, log lines included", () => {
    const doc = wornWizard();
    armed(doc);
    const before = structuredClone(live());
    const removed: string[] = [];
    setPlayLogSink({
      added: () => {},
      removed: (_characterId, entryId) => removed.push(entryId),
      corrected: () => {},
    });

    expect(restThroughWorld("long")).toBe("engine");
    const rested = live();
    expect(rested.session.hp.current).toBe(rested.character.hp.max);
    expect(rested.session.exhaustion).toBe(2);
    expect(isWishStressed(rested.session)).toBe(false);
    const restLines = rested.session.logEntries
      .filter((entry) => !before.session.logEntries.some((old) => old.id === entry.id))
      .map((entry) => entry.id);
    expect(restLines.length).toBeGreaterThan(0);

    // The standard undo toast advertises the rest.
    expect(useToastStore.getState().toasts.some((toast) => toast.onUndo)).toBe(true);
    expect(useUndoStore.getState().undo()).toBe(true);

    const back = live();
    expect(back.session.hp).toEqual(before.session.hp);
    expect(back.session.spellSlots).toEqual(before.session.spellSlots);
    expect(back.session.hitDice).toEqual(before.session.hitDice);
    expect(back.session.trackers).toEqual(before.session.trackers);
    expect(back.session.exhaustion).toBe(3);
    expect(isWishStressed(back.session)).toBe(true);
    expect(back.session.fadingPenalties).toEqual({ "raise-dead": 2 });
    expect(back.session.hpMaxReduction).toBe(4);
    expect(back.character.equipment[0]?.charges).toMatchObject({ current: 1 });
    expect(back.session.logEntries).toEqual(before.session.logEntries);
    expect(back).toEqual(before);
    // The campaign session log hears every rest line taken back.
    expect([...removed].sort()).toEqual([...restLines].sort());
  });

  it("puts a short-rested character back too", () => {
    const doc = makeCharacterDoc(
      { classId: "wizard", level: 5 },
      { hp: { current: 9, temp: 0 }, hitDice: { used: 1 } }
    );
    armed(doc);
    const before = structuredClone(live());

    expect(restThroughWorld("short", { healedHp: 6 })).toBe("engine");
    expect(live().session.hp.current).toBe(15);

    expect(useUndoStore.getState().undo()).toBe(true);
    expect(live()).toEqual(before);
  });

  it("refuses to undo a rest once something changed after it", () => {
    armed(wornWizard());

    expect(restThroughWorld("long")).toBe("engine");
    const after = live();
    useCharacterStore.setState({
      character: {
        ...after,
        session: { ...after.session, hp: { ...after.session.hp, current: 1 } },
      },
    });

    expect(useUndoStore.getState().undo()).toBe(false);
    expect(live().session.hp.current).toBe(1);
    expect(live().session.exhaustion).toBe(2);
  });

  it("still fences the undo entries registered before the rest", () => {
    armed(wornWizard());
    let stale = false;
    useUndoStore.getState().register({
      label: { message: "older" },
      turnScoped: false,
      undo: () => {
        stale = true;
      },
      redo: () => null,
    });

    expect(restThroughWorld("long")).toBe("engine");
    expect(useUndoStore.getState().past).toHaveLength(1);
    expect(useUndoStore.getState().undo()).toBe(true);
    expect(useUndoStore.getState().undo()).toBe(false);
    expect(stale).toBe(false);
  });
});
