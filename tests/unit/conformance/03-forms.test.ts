/** Conformance, category 3: forms and transformations (corpus.md § 3). */
import { describe, expect } from "vitest";
import { getBeast } from "@/data/beasts";
import { getMonster } from "@/data/monsters";
import type { BeastStatBlock } from "@/data/types";
import { aggregateCharacterGrants, effectiveAC } from "@/lib/aggregate-character";
import { beastProjectionFromMonster } from "@/lib/beast-projection";
import {
  polymorphBuildPatch,
  resolvePolymorphForms,
  selfFormRule,
} from "@/lib/polymorph";
import { concentrationValue } from "@/lib/concentration";
import { changeConcentration } from "@/lib/play/concentration";
import { assumeBeastForm, dropBeastForm } from "@/lib/play/forms";
import { takeDamage } from "@/lib/play/damage";
import {
  enterMagicJar,
  hostBodyDies,
  magicJarHost,
  possessHost,
} from "@/lib/play/magic-jar";
import { longRestCharacter } from "@/lib/play/rests";
import { gainTempHp } from "@/lib/play/vitals";
import { isSpellcastingBlocked, resolveTempHp } from "@/lib/smart-tracker";
import { buildScenario } from "@/lib/dev-scenarios";
import { buildSummonedMonsterGroups } from "@/lib/views/companion-row-view";
import type { CharacterDoc, SessionState } from "@/types/character";
import { makeCharacterDoc } from "../_helpers";
import { deriveCharacter } from "@/lib/views/derive-character";
import { rule } from "./rule";

/** The id a Wild Shape form is assumed under (the druid feature). */
const WILD_SHAPE = "druid-wild-shape";

function beast(id: string): BeastStatBlock {
  const found = getBeast(id);
  if (!found) throw new Error(`no beast ${id}`);
  return found;
}

function monsterForm(id: string): BeastStatBlock {
  const found = getMonster(id);
  if (!found) throw new Error(`no monster ${id}`);
  return beastProjectionFromMonster(found);
}

function withSession(doc: CharacterDoc, patch: Partial<SessionState>): CharacterDoc {
  return { ...doc, session: { ...doc.session, ...patch } };
}

function withHp(doc: CharacterDoc, hp: Partial<SessionState["hp"]>): CharacterDoc {
  return withSession(doc, { hp: { ...doc.session.hp, ...hp } });
}

function druid(
  level = 5,
  session: Partial<SessionState> = {},
  equipment: CharacterDoc["character"]["equipment"] = []
): CharacterDoc {
  const doc = buildScenario({
    name: "Druid",
    raceId: "human",
    classId: "druid",
    level,
    background: "acolyte",
    abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 18, CHA: 8 },
    equipment,
  });
  return withSession(withHp(doc, { current: 38, temp: 0 }), session);
}

function wizard(level = 17): CharacterDoc {
  const doc = makeCharacterDoc({
    classId: "wizard",
    level,
    abilityScores: { STR: 8, DEX: 14, CON: 14, INT: 20, WIS: 12, CHA: 10 },
  });
  return withHp(doc, { current: 40, temp: 0 });
}

function shift(doc: CharacterDoc, form: BeastStatBlock, spellId: string) {
  return assumeBeastForm(doc, form, spellId);
}

