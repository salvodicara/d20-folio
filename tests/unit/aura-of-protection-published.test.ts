/**
 * Aura of Protection reaching the allies' sheets (SRD 5.2.1 Paladin 6): the paladin's
 * own sheet publishes its aura (Charisma modifier, minimum +1; 10 ft, 30 ft from 18)
 * only while it can act, and each ally's saves take the best fresh one, on by default
 * while the paladin is in play tonight, unless the ally says they stand outside it.
 */
import { describe, expect, it } from "vitest";
import {
  allyAura,
  AURA_FRESH_MS,
  outOfAuraKey,
  publishedAura,
  type PartyAura,
} from "@/lib/play/aura-of-protection";
import { makeCharacterDoc } from "./_helpers";

const paladin = (level: number, session: Record<string, unknown> = {}) =>
  makeCharacterDoc(
    {
      classes: [{ classId: "paladin", level }],
      abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 12, CHA: 16 },
    },
    { hp: { current: 40, temp: 0 }, ...session }
  );

describe("publishedAura: what the paladin's sheet publishes", () => {
  it("level 6: its Charisma modifier, 10 ft", () => {
    expect(publishedAura(paladin(6))).toEqual({ bonus: 3, reachFt: 10 });
  });
  it("level 18: 30 ft", () => {
    expect(publishedAura(paladin(18))?.reachFt).toBe(30);
  });
  it("none below level 6", () => {
    expect(publishedAura(paladin(5))).toBeNull();
  });
  it("none at 0 HP or Incapacitated", () => {
    expect(publishedAura(paladin(6, { hp: { current: 0, temp: 0 } }))).toBeNull();
    expect(publishedAura(paladin(6, { conditions: ["incapacitated"] }))).toBeNull();
    expect(publishedAura(paladin(6, { conditions: ["stunned"] }))).toBeNull();
  });
});

describe("allyAura: the bonus an ally's saves take", () => {
  const now = 1_000_000_000;
  const aura = (characterId: string, bonus: number, at = now): PartyAura => ({
    characterId,
    name: characterId,
    aura: { bonus, reachFt: 10, at },
  });

  it("the best fresh aura of another character, on by default", () => {
    expect(allyAura([aura("a", 2), aura("b", 4)], "me", now, [])).toEqual({
      from: "b",
      name: "b",
      bonus: 4,
    });
  });
  it("never its own", () => {
    expect(allyAura([aura("me", 4)], "me", now, [])).toBeNull();
  });
  it("not a stale one (the paladin's player is not in play tonight)", () => {
    expect(allyAura([aura("a", 3, now - AURA_FRESH_MS - 1)], "me", now, [])).toBeNull();
  });
  it("not one the ally stands outside of", () => {
    expect(allyAura([aura("a", 3)], "me", now, [outOfAuraKey("a")])).toBeNull();
  });
});
