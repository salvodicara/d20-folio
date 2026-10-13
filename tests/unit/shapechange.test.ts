/**
 * Shapechange on the caster's own sheet (SRD 5.2.1, 2024): the new form is any
 * creature of Challenge Rating ≤ your level that is not a Construct or an Undead;
 * your game statistics are replaced by its stat block, but you keep your Hit Points,
 * Hit Point Dice and your Intelligence, Wisdom and Charisma scores; you gain
 * Temporary Hit Points equal to the Hit Points of the FIRST form you take; and you
 * can shift into a different eligible form while the spell lasts.
 *
 * The cases come from the bestiary itself (every monster, every level), and the
 * pure transitions are pinned doc in → doc out, never mutating their input.
 */
import { afterEach, describe, expect, it } from "vitest";
import { MONSTERS, getMonster } from "@/data/monsters";
import { beastProjectionFromMonster } from "@/lib/beast-projection";
import { resolveShapechangeForms } from "@/lib/shapechange";
import {
  formStatBlock,
  polymorphPriorSnapshot,
  selfFormRule,
  SELF_FORM_SPELL_IDS,
} from "@/lib/polymorph";
import { assumeBeastForm, dropBeastForm } from "@/lib/play/forms";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import { resolveActions } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import type { BeastStatBlock } from "@/data/types";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const MIND = ["INT", "WIS", "CHA"] as const;
const BODY = ["STR", "DEX", "CON"] as const;

function form(id: string): BeastStatBlock {
  const monster = getMonster(id);
  if (!monster) throw new Error(`no monster ${id}`);
  return beastProjectionFromMonster(monster);
}

function druid(level = 18): CharacterDoc {
  const doc = makeCharacterDoc({
    classId: "druid",
    level,
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 13, WIS: 18, CHA: 11 },
  });
  doc.session.hp.current = 90;
  doc.session.hp.temp = 4;
  return doc;
}

describe("the Shapechange forms (CR ≤ your level, not a Construct or an Undead)", () => {
  it.each([1, 9, 17, 20])(
    "at level %i the pool is exactly the eligible bestiary",
    (level) => {
      const expected = MONSTERS.filter(
        (m) => m.cr <= level && m.type !== "construct" && m.type !== "undead"
      ).map((m) => m.id);
      const forms = resolveShapechangeForms(level);
      expect(forms.map((f) => f.id).sort()).toEqual([...expected].sort());
    }
  );

  it("every form is the monster's own projection (one stat-block shape)", () => {
    for (const f of resolveShapechangeForms(30)) {
      const monster = getMonster(f.id);
      if (!monster) throw new Error(f.id);
      expect(f).toEqual(beastProjectionFromMonster(monster));
    }
  });

  it("offers more than Beasts: a dragon at level 17, never at 16", () => {
    expect(resolveShapechangeForms(17).some((f) => f.id === "adult-red-dragon")).toBe(
      true
    );
    expect(resolveShapechangeForms(16).some((f) => f.id === "adult-red-dragon")).toBe(
      false
    );
  });
});

describe("the spell rules each self form follows", () => {
  it("Shapechange keeps the mind, reshifts, and outlasts its Temporary HP", () => {
    expect(SELF_FORM_SPELL_IDS).toContain("shapechange");
    expect(selfFormRule("shapechange")).toMatchObject({
      pool: "bestiary",
      keepsMind: true,
      reshift: true,
      endsWithoutTempHp: false,
    });
  });

  it("Polymorph replaces all six scores and ends when its Temporary HP run out", () => {
    expect(selfFormRule("polymorph")).toMatchObject({
      pool: "beasts",
      keepsMind: false,
      reshift: false,
      endsWithoutTempHp: true,
    });
  });
});