describe("conformance · 3. forms and transformations", () => {
  rule(
    {
      category: 3,
      case: "Wild Shape 2024: your HP, plus temp HP",
      source: "WIKI druid:main",
      status: "works",
    },
    () => {
      const doc = druid(5);
      const agg = aggregateCharacterGrants(doc.character, doc.session);
      const grant = agg.tempHpGrants.find((g) => g.sourceId === WILD_SHAPE);
      // Temp HP equal to the Druid level; the druid's own HP stay as they are.
      expect(grant && resolveTempHp(grant.formula, doc)).toBe(5);
      const next = gainTempHp(doc, 5);
      expect(next?.hp.temp).toBe(5);
      expect(next?.hp.current).toBe(38);
    }
  );

  rule(
    {
      category: 3,
      case: "What Wild Shape keeps",
      source: "WIKI druid:main; FVTT#6638",
      status: "works",
    },
    () => {
      const doc = druid(5);
      const { doc: next, tempHp } = shift(doc, beast("wolf"), WILD_SHAPE);
      // You keep INT, WIS and CHA, your HP, and your own saving-throw proficiencies.
      expect(next.character.abilityScores).toMatchObject({ INT: 10, WIS: 18, CHA: 8 });
      expect(next.character.savingThrows).toEqual(doc.character.savingThrows);
      expect(next.session.hp.current).toBe(38);
      // Temp HP come from the Druid level, not the beast's Hit Points.
      expect(tempHp).toBe(5);
    }
  );

  rule(
    {
      category: 3,
      case: "Temp HP when leaving Wild Shape",
      source: "FVTT#5962",
      status: "works",
    },
    () => {
      // Nothing removes Wild Shape's temp HP when the druid reverts; a Long Rest
      // ends them under the general rule.
      const doc = druid(5);
      const shaped = withSession(doc, gainTempHp(doc, 5) ?? {});
      expect(shaped.session.hp.temp).toBe(5);
      expect(longRestCharacter(shaped).session.hp.temp).toBe(0);
    }
  );

  rule(
    { category: 3, case: "Wild Shape at 0 HP", source: "FVTT#833", status: "works" },
    () => {
      const { doc } = shift(druid(5), beast("wolf"), WILD_SHAPE);
      expect(doc.session.activeForm?.beastId).toBe("wolf");
      const hit = takeDamage(withHp(doc, { current: 3, temp: 0 }), 10);
      // Your own HP drop to 0: Unconscious, so Incapacitated, so the form ends.
      expect(hit?.session.hp.current).toBe(0);
      expect(hit?.session.conditions).toContain("unconscious");
      expect(hit?.session.activeForm).toBeUndefined();
    }
  );

  rule(
    {
      category: 3,
      case: "No spellcasting in beast form, with exceptions",
      source: "WIKI druid:main; WIKI druid:moon",
      status: "works",
    },
    () => {
      const wolf = beast("wolf");
      expect(isSpellcastingBlocked(druid(5), "moonbeam")).toBe(false);
      const { doc: shaped } = shift(druid(5), wolf, WILD_SHAPE);
      expect(isSpellcastingBlocked(shaped, "moonbeam")).toBe(true);
      expect(isSpellcastingBlocked(shaped)).toBe(true);
      // Beast Spells (level 18) lifts the block, except for a spell whose Material
      // component has a cost or is consumed (Revivify's 300 GP diamond).
      const { doc: late } = shift(druid(18), wolf, WILD_SHAPE);
      expect(isSpellcastingBlocked(late, "moonbeam")).toBe(false);
      expect(isSpellcastingBlocked(late, "revivify")).toBe(true);
      // Leaving the form lifts the block.
      const back = dropBeastForm(shaped);
      expect(back && isSpellcastingBlocked(back, "moonbeam")).toBe(false);
    }
  );

  rule(
    {
      category: 3,
      case: "Equipment in Wild Shape",
      source: "WIKI druid:main; FVTT#5738",
      status: "M2",
    },
    () => {
      const ring = {
        srdId: "ring-of-protection",
        equipped: true,
        acBonus: 1,
        attuned: true,
      };
      const ringed = druid(5, {}, [ring]);
      const worn = aggregateCharacterGrants(ringed.character, ringed.session);
      expect(worn.saveBonusFlat).toBe(1);
      const wolf = beast("wolf");
      const { doc: next } = shift(ringed, wolf, WILD_SHAPE);
      // Gear that merges into the form has no effect: no ring bonus to AC or saves.
      const merged = aggregateCharacterGrants(next.character, next.session);
      expect(merged.saveBonusFlat).toBe(0);
      expect(effectiveAC(next.character, next.session)).toBe(wolf.ac);
    }
  );

  rule(
    {
      category: 3,
      case: "Polymorph 2024",
      source: "WIKI spell:polymorph; ERRATA",
      status: "works",
    },
    () => {
      const bear = beast("brown-bear");
      const { doc: next, tempHp } = shift(wizard(9), bear, "polymorph");
      // The beast's statistics; your own HP; temp HP equal to the beast's HP.
      const scores = deriveCharacter(next).abilities;
      expect(
        Object.fromEntries(Object.entries(scores).map(([id, a]) => [id, a.score]))
      ).toEqual(bear.abilityScores);
      expect(next.session.hp.current).toBe(40);
      expect(tempHp).toBe(bear.hp);
      // The spell ends when those temp HP run out, and leftovers vanish with it.
      expect(selfFormRule("polymorph").endsWithoutTempHp).toBe(true);
      expect(dropBeastForm(next)?.session.hp.temp).toBe(0);
    }
  );

  rule(
    {
      category: 3,
      case: "Polymorph and other effects",
      source: "SAC #135; SAC #136; SAC #137",
      status: "M2",
    },
    () => {
      const lit = withSession(wizard(17), { activeFeatures: ["spell-bless"] });
      const { doc: next } = shift(lit, monsterForm("iron-golem"), "true-polymorph");
      // Spells already on the creature stay.
      expect(next.session.activeFeatures).toContain("spell-bless");
      // The form's defenses are the creature's while it lasts.
      const agg = aggregateCharacterGrants(next.character, next.session);
      expect(agg.damageImmunities.has("fire")).toBe(true);
    }
  );

  rule(
    {
      category: 3,
      case: "True Polymorph permanence vs temp HP",
      source: "WIKI spell:true-polymorph; KIBBLES #31",
      status: "M12",
    },
    () => {
      const held = changeConcentration(
        wizard(17),
        concentrationValue("true-polymorph")
      ).doc;
      const { doc: shifted } = shift(held, monsterForm("iron-golem"), "true-polymorph");
      // Held for the full hour (its timer ran out), the transformation lasts until
      // dispelled: the concentration ends, the form stays.
      const done = withSession(shifted, { effectTimers: {} });
      const after = changeConcentration(done, "").doc;
      expect(after.session.activeForm?.beastId).toBe("iron-golem");
    }
  );

  rule(
    {
      category: 3,
      case: "True Polymorph: object into creature",
      source: "WIKI spell:true-polymorph",
      status: "M6",
    },
    () => {
      const doc = wizard(17);
      const caster: CharacterDoc = {
        ...doc,
        character: {
          ...doc.character,
          spells: [{ srdId: "true-polymorph", prepared: true }],
        },
        session: { ...doc.session, concentration: concentrationValue("true-polymorph") },
      };
      // The object becomes a creature you control: a summoned creature of yours.
      const groups = buildSummonedMonsterGroups(caster);
      expect(groups.map((g) => g.spellId)).toContain("true-polymorph");
    }
  );

  rule(
    {
      category: 3,
      case: "Shapechange",
      source: "WIKI spell:shapechange; ERRATA",
      status: "works",
    },
    () => {
      const doc = wizard(17);
      const first = monsterForm("adult-red-dragon");
      const { doc: shaped, tempHp } = shift(doc, first, "shapechange");
      // Mental scores kept; HP kept; temp HP from the first form.
      expect(shaped.character.abilityScores).toMatchObject({ INT: 20, WIS: 12, CHA: 10 });
      expect(shaped.session.hp.current).toBe(40);
      expect(tempHp).toBe(first.hp);
      // A new form doesn't refill the temp HP (errata), and running out of them
      // doesn't end the spell.
      const second = shift(
        withHp(shaped, { temp: 7 }),
        beast("brown-bear"),
        "shapechange"
      );
      expect(second.reshift).toBe(true);
      expect(second.tempHp).toBe(7);
      expect(selfFormRule("shapechange").endsWithoutTempHp).toBe(false);
    }
  );

  rule(
    {
      category: 3,
      case: "Animal Shapes refresh loophole",
      source: "ERRATA",
      status: "works",
    },
    () => {
      const doc = wizard(17);
      const bear = beast("brown-bear");
      const { doc: shaped, tempHp } = shift(doc, bear, "animal-shapes");
      expect(tempHp).toBe(bear.hp);
      // Changing form again keeps the first pool; no fresh temp HP.
      const again = shift(
        withHp(shaped, { temp: 3 }),
        beast("dire-wolf"),
        "animal-shapes"
      );
      expect(again.tempHp).toBe(3);
      expect(selfFormRule("animal-shapes").endsWithoutTempHp).toBe(true);
      // CR 4 or lower, Large or smaller.
      for (const form of resolvePolymorphForms(doc, "animal-shapes")) {
        expect(form.cr).toBeLessThanOrEqual(4);
        expect(["Tiny", "Small", "Medium", "Large"]).toContain(form.size);
      }
    }
  );

  rule(
    {
      category: 3,
      case: "Magic Jar swaps the body, not the mind",
      source: "WIKI spell:magic-jar",
      status: "works",
    },
    () => {
      const knight = getMonster("knight");
      const jarred = enterMagicJar(wizard(11));
      if (!knight || !jarred) throw new Error("no knight or jar");
      const host = magicJarHost(knight);
      const possessed = possessHost(jarred, host);
      if (!possessed) throw new Error("no possession");
      // The host's HP and STR/DEX/CON; you keep INT/WIS/CHA.
      expect(possessed.session.hp.current).toBe(host.hp.current);
      expect(possessed.character.abilityScores).toEqual({
        ...host.abilityScores,
        INT: 20,
        WIS: 12,
        CHA: 10,
      });
      // The host dies: a CHA save returns you to the jar in range, else you die.
      const dead = withHp(possessed, { current: 0 });
      expect(hostBodyDies(dead, { saved: true, containerInRange: true })?.outcome).toBe(
        "container"
      );
      expect(hostBodyDies(dead, { saved: false, containerInRange: true })?.outcome).toBe(
        "dies"
      );
      expect(hostBodyDies(dead, { saved: true, containerInRange: false })?.outcome).toBe(
        "dies"
      );
    }
  );

  rule(
    {
      category: 3,
      case: "Ongoing effects carry over by default",
      source: "GLOSS (Shape-Shifting)",
      status: "works",
    },
    () => {
      const doc = wizard(9);
      const lit = withSession(doc, {
        activeFeatures: ["spell-bless"],
        conditions: ["poisoned"],
      });
      const { doc: shaped } = shift(lit, beast("brown-bear"), "polymorph");
      expect(shaped.session.activeFeatures).toEqual(["spell-bless"]);
      expect(shaped.session.conditions).toEqual(["poisoned"]);
      // Reverting gives back the true form, effects still on.
      const back = dropBeastForm(shaped);
      expect(back?.character.abilityScores).toEqual(doc.character.abilityScores);
      expect(back?.session.activeFeatures).toEqual(["spell-bless"]);
    }
  );

  rule(
    {
      category: 3,
      case: "Size change can free you from restraints",
      source: "SAC #52",
      status: "works",
    },
    () => {
      // Policy: the engine never frees a creature by itself; the table removes the
      // Grappled condition when the new size breaks the grapple's size limit.
      const held = withSession(wizard(9), { conditions: ["grappled"] });
      const { doc: tiny } = shift(held, beast("rat"), "polymorph");
      expect(tiny.session.conditions).toEqual(["grappled"]);
    }
  );

  rule(
    {
      category: 3,
      case: "Monster shape-changers keep some stats",
      source: "FVTT#7153",
      status: "M2",
    },
    () => {
      // A Deva takes a new form's STR and DEX but keeps its CON and mental scores.
      const deva = getMonster("deva");
      if (!deva) throw new Error("no deva");
      const prior = {
        acOverride: null,
        speedOverride: null,
        speedOverrides: {},
        abilityScores: { ...deva.abilityScores },
        tempHp: 0,
      };
      const bear = beast("brown-bear");
      const scores = polymorphBuildPatch(bear, prior, true).abilityScores;
      expect(scores).toEqual({
        ...deva.abilityScores,
        STR: bear.abilityScores.STR,
        DEX: bear.abilityScores.DEX,
      });
    }
  );

  rule(
    {
      category: 3,
      case: "Truesight reveals transformations",
      source: "GLOSS",
      status: "works",
    },
    () => {
      // Policy: there is no observer model. The true form stays on record beside
      // the form, so the table can tell a Truesight observer what it sees.
      const doc = wizard(9);
      const { doc: shaped } = shift(doc, beast("brown-bear"), "polymorph");
      // The form is a layer: the build itself is the true form.
      expect(shaped.session.activeForm?.beastId).toBe("brown-bear");
      expect(shaped.character.abilityScores).toEqual(doc.character.abilityScores);
    }
  );
});
