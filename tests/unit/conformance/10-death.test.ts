/** Conformance, category 10: death and revival (corpus.md § 10). */
import { describe, expect } from "vitest";
import { getBeast } from "@/data/beasts";
import { getMonster } from "@/data/monsters";
import { getRace } from "@/data/races";
import { getSpellById } from "@/data/spells";
import {
  addMonster,
  advanceTurn,
  beginEncounterTurns,
  setHp as setMonsterHp,
} from "@/features/campaigns/encounter";
import {
  deathSaveD20Context,
  resolveCharacterDeathSave,
} from "@/lib/character-d20-tests";
import { reducePcDamage, type PcDamageState } from "@/lib/combat-transition";
import { isMassiveDamageDeath, NO_DEFENSES } from "@/lib/damage-intake";
import { FIND_FAMILIAR_SPELL_ID } from "@/lib/familiar-ids";
import { MOCK_CHARACTER } from "@/lib/mock";
import { setCompanionHp, summonFamiliar } from "@/lib/play/companions";
import { takeDamage } from "@/lib/play/damage";
import { spendZeroHpSaver, zeroHpSavers } from "@/lib/play/zero-hp-savers";
import {
  FADING_PENALTIES,
  fadingPenaltiesAfterLongRest,
  startFadingPenalty,
} from "@/lib/play/fading-penalties";
import { assumeBeastForm } from "@/lib/play/forms";
import {
  enterMagicJar,
  hostBodyDies,
  magicJarHost,
  possessHost,
} from "@/lib/play/magic-jar";
import { longRestCharacter } from "@/lib/play/rests";
import { healBy, setDeathSaves } from "@/lib/play/vitals";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import { deriveCharacter } from "@/lib/views/derive-character";
import type { CharacterDoc, SessionState } from "@/types/character";
import type { EncounterState } from "@/types/campaign";
import { makeCharacterDoc } from "../_helpers";
import { rule } from "./rule";

const withSession = (session: Partial<SessionState>): CharacterDoc => ({
  ...MOCK_CHARACTER,
  session: { ...MOCK_CHARACTER.session, conditions: [], ...session },
});

/** Lyra (62 max HP) at 0 HP, Unconscious, with the given death-save track. */
const dying = (deathSucc = 0, deathFail = 0): CharacterDoc =>
  withSession({
    hp: { ...MOCK_CHARACTER.session.hp, current: 0, temp: 0 },
    conditions: ["unconscious"],
    deathSucc,
    deathFail,
  });

const state = (over: Partial<PcDamageState> = {}): PcDamageState => ({
  hp: { current: 20, temp: 0, max: 20 },
  conditions: [],
  deathSaves: { successes: 0, failures: 0 },
  ...over,
});

const must = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
};

