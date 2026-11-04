/** Conformance, category 1: stacking and ordering (corpus.md § 1). */
import { describe, expect } from "vitest";
import { canAttune } from "@/lib/attunement-guard";
import { effectiveAC } from "@/lib/aggregate-character";
import { netRollState } from "@/lib/condition-effects";
import { resolveDamageIntake, NO_DEFENSES } from "@/lib/damage-intake";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { addCondition } from "@/lib/play/conditions";
import { takeDamage } from "@/lib/play/damage";
import { riderTakenEvents } from "@/lib/play/rider-taken";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { gainTempHp, healBy, setExhaustion } from "@/lib/play/vitals";
import { resolveGrantSourcesForSpells } from "@/lib/resolve-grant-sources";
import { ruleNumber, ruleTerms } from "@/lib/rules";
import {
  attacksPerActionForCharacter,
  effectiveWalkingSpeedFt,
} from "@/lib/smart-tracker";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc, SrdEquipmentRef, SrdSpellRef } from "@/types/character";
import { makeCharacterDoc } from "../_helpers";
import { rule } from "./rule";

const item = (srdId: string, instanceId: string, attuned?: boolean): SrdEquipmentRef => ({
  srdId,
  instanceId,
  quantity: 1,
  equipped: true,
  ...(attuned === undefined ? {} : { attuned }),
});

/** A Wizard 5 with DEX 16 (+3) and the AC buffs prepared; `active` lights them. */
function acDoc(
  active: string[],
  extra: Partial<Parameters<typeof makeCharacterDoc>[0]> = {}
): CharacterDoc {
  const spells: SrdSpellRef[] = [
    { srdId: "mage-armor", prepared: true },
    { srdId: "shield-of-faith", prepared: true },
    { srdId: "barkskin", prepared: true },
  ];
  return makeCharacterDoc(
    {
      classId: "wizard",
      level: 5,
      abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 16, WIS: 12, CHA: 8 },
      spells,
      equipment: [],
      ...extra,
    },
    { activeFeatures: active }
  );
}

const acOf = (doc: CharacterDoc): number => effectiveAC(doc.character, doc.session);

