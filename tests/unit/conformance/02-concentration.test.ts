/** Conformance, category 2: concentration (corpus.md § 2). */
import { describe, expect } from "vitest";
import { getBeast } from "@/data/beasts";
import { getSpellById } from "@/data/spells";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { concentrationSaveD20Context } from "@/lib/character-d20-tests";
import { concentrationEffectIdsOwnedBy } from "@/lib/combat-effects";
import { concentrationSaveDc } from "@/lib/compute";
import { concentrationValue } from "@/lib/concentration";
import { conditionBreaksConcentration } from "@/lib/condition-effects";
import { evaluateGrants } from "@/lib/grants";
import { addCondition } from "@/lib/play/conditions";
import { changeConcentration } from "@/lib/play/concentration";
import { takeDamage } from "@/lib/play/damage";
import { assumeBeastForm } from "@/lib/play/forms";
import {
  readiedHold,
  readiedSpellExpires,
  releaseKeepsConcentration,
  setReadiedSpell,
} from "@/lib/play/ready";
import { resolveGrantSourcesForSpells } from "@/lib/resolve-grant-sources";
import { concentrationTimerKey } from "@/lib/spell-duration";
import { deriveCharacter } from "@/lib/views/derive-character";
import type { CharacterDoc } from "@/types/character";
import type {
  ActiveCombatEffect,
  CombatantRef,
  CombatEffectOp,
} from "@/types/combat-effect";
import type { PendingConcentrationSave } from "@/types/combat-state";
import { makeCharacterDoc } from "../_helpers";
import { rule } from "./rule";

/** One queued Concentration save for `damage` on the held spell. */
function pendingSave(doc: CharacterDoc, damage: number): PendingConcentrationSave {
  return {
    id: "save-1",
    spell: concentrationValue(doc.session.concentration),
    damage,
    difficultyClass: concentrationSaveDc(damage),
  };
}

/** The Concentration save's flat modifier. */
function saveModifier(doc: CharacterDoc): number {
  return concentrationSaveD20Context(doc, pendingSave(doc, 10)).modifierTerms.reduce(
    (sum, term) => sum + term.value,
    0
  );
}

/** A Druid 5 (CON 12, WIS 16) holding Moonbeam, Wild Shaped into a Brown Bear. */
function wildShapedDruid(): CharacterDoc {
  const druid = makeCharacterDoc(
    {
      classId: "druid",
      level: 5,
      abilityScores: { STR: 10, DEX: 12, CON: 12, INT: 10, WIS: 16, CHA: 8 },
      savingThrows: ["INT", "WIS"],
      spells: [{ srdId: "moonbeam", prepared: true }],
    },
    { concentration: concentrationValue("moonbeam") }
  );
  const bear = getBeast("brown-bear");
  if (!bear) throw new Error("brown-bear missing from the beast catalogue");
  return assumeBeastForm(druid, bear, "druid-wild-shape").doc;
}

const pc = (id: string): CombatantRef => ({
  kind: "pc",
  combatantId: id,
  memberUid: `u-${id}`,
  characterId: id,
});

