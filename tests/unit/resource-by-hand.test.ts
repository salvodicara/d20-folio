/**
 * A resource the player changes by hand (a spell-slot pip, the Exhaustion track, Heroic
 * Inspiration) leaves a line in the play log and so in the session report: production
 * (2026-11-12) showed one player per session with 1–2 lines, and these taps wrote none.
 * The change itself is the existing store action, unchanged (it persists as before); the
 * lines come from `resourceLogEvents`, and the undo removes them before it reverts.
 * A cast pays its slot through the same store action without this wrapper, so a cast
 * never writes a second line.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";

function load(): void {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.logEntries = [];
  doc.session.exhaustion = 0;
  doc.session.inspiration = false;
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
}

const store = () => useCharacterStore.getState();
const kinds = () =>
  (store().character?.session.logEntries ?? []).map((e) => e.event.kind);

beforeEach(load);

describe("a resource changed by hand", () => {
  it("a spent slot pip writes its line; undo takes back the line and the slot", () => {
    const usedBefore = store().character?.session.spellSlots["1"]?.used ?? 0;
    const undo = store().changeResourceByHand(
      () => store().useSpellSlot(1),
      () => store().restoreSpellSlot(1)
    );
    expect(store().character?.session.logEntries.at(-1)?.event).toMatchObject({
      kind: "slot-spent",
      level: 1,
      count: 1,
    });
    undo();
    expect(kinds()).toEqual([]);
    expect(store().character?.session.spellSlots["1"]?.used ?? 0).toBe(usedBefore);
  });

  it("Exhaustion and Heroic Inspiration write theirs", () => {
    store().changeResourceByHand(
      () => store().setExhaustion(2),
      () => store().setExhaustion(0)
    );
    store().changeResourceByHand(
      () => store().setHeroicInspiration(true),
      () => store().setHeroicInspiration(false)
    );
    expect(kinds()).toEqual(["exhaustion-change", "inspiration-change"]);
  });

  it("the store action alone, as a cast pays its slot, writes nothing", () => {
    store().useSpellSlot(1);
    expect(kinds()).toEqual([]);
  });

  it("a tap that changes nothing writes nothing", () => {
    store().changeResourceByHand(
      () => store().setHeroicInspiration(false),
      () => store().setHeroicInspiration(false)
    );
    expect(kinds()).toEqual([]);
  });
});