describe("conformance · 1. stacking and ordering", () => {
  rule(
    {
      category: 1,
      case: "Same-name effects don't stack",
      source: "GLOSS",
      status: "works",
    },
    () => {
      // Two clerics each cast Shield of Faith on the same fighter: one +2, not +4.
      const copy = (caster: string): GrantSource => ({
        id: `${caster}:shield-of-faith`,
        ref: { kind: "spell", key: "shield-of-faith" },
        grants: [{ type: "ac-bonus", amount: 2 }],
      });
      const agg = evaluateGrants([copy("cleric-a"), copy("cleric-b")]);
      expect(ruleNumber(agg.values, "ac:bonus")).toBe(2);
    }
  );

  rule(
    { category: 1, case: "Different names do stack", source: "SAC #48", status: "works" },
    () => {
      // Bless and Bane on the same attack roll: both dice ride it (+1d4 and −1d4).
      const sources = resolveGrantSourcesForSpells([
        { srdId: "bless", prepared: true },
        { srdId: "bane", prepared: true },
      ]);
      const agg = evaluateGrants(sources, new Set(["spell-bless", "spell-bane"]));
      const onAttack = agg.rollDieAdjustments.filter((a) => a.rollType === "attack");
      expect(onAttack.map((a) => [a.operation, a.dice])).toEqual([
        ["add", "1d4"],
        ["subtract", "1d4"],
      ]);
    }
  );

  rule(
    {
      category: 1,
      case: "Item bonuses stack, but not duplicate attunement",
      source: "SAC #159",
      status: "works",
    },
    () => {
      const doc = acDoc([], {
        equipment: [
          item("ring-of-protection", "ring-1", true),
          item("bracers-of-defense", "bracers", true),
          item("ring-of-protection", "ring-2", false),
        ],
      });
      // 10 + DEX 3, +1 ring, +2 bracers (no armor, no shield).
      expect(acOf(doc)).toBe(16);
      expect(canAttune(doc, "ring-2")).toMatchObject({
        ok: false,
        reason: "duplicate-copy",
      });
    }
  );

  rule(
    {
      category: 1,
      case: "Advantage/disadvantage cancel regardless of count",
      source: "GLOSS",
      status: "works",
    },
    () => {
      // Three sources of Advantage and one of Disadvantage: a straight roll.
      const adv = [true, true, true].some(Boolean);
      const dis = [true].some(Boolean);
      expect(netRollState(adv, dis)).toBe("none");
      expect(netRollState(true, false)).toBe("advantage");
    }
  );

  rule(
    {
      category: 1,
      case: "Damage modifier order",
      source: "SAC #36; GLOSS",
      status: "works",
    },
    () => {
      // A 21-damage breath weapon, saved (the tray halves it to 10), on a fire-resistant
      // target with two resistance sources: halved once more, to 5.
      const resisted = resolveDamageIntake([{ amount: 10, type: "fire" }], {
        ...NO_DEFENSES,
        allDamageResistance: true,
        resistances: new Set(["fire"]),
      });
      expect(resisted.netTotal).toBe(5);
      // Flat reduction first, then Resistance, then Vulnerability: (20 − 3) / 2 × 2.
      const ordered = resolveDamageIntake(
        [{ amount: 20, type: "slashing", delivery: "attack" }],
        {
          ...NO_DEFENSES,
          resistances: new Set(["slashing"]),
          vulnerabilities: new Set(["slashing"]),
          flatReductions: [
            { id: "ham", damageTypes: ["slashing"], amount: 3, trigger: "attack" },
          ],
        }
      );
      expect(ordered.netTotal).toBe(16);
    }
  );

  rule(
    { category: 1, case: "Damage floors at 0", source: "SAC #35", status: "works" },
    () => {
      const out = resolveDamageIntake(
        [{ amount: 2, type: "piercing", delivery: "attack" }],
        {
          ...NO_DEFENSES,
          resistances: new Set(["piercing"]),
          flatReductions: [
            { id: "ham", damageTypes: ["piercing"], amount: 5, trigger: "attack" },
          ],
        }
      );
      expect(out.netTotal).toBe(0);
      expect(out.parts[0]?.net).toBe(0);
    }
  );

  rule(
    { category: 1, case: "Temp HP never add together", source: "GLOSS", status: "works" },
    () => {
      const doc = {
        ...MOCK_CHARACTER,
        session: {
          ...MOCK_CHARACTER.session,
          hp: { ...MOCK_CHARACTER.session.hp, temp: 8 },
        },
      };
      // A smaller new grant changes nothing; a larger one replaces, never adds.
      expect(gainTempHp(doc, 5)).toBeNull();
      expect(gainTempHp(doc, 10)?.hp.temp).toBe(10);
    }
  );

  rule(
    {
      category: 1,
      case: "Only one AC formula at a time",
      source: "WIKI class:multiclassing; SAC #129",
      status: "works",
    },
    () => {
      // A Barbarian (DEX 14, CON 18) with Mage Armor up: max(10+2+4, 13+2), never a sum.
      const doc = makeCharacterDoc(
        {
          classId: "barbarian",
          level: 5,
          abilityScores: { STR: 16, DEX: 14, CON: 18, INT: 10, WIS: 10, CHA: 8 },
          spells: [{ srdId: "mage-armor", prepared: true }],
          features: [{ srdId: "barbarian-unarmored-defense" }],
          equipment: [],
        },
        { activeFeatures: ["spell-mage-armor"] }
      );
      expect(acOf(doc)).toBe(16);
    }
  );

  rule(
    { category: 1, case: "AC formula vs AC bonus", source: "SAC #128", status: "works" },
    () => {
      const shield = [item("shield", "shield")];
      // Mage Armor works with a shield: 13 + 3 + 2, and Shield of Faith adds 2 more.
      expect(acOf(acDoc(["spell-mage-armor"], { equipment: shield }))).toBe(18);
      expect(
        acOf(acDoc(["spell-mage-armor", "spell-shield-of-faith"], { equipment: shield }))
      ).toBe(20);
      // A Monk's Unarmored Defense (DEX 16, WIS 16) doesn't survive a shield.
      const monk = (equipment: SrdEquipmentRef[]) =>
        makeCharacterDoc({
          classId: "monk",
          level: 5,
          abilityScores: { STR: 10, DEX: 16, CON: 14, INT: 10, WIS: 16, CHA: 8 },
          features: [{ srdId: "monk-unarmored-defense" }],
          equipment,
        });
      expect(acOf(monk([]))).toBe(16);
      expect(acOf(monk(shield))).toBe(15);
    }
  );

  rule(
    {
      category: 1,
      case: "Barkskin is a floor, not a formula",
      source: "SAC #113",
      status: "works",
    },
    () => {
      expect(acOf(acDoc(["spell-barkskin"]))).toBe(17);
      // Plate (18) beats the floor; chain mail (16) is raised to it.
      expect(
        acOf(acDoc(["spell-barkskin"], { equipment: [item("plate-armor", "plate")] }))
      ).toBe(18);
      expect(
        acOf(acDoc(["spell-barkskin"], { equipment: [item("chain-mail", "chain")] }))
      ).toBe(17);
    }
  );

  rule(
    {
      category: 1,
      case: "Overlapping paladin auras",
      source: "WIKI paladin:main",
      status: "works",
    },
    () => {
      // Two paladins' Auras of Protection (CHA +3 and +2) on one ally: only one applies.
      const aura = (paladin: string, amount: number): GrantSource => ({
        id: `${paladin}:paladin-aura-of-protection`,
        ref: { kind: "class-feature", key: "paladin-aura-of-protection" },
        grants: [{ type: "save-bonus", amount }],
      });
      const agg = evaluateGrants([aura("paladin-a", 3), aura("paladin-b", 2)]);
      expect(ruleTerms(agg.values, "save:all")).toEqual([]);
      expect(ruleNumber(agg.values, "save:all")).toBe(3);
    }
  );

  rule(
    { category: 1, case: "Simultaneous effects", source: "GLOSS", status: "works" },
    () => {
      // A heal and a hit land together on a creature at 5/44 HP: the order the turn's
      // owner picks decides the result, and the sheet takes either.
      const doc = makeCharacterDoc({}, { hp: { current: 5, temp: 0 } });
      const healFirst = healBy(doc, 10);
      expect(healFirst).not.toBeNull();
      if (!healFirst) return;
      const thenHit = takeDamage({ ...doc, session: healFirst }, 12);
      expect(thenHit?.session.hp.current).toBe(3);

      const hitFirst = takeDamage(doc, 12);
      expect(hitFirst?.session.hp.current).toBe(0);
      if (!hitFirst) return;
      const thenHeal = healBy({ ...doc, session: hitFirst.session }, 10);
      expect(thenHeal?.hp.current).toBe(10);
    }
  );

  rule(
    {
      category: 1,
      case: "Exhaustion is the only condition that stacks",
      source: "GLOSS; FVTT#7618",
      status: "works",
    },
    () => {
      // Two separate sources of one Exhaustion level each: level 2.
      const doc = makeCharacterDoc({}, { exhaustion: 1, conditions: ["poisoned"] });
      expect(setExhaustion(doc, doc.session.exhaustion + 1)?.exhaustion).toBe(2);
      // Any other condition is on or off: a second Poisoned changes nothing.
      expect(addCondition(doc, "poisoned")).toBeNull();
    }
  );

  rule(
    {
      category: 1,
      case: "Same-name speed reductions",
      source: "KIBBLES #30; WIKI fighter:main",
      status: "works",
    },
    () => {
      // Two Slow-mastery hits (each −10 ft) on a 30 ft creature: 20 ft, not 10.
      let doc = makeCharacterDoc({ speed: "30" });
      for (let hit = 0; hit < 2; hit += 1) {
        for (const event of riderTakenEvents(
          doc,
          { kind: "speed-reduction", feet: 10 },
          { damageTaken: 5 }
        )) {
          doc = applySheetEvent(doc, event) ?? doc;
        }
      }
      expect(effectiveWalkingSpeedFt(doc)).toBe(20);
    }
  );

  rule(
    {
      category: 1,
      case: "Extra Attack doesn't stack across classes",
      source: "WIKI class:multiclassing",
      status: "works",
    },
    () => {
      // Fighter 5 / Paladin 5: two attacks, not three.
      const doc = makeCharacterDoc({
        classes: [
          { classId: "fighter", level: 5 },
          { classId: "paladin", level: 5 },
        ],
      });
      expect(attacksPerActionForCharacter(doc)).toBe(2);
      // Thirsting Blade on top of Extra Attack adds nothing.
      const blade = makeCharacterDoc({
        classes: [
          { classId: "fighter", level: 5 },
          { classId: "warlock", level: 5, invocationChoices: ["thirsting-blade"] },
        ],
      });
      expect(attacksPerActionForCharacter(blade)).toBe(2);
    }
  );
});
