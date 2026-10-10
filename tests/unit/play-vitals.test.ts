/**
 * The pure play transitions for hit points, spell slots and trackers
 * (`src/lib/play/vitals.ts`): the character in, the next session out, with no store.
 * The store's own behaviour is pinned by `character-store-world-vitals.test.ts`; these
 * cases pin the rules on the functions themselves, with and without a world.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { characterTrackerSeeds, characterWorldState } from "@/lib/mechanics-world-store";
import { addCondition, removeCondition } from "@/lib/play/conditions";
import { takeDamage } from "@/lib/play/damage";
import {
  restoreSpellSlot,
  restoreTracker,
  setDeathSaves,
  setExhaustion,
  setHp,
  setTempHp,
  spendSpellSlot,
  spendTracker,
} from "@/lib/play/vitals";
import type { CharacterDoc, SessionState } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const UID = "test-uid";

function withWorld(doc: CharacterDoc): CharacterDoc {
  const world = characterWorldState(
    doc,
    UID,
    doc.character.hp.max,
    {},
    characterTrackerSeeds(doc)
  );
  if (!world) throw new Error("world fixture failed");
  return { ...doc, session: { ...doc.session, world: structuredClone(world) } };
}

const wizard = (session: Partial<SessionState> = {}) =>
  makeCharacterDoc(
    { classId: "wizard", level: 5, spellSlots: [{ level: 2, total: 3 }] },
    session
  );

describe("setHp", () => {
  it("clamps to the maximum and never mutates the character it reads", () => {
    const doc = wizard({ hp: { current: 10, temp: 0 } });
    const before = structuredClone(doc);
    const next = setHp(doc, 999);
    expect(next.hp.current).toBe(doc.character.hp.max);
    expect(doc).toEqual(before);
  });

  it("healing from 0 resets the death saves and sheds Unconscious", () => {
    const doc = wizard({
      hp: { current: 0, temp: 0 },
      deathSucc: 1,
      deathFail: 2,
      conditions: ["unconscious", "prone"],
    });
    const next = setHp(doc, 4);
    expect(next).toMatchObject({ deathSucc: 0, deathFail: 0 });
    expect(next.conditions).toEqual(["prone"]);
  });

  it("with a world, moves the world and mirrors the session in one value", () => {
    const next = setHp(withWorld(wizard({ hp: { current: 20, temp: 0 } })), 0);
    expect(next.hp.current).toBe(0);
    expect(next.world).toBeDefined();
  });
});

describe("setTempHp", () => {
  it("sets temporary HP, never below 0", () => {
    expect(setTempHp(wizard(), 6).hp.temp).toBe(6);
    expect(setTempHp(wizard({ hp: { current: 10, temp: 4 } }), -3).hp.temp).toBe(0);
  });
});

describe("spell slots", () => {
  it("spends and restores the legacy counter without a world", () => {
    const spent = spendSpellSlot(wizard(), 2, false);
    expect(spent.spellSlots["2"]?.used).toBe(1);
    const doc = wizard({ spellSlots: { "2": { used: 1 } } });
    expect(restoreSpellSlot(doc, 2, false).spellSlots["2"]?.used).toBe(0);
    expect(restoreSpellSlot(wizard(), 2, false).spellSlots["2"]?.used).toBe(0);
  });

  it("with a world, spends the world cell and mirrors the counter", () => {
    const next = spendSpellSlot(withWorld(wizard()), 2, false);
    expect(next.spellSlots["2"]?.used).toBe(1);
  });
});

describe("trackers", () => {
  const fighter = (session: Partial<SessionState> = {}) =>
    makeCharacterDoc(
      { classId: "fighter", level: 5, features: [{ srdId: "fighter-second-wind" }] },
      session
    );

  it("spends and restores uses, keeping a tracker's other fields", () => {
    const doc = fighter({
      trackers: { "fighter-second-wind": { used: 0, rolls: [3] } },
    });
    const spent = spendTracker(doc, "fighter-second-wind", 1);
    expect(spent.trackers["fighter-second-wind"]).toMatchObject({ used: 1 });
    const restored = restoreTracker({ ...doc, session: spent }, "fighter-second-wind", 5);
    expect(restored.trackers["fighter-second-wind"]?.used).toBe(0);
  });
});

describe("death saves and exhaustion", () => {
  it("names only an ADDED mark; unchanged counts are no transition", () => {
    const down = wizard({ hp: { current: 0, temp: 0 }, deathSucc: 1, deathFail: 0 });
    expect(setDeathSaves(down, 2, 0)?.newMark).toBe("success");
    expect(setDeathSaves(down, 1, 1)?.newMark).toBe("failure");
    expect(setDeathSaves(down, 0, 0)?.newMark).toBeNull();
    expect(setDeathSaves(down, 1, 0)).toBeNull();
    expect(setDeathSaves(down, 9, -2)?.session).toMatchObject({
      deathSucc: 3,
      deathFail: 0,
    });
  });

  it("sets exhaustion within 0–6, or nothing when unchanged", () => {
    expect(setExhaustion(wizard(), 2.6)?.exhaustion).toBe(3);
    expect(setExhaustion(wizard({ exhaustion: 2 }), 2)).toBeNull();
    expect(setExhaustion(wizard(), Number.NaN)).toBeNull();
  });
});

describe("conditions", () => {
  it("adds a condition once and removes it, forgetting the hidden find-DC with Invisible", () => {
    const added = addCondition(wizard(), "invisible");
    expect(added?.conditions).toEqual(["invisible"]);
    expect(
      addCondition(
        { ...wizard(), session: { ...wizard().session, conditions: ["invisible"] } },
        "invisible"
      )
    ).toBeNull();
    const hidden = wizard({ conditions: ["invisible"], hiddenDc: 17 });
    const removed = removeCondition(hidden, "invisible");
    expect(removed?.session.conditions).toEqual([]);
    expect(removed?.session.hiddenDc).toBeUndefined();
    expect(removed?.worldActionId).toBeNull();
    expect(removeCondition(wizard(), "prone")).toBeNull();
  });
});

describe("takeDamage", () => {
  it("temp HP absorbs first, then current HP", () => {
    const taken = takeDamage(wizard({ hp: { current: 20, temp: 5 } }), 8);
    expect(taken?.session.hp).toMatchObject({ current: 17, temp: 0 });
    expect(taken?.transition.events.some((event) => event.kind === "hp-damage")).toBe(
      true
    );
  });

  it("dropping to 0 knocks the character unconscious on the dying track", () => {
    const taken = takeDamage(wizard({ hp: { current: 6, temp: 0 } }), 10);
    expect(taken?.session.hp.current).toBe(0);
    expect(taken?.session.conditions).toContain("unconscious");
    expect(taken?.session).toMatchObject({ deathSucc: 0, deathFail: 0 });
  });

  it("never mutates the character it reads", () => {
    const doc = wizard({ hp: { current: 20, temp: 5 } });
    const before = structuredClone(doc);
    takeDamage(doc, 8);
    expect(doc).toEqual(before);
  });
});
