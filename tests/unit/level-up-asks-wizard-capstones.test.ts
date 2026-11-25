/**
 * The new level-up screen draws the Wizard's level-18 Spell Mastery and level-20
 * Signature Spells itself (no hand-off to the classic wizard). SRD 5.2.1:
 * - Spell Mastery: «Choose a level 1 and a level 2 spell in your spellbook that have a
 *   casting time of an action. You always have those spells prepared»;
 * - Signature Spells: «Choose two level 3 spells in your spellbook as your signature
 *   spells. You always have these spells prepared».
 */
import { describe, expect, it } from "vitest";

import { levelUpAsks, NO_ANSWERS, toggleAnswer } from "@/domains/leveling/level-up-asks";
import { commitLevelUp } from "@/lib/level-up-commit";
import { makeCharacterDoc } from "./_helpers";

const book = [
  "magic-missile", // 1, action
  "shield", // 1, reaction: not a Spell Mastery pick
  "misty-step", // 2, bonus action: not one
  "hold-person", // 2, action
  "fireball", // 3
  "counterspell", // 3
].map((srdId) => ({ srdId, prepared: false }));

const wizard = (level: number) =>
  makeCharacterDoc({ classes: [{ classId: "wizard", level }], spells: book });

const row = (asks: ReturnType<typeof levelUpAsks>, key: string) =>
  asks.rows.find((r) => r.key === key);

describe("Wizard capstones on the new level-up screen", () => {
  it("17 → 18: Spell Mastery's two rows, action spells only, saved always prepared", () => {
    const doc = wizard(17);
    let asks = levelUpAsks(doc, "wizard", NO_ANSWERS, "en");
    expect(asks.supported).toBe(true);
    expect(row(asks, "spellMastery1")?.options.map((o) => o.id)).toEqual([
      "magic-missile",
    ]);
    expect(row(asks, "spellMastery2")?.options.map((o) => o.id)).toEqual(["hold-person"]);
    let a = NO_ANSWERS;
    for (const [key, id] of [
      ["spellMastery1", "magic-missile"],
      ["spellMastery2", "hold-person"],
    ] as const) {
      const r = row(levelUpAsks(doc, "wizard", a, "en"), key);
      if (!r) throw new Error(`no ${key}`);
      a = toggleAnswer(a, r, id);
    }
    asks = levelUpAsks(doc, "wizard", a, "en");
    const saved = commitLevelUp(doc, asks.picks).character.spells;
    for (const id of ["magic-missile", "hold-person"])
      expect(saved.find((s) => "srdId" in s && s.srdId === id)).toMatchObject({
        wizardSpellMastery: true,
        alwaysPrepared: true,
      });
  });

  it("19 → 20: Signature Spells asks two level-3 spells and saves them", () => {
    const doc = wizard(19);
    let a = NO_ANSWERS;
    const first = levelUpAsks(doc, "wizard", a, "en");
    expect(first.supported).toBe(true);
    const sig = row(first, "signatureSpells");
    expect(sig?.count).toBe(2);
    expect(sig?.options.map((o) => o.id).sort()).toEqual(["counterspell", "fireball"]);
    if (!sig) throw new Error("no signature row");
    a = toggleAnswer(a, sig, "fireball");
    const sig2 = row(levelUpAsks(doc, "wizard", a, "en"), "signatureSpells");
    if (!sig2) throw new Error("no signature row");
    a = toggleAnswer(a, sig2, "counterspell");
    const saved = commitLevelUp(doc, levelUpAsks(doc, "wizard", a, "en").picks).character
      .spells;
    for (const id of ["fireball", "counterspell"])
      expect(saved.find((s) => "srdId" in s && s.srdId === id)).toMatchObject({
        wizardSignatureSpell: true,
        alwaysPrepared: true,
      });
  });
});
