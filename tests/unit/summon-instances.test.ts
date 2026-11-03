/**
 * Summons with a lifecycle (edge-case family M6, step 1; docs/architecture/2026-11-summons.md).
 * Cases from the SRD 5.2.1 text: Find Steed's steed "vanishes" at 0 Hit Points and
 * when you die; Find Familiar's familiar "disappears" at 0 Hit Points; a Concentration
 * summon lasts while you concentrate. A document written before `summons` existed
 * keeps today's rule (a prepared Find Steed shows).
 */
import { describe, expect, it } from "vitest";

import { buildScenario } from "@/lib/dev-scenarios";
import { FIND_FAMILIAR_SPELL_ID } from "@/lib/familiar-ids";
import {
  reviveCompanion,
  setCompanionHp,
  summonCompanion,
  summonFamiliar,
} from "@/lib/play/companions";
import { concentrationValue } from "@/lib/concentration";
import { longRestCharacter } from "@/lib/play/rests";
import { takeDamage } from "@/lib/play/damage";
import { buildCompanionCardViews } from "@/lib/views/companion-row-view";
import type { CharacterDoc, SessionState } from "@/types/character";

const t = (key: string): string => key;

function paladin(session: Partial<SessionState> = {}): CharacterDoc {
  const doc = buildScenario({
    name: "Paladin",
    raceId: "human",
    classId: "paladin",
    level: 7,
    background: "acolyte",
    abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 12, CHA: 16 },
    spells: [{ srdId: "find-steed", prepared: true }],
  });
  return { ...doc, session: { ...doc.session, ...session } };
}

const steed = (doc: CharacterDoc) =>
  buildCompanionCardViews(doc, "en", t).find((v) => v.featureId === "find-steed");

const withSession = (doc: CharacterDoc, session: SessionState): CharacterDoc => ({
  ...doc,
  session,
});

describe("a summon is on the field once summoned", () => {
  it("a document from before `summons` keeps today's rule: a prepared steed shows", () => {
    expect(steed(paladin())).toBeDefined();
  });

  it("once summons are recorded, the steed shows only after it is summoned", () => {
    const doc = paladin({ summons: {} });
    expect(steed(doc)).toBeUndefined();
    const summoned = withSession(doc, summonCompanion(doc.session, "find-steed", 2));
    expect(steed(summoned)).toMatchObject({ ac: 12, hpMax: 25 });
  });

  it("summoning at a higher level uses that level, at full HP", () => {
    const doc = paladin();
    const hurt = setCompanionHp(doc.session, "find-steed", 3);
    const summoned = withSession(doc, summonCompanion(hurt, "find-steed", 4));
    expect(steed(summoned)).toMatchObject({ ac: 14, hpMax: 45 });
    expect(summoned.session.companionHp?.["find-steed"]).toBeUndefined();
  });
});

describe("a summon ends by its catalogue rule", () => {
  it("Find Steed vanishes at 0 HP", () => {
    const doc = paladin();
    const summoned = withSession(doc, summonCompanion(doc.session, "find-steed", 2));
    const down = withSession(doc, setCompanionHp(summoned.session, "find-steed", 0));
    expect(steed(down)).toBeUndefined();
    expect(down.session.summons?.["find-steed"]).toBeUndefined();
    expect(down.session.companionHp?.["find-steed"]).toBeUndefined();
  });

  it("a hurt steed stays", () => {
    const doc = paladin();
    const summoned = withSession(doc, summonCompanion(doc.session, "find-steed", 2));
    const hurt = withSession(doc, setCompanionHp(summoned.session, "find-steed", 4));
    expect(steed(hurt)).toBeDefined();
  });

  it("the steed vanishes when its caster dies", () => {
    const doc = paladin();
    const summoned = withSession(doc, summonCompanion(doc.session, "find-steed", 2));
    const dying = withSession(summoned, {
      ...summoned.session,
      hp: { ...summoned.session.hp, current: 1, temp: 0 },
    });
    // Massive damage: the damage left over equals the maximum, so the caster dies.
    const dead = takeDamage(dying, 1 + summoned.character.hp.max);
    expect(dead?.session.summons?.["find-steed"]).toBeUndefined();
  });

  it("the familiar disappears at 0 HP", () => {
    const doc = paladin();
    const summoned = summonFamiliar(doc.session, "owl", "fey", 1);
    const dropped = setCompanionHp(summoned, FIND_FAMILIAR_SPELL_ID, 0);
    expect(dropped.familiar).toBeUndefined();
  });

  it("a Long Rest leaves a summoned steed alone (it lasts until it vanishes)", () => {
    const doc = paladin();
    const summoned = withSession(doc, summonCompanion(doc.session, "find-steed", 2));
    expect(longRestCharacter(summoned).session.summons?.["find-steed"]).toBeDefined();
  });
});