describe("conformance · 2. concentration", () => {
  rule(
    {
      category: 2,
      case: "A new concentration spell ends the old one",
      source: "GLOSS; SAC #104",
      status: "works",
    },
    () => {
      const doc = makeCharacterDoc(
        {
          classId: "cleric",
          level: 5,
          spells: [
            { srdId: "bless", prepared: true },
            { srdId: "shield-of-faith", prepared: true },
          ],
        },
        { concentration: concentrationValue("bless"), activeFeatures: ["spell-bless"] }
      );
      const next = changeConcentration(doc, concentrationValue("shield-of-faith")).doc;
      expect(next.session.concentration).toBe("shield-of-faith");
      expect(next.session.activeFeatures).not.toContain("spell-bless");
    }
  );

  rule(
    {
      category: 2,
      case: "Damage-save DC uses damage before temp HP",
      source: "SAC #109; FVTT#5394",
      status: "works",
    },
    () => {
      // A 30-damage hit fully soaked by 30 temp HP still calls for DC 15.
      const doc = makeCharacterDoc(
        { spells: [{ srdId: "bless", prepared: true }] },
        { hp: { current: 44, temp: 30 }, concentration: concentrationValue("bless") }
      );
      const hit = takeDamage(doc, 30);
      expect(hit?.session.hp).toMatchObject({ current: 44, temp: 0 });
      expect(concentrationSaveDc(hit?.transition.resolvedDamage ?? 0)).toBe(15);
      // DC 10 at least, 30 at most.
      expect(concentrationSaveDc(4)).toBe(10);
      expect(concentrationSaveDc(100)).toBe(30);
    }
  );

  rule(
    {
      category: 2,
      case: "One save per damage instance",
      source: "GLOSS; SAC #97",
      status: "works",
    },
    () => {
      // Two 24-damage hits are two DC 12 saves, never one DC 24 for the sum.
      const hits = [24, 24];
      expect(hits.map(concentrationSaveDc)).toEqual([12, 12]);
      expect(concentrationSaveDc(48)).toBe(24);
    }
  );

  rule(
    {
      category: 2,
      case: "Incapacitated or dead ends concentration",
      source: "GLOSS",
      status: "works",
    },
    () => {
      for (const id of ["incapacitated", "stunned", "paralyzed", "unconscious"]) {
        expect(conditionBreaksConcentration(id)).toBe(true);
      }
      for (const id of ["prone", "grappled"]) {
        expect(conditionBreaksConcentration(id)).toBe(false);
      }
    }
  );

  rule(
    {
      category: 2,
      case: "Rage forbids concentration",
      source: "WIKI barbarian:main; SAC (2014 carry-over)",
      status: "works",
    },
    () => {
      // A Barbarian 5 / Cleric 3 holding Bless, with Aid (no concentration) running.
      const doc = makeCharacterDoc(
        {
          classes: [
            { classId: "barbarian", level: 5 },
            { classId: "cleric", level: 3 },
          ],
          features: [{ srdId: "barbarian-rage" }],
          spells: [
            { srdId: "bless", prepared: true },
            { srdId: "aid", prepared: true },
          ],
        },
        {
          concentration: concentrationValue("bless"),
          activeFeatures: ["spell-bless", "spell-aid", "barbarian-rage"],
        }
      );
      const raging = aggregateCharacterGrants(doc.character, doc.session);
      expect(raging.concentrationBlocked).toBe(true);
      expect(raging.spellcastingBlocked).toBe(true);
      // Entering Rage ends the held spell; the non-concentration one keeps running.
      const after = changeConcentration(doc, concentrationValue("")).doc;
      expect(after.session.activeFeatures).not.toContain("spell-bless");
      expect(after.session.activeFeatures).toContain("spell-aid");
    }
  );

  rule(
    {
      category: 2,
      case: "Shape-shifting doesn't end concentration",
      source: "WIKI druid:main; SAC #134; WIKI druid:moon",
      status: "works",
    },
    () => {
      const doc = wildShapedDruid();
      // Still concentrating, the save uses the bear's CON (15: +2)…
      expect(doc.session.concentration).toBe("moonbeam");
      expect(saveModifier(doc)).toBe(2);
      // …and the Druid keeps its own Wisdom (a Moon Druid adds it at level 6+).
      expect(doc.character.abilityScores.WIS).toBe(16);
      expect(deriveCharacter(doc).abilities.WIS.score).toBe(16);
    }
  );

  rule(
    {
      category: 2,
      case: "Advantage and disadvantage on the save",
      source: "WIKI feat:war-caster; WIKI feat:mage-slayer; rpgbot 2024 change log",
      status: "M13",
    },
    () => {
      // Eldritch Mind: Advantage on the save.
      const warlock = makeCharacterDoc(
        {
          classes: [
            { classId: "warlock", level: 5, invocationChoices: ["eldritch-mind"] },
          ],
          spells: [{ srdId: "hex", prepared: true }],
        },
        { concentration: concentrationValue("hex") }
      );
      expect(
        concentrationSaveD20Context(warlock, pendingSave(warlock, 10)).advantageSourceIds
      ).not.toEqual([]);
      // Extended Spell (2024): a Sorcerer who extended the held spell has Advantage too.
      // (The cast record of M13 says which spell was extended; here the held Hold
      // Person was cast with it.)
      const sorcerer = makeCharacterDoc(
        {
          classes: [
            { classId: "sorcerer", level: 5, metamagicChoices: ["extended-spell"] },
          ],
          spells: [{ srdId: "hold-person", prepared: true }],
        },
        { concentration: concentrationValue("hold-person") }
      );
      expect(
        concentrationSaveD20Context(sorcerer, pendingSave(sorcerer, 10))
          .advantageSourceIds
      ).not.toEqual([]);
    }
  );

  rule(
    {
      category: 2,
      case: "No range or sight needed",
      source: "SAC #108",
      status: "works",
    },
    () => {
      // Going blind, or anywhere at all, leaves Concentration alone.
      const doc = makeCharacterDoc(
        { spells: [{ srdId: "bless", prepared: true }] },
        { concentration: concentrationValue("bless") }
      );
      expect(conditionBreaksConcentration("blinded")).toBe(false);
      expect(addCondition(doc, "blinded")?.concentration).toBe("bless");
    }
  );

  rule(
    {
      category: 2,
      case: "Readied spells need concentration",
      source: "SAC #26; GLOSS",
      status: "works",
    },
    () => {
      // A Wizard holding Haste readies Fireball: holding it takes the Concentration.
      const doc = makeCharacterDoc(
        {
          classId: "wizard",
          level: 5,
          spells: [
            { srdId: "haste", prepared: true },
            { srdId: "fireball", prepared: true },
          ],
        },
        { concentration: concentrationValue("haste"), activeFeatures: ["spell-haste"] }
      );
      const holding = changeConcentration(doc, concentrationValue("fireball")).doc;
      expect(holding.session.activeFeatures).not.toContain("spell-haste");
      const readied = setReadiedSpell(holding.session, readiedHold(3, null));
      expect(readied?.readiedSpell).toEqual({ expiresRound: 4 });
      if (!readied) return;
      // Releasing Fireball doesn't keep Concentration; no trigger by round 4: lost.
      expect(releaseKeepsConcentration(readied)).toBe(false);
      expect(readiedSpellExpires(readied, 4)).toBe(true);
      // Any change of Concentration drops the held spell.
      const dropped = changeConcentration(
        { ...holding, session: readied },
        concentrationValue("")
      ).doc;
      expect(dropped.session.readiedSpell).toBeUndefined();
    }
  );

  rule(
    {
      category: 2,
      case: "Concentration-linked summons",
      source: "WIKI spell:summon-beast; FVTT#3543",
      status: "M6",
    },
    () => {
      // A Druid holding Giant Insect, its insect hurt to 5 HP. Concentration ends: the
      // insect vanishes, so nothing of it (its HP) outlives the spell.
      const doc = makeCharacterDoc(
        {
          classId: "druid",
          level: 7,
          spells: [{ srdId: "giant-insect", prepared: true }],
        },
        {
          concentration: concentrationValue("giant-insect"),
          concentrationCastLevel: 4,
          companionHp: { "giant-insect": { current: 5 } },
        }
      );
      const ended = changeConcentration(doc, concentrationValue("")).doc;
      expect(
        Object.keys(ended.session.companionHp ?? {}).filter((k) =>
          k.startsWith("giant-insect")
        )
      ).toEqual([]);
    }
  );

  rule(
    {
      category: 2,
      case: "Several effects, one concentration",
      source: "FVTT#5282; FVTT#5637",
      status: "works",
    },
    () => {
      // One Bless on three allies, plus the caster's own state: all end together.
      const caster = pc("cleric");
      const bless = (id: string, target: string): CombatEffectOp => {
        const effect: ActiveCombatEffect = {
          id,
          actor: caster,
          target: pc(target),
          source: { kind: "spell", id: "bless", actionId: "cast-1" },
          payload: { kind: "grant-group", activeKey: "spell-bless" },
          duration: { kind: "concentration", actorId: "cleric", sourceId: "bless" },
        };
        return { id: `op-${id}`, kind: "apply", effect };
      };
      const ops = [bless("b1", "a"), bless("b2", "b"), bless("b3", "c")];
      expect(concentrationEffectIdsOwnedBy(ops, "cleric").sort()).toEqual([
        "b1",
        "b2",
        "b3",
      ]);
      const doc = makeCharacterDoc(
        { classId: "cleric", level: 5, spells: [{ srdId: "bless", prepared: true }] },
        { concentration: concentrationValue("bless"), activeFeatures: ["spell-bless"] }
      );
      expect(
        changeConcentration(doc, concentrationValue("")).doc.session.activeFeatures
      ).toEqual([]);
    }
  );

  rule(
    {
      category: 2,
      case: "What survives when concentration ends",
      source: "WIKI spell:true-polymorph",
      status: "M12",
    },
    () => {
      // A Wizard True Polymorphed into a Brown Bear holds it for the full hour: the
      // spell has run its course, so it lasts until dispelled, and dropping
      // Concentration after that changes nothing.
      const wizard = makeCharacterDoc(
        {
          classId: "wizard",
          level: 17,
          spells: [{ srdId: "true-polymorph", prepared: true }],
        },
        { concentration: concentrationValue("true-polymorph") }
      );
      const bear = getBeast("brown-bear");
      if (!bear) throw new Error("brown-bear missing from the beast catalogue");
      const formed = assumeBeastForm(wizard, bear, "true-polymorph").doc;
      const completed: CharacterDoc = {
        ...formed,
        session: {
          ...formed.session,
          effectTimers: { [concentrationTimerKey("true-polymorph")]: { roundsLeft: 0 } },
        },
      };
      const after = changeConcentration(completed, concentrationValue("")).doc;
      expect(after.session.activeForm?.beastId).toBe("brown-bear");
      expect(after.session.hp.current).toBe(completed.session.hp.current);
    }
  );

  rule(
    {
      category: 2,
      case: "Ending an effect can trigger a penalty",
      source: "GLOSS (Shape-Shifting)",
      status: "M12",
    },
    () => {
      // Fly ends while the target is aloft: it falls. The end of the spell must carry
      // that consequence, not just remove the fly speed.
      const fly = getSpellById("fly")?.grants?.find((g) => g.type === "while-active");
      expect(fly && "afterEffect" in fly && fly.afterEffect).toBeTruthy();
    }
  );

  rule(
    {
      category: 2,
      case: "Concentration moves become new spells (2024 change)",
      source: "wargamer spiritual-weapon-nerf; KIBBLES #38",
      status: "works",
    },
    () => {
      expect(getSpellById("spiritual-weapon")?.concentration).toBe(true);
      expect(getSpellById("divine-favor")?.concentration).toBe(false);
      expect(getSpellById("magic-weapon")?.concentration).toBe(false);
    }
  );

  rule(
    {
      category: 2,
      case: "Hex and Hunter's Mark can be moved",
      source: "WIKI spell:hex",
      status: "works",
    },
    () => {
      // While each is running, a Bonus Action moves the mark to a new creature.
      for (const [spell, key] of [
        ["hex", "spell-hex"],
        ["hunters-mark", "spell-hunters-mark"],
      ] as const) {
        const agg = evaluateGrants(
          resolveGrantSourcesForSpells([{ srdId: spell, prepared: true }]),
          new Set([key])
        );
        expect(agg.grantedActions.some((a) => a.slot === "bonus")).toBe(true);
      }
    }
  );

  rule(
    {
      category: 2,
      case: "Wild Shape ends on Incapacitated, but concentration is separate",
      source: "WIKI druid:main",
      status: "works",
    },
    () => {
      // Stunned: the form ends, and (separately) so does Concentration.
      const doc = wildShapedDruid();
      expect(doc.session.activeForm?.beastId).toBe("brown-bear");
      expect(conditionBreaksConcentration("stunned")).toBe(true);
      expect(addCondition(doc, "stunned")?.activeForm).toBeUndefined();
    }
  );
});
