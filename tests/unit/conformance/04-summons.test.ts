/** Conformance, category 4: summons and companions (corpus.md § 4). */
import { describe, expect } from "vitest";
import { classFeatureIndex } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import { GIANT_INSECT, OTHERWORLDLY_STEED } from "@/data/spells/companions";
import { resolveCompanion } from "@/lib/compute";
import { concentrationValue } from "@/lib/concentration";
import { buildScenario } from "@/lib/dev-scenarios";
import { FIND_FAMILIAR_SPELL_ID } from "@/lib/familiar-ids";
import { setCompanionHp, summonFamiliar } from "@/lib/play/companions";
import {
  summonInitiativeEntries,
  summonTurnOf,
  summonedTurnOrder,
} from "@/lib/play/summon-initiative";
import {
  buildCompanionCardViews,
  buildSummonedMonsterGroups,
} from "@/lib/views/companion-row-view";
import type { CharacterDoc, SessionState } from "@/types/character";
import { rule } from "./rule";

const t = (key: string): string => key;

const SCORES = { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 12, CHA: 16 };

function caster(
  classId: string,
  level: number,
  spells: string[],
  session: Partial<SessionState> = {}
): CharacterDoc {
  const doc = buildScenario({
    name: "Caster",
    raceId: "human",
    classId,
    level,
    background: "acolyte",
    abilityScores: SCORES,
    spells: spells.map((srdId) => ({ srdId, prepared: true })),
  });
  return { ...doc, session: { ...doc.session, ...session } };
}

