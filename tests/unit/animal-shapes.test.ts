/**
 * Animal Shapes on the caster's own sheet (SRD 5.2.1, 2024): a willing creature
 * (here, the caster) shape-shifts into a Large or smaller Beast of Challenge
 * Rating 4 or lower; it keeps its Hit Points, Hit Point Dice and its Intelligence,
 * Wisdom and Charisma scores; it gains Temporary Hit Points equal to the first
 * form's Hit Points; the caster can transform it again on later turns; and the
 * transformation lasts until it has no Temporary Hit Points. The spell lasts 24
 * hours without Concentration.
 *
 * Cases come from the Beast catalogue itself; the pure transitions are pinned doc
 * in → doc out, never mutating their input.
 */
import { afterEach, describe, expect, it } from "vitest";
import { BEASTS, getBeast } from "@/data/beasts";
import { CREATURE_SIZE_ORDER, type BeastStatBlock } from "@/data/types";
import {
  polymorphPriorSnapshot,
  resolvePolymorphForms,
  selfFormRule,
  SELF_FORM_SPELL_IDS,
} from "@/lib/polymorph";
import { assumeBeastForm, dropBeastForm } from "@/lib/play/forms";
import { concentrationValue } from "@/lib/concentration";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const LARGE = CREATURE_SIZE_ORDER.indexOf("Large");

function beast(id: string): BeastStatBlock {
  const b = getBeast(id);
  if (!b) throw new Error(`no beast ${id}`);
  return b;
}

function druid(level = 15): CharacterDoc {
  const doc = makeCharacterDoc({
    classId: "druid",
    level,
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 13, WIS: 18, CHA: 11 },
  });
  doc.session.hp.current = 40;
  doc.session.hp.temp = 2;
  return doc;
}

describe("the Animal Shapes forms (Large or smaller Beast, CR 4 or lower)", () => {
  it.each([15, 20])("at level %i the pool is exactly the eligible Beasts", (level) => {
    const expected = BEASTS.filter(
      (b) => b.cr <= 4 && CREATURE_SIZE_ORDER.indexOf(b.size) <= LARGE
    ).map((b) => b.id);
    const forms = resolvePolymorphForms(druid(level), "animal-shapes");
    expect(forms.map((f) => f.id).sort()).toEqual([...expected].sort());
  });

  it("a Huge Beast and a CR 5+ Beast are never offered, at any level", () => {
    const ids = new Set(
      resolvePolymorphForms(druid(20), "animal-shapes").map((f) => f.id)
    );
    for (const b of BEASTS) {
      if (b.cr > 4 || CREATURE_SIZE_ORDER.indexOf(b.size) > LARGE) {
        expect(ids.has(b.id), b.id).toBe(false);
      }
    }
  });

  it("Polymorph's pool still follows the caster's level", () => {
    const forms = resolvePolymorphForms(druid(15));
    expect(forms.some((f) => f.cr > 4)).toBe(true);
  });
});

describe("the Animal Shapes rule", () => {
  it("keeps the mind, reshifts, and ends when its Temporary HP run out", () => {
    expect(SELF_FORM_SPELL_IDS).toContain("animal-shapes");
    expect(selfFormRule("animal-shapes")).toMatchObject({
      pool: "beasts",
      keepsMind: true,
      reshift: true,
      endsWithoutTempHp: true,
    });
  });
});

describe("assumeBeastForm with Animal Shapes (doc in, doc out)", () => {
  it("takes the Beast's body and Temp HP, keeps INT/WIS/CHA; a second form keeps the Temp HP", () => {
    const doc = druid();
    const frozen = structuredClone(doc);
    const bear = beast("brown-bear");
    const first = assumeBeastForm(
      doc,
      bear,
      "animal-shapes",
      polymorphPriorSnapshot(doc)
    );
    expect(doc).toEqual(frozen);
    expect(first.doc.character.abilityScores).toEqual({
      ...bear.abilityScores,
      INT: 13,
      WIS: 18,
      CHA: 11,
    });
    expect(first.doc.session.hp.temp).toBe(bear.hp);
    expect(first.doc.session.polymorphForm?.statBlock).toBeUndefined();

    const wolf = beast("dire-wolf");
    const second = assumeBeastForm(
      first.doc,
      wolf,
      "animal-shapes",
      polymorphPriorSnapshot(first.doc)
    );
    expect(second.reshift).toBe(true);
    expect(second.doc.session.hp.temp).toBe(bear.hp);
    expect(second.doc.character.acOverride).toBe(wolf.ac);

    const dropped = dropBeastForm(second.doc);
    expect(dropped?.character.abilityScores).toEqual(doc.character.abilityScores);
    expect(dropped?.session.hp.temp).toBe(2);
  });

  it("a depleted form drops with the Temp HP it was left with", () => {
    const doc = druid();
    const formed = assumeBeastForm(
      doc,
      beast("brown-bear"),
      "animal-shapes",
      polymorphPriorSnapshot(doc)
    ).doc;
    const depleted: CharacterDoc = {
      ...formed,
      session: { ...formed.session, hp: { ...formed.session.hp, temp: 0 } },
    };
    const frozen = structuredClone(depleted);
    const dropped = dropBeastForm(depleted, 0);
    expect(depleted).toEqual(frozen);
    expect(dropped?.session.hp.temp).toBe(0);
    expect(dropped?.session.polymorphForm).toBeUndefined();
    expect(dropped?.character.abilityScores).toEqual(doc.character.abilityScores);
  });
});

describe("the store: Animal Shapes through the Transform flow", () => {
  afterEach(() => {
    useCharacterStore.getState().setCharacter(null);
    useToastStore.setState({ toasts: [] });
  });

  it("needs no Concentration, and running out of Temp HP ends only the form", () => {
    const doc = druid();
    doc.session.concentration = concentrationValue("barkskin");
    useCharacterStore.getState().setCharacter(doc);
    const bear = beast("brown-bear");
    useCharacterStore.getState().assumePolymorphForm(bear.id, "animal-shapes");
    let after = useCharacterStore.getState().character;
    expect(after?.session.polymorphForm?.beastId).toBe("brown-bear");
    expect(after?.session.concentration).toBe("barkskin");

    useCharacterStore.getState().applyDamage(bear.hp);
    after = useCharacterStore.getState().character;
    expect(after?.session.polymorphForm).toBeUndefined();
    expect(after?.session.hp.temp).toBe(0);
    expect(after?.session.hp.current).toBe(40);
    expect(after?.character.abilityScores).toEqual(doc.character.abilityScores);
    // Barkskin is unrelated: its Concentration holds (a save is due, not a drop).
    expect(after?.session.concentration).toBe("barkskin");
    const intents = useToastStore.getState().toasts.map((t) => t.intent?.kind);
    expect(intents).not.toContain("concentration-dropped");
  });
});
