/** Conformance, category 7: effects that modify other effects (corpus.md § 7). */
import { describe, expect } from "vitest";
import { getClassFeatures } from "@/data/classes";
import { getFeat } from "@/data/feats";
import { getSpellById } from "@/data/spells";
import { SRD_METAMAGIC } from "@/data/metamagic";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { evaluateGrants } from "@/lib/grants";
import { resolveGrantSourcesForSpells } from "@/lib/resolve-grant-sources";
import { resolveCastingModifier, resolveSpellDamageBonus } from "@/lib/compute";
import {
  metamagicOptionsForCast,
  toggleMetamagicSelection,
  type MetamagicSpellFacts,
} from "@/lib/cast-options";
import { catalogueActions } from "@/lib/activities/catalogue";
import { activityFromAction, activityFromSpell } from "@/lib/activities";
import { resolveActions, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import {
  damageTrayPlan,
  initialTrayRow,
  rowAmount,
  setAttackOutcome,
} from "@/lib/play/damage-tray";
import type { CharacterDoc, SessionState } from "@/types/character";
import { makeCharacterDoc } from "../_helpers";
import { rule } from "./rule";

const SCORES = { STR: 10, DEX: 16, CON: 14, INT: 18, WIS: 12, CHA: 18 };

function pc(
  classId: string,
  level: number,
  extra: Partial<ScenarioSpec> = {},
  session: Partial<SessionState> = {}
): CharacterDoc {
  const doc = buildScenario({
    name: "Conformance",
    raceId: "human",
    classId,
    level,
    background: "sage",
    abilityScores: SCORES,
    ...extra,
  });
  return { ...doc, session: { ...doc.session, ...session } };
}

const aggregate = (doc: CharacterDoc) =>
  aggregateCharacterGrants(doc.character, doc.session);

/** A spell's lit state, as its own grant sources evaluate it. */
const litSpell = (spellId: string) =>
  evaluateGrants(
    resolveGrantSourcesForSpells([{ srdId: spellId, prepared: true }]),
    new Set([`spell-${spellId}`])
  );

const feature = (classId: string, id: string) => {
  const found = getClassFeatures(classId).find((f) => f.id === id);
  if (!found) throw new Error(`no feature ${id}`);
  return found;
};

function facts(spellId: string): MetamagicSpellFacts {
  const spell = getSpellById(spellId);
  if (!spell) throw new Error(`no spell ${spellId}`);
  return {
    level: spell.level,
    castingTime: spell.castingTime,
    forcesSave: spell.saveAbility != null,
    dealsDamage: spell.damageDice != null,
    makesAttack: spell.attackType != null,
  };
}

const STACKERS = new Set(
  SRD_METAMAGIC.filter((m) => m.stacksWithPrimary).map((m) => m.id)
);

/** A wizard 9 spellbook, resolved as combat cards. */
function spellCard(spellId: string): ResolvedAction {
  const doc = makeCharacterDoc({
    classes: [{ classId: "wizard", level: 9 }],
    spells: [{ srdId: spellId }],
  });
  const card = resolveActions(doc, "spellbook")
    .map((row) => localizeAction(row, "en"))
    .find((a) => a.spellId === spellId);
  if (!card) throw new Error(`no card for ${spellId}`);
  return card;
}

describe("conformance · 7. effects that modify other effects", () => {
  rule(
    {
      category: 7,
      case: "One Metamagic per spell, with exceptions",
      source: "WIKI sorcerer:main; SAC #62",
      status: "M13",
    },
    () => {
      // Normally a second primary option replaces the first.
      expect(
        toggleMetamagicSelection(["quickened-spell"], "twinned-spell", STACKERS)
      ).toEqual(["twinned-spell"]);
      // Sorcery Incarnate (7) with Innate Sorcery active: two options on one spell.
      const doc = pc("sorcerer", 7, { activeFeatures: ["sorcerer-innate-sorcery"] });
      const policy = new Map(Object.entries(aggregate(doc)));
      expect(policy.get("metamagicPerSpell")).toBe(2);
    }
  );

  rule(
    {
      category: 7,
      case: "Twinned Spell 2024",
      source: "DDB 2024 sorcerer; SAC #66",
      status: "M13",
    },
    () => {
      // Only spells that gain a target when upcast: Hold Person yes, Fireball no.
      const twinned = (spellId: string) =>
        metamagicOptionsForCast(["twinned-spell"], facts(spellId), 5)[0]?.appliesToSpell;
      expect(twinned("hold-person")).toBe(true);
      expect(twinned("fireball")).toBe(false);
    }
  );

  rule(
    {
      category: 7,
      case: "Careful and Heightened Spell",
      source: "dungeonmister 2024 metamagic",
      status: "works",
    },
    () => {
      // Both need a save; Careful costs 1 Sorcery Point, Heightened 2. Who is
      // protected and the per-target disadvantage are the table's.
      const options = metamagicOptionsForCast(
        ["careful-spell", "heightened-spell"],
        facts("fireball"),
        5
      );
      expect(options.map((o) => [o.id, o.cost, o.appliesToSpell])).toEqual([
        ["careful-spell", 1, true],
        ["heightened-spell", 2, true],
      ]);
      const noSave = metamagicOptionsForCast(
        ["careful-spell"],
        facts("magic-missile"),
        5
      );
      expect(noSave[0]?.appliesToSpell).toBe(false);
    }
  );

  rule(
    {
      category: 7,
      case: "Empowered Spell across rays",
      source: "SAC #64",
      status: "works",
    },
    () => {
      // One option for the whole Scorching Ray (the per-spell die limit is the
      // player's), stacking on top of another option.
      const [empowered] = metamagicOptionsForCast(
        ["empowered-spell"],
        facts("scorching-ray"),
        5
      );
      expect(empowered).toMatchObject({
        cost: 1,
        appliesToSpell: true,
        stacksWithPrimary: true,
      });
    }
  );

  rule(
    {
      category: 7,
      case: "Elemental Affinity and Empowered Evocation",
      source: "SAC #63",
      status: "works",
    },
    () => {
      // One bonus per spell, however many rays: +INT (4) on Scorching Ray, once.
      const evoker = pc("wizard", 10, { subclassId: "evoker" });
      const scores = { ...SCORES };
      expect(
        resolveSpellDamageBonus(
          aggregate(evoker).spellDamageBonuses,
          ["fire"],
          scores,
          "wizard",
          2,
          "evocation"
        )
      ).toBe(4);
      // Draconic Sorcery (fire): +CHA (4) on a fire spell, nothing on a cold one.
      const draconic = pc("sorcerer", 6, {
        subclassId: "draconic-sorcery",
        grantBundleChoices: { "sorcerer-draconic-elemental-affinity": "fire" },
      });
      const bonuses = aggregate(draconic).spellDamageBonuses;
      expect(resolveSpellDamageBonus(bonuses, ["fire"], scores, "sorcerer", 2)).toBe(4);
      expect(resolveSpellDamageBonus(bonuses, ["cold"], scores, "sorcerer", 2)).toBe(0);
    }
  );

  rule(
    {
      category: 7,
      case: "Great Weapon Fighting is weapon dice only",
      source: "SAC #84; SAC #87",
      status: "works",
    },
    () => {
      // A 1 or 2 counts as 3, on the two-handed weapon's own dice only (Smite and Hex
      // dice are not weapon dice); Savage Attacker also rerolls only weapon dice.
      expect(getFeat("great-weapon-fighting")?.grants).toEqual([
        {
          type: "damage-die-modifier",
          mode: "floor",
          appliesTo: "two-handed-melee",
          floorBelow: 2,
          floorTo: 3,
        },
      ]);
      expect(getFeat("savage-attacker")?.grants).toEqual([
        expect.objectContaining({ type: "damage-die-modifier", appliesTo: "weapon" }),
      ]);
    }
  );

  rule(
    {
      category: 7,
      case: "Critical hits double every damage die",
      source: "GLOSS; SAC #51",
      status: "works",
    },
    () => {
      // The player rolls the doubled dice and types the total: the tray never
      // doubles it again (a flat bonus would be doubled with it).
      const card = spellCard("fire-bolt");
      const plan = damageTrayPlan(card, ["monster-1"], "pc-me");
      if (!plan) throw new Error("no tray");
      const crit = setAttackOutcome(initialTrayRow(plan, "monster-1"), "critical", plan);
      expect(crit.multiplier).toBe("1");
      expect(rowAmount(23, crit, plan)).toBe(23);
    }
  );

  rule(
    {
      category: 7,
      case: "Negative dice on a crit",
      source: "FVTT#7047",
      status: "works",
    },
    () => {
      // Ray of Enfeeblement's −1d8 isn't damage: its crit has no damage to double.
      const plan = damageTrayPlan(
        spellCard("ray-of-enfeeblement"),
        ["monster-1"],
        "pc-me"
      );
      expect(plan?.effect).toBeNull();
    }
  );

  rule(
    {
      category: 7,
      case: "Non-damage riders aren't doubled",
      source: "SAC #151",
      status: "works",
    },
    () => {
      // Only damage effects carry dice a crit doubles: Ray of Sickness's Poisoned is
      // its own effect, landed once whatever the attack result.
      const spell = getSpellById("ray-of-sickness");
      if (!spell) throw new Error("no spell");
      const effects = activityFromSpell(spell).effects;
      expect(effects.map((e) => e.kind)).toEqual(["damage", "condition"]);
      expect(effects[1]).not.toHaveProperty("dice");
    }
  );

  rule(
    {
      category: 7,
      case: "Reliable Talent sets a minimum on the die",
      source: "WIKI rogue:main; SAC #61",
      status: "works",
    },
    () => {
      // A d20 of 9 or less counts as 10, on proficient checks only (so never with
      // Jack of All Trades).
      expect(aggregate(pc("rogue", 7)).rollFloors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rollType: "check",
            floor: 10,
            appliesTo: "proficient",
          }),
        ])
      );
    }
  );

  rule(
    { category: 7, case: "Tactical Mind", source: "WIKI fighter:main", status: "works" },
    () => {
      // +1d10 on a failed check, paid from Second Wind only if it then succeeds.
      const [action] =
        feature("fighter", "fighter-tactical-mind").mechanics?.actions ?? [];
      expect(action).toMatchObject({
        costTracker: "fighter-second-wind",
        checkBonus: { dice: "1d10", refundOnFail: true },
      });
    }
  );

  rule(
    {
      category: 7,
      case: "Indomitable and Disciplined Survivor",
      source: "WIKI fighter:main; WIKI monk:main",
      status: "works",
    },
    () => {
      // Indomitable is a reroll of a failed save, + Fighter level, spending a use.
      const actions = resolveActions(pc("fighter", 9), "combat");
      expect(actions.some((a) => a.id.startsWith("fighter-indomitable"))).toBe(true);
      // Disciplined Survivor: the same reroll for 1 Focus Point.
      const monk = resolveActions(pc("monk", 14), "combat");
      expect(monk.some((a) => a.id.startsWith("monk-disciplined-survivor"))).toBe(true);
    }
  );

  rule(
    {
      category: 7,
      case: "Innate Sorcery",
      source: "WIKI sorcerer:main",
      status: "works",
    },
    () => {
      // +1 to the Sorcerer spell DC only; a Wizard spell of the same character
      // keeps its DC.
      const doc = pc("sorcerer", 3, {
        secondaryClasses: [{ classId: "wizard", level: 1 }],
        activeFeatures: ["sorcerer-innate-sorcery"],
      });
      const agg = aggregate(doc);
      expect(resolveCastingModifier(agg.spellSaveDcBonus, "sorcerer")).toBe(1);
      expect(resolveCastingModifier(agg.spellSaveDcBonus, "wizard")).toBe(0);
      expect(agg.advantages.some((a) => a.rollType === "attack")).toBe(true);
    }
  );

  rule(
    {
      category: 7,
      case: "Cunning Strike costs dice before the roll",
      source: "WIKI rogue:main",
      status: "works",
    },
    () => {
      // Poison, Trip, Withdraw at 1 die each from level 5; Daze (2), Knock Out (6)
      // and Obscure (3) from level 14.
      const costs = (level: number) =>
        Object.fromEntries(
          aggregate(pc("rogue", level)).cunningStrikeOptions.map((o) => [
            o.optionId,
            o.cost,
          ])
        );
      expect(costs(5)).toEqual({ poison: 1, trip: 1, withdraw: 1 });
      expect(costs(14)).toMatchObject({ daze: 2, "knock-out": 6, obscure: 3 });
    }
  );

  rule(
    {
      category: 7,
      case: "Stunning Strike on a success",
      source: "WIKI monk:main; KIBBLES #10",
      status: "M12",
    },
    () => {
      // On a successful save: half speed and Advantage on the next attack against it.
      const entry = catalogueActions().find(
        (c) =>
          c.owner.source.kind === "feature" &&
          c.owner.source.ownerId === "monk-stunning-strike"
      );
      if (!entry) throw new Error("no Stunning Strike action");
      const kinds = activityFromAction(entry.action, entry.owner).effects.map(
        (e) => e.kind
      );
      expect(kinds).toContain("next-attack-advantage");
    }
  );

  rule(
    {
      category: 7,
      case: "Shillelagh and other die swaps",
      source: "SAC #140; SAC #86",
      status: "works",
    },
    () => {
      // Shillelagh binds to the one weapon it targets (Club or Quarterstaff), so
      // other attacks keep their own die.
      const bindings = litSpell("shillelagh").weaponBindings;
      expect(bindings.map((b) => b.grant.weaponIds)).toEqual([["club", "quarterstaff"]]);
    }
  );

  rule(
    { category: 7, case: "Bless and Bane", source: "SAC #48", status: "works" },
    () => {
      // Bless adds a d4, Bane subtracts one, to attacks and saves.
      const adjust = (spellId: string) => {
        return litSpell(spellId).rollDieAdjustments.map((a) => [
          a.rollType,
          a.operation,
          a.dice,
        ]);
      };
      expect(adjust("bless")).toEqual(
        expect.arrayContaining([
          ["attack", "add", "1d4"],
          ["save", "add", "1d4"],
        ])
      );
      expect(adjust("bane")).toEqual(
        expect.arrayContaining([
          ["attack", "subtract", "1d4"],
          ["save", "subtract", "1d4"],
        ])
      );
    }
  );
});