describe("conformance · 4. summons and companions", () => {
  rule(
    {
      category: 4,
      case: "Summons share initiative but act after you",
      source: "WIKI spell:summon-beast; aidedd summon-beast",
      status: "works",
    },
    () => {
      expect(summonTurnOf({ spellId: "giant-insect" })).toBe("after-caster");
      const rows = summonInitiativeEntries([{ spellId: "giant-insect", count: 1 }], {
        id: "caster",
        initiative: 14,
      });
      // The insect acts on the caster's count, right after the caster.
      expect(rows).toEqual([
        expect.objectContaining({
          turn: "after-caster",
          initiative: 14,
          afterId: "caster",
        }),
      ]);
      expect(
        summonedTurnOrder(
          ["goblin", "caster", "ogre", "insect"],
          [{ summonId: "insect", casterId: "caster" }]
        )
      ).toEqual(["goblin", "caster", "insect", "ogre"]);
    }
  );

  rule(
    {
      category: 4,
      case: "Conjure spells are zones now, not creatures",
      source: "WIKI spell:conjure-animals",
      status: "works",
    },
    () => {
      const spell = getSpellById("conjure-animals");
      // No creature to track: a concentration area that forces a DEX save when a
      // creature enters it or ends its turn there.
      expect(spell?.companion).toBeUndefined();
      expect(spell?.summonedMonsters).toBeUndefined();
      expect(spell).toMatchObject({
        concentration: true,
        area: true,
        saveAbility: "DEX",
        recurrence: "on-enter-or-end-turn",
      });
    }
  );

  rule(
    {
      category: 4,
      case: "Conjure Minor Elementals is a per-attack buff",
      source: "ERRATA; KIBBLES #25",
      status: "M11",
    },
    () => {
      const spell = getSpellById("conjure-minor-elementals");
      const riders = (spell?.grants ?? []).flatMap((g) =>
        g.type === "while-active" ? g.grants.filter((i) => i.type === "damage-rider") : []
      );
      // Any attack, Scorching Ray's rays included; +1d8 per slot level above 4.
      expect(riders).toEqual([
        expect.objectContaining({ appliesTo: "attack-or-spell", dice: "2d8" }),
      ]);
    }
  );

  rule(
    {
      category: 4,
      case: "Find Familiar",
      source: "WIKI spell:find-familiar; SAC #123; SAC #124",
      status: "works",
    },
    () => {
      const doc = caster("wizard", 3, ["find-familiar"]);
      const summoned = summonFamiliar(doc.session, "owl", "fey", 1);
      expect(summoned.familiar?.monsterId).toBe("owl");
      // At 0 HP the familiar disappears.
      const dropped = setCompanionHp(summoned, FIND_FAMILIAR_SPELL_ID, 0);
      expect(dropped.familiar).toBeUndefined();
    }
  );

  rule(
    {
      category: 4,
      case: "Druid Wild Companion",
      source: "WIKI druid:main",
      status: "works",
    },
    () => {
      // One summon, two ways to pay: a Wild Shape use or a spell slot.
      const action =
        classFeatureIndex.get("druid-wild-companion")?.mechanics?.actions?.[0];
      expect(action).toMatchObject({
        costTracker: "druid-wild-shape",
        trackerCost: 1,
        alternateCost: { kind: "spell-slot", minLevel: 1 },
      });
    }
  );

  rule(
    {
      category: 4,
      case: "Find Steed",
      source: "WIKI spell:find-steed",
      status: "works",
    },
    () => {
      const doc = caster("paladin", 7, ["find-steed"]);
      const steed = buildCompanionCardViews(doc, "en", t).find(
        (v) => v.featureId === "find-steed"
      );
      // At its own level: AC 12, HP 25.
      expect(steed).toMatchObject({ ac: 12, hpMax: 25 });
      // Cast with a 4th-level slot: AC 14, HP 45, and a Fly speed of 60 ft.
      const upcast = resolveCompanion(OTHERWORLDLY_STEED, 7, SCORES, null, 5, {
        castLevel: 4,
      });
      expect(upcast).toMatchObject({ ac: 14, hpMax: 45 });
      expect(upcast.speeds.fly).toBe(60);
      // It vanishes at 0 HP.
      const down = { ...doc, session: setCompanionHp(doc.session, "find-steed", 0) };
      expect(
        buildCompanionCardViews(down, "en", t).some((v) => v.featureId === "find-steed")
      ).toBe(false);
    }
  );

  rule(
    {
      category: 4,
      case: "True Polymorph's controlled creature",
      source: "WIKI spell:true-polymorph",
      status: "M6",
    },
    () => {
      // The creature acts right after you and obeys you for an hour.
      expect(summonTurnOf({ spellId: "true-polymorph" })).toBe("after-caster");
    }
  );

  rule(
    {
      category: 4,
      case: "Antimagic and summons",
      source: "FVTT#7684",
      status: "works",
    },
    () => {
      // A Find Steed steed inside the caster's Antimagic Field winks out until the
      // field ends.
      const doc = caster("paladin", 15, ["find-steed", "antimagic-field"], {
        concentration: concentrationValue("antimagic-field"),
      });
      const steed = buildCompanionCardViews(doc, "en", t).find(
        (v) => v.featureId === "find-steed"
      );
      expect(steed).toHaveProperty("suppressed", true);
    }
  );

  rule(
    {
      category: 4,
      case: "Unseen Servant isn't a combatant",
      source: "SAC #145",
      status: "works",
    },
    () => {
      const doc = caster("wizard", 3, ["unseen-servant"]);
      // No stat block, no group, so no initiative row.
      expect(getSpellById("unseen-servant")?.companion).toBeUndefined();
      expect(buildCompanionCardViews(doc, "en", t)).toEqual([]);
      expect(buildSummonedMonsterGroups(doc)).toEqual([]);
    }
  );

  rule(
    {
      category: 4,
      case: "Summon spell attacks without saves",
      source: "KIBBLES #20",
      status: "M6",
    },
    async () => {
      const spider = GIANT_INSECT.variants?.find((v) => v.variantId === "spider");
      const web = spider?.attacks?.find((a) => a.id === "web-bolt");
      expect(web).toBeDefined();
      // A hit sets the target's Speed to 0, with no save and no size limit.
      expect(web).toHaveProperty(
        "effects",
        expect.arrayContaining([expect.objectContaining({ kind: "speed-zero" })])
      );
      // The case works once the damage tray applies a companion attack's effects.
      const id = "@/lib/play/companion-attack";
      const tray = (await import(/* @vite-ignore */ id)) as Record<string, unknown>;
      expect(typeof tray.companionAttackEffects).toBe("function");
    }
  );

  rule(
    {
      category: 4,
      case: "Summon placement and range",
      source: "FVTT#6032",
      status: "works",
    },
    () => {
      // Policy: no geometry. A summon's initiative row carries no position, so the
      // table enforces where it appears.
      const [row] = summonInitiativeEntries([{ spellId: "giant-insect", count: 1 }], {
        id: "caster",
        initiative: 12,
      });
      expect(Object.keys(row ?? {}).sort()).toEqual(
        ["afterId", "groupId", "initiative", "key", "n", "turn"].sort()
      );
    }
  );

  rule(
    {
      category: 4,
      case: "One familiar at a time",
      source: "WIKI spell:find-familiar",
      status: "works",
    },
    () => {
      const doc = caster("wizard", 3, ["find-familiar"]);
      const owl = summonFamiliar(doc.session, "owl", "fey", 1);
      const recast = summonFamiliar(owl, "cat", "fiend", 2);
      // Casting again changes the one familiar's form; there is never a second.
      expect(recast.familiar).toEqual({ monsterId: "cat", creatureType: "fiend" });
      expect(Object.keys(recast.companionHp ?? {})).toEqual([FIND_FAMILIAR_SPELL_ID]);
    }
  );
});
