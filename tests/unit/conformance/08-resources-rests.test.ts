/** Conformance, category 8: resource economy and rests (corpus.md § 8). */
import { describe, expect } from "vitest";
import { getMagicItem } from "@/data/magic-items";
import { getSpellById } from "@/data/spells";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { enteredRollMaximum, enteredRollMinimum } from "@/lib/resources";
import {
  gainsHeroicInspirationOnLongRest,
  getInitiativeTrackerTopUps,
  resolveTrackers,
} from "@/lib/smart-tracker";
import { longRestCharacter, shortRestCharacter } from "@/lib/play/rests";
import { applySheetEvent } from "@/lib/play/sheet-events";
import { takeDamage } from "@/lib/play/damage";
import { zeroHpSavers } from "@/lib/play/zero-hp-savers";
import { unmaintainedStates } from "@/lib/play/end-turn";
import {
  addMonster,
  rollMonsterRecharge,
  spendMonsterUse,
  startEncounter,
} from "@/lib/play/encounter";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { EncounterMonster, EncounterState } from "@/types/campaign";
import { rule } from "./rule";

const SCORES = { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 14 };

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
    background: "soldier",
    abilityScores: SCORES,
    ...extra,
  });
  return { ...doc, session: { ...doc.session, ...session } };
}

const RELENTLESS_RAGE = "barbarian-relentless-rage";

const used = (doc: CharacterDoc, id: string) => doc.session.trackers[id]?.used ?? 0;
const tracker = (doc: CharacterDoc, id: string) =>
  resolveTrackers(doc).find((t) => t.id === id);

