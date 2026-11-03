/**
 * Forms as a computed layer (edge-case family M2, docs/architecture/2026-11-forms-layer.md):
 * a form recorded as `session.activeForm` is read from the session when the sheet is
 * derived, never stamped into the build. Parity with today's stamping: the derived
 * sheet (scores, AC, speeds) is the same as the stamped one, while the stored build
 * keeps the character's own values.
 */
import { describe, expect, it } from "vitest";

import { getBeast } from "@/data/beasts";
import type { BeastStatBlock } from "@/data/types";
import { assumeBeastForm, dropBeastForm } from "@/lib/play/forms";
import { polymorphBuildPatch, polymorphPriorSnapshot } from "@/lib/polymorph";
import { deriveCharacter } from "@/lib/views/derive-character";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

const caster = (): CharacterDoc =>
  makeCharacterDoc(
    {
      classId: "wizard",
      level: 9,
      abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
    },
    { hp: { current: 40, temp: 0 } }
  );

const beast = (id: string): BeastStatBlock => {
  const found = getBeast(id);
  if (!found) throw new Error(`no beast ${id}`);
  return found;
};

/** The derived numbers a form changes. */
const numbers = (doc: CharacterDoc) => {
  const sheet = deriveCharacter(doc);
  return {
    abilities: Object.fromEntries(
      Object.entries(sheet.abilities).map(([id, a]) => [id, a.score])
    ),
    ac: sheet.ac,
    walk: sheet.walkingSpeedFt,
    speeds: sheet.speeds,
  };
};

/** Today's stamped form, for parity. */
function stamped(
  doc: CharacterDoc,
  block: BeastStatBlock,
  keepsMind = false
): CharacterDoc {
  const prior = polymorphPriorSnapshot(doc);
  return {
    ...doc,
    character: { ...doc.character, ...polymorphBuildPatch(block, prior, keepsMind) },
  };
}

describe("a form is read, not stamped", () => {
  it.each(["giant-ape", "brown-bear", "giant-bat", "eagle"])(
    "Polymorph into %s: the same sheet as stamping, the build untouched",
    (id) => {
      const doc = caster();
      const { doc: formed } = assumeBeastForm(doc, beast(id), "polymorph");
      expect(formed.session.activeForm).toMatchObject({
        sourceId: "polymorph",
        beastId: id,
      });
      expect(formed.session.polymorphForm).toBeUndefined();
      expect(formed.character.abilityScores).toEqual(doc.character.abilityScores);
      expect(formed.character.acOverride ?? null).toBe(doc.character.acOverride ?? null);
      expect(numbers(formed)).toEqual(numbers(stamped(doc, beast(id))));
    }
  );

  it("Shapechange keeps the caster's INT, WIS and CHA", () => {
    const doc = caster();
    const block = beast("giant-ape");
    const { doc: formed } = assumeBeastForm(doc, block, "shapechange");
    const scores = numbers(formed).abilities;
    expect(scores.INT).toBe(18);
    expect(scores.STR).toBe(block.abilityScores.STR);
    expect(numbers(formed)).toEqual(numbers(stamped(doc, block, true)));
  });

  it("dropping the form gives back the caster's own sheet and Temporary HP", () => {
    const doc = caster();
    const { doc: formed } = assumeBeastForm(doc, beast("brown-bear"), "polymorph");
    expect(formed.session.hp.temp).toBe(beast("brown-bear").hp);
    const back = dropBeastForm(formed);
    expect(back?.session.activeForm).toBeUndefined();
    expect(back?.session.hp.temp).toBe(0);
    expect(numbers(back ?? doc)).toEqual(numbers(doc));
  });

  it("an old stamped form (with its prior) still reverts as before", () => {
    const doc = caster();
    const prior = polymorphPriorSnapshot(doc);
    const old: CharacterDoc = {
      ...stamped(doc, beast("brown-bear")),
      session: {
        ...doc.session,
        polymorphForm: { beastId: "brown-bear", spellId: "polymorph", prior },
      },
    };
    const back = dropBeastForm(old);
    expect(back?.character.abilityScores).toEqual(doc.character.abilityScores);
    expect(back?.session.polymorphForm).toBeUndefined();
  });
});