describe("a companion that dies stays, fallen", () => {
  it("a 0-hp:dies companion is fallen at 0 HP, and summoning it again brings it back", async () => {
    const { classFeatureIndex } = await import("@/data/classes");
    const dies = [...classFeatureIndex.values()].find((f) =>
      f.companion?.lifecycle?.endsOn.includes("0-hp:dies")
    );
    if (!dies) return; // no such companion in this build (the pack's Beast Master)
    const doc = paladin();
    const down = setCompanionHp(doc.session, dies.id, 0);
    expect(down.summons?.[dies.id]).toEqual({ fallen: true });
    const back = summonCompanion(down, dies.id);
    expect(back.summons?.[dies.id]).toEqual({});
    expect(back.companionHp?.[dies.id]).toBeUndefined();
  });
});

describe("step 2: revive, a steed that ends when hurt, Antimagic", () => {
  it("reviving a fallen companion brings it back at full HP", () => {
    const fallen: SessionState = {
      ...paladin().session,
      summons: { "steel-defender": { fallen: true } },
      companionHp: { "steel-defender": { current: 0 } },
    };
    const back = reviveCompanion(fallen, "steel-defender");
    expect(back?.summons?.["steel-defender"]).toEqual({});
    expect(back?.companionHp?.["steel-defender"]).toBeUndefined();
    expect(reviveCompanion(paladin().session, "steel-defender")).toBeNull();
  });

  it("Phantom Steed ends as soon as it takes any damage", () => {
    const doc = paladin();
    const summoned = summonCompanion(doc.session, "phantom-steed", 3);
    const hit = setCompanionHp(summoned, "phantom-steed", 12);
    expect(hit.summons?.["phantom-steed"]).toBeUndefined();
  });

  it("a steed inside its caster's Antimagic Field winks out (suppressed, not gone)", () => {
    const doc = buildScenario({
      name: "Paladin",
      raceId: "human",
      classId: "paladin",
      level: 15,
      background: "acolyte",
      abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 12, CHA: 16 },
      spells: [
        { srdId: "find-steed", prepared: true },
        { srdId: "antimagic-field", prepared: true },
      ],
    });
    const held = withSession(doc, {
      ...doc.session,
      concentration: concentrationValue("antimagic-field"),
    });
    expect(steed(held)).toHaveProperty("suppressed", true);
    expect(steed(doc)).not.toHaveProperty("suppressed");
  });
});

describe("a summon that lasts a while counts down on game time", () => {
  it("Phantom Steed lasts an hour: rounds, time passing and rests end it", async () => {
    const { passTime } = await import("@/lib/play/time");
    const { shortRestCharacter } = await import("@/lib/play/rests");
    const doc = paladin();
    const summoned = withSession(doc, summonCompanion(doc.session, "phantom-steed", 3));
    expect(summoned.session.effectTimers?.["summon:phantom-steed"]).toEqual({
      roundsLeft: 600,
    });
    // Half an hour passes: still there.
    const half = passTime(summoned, 30);
    expect(half?.session.summons?.["phantom-steed"]).toBeDefined();
    // The hour runs out.
    const gone = passTime(half ?? summoned, 30);
    expect(gone?.session.summons?.["phantom-steed"]).toBeUndefined();
    expect(gone?.session.effectTimers?.["summon:phantom-steed"]).toBeUndefined();
    // A Short Rest is an hour: it outlasts the steed too.
    expect(
      shortRestCharacter(summoned).session.summons?.["phantom-steed"]
    ).toBeUndefined();
  });

  it("Find Steed has no timer", () => {
    const doc = paladin();
    const summoned = summonCompanion(doc.session, "find-steed", 2);
    expect(summoned.effectTimers?.["summon:find-steed"]).toBeUndefined();
  });
});