describe("assumeBeastForm with Shapechange (doc in, doc out)", () => {
  it("takes the form's AC, speeds, STR/DEX/CON and Temp HP, keeps INT/WIS/CHA", () => {
    const doc = druid();
    const frozen = structuredClone(doc);
    const dragon = form("adult-red-dragon");
    const { doc: next, tempHp } = assumeBeastForm(
      doc,
      dragon,
      "shapechange",
      polymorphPriorSnapshot(doc)
    );
    expect(doc).toEqual(frozen); // never mutates its input
    expect(next.character.acOverride).toBe(dragon.ac);
    expect(next.character.speedOverride).toBe(dragon.speeds.walk);
    expect(next.character.speedOverrides?.fly).toBe(dragon.speeds.fly);
    for (const a of BODY)
      expect(next.character.abilityScores[a]).toBe(dragon.abilityScores[a]);
    for (const a of MIND)
      expect(next.character.abilityScores[a]).toBe(doc.character.abilityScores[a]);
    // Hit Points stay yours; Temporary HP = the first form's Hit Points.
    expect(next.session.hp.current).toBe(90);
    expect(tempHp).toBe(dragon.hp);
    expect(next.session.hp.temp).toBe(dragon.hp);
    // The bestiary form rides the session (the eager sheet cannot read the bestiary).
    expect(next.session.polymorphForm).toMatchObject({
      beastId: "adult-red-dragon",
      spellId: "shapechange",
      statBlock: dragon,
    });
    expect(formStatBlock(next.session.polymorphForm)).toEqual(dragon);
  });

  it("a second form keeps the first form's Temp HP and the caster's original body", () => {
    const doc = druid();
    const first = assumeBeastForm(
      doc,
      form("adult-red-dragon"),
      "shapechange",
      polymorphPriorSnapshot(doc)
    ).doc;
    // Hurt in dragon form: 30 of the Temp HP gone.
    const hurt: CharacterDoc = {
      ...first,
      session: {
        ...first.session,
        hp: { ...first.session.hp, temp: first.session.hp.temp - 30 },
      },
    };
    const frozen = structuredClone(hurt);
    const ape = form("giant-ape");
    const { doc: second } = assumeBeastForm(
      hurt,
      ape,
      "shapechange",
      polymorphPriorSnapshot(hurt) // the store hands the live body; the form keeps the first
    );
    expect(hurt).toEqual(frozen);
    expect(second.session.hp.temp).toBe(hurt.session.hp.temp); // no new Temp HP
    expect(second.character.acOverride).toBe(ape.ac);
    expect(second.character.speedOverrides?.fly).toBeUndefined();
    for (const a of BODY)
      expect(second.character.abilityScores[a]).toBe(ape.abilityScores[a]);
    for (const a of MIND)
      expect(second.character.abilityScores[a]).toBe(doc.character.abilityScores[a]);
    expect(second.session.polymorphForm?.prior).toEqual(polymorphPriorSnapshot(doc));

    // Dropping restores the caster's exact AC, speeds, scores and Temp HP.
    const dropped = dropBeastForm(second);
    if (!dropped) throw new Error("no form to drop");
    expect(dropped.session.polymorphForm).toBeUndefined();
    expect(dropped.character.abilityScores).toEqual(doc.character.abilityScores);
    expect(dropped.character.acOverride ?? null).toBe(doc.character.acOverride ?? null);
    expect(dropped.character.speedOverride ?? null).toBe(
      doc.character.speedOverride ?? null
    );
    expect(dropped.character.speedOverrides ?? {}).toEqual(
      doc.character.speedOverrides ?? {}
    );
    expect(dropped.session.hp.temp).toBe(4);
  });

  it("Polymorph still replaces all six scores", () => {
    const doc = druid(10);
    const ape = form("giant-ape");
    const next = assumeBeastForm(doc, ape, "polymorph", polymorphPriorSnapshot(doc)).doc;
    expect(next.character.abilityScores).toEqual(ape.abilityScores);
    expect(next.session.polymorphForm?.statBlock).toBeUndefined();
  });
});

