/**
 * Who can't speak (2024): a creature entirely inside Silence ("Casting a spell that
 * includes a Verbal component is impossible there"), and an Incapacitated one ("it
 * can't speak"), Paralyzed, Stunned and Unconscious included. An item used with a
 * command word («use a command word») is then blocked too.
 */
import { describe, expect, it } from "vitest";

import { getMagicItem } from "@/data/magic-items";
import { cannotSpeak, commandWordBlocked } from "@/lib/play/speech";
import type { ActiveCombatEffect } from "@/types/combat-effect";
import { makeCharacterDoc } from "./_helpers";

/** Silence's state on a creature inside the Sphere, as the fight projects it. */
const insideSilence: ActiveCombatEffect = {
  id: "silence-1",
  actor: { kind: "monster", combatantId: "caster" },
  target: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: "test-char" },
  source: { kind: "spell", id: "silence", actionId: "spell-silence" },
  payload: { kind: "grant-group", activeKey: "spell-silence" },
  duration: { kind: "concentration", actorId: "caster", sourceId: "silence" },
};
const silenced = () => makeCharacterDoc({}, { encounterEffects: [insideSilence] });

describe("cannotSpeak", () => {
  it("a creature speaks by default", () => {
    expect(cannotSpeak(makeCharacterDoc())).toBe(false);
  });

  it("inside Silence it can't", () => {
    expect(cannotSpeak(silenced())).toBe(true);
  });

  it.each(["incapacitated", "paralyzed", "stunned", "unconscious"])(
    "%s: it can't (Incapacitated can't speak)",
    (condition) => {
      expect(cannotSpeak(makeCharacterDoc({}, { conditions: [condition] }))).toBe(true);
    }
  );
});

describe("commandWordBlocked", () => {
  it("the Carpet of Flying's command word is blocked inside Silence", () => {
    expect(getMagicItem("carpet-of-flying")?.commandWord).toBe(true);
    expect(commandWordBlocked(silenced(), "carpet-of-flying")).toBe(true);
    expect(commandWordBlocked(makeCharacterDoc(), "carpet-of-flying")).toBe(false);
  });

  it("an item with no command word is never blocked by silence", () => {
    expect(commandWordBlocked(silenced(), "cloak-of-protection")).toBe(false);
  });
});
