/** Conformance, category 12: vision and light (corpus.md § 12). */
import { describe, expect } from "vitest";
import {
  CONDITION_GATES,
  netRollState,
  resolveConditionEffects,
} from "@/lib/condition-effects";
import { lightStateKey, resolveLightStateSources, sightUnder } from "@/lib/light-states";
import { COVER_STATES } from "@/lib/cover-states";
import { SITUATION_IDS } from "@/lib/situational-states";
import { evaluateGrants } from "@/lib/grants";
import { getSpellById } from "@/data/spells";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { getMonster } from "@/data/monsters";
import { rule } from "./rule";
import { activeZones, zoneLight, zonePayload } from "@/lib/zones";

/** A zone the caster left on the field, as the encounter stores it (edge-case M9). */
function zoneOf(spellId: string, castLevel: number, spared: string[] = []) {
  const [zone] = activeZones([
    {
      id: `zone-${spellId}`,
      actor: { kind: "monster", combatantId: "caster" },
      target: { kind: "monster", combatantId: "caster" },
      source: { kind: "spell", id: spellId, actionId: `spell-${spellId}`, castLevel },
      payload: zonePayload(spellId, spared),
      duration: { kind: "encounter" },
    },
  ]);
  if (!zone) throw new Error(`no zone for ${spellId}`);
  return zone;
}

const sightWith = sightUnder;

