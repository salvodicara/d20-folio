/** Conformance, category 14: homebrew and table rules (corpus.md § 14). */
import { describe, expect } from "vitest";
import { clampExhaustion } from "@/lib/compute";
import { effectiveTableRules } from "@/lib/table-rules";
import { diedInPlay } from "@/lib/character-status";
import { evaluateGrants } from "@/lib/grants";
import { homebrewSpellData } from "@/lib/homebrew-spells";
import { selfFormRule } from "@/lib/polymorph";
import { SITUATION_IDS } from "@/lib/situational-states";
import { consumableActionSlot } from "@/lib/srd-resolve";
import { undatedLifetime } from "@/lib/status-lifetime";
import {
  abilityPart,
  breakdownTotal,
  isHandSet,
  termPart,
  withOverride,
} from "@/lib/value-breakdown";
import type { CustomSpell } from "@/types/character";
import { customInstanceId } from "../__helpers__/custom-items";
import { rule } from "./rule";

/** The campaign's table rules (B-F11): RAW by default. */
async function defaultTableRules(): Promise<Record<string, unknown>> {
  const id = "@/lib/table-rules";
  const mod = (await import(/* @vite-ignore */ id)) as Record<string, unknown>;
  return mod.RAW_TABLE_RULES as Record<string, unknown>;
}

/** Call a pure function with the table rules it should take as a last argument. */
function withRules<A extends unknown[], R>(
  fn: (...args: A) => R,
  ...args: [...A, unknown]
): R {
  return (fn as unknown as (...a: unknown[]) => R)(...args);
}

