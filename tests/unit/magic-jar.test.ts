/**
 * Magic Jar on the caster's own sheet (SRD 5.2.1, level 6 Necromancy):
 *
 *   "Your body falls into a catatonic state as your soul leaves it and enters the
 *   container … You can't move or take Reactions. The only action you can take is to
 *   project your soul up to 100 feet out of the container, either returning to your
 *   living body (and ending the spell) or attempting to possess a Humanoid's body …
 *   The target makes a Charisma saving throw. On a failed save, your soul enters the
 *   target's body … On a successful save, the target resists your efforts to possess
 *   it, and you can't attempt to possess it again for 24 hours. Once you possess a
 *   creature's body, you control it. Your Hit Points, Hit Point Dice, Strength,
 *   Dexterity, Constitution, Speed, and senses are replaced by the creature's. You
 *   otherwise keep your game statistics … While possessing a body, you can take a
 *   Magic action to return from the host body to the container … If the host body dies
 *   while you're in it, the creature dies, and you make a Charisma saving throw against
 *   your own spellcasting DC. On a success, you return to the container if it is within
 *   100 feet of you. Otherwise, you die."
 *
 * Hosts come from the bestiary (the Knight, a Humanoid; the Wolf, a Beast).
 */
import { describe, expect, it } from "vitest";
import { getMonster } from "@/data/monsters";
import type { MonsterStatBlock } from "@/data/types";
import {
  enterMagicJar,
  hostBodyDies,
  magicJarFacts,
  magicJarHost,
  possessHost,
  returnToBody,
  returnToContainer,
} from "@/lib/play/magic-jar";
import { sessionToState, stateToSession } from "@/lib/session-state-codec";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function monster(id: string): MonsterStatBlock {
  const found = getMonster(id);
  if (!found) throw new Error(id);
  return found;
}

function wizard(): CharacterDoc {
  const doc = makeCharacterDoc({
    classId: "wizard",
    level: 11,
    abilityScores: { STR: 8, DEX: 14, CON: 12, INT: 20, WIS: 12, CHA: 10 },
    hp: { max: 68 },
    speedOverride: null,
  });
  doc.session.hp.current = 50;
  doc.session.hitDice.used = 3;
  return doc;
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}

const inJar = () => must(enterMagicJar(wizard()));
const knight = () => magicJarHost(monster("knight"));

describe("the soul in the container", () => {
  it("leaves the body: no movement, no Reactions, only the projection", () => {
    const doc = inJar();
    expect(doc.session.magicJar).toEqual({ stage: "container" });
    expect(magicJarFacts(doc)).toEqual({
      stage: "container",
      canMove: false,
      reactions: false,
      actions: ["project-soul"],
    });
  });

  it("enters once: a second cast while the spell lasts changes nothing", () => {
    expect(enterMagicJar(inJar())).toBeNull();
  });

  it("returning to its living body ends the spell", () => {
    const back = must(returnToBody(inJar()));
    expect(back.session.magicJar).toBeUndefined();
    expect(magicJarFacts(back)).toBeNull();
    expect(returnToBody(wizard())).toBeNull();
  });
});

describe("possessing a Humanoid", () => {
  it("reads the host from its stat block: HP, Hit Point Dice, STR/DEX/CON, Speed, senses", () => {
    expect(knight()).toEqual({
      id: "knight",
      type: "humanoid",
      hp: { current: 52, max: 52 },
      hitDice: { count: 8, die: 8 },
      abilityScores: { STR: 16, DEX: 11, CON: 14 },
      speeds: { walk: 30 },
      senses: {},
    });
    expect(magicJarHost(monster("knight"), 20).hp).toEqual({ current: 20, max: 52 });
  });

  it("only a Humanoid can be possessed, and only from the container", () => {
    expect(possessHost(inJar(), magicJarHost(monster("wolf")))).toBeNull();
    expect(possessHost(wizard(), knight())).toBeNull();
  });

  it("takes the host's HP, Hit Point Dice, STR/DEX/CON and Speed; keeps the mind", () => {
    const doc = must(possessHost(inJar(), knight()));
    expect(doc.character.abilityScores).toEqual({
      STR: 16,
      DEX: 11,
      CON: 14,
      INT: 20,
      WIS: 12,
      CHA: 10,
    });
    expect(doc.character.hp.max).toBe(52);
    expect(doc.session.hp.current).toBe(52);
    expect(doc.character.hitDiceTotalOverride).toBe(8);
    expect(doc.character.hitDieType).toBe(8);
    expect(doc.session.hitDice.used).toBe(0);
    expect(doc.character.speedOverride).toBe(30);
    // The Knight prints no senses: the caster's own (Darkvision, …) are replaced too.
    expect(doc.character.senseRangeOverrides).toEqual({
      darkvision: 0,
      blindsight: 0,
      tremorsense: 0,
      truesight: 0,
    });
    expect(doc.character.classes).toEqual(wizard().character.classes);
    expect(magicJarFacts(doc)).toMatchObject({ stage: "host", hostId: "knight" });
  });

  it("possession round-trips the stored session", () => {
    const doc = must(possessHost(inJar(), knight()));
    const read = stateToSession(structuredClone(sessionToState(doc.session)));
    expect(read.magicJar).toEqual(doc.session.magicJar);
  });

  it("a Magic action returns the soul to the container and the caster's own body", () => {
    const host = must(possessHost(inJar(), knight()));
    host.session.hp.current = 30;
    const result = must(returnToContainer(host));
    expect(result.hostHp).toBe(30);
    expect(result.doc.session.magicJar).toEqual({ stage: "container" });
    expect(result.doc.character.abilityScores).toEqual(wizard().character.abilityScores);
    expect(result.doc.character.hp.max).toBe(68);
    expect(result.doc.session.hp.current).toBe(50);
    expect(result.doc.character.hitDiceTotalOverride).toBeUndefined();
    expect(result.doc.session.hitDice.used).toBe(3);
    expect(result.doc.character.speedOverride).toBeNull();
    expect(returnToContainer(inJar())).toBeNull();
  });
});

describe("the host body dies", () => {
  const dying = () => {
    const doc = must(possessHost(inJar(), knight()));
    doc.session.hp.current = 0;
    return doc;
  };

  it("a CHA save against your own DC with the container in range returns you to it", () => {
    const result = must(hostBodyDies(dying(), { saved: true, containerInRange: true }));
    expect(result.outcome).toBe("container");
    expect(result.doc.session.magicJar).toEqual({ stage: "container" });
    expect(result.doc.character.hp.max).toBe(68);
  });

  it("a failed save, or the container out of range, kills you", () => {
    for (const roll of [
      { saved: false, containerInRange: true },
      { saved: true, containerInRange: false },
    ]) {
      const result = must(hostBodyDies(dying(), roll));
      expect(result.outcome).toBe("dies");
      expect(result.doc.session.magicJar).toBeUndefined();
      expect(result.doc.character.abilityScores).toEqual(
        wizard().character.abilityScores
      );
    }
  });

  it("asks nothing while the host still has Hit Points", () => {
    const alive = must(possessHost(inJar(), knight()));
    expect(hostBodyDies(alive, { saved: true, containerInRange: true })).toBeNull();
  });
});
