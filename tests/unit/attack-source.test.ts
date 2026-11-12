/**
 * Which of a player's action lines is a blow, read from the catalogue the line names
 * (never from free text): a weapon from the equipment catalogue (it has weapon damage),
 * or a spell that deals damage, makes an attack roll or forces a saving throw. A heal,
 * a utility spell, armour, gear or a homebrew name is not. The fight inference counts
 * these blows even with no target (production: the party's attacks carry none).
 */
import { describe, expect, it } from "vitest";

import { isAttackSource } from "@/lib/session-log/attack-source";

const srd = (kind: "spell" | "equipment", key: string) => ({
  srd: { kind, key, field: "name" },
});

describe("a blow, by the catalogue", () => {
  it.each([
    ["a weapon", srd("equipment", "longsword")],
    ["a damage spell with a save", srd("spell", "fireball")],
    ["an attack-roll cantrip", srd("spell", "fire-bolt")],
    ["an auto-hit damage spell", srd("spell", "magic-missile")],
    ["a save-or-suffer spell", srd("spell", "hold-person")],
  ])("%s is a blow", (_, source) => {
    expect(isAttackSource(source)).toBe(true);
  });

  it.each([
    ["a healing spell", srd("spell", "cure-wounds")],
    ["armour", srd("equipment", "shield")],
    ["gear", srd("equipment", "rope")],
    ["a homebrew name", { custom: "Big Swing" }],
    ["an unknown catalogue key", srd("spell", "no-such-spell")],
  ])("%s is not", (_, source) => {
    expect(isAttackSource(source)).toBe(false);
  });
});
