/**
 * What ends a state on the character's own acts (edge-case family M3).
 *
 * 2024 Hide: you have the Invisible condition while hidden, and it ends "immediately
 * after you make a sound louder than a whisper, an enemy finds you, you make an
 * attack roll, or you cast a spell with a Verbal component". Being found ends the
 * Hide only, not another source's Invisible (a Potion of Invisibility).
 *
 * Every use goes through `actsOfUse`, so a weapon attack, a spell and a spell attack
 * end what their acts end, within the use's own undo.
 */
import { describe, expect, it } from "vitest";

import { MOCK_CHARACTER } from "@/lib/mock";
import { removeCondition } from "@/lib/play/conditions";
import { endStatesOnAct, actsOfUse } from "@/lib/play/states";
import { localizeActions } from "@/lib/views/combat-action-view";
import type { CharacterDoc, SessionState } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

const withSession = (session: Partial<SessionState>): CharacterDoc => ({
  ...MOCK_CHARACTER,
  session: { ...MOCK_CHARACTER.session, ...session },
});

const hidden = (extra: Partial<SessionState> = {}) =>
  withSession({ conditions: ["invisible"], hiddenDc: 17, ...extra });

describe("Hide's Invisible ends on the hider's acts (corpus: Hide grants Invisible)", () => {
  it.each(["attack-roll", "verbal-spell", "loud-noise"] as const)(
    "%s ends it, with the find DC",
    (act) => {
      const after = endStatesOnAct(hidden(), act);
      expect(after?.session.conditions).not.toContain("invisible");
      expect(after?.session.hiddenDc).toBeUndefined();
    }
  );

  it("a spell without a Verbal component does not end it", () => {
    expect(endStatesOnAct(hidden(), "cast-spell")).toBeNull();
  });

  it("an Invisible that is not a Hide (no find DC) stays", () => {
    expect(
      endStatesOnAct(withSession({ conditions: ["invisible"] }), "attack-roll")
    ).toBeNull();
  });
});

describe("being found ends the Hide only (corpus: Blindsight and Truesight)", () => {
  const potion = "potion:potion-of-invisibility";

  it("removing the Hide's Invisible keeps a potion's Invisibility running", () => {
    const after = removeCondition(
      hidden({ hiddenDc: 15, activeFeatures: [potion] }),
      "invisible"
    );
    expect(after?.session.activeFeatures).toContain(potion);
    expect(after?.session.hiddenDc).toBeUndefined();
    expect(after?.session.conditions).not.toContain("invisible");
  });

  it("with no chip of its own, removing Invisible still ends the potion's state", () => {
    const after = removeCondition(
      withSession({ conditions: [], activeFeatures: [potion] }),
      "invisible"
    );
    expect(after?.session.activeFeatures ?? []).not.toContain(potion);
  });
});

describe("the acts of a use", () => {
  const fighter = makeCharacterDoc({
    classId: "fighter",
    level: 3,
    weapons: [{ srdId: "longsword", quantity: 1 }],
  });
  const wizard = makeCharacterDoc({
    classId: "wizard",
    level: 3,
    spells: [
      { srdId: "fire-bolt", prepared: true },
      { srdId: "mage-armor", prepared: true },
      { srdId: "misty-step", prepared: true },
    ],
  });
  const action = (doc: CharacterDoc, id: string) => {
    const found = localizeActions(doc, "en").find((a) => a.id === id);
    if (!found) throw new Error(`no action ${id}`);
    return found;
  };

  it("a weapon attack makes an attack roll", () => {
    expect(actsOfUse(action(fighter, "weapon-longsword"))).toEqual(["attack-roll"]);
  });

  it("a spell attack with a Verbal component is all three", () => {
    expect(actsOfUse(action(wizard, "spell-fire-bolt")).sort()).toEqual(
      ["attack-roll", "cast-spell", "verbal-spell"].sort()
    );
  });

  it("Misty Step (Verbal only, no attack) is a cast with a Verbal component", () => {
    expect(actsOfUse(action(wizard, "spell-misty-step")).sort()).toEqual(
      ["cast-spell", "verbal-spell"].sort()
    );
  });
});
