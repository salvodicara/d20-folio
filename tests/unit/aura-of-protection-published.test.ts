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
  AURA_HEARTBEAT_MS,
  auraWrite,
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

describe("an ally's sheet with a received aura", () => {
  it("adds the bonus to every saving throw, as its own named part", async () => {
    const { deriveSavesAndChecks } = await import("@/lib/views/saves-checks-view");
    const ally = makeCharacterDoc({ classes: [{ classId: "fighter", level: 5 }] });
    const plain = deriveSavesAndChecks(ally.character, ally.session).saves;
    const withAura = deriveSavesAndChecks(ally.character, {
      ...ally.session,
      partyAura: { from: "pal", name: "Aldric", bonus: 3 },
    }).saves;
    for (const [i, row] of withAura.entries()) {
      expect(row.bonus - (plain[i]?.bonus ?? 0)).toBe(3);
    }
    // The bonus is its own named part, not a bigger «feature bonus».
    expect(withAura[0]?.breakdownParts).toContainEqual(
      expect.objectContaining({
        label: { loc: { ui: "play.aura.source", params: { name: "Aldric" } } },
        value: 3,
      })
    );
    // A save the fighter is not proficient in moves too, and lists the aura: its
    // total is no longer the bare modifier, so the tile shows the number.
    const dex = withAura.find((row) => row.id === "DEX");
    const plainDex = plain.find((row) => row.id === "DEX");
    expect(dex?.proficient).toBe(false);
    expect(dex?.bonus).toBe((plainDex?.bonus ?? 0) + 3);
    expect(dex?.breakdownParts).toContainEqual(
      expect.objectContaining({
        label: { loc: { ui: "play.aura.source", params: { name: "Aldric" } } },
        value: 3,
      })
    );
  });
});

describe("auraWrite: when the paladin's sheet writes its aura", () => {
  const now = 50_000_000;
  const published = { bonus: 3, reachFt: 10 };

  it("an unchanged, recently written aura writes nothing (no loops, no quota)", () => {
    expect(auraWrite(published, { ...published, at: now - 60_000 }, now)).toBeNull();
    expect(auraWrite(null, undefined, now)).toBeNull();
  });
  it("a new or changed aura is written with the time", () => {
    expect(auraWrite(published, undefined, now)).toEqual({
      kind: "set",
      aura: { ...published, at: now },
    });
    expect(auraWrite({ bonus: 4, reachFt: 10 }, { ...published, at: now }, now)).toEqual({
      kind: "set",
      aura: { bonus: 4, reachFt: 10, at: now },
    });
  });
  it("an aura that ends (0 HP, Incapacitated) is cleared at once", () => {
    expect(auraWrite(null, { ...published, at: now }, now)).toEqual({ kind: "clear" });
  });
  it("an unchanged aura is refreshed after the heartbeat", () => {
    expect(
      auraWrite(published, { ...published, at: now - AURA_HEARTBEAT_MS - 1 }, now)
    ).toEqual({
      kind: "set",
      aura: { ...published, at: now },
    });
  });
});

describe("standing outside an aura lasts until the next rest", () => {
  it("a Short or Long Rest clears it", async () => {
    const { longRestCharacter, shortRestCharacter } = await import("@/lib/play/rests");
    const doc = makeCharacterDoc(
      {},
      { activeFeatures: [outOfAuraKey("pal"), "keep-me"] }
    );
    expect(shortRestCharacter(doc).session.activeFeatures).toEqual(["keep-me"]);
    expect(longRestCharacter(doc).session.activeFeatures).toEqual(["keep-me"]);
  });
});

describe("the Concentration save under a received aura", () => {
  it("counts the aura in the CON save the banner judges", async () => {
    const { concentrationSaveD20Context } = await import("@/lib/character-d20-tests");
    const ally = makeCharacterDoc({ classes: [{ classId: "wizard", level: 5 }] });
    const pending = { id: "p", difficultyClass: 10 } as Parameters<
      typeof concentrationSaveD20Context
    >[1];
    const total = (doc: typeof ally) =>
      concentrationSaveD20Context(doc, pending).modifierTerms.reduce(
        (sum, term) => sum + term.value,
        0
      );
    const inAura = {
      ...ally,
      session: { ...ally.session, partyAura: { from: "pal", name: "Aldric", bonus: 3 } },
    };
    expect(total(inAura)).toBe(total(ally) + 3);
  });
});

describe("a paladin standing in another paladin's aura", () => {
  // SRD 5.2.1, Combining Game Effects: the same feature doesn't stack. A paladin's own
  // Aura of Protection and another paladin's are one effect: only the best counts.
  const now = 1_000_000_000;
  const other = (bonus: number): PartyAura => ({
    characterId: "pal-2",
    name: "Bren",
    aura: { bonus, reachFt: 10, at: now },
  });

  it("adds its own aura or the received one, the best, never both", async () => {
    const { deriveSavesAndChecks } = await import("@/lib/views/saves-checks-view");
    const own = makeCharacterDoc({
      classes: [{ classId: "paladin", level: 6 }],
      features: [{ srdId: "paladin-aura-of-protection" }],
      abilityScores: { STR: 14, DEX: 10, CON: 12, INT: 10, WIS: 10, CHA: 16 },
    });
    const ownBonus = publishedAura(own)?.bonus ?? null;
    expect(ownBonus).toBe(3);
    const savesWith = (received: ReturnType<typeof allyAura>) =>
      deriveSavesAndChecks(own.character, {
        ...own.session,
        ...(received ? { partyAura: received } : {}),
      }).saves;
    const alone = savesWith(null);
    // its own +3 beats the received +2: nothing is received
    expect(allyAura([other(2)], "me", now, [], ownBonus)).toBeNull();
    // the received +5 replaces its own +3: two more, not five
    const stronger = savesWith(allyAura([other(5)], "me", now, [], ownBonus));
    for (const [i, row] of stronger.entries()) {
      expect(row.bonus, row.id).toBe((alone[i]?.bonus ?? 0) + 2);
    }
  });
});
