/**
 * A state another creature left on you can make you Stable the moment you drop to 0
 * Hit Points (a ring that keeps duellists from dying): the `auto-stabilize` grant
 * inside a selected-recipient state, landed as an encounter or campaign effect, works
 * like the item's (Periapt of Wound Closure). The catalogue spell is a stand-in.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/spells", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/data/spells")>();
  const ring = {
    id: "test-ring",
    grants: [
      {
        type: "while-active",
        activeKey: "spell-test-ring",
        recipient: "selected",
        grants: [{ type: "auto-stabilize" }],
      },
    ],
  };
  return {
    ...real,
    getSpellById: (id: string) => (id === "test-ring" ? ring : real.getSpellById(id)),
  };
});

import { applySheetEvent } from "@/lib/play/sheet-events";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const ring: ActiveCombatEffect = {
  id: "fx-ring",
  actor: { kind: "pc", combatantId: "pc-mara", memberUid: "mara", characterId: "c-mara" },
  target: {
    kind: "pc",
    combatantId: "pc-bren",
    memberUid: "bren",
    characterId: "c-bren",
  },
  source: { kind: "spell", id: "test-ring", actionId: "cast" },
  payload: { kind: "grant-group", activeKey: "spell-test-ring" },
  duration: { kind: "game-clock", untilMinute: 60 },
};

function bren(withRing: boolean): CharacterDoc {
  const doc = makeCharacterDoc(
    { classId: "fighter", level: 3 },
    { hp: { current: 5, temp: 0 } }
  );
  if (withRing) {
    Object.defineProperty(doc.session, "encounterEffects", {
      configurable: true,
      enumerable: false,
      writable: true,
      value: [ring],
    });
  }
  return doc;
}

describe("a state that keeps its holder from dying", () => {
  it("dropping to 0 Hit Points under it, Bren is Stable at once", () => {
    const after = applySheetEvent(bren(true), { kind: "take-damage", amount: 12 });
    expect(after?.session.hp.current).toBe(0);
    expect([after?.session.deathSucc, after?.session.deathFail]).toEqual([3, 0]);
  });

  it("without it, he is dying", () => {
    const after = applySheetEvent(bren(false), { kind: "take-damage", amount: 12 });
    expect([after?.session.deathSucc, after?.session.deathFail]).toEqual([0, 0]);
  });
});