describe("conformance · 10. death and revival", () => {
  rule({ category: 10, case: "Death saves", source: "GLOSS", status: "works" }, () => {
    const doc = dying();
    const save = (face: number) => resolveCharacterDeathSave(doc, [face]).reviewedOutcome;
    expect(save(10).status).toBe("success");
    expect(save(9).status).toBe("failure");
    expect(save(20).deathSave?.hitPointsRegained).toBe(1);
    expect(save(1).deathSave?.failures).toBe(2);
    // Damage at 0: one failure, two on a critical.
    const at0 = state({
      hp: { current: 0, temp: 0, max: 20 },
      conditions: ["unconscious"],
    });
    const hit = { stage: "resolved", amount: 3 } as const;
    expect(reducePcDamage({ state: at0, intake: hit }).state.deathSaves.failures).toBe(1);
    expect(
      reducePcDamage({ state: at0, intake: hit, crit: true }).state.deathSaves.failures
    ).toBe(2);
    // Exhaustion's d20 penalty applies.
    expect(
      deathSaveD20Context({ ...doc, session: { ...doc.session, exhaustion: 1 } })
        .modifierTerms
    ).toContainEqual(expect.objectContaining({ kind: "exhaustion", value: -2 }));
  });

  rule({ category: 10, case: "Instant death", source: "GLOSS", status: "works" }, () => {
    // 8 HP + 2 temp, max 20: 30 damage leaves 20 remaining ≥ max → dead.
    expect(isMassiveDamageDeath(30, 8, 2, 20)).toBe(true);
    expect(isMassiveDamageDeath(29, 8, 2, 20)).toBe(false);
    // Resistance halves first: 58 fire resisted → 29, not enough.
    const resisted = reducePcDamage({
      state: state({ hp: { current: 8, temp: 2, max: 20 } }),
      intake: {
        stage: "raw",
        amount: 58,
        damageType: "fire",
        defenses: { ...NO_DEFENSES, resistances: new Set(["fire"]) },
      },
    });
    expect(resisted.instantDeath).toBe(false);
    expect(
      reducePcDamage({
        state: state({ hp: { current: 8, temp: 2, max: 20 } }),
        intake: { stage: "resolved", amount: 30 },
      }).instantDeath
    ).toBe(true);
  });

  rule(
    {
      category: 10,
      case: "Temp HP while at 0",
      source: "GLOSS; SAC #109",
      status: "works",
    },
    () => {
      // Disputed; the coded ruling: any hit at 0 is a failure, even one temp HP absorb.
      const result = reducePcDamage({
        state: state({
          hp: { current: 0, temp: 5, max: 20 },
          conditions: ["unconscious"],
        }),
        intake: { stage: "resolved", amount: 3 },
      });
      expect(result.state.hp.temp).toBe(2);
      expect(result.state.deathSaves.failures).toBe(1);
    }
  );

  rule(
    { category: 10, case: "Stable creatures", source: "GLOSS; RPGBOT", status: "M7" },
    () => {
      // Any healing at 0 wakes you.
      const healed = must(healBy(dying(1, 1), 1));
      expect(healed.hp.current).toBe(1);
      expect(healed.conditions).not.toContain("unconscious");
      // Stabilising starts the 1d4-hour clock to 1 HP.
      const stable = must(setDeathSaves(dying(2, 1), 3, 1));
      expect(stable.session).toHaveProperty("stableSince");
    }
  );

  rule(
    { category: 10, case: "Knocking out", source: "GLOSS; SAC #37", status: "M7" },
    () => {
      // The melee attacker chooses to knock out instead of kill.
      const input = {
        state: state({ hp: { current: 5, temp: 0, max: 20 } }),
        intake: { stage: "resolved" as const, amount: 12 },
        hit: { attacker: null, attackMode: "melee" as const },
        knockOut: true,
      };
      const result = reducePcDamage(input);
      expect(result.state.hp.current).toBe(1);
      expect(result.state.conditions).toContain("unconscious");
    }
  );

  rule(
    {
      category: 10,
      case: "Disintegrate and Relentless Endurance",
      source: "SAC #117",
      status: "M7",
    },
    () => {
      // The saver (drop to 1 instead) exists …
      expect(JSON.stringify(getRace("orc"))).toContain("at-zero-hp-interrupt");
      // … and Disintegrate dusts only a creature it leaves at 0.
      expect(JSON.stringify(getSpellById("disintegrate"))).toContain("on-reduce-to-zero");
    }
  );

  rule(
    {
      category: 10,
      case: "Relentless Rage",
      source: "WIKI barbarian:main",
      status: "works",
    },
    () => {
      // A raging Barbarian 11 drops to 0: a CON save (DC 10, +5 per use), HP = 2 × level.
      const doc = makeCharacterDoc(
        { classId: "barbarian", level: 11 },
        { hp: { current: 5, temp: 0 }, activeFeatures: ["barbarian-rage"] }
      );
      doc.character.hp = { max: 120 };
      doc.character.features = [
        { srdId: "barbarian-rage" },
        { srdId: "barbarian-relentless-rage" },
      ];
      const fall = takeDamage(doc, 15);
      const down = { ...doc, session: fall?.session ?? doc.session };
      const saver = zeroHpSavers(down).find(
        (s) => s.sourceId === "barbarian-relentless-rage"
      );
      expect(saver).toMatchObject({ save: { ability: "CON", dc: 10 }, hitPoints: 22 });
      const used = spendZeroHpSaver(down, "barbarian-relentless-rage", "success");
      expect(used?.session.hp.current).toBe(22);
      const again = takeDamage({ ...down, session: used?.session ?? down.session }, 30);
      const second = { ...down, session: again?.session ?? down.session };
      expect(zeroHpSavers(second)[0]?.save?.dc).toBe(15);
    }
  );

  rule(
    {
      category: 10,
      case: "Wild Shape at 0",
      source: "WIKI druid:main; FVTT#833",
      status: "M2",
    },
    () => {
      // Wild Shape is a form that ends at 0 HP (the druid falls Unconscious).
      expect(JSON.stringify(getSrdFeatureSource("druid-wild-shape"))).toContain(
        "assume-form"
      );
    }
  );

  rule(
    { category: 10, case: "Revivify", source: "WIKI spell:revivify", status: "works" },
    () => {
      const revivify = must(getSpellById("revivify"));
      expect(revivify.components).toMatchObject({ m: true, costGp: 300, consumed: true });
      expect(revivify.revives).toEqual({ hitPoints: 1 });
      expect(revivify.classes).toEqual(
        expect.arrayContaining(["cleric", "druid", "paladin", "ranger"])
      );
    }
  );

  rule(
    {
      category: 10,
      case: "Raise Dead penalty",
      source: "WIKI spell:raise-dead",
      status: "works",
    },
    () => {
      const raised = withSession({
        fadingPenalties: must(startFadingPenalty(withSession({}), "raise-dead"))
          .fadingPenalties,
      });
      expect(raised.session.fadingPenalties).toEqual({ "raise-dead": 4 });
      const base = deriveCharacter(withSession({}));
      // −4 to d20 Tests, together with Exhaustion's −2.
      const both = deriveCharacter({
        ...raised,
        session: { ...raised.session, exhaustion: 1 },
      });
      expect(both.saves.map((s) => s.bonus)).toEqual(base.saves.map((s) => s.bonus - 6));
      expect(both.initiativeBonus).toBe(base.initiativeBonus - 6);
      expect(fadingPenaltiesAfterLongRest({ "raise-dead": 4 })).toEqual({
        "raise-dead": 3,
      });
    }
  );

  rule(
    {
      category: 10,
      case: "Dead creatures and conditions",
      source: "GLOSS",
      status: "M7",
    },
    () => {
      const doc = withSession({
        hp: { ...MOCK_CHARACTER.session.hp, current: 0, temp: 0 },
        conditions: ["unconscious", "poisoned"],
        deathFail: 2,
      });
      const died = must(takeDamage(doc, 1));
      expect(died.session.deathFail).toBe(3);
      // Conditions stay; attunement ends at death.
      expect(died.session.conditions).toContain("poisoned");
      expect(died.transition.events).toContainEqual(
        expect.objectContaining({ kind: "attunement-end" })
      );
    }
  );

  rule(
    { category: 10, case: "Monsters at 0 usually die", source: "GLOSS", status: "works" },
    () => {
      const empty: EncounterState = {
        combatants: [],
        nextMonsterOrdinal: 1,
        round: 1,
        currentCombatantId: null,
        epoch: 1,
        status: "active",
      };
      let enc = addMonster(empty, {
        name: "Goblin",
        ac: 15,
        maxHp: 7,
        count: 2,
        initiative: 12,
        xp: 50,
      });
      enc = beginEncounterTurns(enc, ["monster-1", "monster-2"]);
      enc = setMonsterHp(enc, "monster-2", 0);
      // The monster at 0 is skipped: it is dead.
      expect(advanceTurn(enc)).toMatchObject({
        currentCombatantId: "monster-1",
        round: 2,
      });
      // A PC at 0 rolls death saves instead (its own track).
      expect(resolveCharacterDeathSave(dying(), [12]).reviewedOutcome.status).toBe(
        "success"
      );
    }
  );

  rule(
    {
      category: 10,
      case: "Familiar and steed at 0",
      source: "WIKI spell:find-familiar; WIKI spell:find-steed",
      status: "M7",
    },
    () => {
      const withFamiliar = summonFamiliar(MOCK_CHARACTER.session, "owl", "fey", 1);
      // At 0 the familiar vanishes (leaving its gear), it doesn't lie there at 0.
      const after = setCompanionHp(withFamiliar, FIND_FAMILIAR_SPELL_ID, 0);
      expect(after.familiar).toBeUndefined();
    }
  );

  rule(
    {
      category: 10,
      case: "Magic Jar death",
      source: "WIKI spell:magic-jar",
      status: "works",
    },
    () => {
      const knight = must(getMonster("knight"));
      const host = must(
        possessHost(must(enterMagicJar(MOCK_CHARACTER)), magicJarHost(knight))
      );
      const dead = {
        ...host,
        session: { ...host.session, hp: { ...host.session.hp, current: 0 } },
      };
      expect(
        must(hostBodyDies(dead, { saved: true, containerInRange: true })).outcome
      ).toBe("container");
      expect(
        must(hostBodyDies(dead, { saved: false, containerInRange: true })).outcome
      ).toBe("dies");
      expect(
        must(hostBodyDies(dead, { saved: true, containerInRange: false })).outcome
      ).toBe("dies");
    }
  );

  rule(
    {
      category: 10,
      case: "Polymorph at 0 temp HP",
      source: "WIKI spell:polymorph; SAC #136",
      status: "M2",
    },
    () => {
      const doc = withSession({
        hp: { ...MOCK_CHARACTER.session.hp, current: 40, temp: 0 },
      });
      const wolf = must(getBeast("wolf"));
      const form = assumeBeastForm(doc, wolf, "polymorph").doc;
      expect(form.session.activeForm?.beastId).toBe("wolf");
      // A hit larger than the form's temp HP ends the spell; the rest hits real HP.
      const hit = must(takeDamage(form, wolf.hp + 5));
      expect(hit.session.hp.current).toBe(35);
      expect(hit.session.activeForm).toBeUndefined();
    }
  );

  rule(
    {
      category: 10,
      case: "Lingering penalties from Resurrection-type spells",
      source: "WIKI spell:raise-dead",
      status: "works",
    },
    () => {
      expect(FADING_PENALTIES.resurrection?.start).toBe(4);
      const doc = withSession({ fadingPenalties: { resurrection: 4, "raise-dead": 1 } });
      // Each Long Rest takes one off every timer; a spent one disappears.
      expect(longRestCharacter(doc).session.fadingPenalties).toEqual({ resurrection: 3 });
    }
  );
});