describe("conformance · 8. resource economy and rests", () => {
  rule(
    {
      category: 8,
      case: "Long Rest restores all Hit Point Dice",
      source: "GLOSS",
      status: "works",
    },
    () => {
      // 2024: every spent Hit Die comes back, not half of them.
      const doc = pc("fighter", 8, {}, { hitDice: { used: 8 } });
      expect(longRestCharacter(doc).session.hitDice.used).toBe(0);
    }
  );

  rule(
    { category: 8, case: "Interrupted rests", source: "GLOSS", status: "works" },
    () => {
      // A Short Rest needs at least 1 HP: a character at 0 HP gets nothing from it.
      const doc = pc(
        "fighter",
        5,
        {},
        {
          hp: { current: 0, temp: 0 },
          trackers: { "fighter-second-wind": { used: 2 } },
        }
      );
      expect(used(shortRestCharacter(doc), "fighter-second-wind")).toBe(2);
    }
  );

  rule(
    {
      category: 8,
      case: "Short Rests: the only limit is time",
      source: "SAC #7; GLOSS",
      status: "works",
    },
    () => {
      // No daily cap: a second Short Rest recovers again.
      const doc = pc(
        "fighter",
        5,
        {},
        { trackers: { "fighter-second-wind": { used: 3 } } }
      );
      const once = shortRestCharacter(doc);
      expect(used(once, "fighter-second-wind")).toBe(2);
      expect(used(shortRestCharacter(once), "fighter-second-wind")).toBe(1);
    }
  );

  rule(
    {
      category: 8,
      case: "Partial Short Rest recovery",
      source: "WIKI fighter:main; WIKI druid:main",
      status: "works",
    },
    () => {
      // Second Wind, Channel Divinity and Wild Shape: one use back on a Short Rest,
      // every use on a Long Rest.
      for (const [classId, id] of [
        ["fighter", "fighter-second-wind"],
        ["cleric", "cleric-channel-divinity"],
        ["druid", "druid-wild-shape"],
      ] as const) {
        const doc = pc(classId, 6, {}, { trackers: { [id]: { used: 2 } } });
        expect(used(shortRestCharacter(doc), id), id).toBe(1);
        expect(used(longRestCharacter(doc), id), id).toBe(0);
      }
    }
  );

  rule(
    {
      category: 8,
      case: "Features that refresh on initiative",
      source: "WIKI barbarian:main; WIKI monk:main; WIKI druid:main",
      status: "works",
    },
    () => {
      // Persistent Rage: on Initiative, regain every Rage use, once per Long Rest.
      const rages = { "barbarian-rage": { used: 4 } };
      const fresh = pc("barbarian", 15, {}, { trackers: rages });
      expect(getInitiativeTrackerTopUps(fresh).get("barbarian-rage")).toBe(0);
      // With this Long Rest's refill already taken, the next fight gets nothing.
      const spent = pc(
        "barbarian",
        15,
        {},
        { trackers: { ...rages, "barbarian-persistent-rage": { used: 1 } } }
      );
      expect(getInitiativeTrackerTopUps(spent).has("barbarian-rage")).toBe(false);
    }
  );

  rule(
    {
      category: 8,
      case: "Once-per-rest uses of a recovery feature",
      source: "WIKI sorcerer:main",
      status: "works",
    },
    () => {
      // Sorcerous Restoration: a Short Rest gives back up to half the Sorcerer level
      // in Sorcery Points (5 → 2), once per Long Rest.
      const doc = pc(
        "sorcerer",
        5,
        {},
        { trackers: { "sorcerer-font-of-magic": { used: 5 } } }
      );
      const first = shortRestCharacter(doc);
      expect(used(first, "sorcerer-font-of-magic")).toBe(3);
      expect(used(shortRestCharacter(first), "sorcerer-font-of-magic")).toBe(3);
    }
  );

  rule(
    {
      category: 8,
      case: "Once per turn vs once on each of your turns",
      source: "SAC #58; WIKI druid:moon; WIKI barbarian:main",
      status: "works",
    },
    () => {
      // Sneak Attack is once per TURN: spent on one enemy's turn (an OA), it is fresh
      // on the next enemy's turn, before the rogue's own turn comes round.
      const spentOnGoblinTurn = { used: 1, turnKey: "3:monster-1" };
      const doc = pc(
        "rogue",
        5,
        {},
        { trackers: { "rogue-sneak-attack": spentOnGoblinTurn } }
      );
      const next = applySheetEvent(doc, {
        kind: "recover-per-turn-trackers",
        turnKey: "3:monster-2",
      });
      expect(next && tracker(next, "rogue-sneak-attack")?.used).toBe(0);
    }
  );

  rule(
    {
      category: 8,
      case: "Per-turn save limits on areas",
      source: "KIBBLES #17; KIBBLES #18",
      status: "works",
    },
    () => {
      // Each pulse is its own tap: Spirit Guardians re-offers its save whenever a
      // creature enters or ends its turn there (the table counts once per turn).
      expect(getSpellById("spirit-guardians")?.recurrence).toBe("on-enter-or-end-turn");
    }
  );

  rule(
    {
      category: 8,
      case: "Rage duration upkeep",
      source: "WIKI barbarian:main",
      status: "works",
    },
    () => {
      const raging = { activeFeatures: ["barbarian-rage"] };
      const keys = (level: number) =>
        unmaintainedStates(pc("barbarian", level, {}, raging), {}, new Set()).map(
          (e) => e.activeKey
        );
      // Below 15, an End Turn with no attack or extending Bonus Action asks to keep it.
      expect(keys(5)).toContain("barbarian-rage");
      // Persistent Rage (15): the Rage lasts its full 10 minutes with no upkeep.
      expect(keys(15)).not.toContain("barbarian-rage");
    }
  );

  rule(
    {
      category: 8,
      case: "Relentless Rage escalating DC",
      source: "WIKI barbarian:main",
      status: "works",
    },
    () => {
      // DC 10, +5 per use, back to 10 after a Short or Long Rest.
      const raging = (doc: CharacterDoc): CharacterDoc => ({
        ...doc,
        session: {
          ...doc.session,
          hp: { current: 5, temp: 0 },
          activeFeatures: ["barbarian-rage"],
        },
      });
      const dcAtZero = (doc: CharacterDoc) => {
        const taken = takeDamage(raging(doc), 15);
        const down = { ...doc, session: taken?.session ?? doc.session };
        return zeroHpSavers(down).find((s) => s.sourceId === RELENTLESS_RAGE)?.save?.dc;
      };
      expect(dcAtZero(pc("barbarian", 11))).toBe(10);
      const onceUsed = pc(
        "barbarian",
        11,
        {},
        { zeroHpSaverUses: { [RELENTLESS_RAGE]: 1 } }
      );
      expect(dcAtZero(onceUsed)).toBe(15);
      expect(dcAtZero(shortRestCharacter(onceUsed))).toBe(10);
      expect(dcAtZero(longRestCharacter(onceUsed))).toBe(10);
    }
  );

  rule(
    { category: 8, case: "Monster Recharge", source: "ERRATA", status: "works" },
    () => {
      // Recharge 5–6: a spent breath comes back on an entered 5 or 6 only.
      const breath = {
        key: "actions:fire-breath",
        max: 1,
        kind: "recharge",
        recharge: 5,
      } as const;
      const state: EncounterState = addMonster(startEncounter({}, [], 1), {
        name: "Hound",
        ac: 15,
        maxHp: 45,
        count: 1,
        initiative: 12,
      });
      const spent = spendMonsterUse(state, "monster-1", breath.key, 1);
      const hound = (s: EncounterState) =>
        s.combatants.find((c): c is EncounterMonster => c.kind === "monster");
      expect(hound(rollMonsterRecharge(spent, "monster-1", breath, 4))?.spent).toEqual({
        [breath.key]: 1,
      });
      expect(
        hound(rollMonsterRecharge(spent, "monster-1", breath, 5))?.spent
      ).toBeUndefined();
    }
  );

  rule(
    { category: 8, case: "Item charges and dawn", source: "ITEMS", status: "works" },
    () => {
      // Wand of Fireballs: 7 charges, 1d6+1 back at dawn (entered), and a d20 on the
      // last charge destroys it on a 1.
      const charges = getMagicItem("wand-of-fireballs")?.resources?.[0];
      if (charges?.kind !== "counter") throw new Error("no charge counter");
      expect(charges.capacity).toEqual({ kind: "fixed", amount: 7 });
      const dawn = charges.recoveries?.[0];
      expect(dawn?.trigger.kind).toBe("dawn");
      if (dawn?.amount.kind !== "entered-roll") throw new Error("not an entered roll");
      expect(enteredRollMinimum(dawn.amount.roll)).toBe(2);
      expect(enteredRollMaximum(dawn.amount.roll)).toBe(7);
      expect(charges.onEmpty).toMatchObject({
        kind: "entered-d20",
        bands: [
          {
            min: 1,
            max: 1,
            outcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
          },
          { min: 2, max: 20, outcomes: [] },
        ],
      });
    }
  );

  rule(
    {
      category: 8,
      case: "Lay on Hands pool",
      source: "WIKI paladin:main",
      status: "works",
    },
    () => {
      // 5 × Paladin level.
      expect(tracker(pc("paladin", 6), "paladin-lay-on-hands")?.total).toBe(30);
    }
  );

  rule(
    {
      category: 8,
      case: "Free casts plus slot casts",
      source: "WIKI paladin:main",
      status: "works",
    },
    () => {
      // Paladin's Smite and Faithful Steed: one free cast each per Long Rest, beside
      // the slots.
      const doc = pc("paladin", 5);
      const free = aggregateCharacterGrants(doc.character, doc.session).freeCasts.map(
        (f) => f.spellId
      );
      expect(free).toEqual(expect.arrayContaining(["divine-smite", "find-steed"]));
    }
  );

  rule(
    {
      category: 8,
      case: "Exhaustion recovery",
      source: "GLOSS; SAC #10",
      status: "works",
    },
    () => {
      const tired = { exhaustion: 3 };
      expect(longRestCharacter(pc("fighter", 5, {}, tired)).session.exhaustion).toBe(2);
      // A Short Rest removes nothing, except for a Ranger with Tireless.
      expect(shortRestCharacter(pc("fighter", 5, {}, tired)).session.exhaustion).toBe(3);
      expect(shortRestCharacter(pc("ranger", 10, {}, tired)).session.exhaustion).toBe(2);
    }
  );

  rule(
    {
      category: 8,
      case: "Temp HP expire on a Long Rest",
      source: "GLOSS",
      status: "works",
    },
    () => {
      const doc = pc("fighter", 5, {}, { hp: { current: 20, temp: 9 } });
      expect(longRestCharacter(doc).session.hp.temp).toBe(0);
      expect(shortRestCharacter(doc).session.hp.temp).toBe(9);
    }
  );

  rule(
    {
      category: 8,
      case: "Heroic Inspiration",
      source: "rpgbot 2024 transition guide",
      status: "works",
    },
    () => {
      // A Human gains it on each Long Rest; it is held or not (at most one).
      const human = pc("fighter", 5, {}, { inspiration: false });
      expect(gainsHeroicInspirationOnLongRest(human)).toBe(true);
      expect(longRestCharacter(human).session.inspiration).toBe(true);
      // The Champion's Heroic Warrior grants it at the start of each turn.
      const champ = pc("fighter", 10, { subclassId: "champion" });
      expect(
        aggregateCharacterGrants(champ.character, champ.session)
          .heroicInspirationAtTurnStart
      ).toBe(true);
    }
  );
});