describe("conformance · 12. vision and light", () => {
  rule(
    {
      category: 12,
      case: "Heavily obscured means effectively Blinded",
      source: "GLOSS; thealexandrian.net",
      status: "works",
    },
    () => {
      // Darkness without Darkvision is Heavily Obscured: your attacks have Disadvantage.
      expect(sightUnder("darkness", { darkvisionFt: 0 })).toBe("heavily-obscured");
      const key = lightStateKey("darkness");
      const aggregate = evaluateGrants(
        resolveLightStateSources(new Set([key]), { darkvisionFt: 0 }),
        new Set([key])
      );
      expect(aggregate.disadvantages.some((d) => d.rollType === "attack")).toBe(true);
      // Both sides unseen: the attacker's Disadvantage and the unseen-attacker
      // Advantage cancel.
      expect(netRollState(true, true)).toBe("none");
    }
  );

  rule(
    {
      category: 12,
      case: "Magical darkness vs darkvision",
      source: "SAC #6; WIKI spell:darkness",
      status: "works",
    },
    () => {
      // Darkvision 60 ft lifts ordinary darkness one step, but not the Darkness spell.
      expect(sightWith("darkness", { darkvisionFt: 60 })).toBe("lightly-obscured");
      expect(sightWith("magical-darkness", { darkvisionFt: 60 })).toBe(
        "heavily-obscured"
      );
    }
  );

  rule(
    {
      category: 12,
      case: "Darkness dispels weaker light",
      source: "WIKI spell:darkness",
      status: "works",
    },
    () => {
      // Darkness (2nd level) loses to a 3rd-level Daylight, beats it cast at 4th.
      expect(zoneLight([zoneOf("darkness", 2), zoneOf("daylight", 3)])).toBe("bright");
      expect(zoneLight([zoneOf("daylight", 3), zoneOf("darkness", 4)])).toBe(
        "magical-darkness"
      );
    }
  );

  rule(
    {
      category: 12,
      case: "Darkness on an object",
      source: "WIKI spell:darkness; rpgbot",
      status: "works",
    },
    () => {
      // The zone can sit on an object and moves with it: its anchor says so.
      expect(zoneOf("darkness", 2).zone.anchor).toBe("point-or-object");
      expect(zoneLight([zoneOf("darkness", 2)])).toBe("magical-darkness");
    }
  );

  rule(
    {
      category: 12,
      case: "Devil's Sight",
      source: "rpgbot; blackcitadelrpg",
      status: "works",
    },
    () => {
      const devilsSight = SRD_INVOCATIONS.find((i) => i.id === "devils-sight");
      // Sees normally in magical darkness out to 120 ft, which plain Darkvision doesn't.
      expect(devilsSight?.grants).toContainEqual({
        type: "darkvision",
        range: 120,
        penetratesMagicalDarkness: true,
      });
    }
  );

  rule(
    { category: 12, case: "Blindsight", source: "GLOSS; SAC #29", status: "works" },
    () => {
      // Within its range Blindsight perceives through darkness: no obscurement.
      expect(sightWith("darkness", { darkvisionFt: 0, blindsightFt: 10 })).toBeNull();
    }
  );

  rule({ category: 12, case: "Truesight", source: "GLOSS", status: "works" }, () => {
    // Truesight sees through both kinds of darkness within range.
    expect(
      sightWith("magical-darkness", { darkvisionFt: 0, truesightFt: 120 })
    ).toBeNull();
  });

  rule(
    {
      category: 12,
      case: "Invisibility doesn't hide your location",
      source: "thealexandrian.net",
      status: "works",
    },
    () => {
      // Invisible changes the rolls (your attacks have Advantage); it doesn't make
      // you untargetable. "Can't see the target" is a separate situation fact.
      const invisible = resolveConditionEffects(["invisible"]);
      expect(invisible.advantages.map((a) => a.rollType)).toContain("attack");
      expect(invisible.blockedSlots.size).toBe(0);
      expect(SITUATION_IDS).toContain("unseen-target");
      expect(SITUATION_IDS).toContain("unseen-attacker");
    }
  );

  rule(
    {
      category: 12,
      case: "See Invisibility also reveals hidden creatures",
      source: "KIBBLES #14",
      status: "works",
    },
    () => {
      // See Invisibility grants the see-invisible sense while lit; revealing a
      // hidden creature is the table removing its Invisible chip.
      const grants = getSpellById("see-invisibility")?.grants ?? [];
      const lit = grants.find(
        (g) => g.type === "while-active" && g.activeKey === "spell-see-invisibility"
      );
      expect(lit && lit.type === "while-active" ? lit.grants : []).toContainEqual({
        type: "see-invisible",
      });
    }
  );

  rule(
    { category: 12, case: "Unseen sources", source: "SAC #12; SAC #29", status: "M3" },
    () => {
      // Frightened's Disadvantage applies only while you can see the source.
      expect(CONDITION_GATES.frightened).toHaveProperty("suppressedUnless", [
        "sees-source",
      ]);
    }
  );

  rule(
    {
      category: 12,
      case: "Illusion Wizard fake cover",
      source: "KIBBLES #27; SAC #131; SAC #132",
      status: "works",
    },
    () => {
      // An illusory object gives the cover the table agrees on: Half Cover is +2
      // to AC and Dexterity saves, Three-Quarters +5.
      expect(getSpellById("minor-illusion")).toBeDefined();
      const half = COVER_STATES.find((s) => s.level === "half");
      if (!half) throw new Error("no half cover state");
      const aggregate = evaluateGrants(
        [{ id: half.grant.activeKey, grants: [half.grant] }],
        new Set([half.grant.activeKey])
      );
      expect(aggregate.acBonus).toBe(2);
      const threeQuarters = COVER_STATES.find((s) => s.level === "three-quarters");
      expect(threeQuarters?.reference.acBonus).toBe(5);
      expect(threeQuarters?.reference.dexSaveBonus).toBe(5);
    }
  );

  rule(
    {
      category: 12,
      case: "Mirror Image uses your AC",
      source: "KIBBLES #37",
      status: "works",
    },
    () => {
      // 2024: a hit that would land on you lands on a duplicate instead, so the
      // duplicates have no AC of their own and the caster's AC is unchanged.
      const source = { id: "mirror-image", grants: getSpellById("mirror-image")?.grants };
      const lit = evaluateGrants([source], new Set(["spell-mirror-image"]));
      const unlit = evaluateGrants([source], new Set());
      expect(lit.acBonus).toBe(unlit.acBonus);
      expect(JSON.stringify(source.grants)).toContain('"defense-note"');
    }
  );

  rule({ category: 12, case: "Divine Sense", source: "SAC #57", status: "works" }, () => {
    // Detection goes by creature type data: an Imp is a Fiend; player species are
    // Humanoids whatever their heritage.
    expect(getMonster("imp")?.type).toBe("fiend");
  });
});