describe("a bestiary form on the sheet", () => {
  it("survives the session codec", () => {
    const doc = druid();
    const next = assumeBeastForm(
      doc,
      form("adult-red-dragon"),
      "shapechange",
      polymorphPriorSnapshot(doc)
    ).doc;
    const round = stateToSession(
      JSON.parse(JSON.stringify(sessionToState(next.session))) as Record<string, unknown>
    );
    expect(round.polymorphForm).toEqual(next.session.polymorphForm);
  });

  it("the codec drops a malformed stat block but keeps the form, so it can still be dropped", () => {
    const doc = druid();
    const next = assumeBeastForm(
      doc,
      form("adult-red-dragon"),
      "shapechange",
      polymorphPriorSnapshot(doc)
    ).doc;
    const state = JSON.parse(JSON.stringify(sessionToState(next.session))) as {
      polymorphForm: { statBlock: { ac: unknown } };
    };
    state.polymorphForm.statBlock.ac = "high";
    const parsed = stateToSession(state).polymorphForm;
    expect(parsed?.statBlock).toBeUndefined();
    expect(parsed?.prior).toEqual(next.session.polymorphForm?.prior);
  });

  it("puts the form's attacks on the Play board, named from the bestiary", () => {
    const doc = druid();
    const dragon = form("adult-red-dragon");
    const next = assumeBeastForm(
      doc,
      dragon,
      "shapechange",
      polymorphPriorSnapshot(doc)
    ).doc;
    const rows = resolveActions(next).filter((r) => r.id.startsWith("beast-attack-"));
    expect(rows).toHaveLength(dragon.attacks.length);
    expect(rows[0]?.summary.attackBonus).toBe(dragon.attacks[0]?.toHit);
    expect(rows[0]?.name).toEqual({
      srd: { kind: "monster", key: "adult-red-dragon.actions.rend", field: "name" },
    });
  });
});

describe("the store: Shapechange through the Transform flow", () => {
  afterEach(() => {
    useCharacterStore.getState().setCharacter(null);
    useToastStore.setState({ toasts: [] });
  });

  it("concentrates on Shapechange, reshifts without new Temp HP, and keeps the form at 0 Temp HP", () => {
    useCharacterStore.getState().setCharacter(druid());
    const dragon = form("adult-red-dragon");
    useCharacterStore.getState().assumePolymorphForm(dragon.id, "shapechange", dragon);
    let doc = useCharacterStore.getState().character;
    expect(doc?.session.concentration).toBe("shapechange");
    expect(doc?.session.hp.temp).toBe(dragon.hp);

    // Shift into a second form while the spell lasts.
    const ape = form("giant-ape");
    expect(
      useCharacterStore.getState().assumePolymorphForm(ape.id, "shapechange", ape)
    ).not.toBeNull();
    doc = useCharacterStore.getState().character;
    expect(doc?.session.polymorphForm?.beastId).toBe("giant-ape");
    expect(doc?.session.hp.temp).toBe(dragon.hp);
    expect(doc?.session.concentration).toBe("shapechange");

    // Losing every Temporary HP does not end Shapechange: a Concentration save is due.
    useCharacterStore.getState().applyDamage(dragon.hp);
    doc = useCharacterStore.getState().character;
    expect(doc?.session.polymorphForm?.beastId).toBe("giant-ape");
    expect(doc?.session.hp.temp).toBe(0);
    const intents = useToastStore.getState().toasts.map((t) => t.intent?.kind);
    expect(intents).toContain("concentration-save");
  });

  it("Polymorph cannot reshift: a second form while transformed is refused", () => {
    useCharacterStore.getState().setCharacter(druid(10));
    useCharacterStore.getState().assumePolymorphForm("giant-ape", "polymorph");
    expect(
      useCharacterStore.getState().assumePolymorphForm("brown-bear", "polymorph")
    ).toBeNull();
  });
});