describe("conformance · 14. homebrew", () => {
  rule(
    {
      category: 14,
      case: "Optional rules dropped from the 2024 DMG",
      source: "wargamer.com axed-optional-rules",
      status: "M16",
    },
    async () => {
      // The table can switch on rules no 2024 book has; RAW leaves them off.
      expect(await defaultTableRules()).toMatchObject({
        flanking: "off",
        heroPoints: false,
        plotPoints: false,
      });
    }
  );

  rule(
    {
      category: 14,
      case: "Flanking toggle",
      source: "themonstersknow.com",
      status: "M16",
    },
    () => {
      // With no positions on the sheet, flanking is a situation the player taps.
      expect(SITUATION_IDS).toContain("flanking");
    }
  );

  rule(
    { category: 14, case: "Critical fumbles", source: "SAC #3", status: "M16" },
    async () => {
      // RAW: a 1 on a check or save isn't an automatic failure, a 1 on an attack is a
      // miss; a table may add a fumble.
      expect(await defaultTableRules()).toMatchObject({
        nat1: { checks: "none", attacks: "miss" },
      });
    }
  );

  rule(
    {
      category: 14,
      case: "Potions: house rule reversed",
      source: "enworld; rpgbot",
      status: "works",
    },
    () => {
      const potion = { isPotion: true, isConsumable: true };
      expect(consumableActionSlot(potion)).toBe("bonus");
      // A table that makes drinking a potion an action.
      const rules = effectiveTableRules({ tableRules: { potions: { drink: "action" } } });
      expect(consumableActionSlot(potion, rules)).toBe("action");
    }
  );

  rule(
    {
      category: 14,
      case: "Gritty rests and long-term timers",
      source: "GLOSS; enworld",
      status: "works",
    },
    () => {
      const eightHours = { kind: "timed", minutes: 480 } as const;
      expect(undatedLifetime(eightHours)).toEqual({ kind: "rest", rest: "long" });
      // Gritty realism: a Short Rest is a night, so it outlasts an 8-hour effect.
      const gritty = effectiveTableRules({
        tableRules: { rest: { shortMinutes: 8 * 60, longMinutes: 7 * 24 * 60 } },
      });
      expect(undatedLifetime(eightHours, gritty)).toEqual({
        kind: "rest",
        rest: "short",
      });
    }
  );

  rule(
    {
      category: 14,
      case: "Tracking exhaustion your own way",
      source: "fvtt-dnd5e-custom-counters",
      status: "works",
    },
    () => {
      expect(clampExhaustion(8)).toBe(6);
      // A 10-level track keeps level 8.
      const tenLevels = effectiveTableRules({
        tableRules: { exhaustion: { maxLevel: 10 } },
      });
      expect(clampExhaustion(8, tenLevels)).toBe(8);
    }
  );

  rule(
    {
      category: 14,
      case: "Mixed 2014 and 2024 content",
      source: "rpgbot",
      status: "works",
    },
    () => {
      // A 2014 homebrew copy and the 2024 Shield of Faith are the same effect: only
      // one +2 applies.
      const shieldOfFaith = [{ type: "ac-bonus", amount: 2 } as const];
      const aggregate = evaluateGrants([
        {
          id: "shield-of-faith",
          name: { en: "Shield of Faith", it: "Scudo della Fede" },
          grants: shieldOfFaith,
        },
        {
          id: "homebrew-shield-of-faith-2014",
          name: { en: "Shield of Faith", it: "Scudo della Fede" },
          grants: shieldOfFaith,
        },
      ]);
      expect(aggregate.acBonus).toBe(2);
    }
  );

  rule(
    {
      category: 14,
      case: "Custom spells that scale",
      source: "WIKI spell:summon-beast; dndbeyond",
      status: "works",
    },
    () => {
      // A homebrew spell takes the official templates: dice and targets per upcast.
      const spell: CustomSpell = {
        custom: true,
        name: "Twin Bolt",
        level: 2,
        school: "evocation",
        castingTime: "action",
        range: "120 feet",
        components: { v: true, s: true, m: false },
        duration: "Instantaneous",
        concentration: false,
        description: "Bolts of force.",
        prepared: true,
        instanceId: customInstanceId("Twin Bolt"),
        mechanics: {
          damageType: "force",
          damageDice: "2d8",
          damageDicePerUpcast: "1d8",
          targeting: { affinity: "enemy", maxTargets: 1, maxTargetsPerUpcast: 1 },
          duration: { kind: "instantaneous" },
        },
      };
      const data = homebrewSpellData(spell);
      expect(data?.damageDicePerUpcast).toBe("1d8");
      expect(data?.targeting?.maxTargetsPerUpcast).toBe(1);
    }
  );

  rule(
    {
      category: 14,
      case: "Custom monsters and partial shape-change",
      source: "FVTT#7153",
      status: "M2",
    },
    () => {
      // A form rule names which of the caster's own scores it keeps.
      expect(selfFormRule("shapechange")).toHaveProperty("keeps.abilities", [
        "INT",
        "WIS",
        "CHA",
      ]);
    }
  );

  rule(
    {
      category: 14,
      case: "Familiars that can attack",
      source: "FVTT#4009",
      status: "works",
    },
    async () => {
      // RAW a familiar can't attack; the table can allow it.
      expect(await defaultTableRules()).toMatchObject({ familiarsAttack: false });
    }
  );

  rule(
    {
      category: 14,
      case: "Fixing the hide rules",
      source: "enworld; dndbeyond",
      status: "M16",
    },
    async () => {
      // The Hide/Invisible model is a table policy with RAW as its default.
      expect(await defaultTableRules()).toMatchObject({ hide: "raw" });
    }
  );

  rule(
    {
      category: 14,
      case: "Other optional rules in the 2024 books",
      source: "WIKI home",
      status: "M16",
    },
    async () => {
      // Bastions, Circle Magic, Factions and evolving items are systems a table
      // switches on.
      expect(await defaultTableRules()).toMatchObject({
        bastions: false,
        circleMagic: false,
        factions: false,
        evolvingItems: false,
      });
    }
  );

  rule(
    {
      category: 14,
      case: "Sheet overrides",
      source: "dndbeyond forums",
      status: "works",
    },
    () => {
      // The hand-set AC sits above the computed parts and stays visible as such.
      const computed = [termPart("breakdown.base", 10), abilityPart("DEX", 2)];
      const parts = withOverride(computed, 15);
      expect(breakdownTotal(parts)).toBe(15);
      expect(isHandSet(parts)).toBe(true);
      expect(isHandSet(computed)).toBe(false);
    }
  );

  rule(
    { category: 14, case: "Opt-in bonuses", source: "FVTT#7255", status: "works" },
    () => {
      // A "you can" bonus applies only while the player switches it on.
      const source = {
        id: "homebrew-feat",
        grants: [
          {
            type: "while-active",
            activeKey: "homebrew-steady-aim",
            grants: [{ type: "ac-bonus", amount: 1 }],
          },
        ] as const,
      };
      expect(evaluateGrants([source]).acBonus).toBe(0);
      expect(evaluateGrants([source], new Set(["homebrew-steady-aim"])).acBonus).toBe(1);
    }
  );

  rule(
    { category: 14, case: "Death-save variants", source: "FVTT#7367", status: "M16" },
    () => {
      expect(diedInPlay({ deathFail: 3 })).toBe(true);
      // A table that needs five failures.
      expect(
        withRules(diedInPlay, { deathFail: 3 }, { deathSaves: { failures: 5 } })
      ).toBe(false);
    }
  );
});
