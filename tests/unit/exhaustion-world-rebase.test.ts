vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
/**
 * The stored exhaustion is the truth, like the stored HP: a world commit (a slot
 * spend) must never copy the world's older exhaustion back over a value that
 * reached the sheet without the world (a DM's edit, a level-6 set the world
 * refuses on a living character).
 */
import { describe, expect, it, vi } from "vitest";

import { characterTrackerSeeds, characterWorldState } from "@/lib/mechanics-world-store";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc, SessionState } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

function docWithWorld(session: Partial<SessionState> = {}): CharacterDoc {
  const doc = makeCharacterDoc(
    { classId: "wizard", level: 5, spellSlots: [{ level: 1, total: 4 }] },
    session
  );
  const world = characterWorldState(
    doc,
    "test-uid",
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  if (!world) throw new Error("world fixture failed");
  doc.session = { ...doc.session, world: structuredClone(world) };
  return doc;
}

function load(doc: CharacterDoc): void {
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
    combatPersistence: null,
    combatPendingConcentrationSaves: [],
  });
}

const exhaustion = (): number | undefined =>
  useCharacterStore.getState().character?.session.exhaustion;

describe("a world commit keeps the stored exhaustion", () => {
  it("an exhaustion the world never saw survives a slot spend", () => {
    const doc = docWithWorld({ exhaustion: 0 });
    // The DM (or any write that bypasses the world) sets level 3 on the sheet.
    load({ ...doc, session: { ...doc.session, exhaustion: 3 } });
    useCharacterStore.getState().useSpellSlot(1);
    expect(exhaustion()).toBe(3);
  });

  it("level 6 on a living character, which the world refuses, survives a slot spend", () => {
    load(docWithWorld({ exhaustion: 2 }));
    useCharacterStore.getState().setExhaustion(6);
    expect(exhaustion()).toBe(6);
    useCharacterStore.getState().useSpellSlot(1);
    expect(exhaustion()).toBe(6);
  });
});
