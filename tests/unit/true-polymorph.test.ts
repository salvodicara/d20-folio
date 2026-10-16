/**
 * True Polymorph on yourself (SRD 5.2.1, Creature into Creature): the new form can
 * be any kind of creature whose Challenge Rating is equal to or less than the
 * target's (or its level); its game statistics are replaced by the new form's
 * stat block, but it keeps its Hit Points and Hit Point Dice, and gains Temporary
 * Hit Points equal to the new form's Hit Points.
 *
 * Unlike Shapechange, no creature type is excluded and the mind is replaced too.
 * Cases come from the bestiary; the pure transition is pinned doc in → doc out.
 */
import { afterEach, describe, expect, it } from "vitest";
import { MONSTERS, getMonster } from "@/data/monsters";
import { beastProjectionFromMonster } from "@/lib/beast-projection";
import { resolveBestiaryForms } from "@/lib/bestiary-forms";
import {
  bestiaryNameKey,
  polymorphPriorSnapshot,
  selfFormRule,
  SELF_FORM_SPELL_IDS,
} from "@/lib/polymorph";
import { assumeBeastForm, dropBeastForm } from "@/lib/play/forms";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import type { BeastStatBlock } from "@/data/types";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function form(id: string): BeastStatBlock {
  const monster = getMonster(id);
  if (!monster) throw new Error(`no monster ${id}`);
  return beastProjectionFromMonster(monster);
}

function wizard(level = 17): CharacterDoc {
  const doc = makeCharacterDoc({
    classId: "wizard",
    level,
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 20, WIS: 12, CHA: 10 },
  });
  doc.session.hp.current = 40;
  doc.session.hp.temp = 0;
  return doc;
}

describe("the True Polymorph forms (any creature of CR ≤ your level)", () => {
  it.each([1, 9, 17, 20])(
    "at level %i the pool is the whole bestiary up to that CR",
    (level) => {
      const expected = MONSTERS.filter((m) => m.cr <= level).map((m) => m.id);
      const forms = resolveBestiaryForms("true-polymorph", level);
      expect(forms.map((f) => f.id).sort()).toEqual([...expected].sort());
    }
  );

  it("offers the Constructs and Undead Shapechange may not take", () => {
    const tp = new Set(resolveBestiaryForms("true-polymorph", 20).map((f) => f.id));
    const sc = new Set(resolveBestiaryForms("shapechange", 20).map((f) => f.id));
    const excluded = MONSTERS.filter(
      (m) => m.cr <= 20 && (m.type === "construct" || m.type === "undead")
    );
    expect(excluded.length).toBeGreaterThan(0);
    for (const m of excluded) {
      expect(tp.has(m.id), m.id).toBe(true);
      expect(sc.has(m.id), m.id).toBe(false);
    }
  });

  it("names a bestiary form's attacks and traits from the monster catalogue", () => {
    expect(bestiaryNameKey("iron-golem", "attack.bladed-arm")).toBe(
      "iron-golem.actions.bladed-arm"
    );
    expect(bestiaryNameKey("aboleth", "trait.amphibious")).toBe(
      "aboleth.traits.amphibious"
    );
  });
});

describe("the True Polymorph rule", () => {
  it("draws from the bestiary, replaces the mind, and ends at 0 Temp HP", () => {
    expect(SELF_FORM_SPELL_IDS).toContain("true-polymorph");
    expect(selfFormRule("true-polymorph")).toMatchObject({
      pool: "bestiary",
      keepsMind: false,
      reshift: false,
      endsWithoutTempHp: true,
    });
  });
});

describe("assumeBeastForm with True Polymorph (doc in, doc out)", () => {
  it("takes a Construct's whole stat block and its HP as Temp HP; drop restores you", () => {
    const doc = wizard();
    const frozen = structuredClone(doc);
    const golem = form("iron-golem");
    const { doc: next, tempHp } = assumeBeastForm(
      doc,
      golem,
      "true-polymorph",
      polymorphPriorSnapshot(doc)
    );
    expect(doc).toEqual(frozen);
    expect(next.character.abilityScores).toEqual(golem.abilityScores);
    expect(next.character.acOverride).toBe(golem.ac);
    expect(tempHp).toBe(golem.hp);
    expect(next.session.hp.current).toBe(40);
    expect(next.session.polymorphForm?.statBlock).toEqual(golem);

    const dropped = dropBeastForm(next);
    expect(dropped?.character.abilityScores).toEqual(doc.character.abilityScores);
    expect(dropped?.character.acOverride ?? null).toBe(doc.character.acOverride ?? null);
    expect(dropped?.session.hp.temp).toBe(0);
  });
});

describe("the store: True Polymorph through the Transform flow", () => {
  afterEach(() => {
    useCharacterStore.getState().setCharacter(null);
    useToastStore.setState({ toasts: [] });
  });

  it("concentrates on True Polymorph and ends the form when its Temp HP run out", () => {
    useCharacterStore.getState().setCharacter(wizard());
    const golem = form("iron-golem");
    useCharacterStore.getState().assumePolymorphForm(golem.id, "true-polymorph", golem);
    let doc = useCharacterStore.getState().character;
    expect(doc?.session.concentration).toBe("true-polymorph");
    expect(doc?.session.polymorphForm?.beastId).toBe("iron-golem");

    useCharacterStore.getState().applyDamage(golem.hp);
    doc = useCharacterStore.getState().character;
    expect(doc?.session.polymorphForm).toBeUndefined();
    expect(doc?.session.concentration).toBe("");
  });
});
