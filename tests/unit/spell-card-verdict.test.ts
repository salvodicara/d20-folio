/**
 * Spell-card verdict — S12 oracle-equality on the CARD side.
 *
 * The spell card's verdict chip (`buildVerdict`) and colour (`spellVerdictOutcome`)
 * read the SAME structured `damageDice`/`healDice`/`effectTag` the combat tab now
 * reads. Before S12 ~125 damage cards fell to a bare type word ("Fire") and every
 * healer except Healing Word showed the wrong "Utility" verdict; these pins lock
 * the card to the structured dice so both surfaces agree by construction.
 *
 * fail-before: with `damageDice`/`healDice` absent on the data, `buildVerdict`
 * returns the bare type word / "Utility" and `spellVerdictOutcome` mis-colours the
 * healers — exactly the defect S12 closes.
 */
import { describe, it, expect } from "vitest";
import {
  buildVerdict,
  spellVerdictOutcome,
} from "@/features/character/center/tabs/spells/spell-card-helpers";
import type { SpellCardVM } from "@/lib/views/spells-view";
import { getSpellById } from "@/data/spells";
import type { TFunction } from "i18next";

/** A minimal SRD card VM around a real spell's data (only the verdict path is exercised). */
function vmFor(id: string): SpellCardVM {
  const data = getSpellById(id);
  if (!data) throw new Error(`spell ${id} not found`);
  return {
    key: id,
    idx: 0,
    kind: "srd",
    data,
    ref: { srdId: id },
    name: id,
    searchEn: id,
    description: "",
    higherLevels: null,
    facts: { range: "", duration: null, material: null },
    level: data.level,
    isCantrip: data.level === 0,
    concentration: data.concentration,
    ritual: data.ritual,
    concentratingNow: false,
    isPrepared: true,
    isAlwaysPrepared: false,
    prepLocked: false,
    showPrep: true,
    dimmed: false,
    canRitual: false,
    effectWord: null,
    overrideAbility: null,
    attackBonus: null,
    saveDC: null,
    wizardMastery: false,
    wizardSignature: false,
  };
}

/** A faithful-enough `t`: damage-short → capitalized type, heal verdict → "Heal",
 *  and the S12b "{{count}} × {{dice}}" multi-instance interpolation. */
const t = ((key: string, opts?: { count?: number; dice?: string }) => {
  const m = /^srd\.damageShort_(.+)$/.exec(key);
  const type = m?.[1];
  if (type) return type.charAt(0).toUpperCase() + type.slice(1);
  if (key === "spells.healVerdict") return "Heal";
  if (key === "spells.utility") return "Utility";
  if (key === "spells.saveBadge") return "Save";
  if (key === "spells.multiInstance") return `${opts?.count} × ${opts?.dice}`;
  return key;
}) as unknown as TFunction;

describe("spell-card verdict reads the structured dice (S12)", () => {
  it("damage card shows 'NdM Type' — Fireball → '8d6 Fire', not a bare 'Fire'", () => {
    expect(buildVerdict(vmFor("fireball"), t)).toBe("8d6 Fire");
    expect(spellVerdictOutcome(vmFor("fireball"))).toBe("fire");
  });

  it("a representative spread keys its dice + chromatic colour", () => {
    expect(buildVerdict(vmFor("guiding-bolt"), t)).toBe("4d6 Radiant");
    expect(buildVerdict(vmFor("spirit-guardians"), t)).toBe("3d8 Radiant");
    expect(buildVerdict(vmFor("moonbeam"), t)).toBe("2d10 Radiant");
    expect(spellVerdictOutcome(vmFor("moonbeam"))).toBe("radiant");
  });

  it("a cantrip card shows its BASE die (the combat tab does the level scaling)", () => {
    expect(buildVerdict(vmFor("fire-bolt"), t)).toBe("1d10 Fire");
  });

  it("S12b — a multi-instance damage spell shows 'N × dice' (Magic Missile → '3 × 1d4+1 Force')", () => {
    // fail-before: without the `instances` shape + the multi-instance branch the
    // card showed the per-instance "1d4+1 Force" (byte-identical to pre-S12b).
    expect(buildVerdict(vmFor("magic-missile"), t)).toBe("3 × 1d4+1 Force");
    expect(buildVerdict(vmFor("scorching-ray"), t)).toBe("3 × 2d6 Fire");
    // The data carries the upcast bump (combat/cast modal resolves the per-slot
    // count via spellInstanceCount — pinned in utils.test.ts).
    expect(getSpellById("magic-missile")?.instances).toBe(3);
    expect(getSpellById("magic-missile")?.instancesPerUpcast).toBe(1);
    expect(getSpellById("scorching-ray")?.instances).toBe(3);
  });

  it("a player-choice damage spell carries its dice on the data (combat-tab reads it)", () => {
    // chromatic-orb has `damageChoice` (no single `damageType`), so its CARD chip
    // routes through the multi/choice element path — but the structured `damageDice`
    // is present so the COMBAT tab (which reads `spell.damageDice`) shows "3d8".
    expect(getSpellById("chromatic-orb")?.damageDice).toBe("3d8");
  });

  it("M03/M04/M14 — a dual-instance spell appends its second damage on the card", () => {
    // fail-before: with only `damageDice`/`damageType`, Ice Storm's card read
    // "2d10 Cold" (wrong type, and no 4d6 Cold half). The card now shows both
    // instances. Uses the shipped short-type labels so the 20ch chip budget
    // matches production (the default `t` above returns FULL type words).
    const short: Record<string, string> = {
      bludgeoning: "Bldg",
      cold: "Cold",
      piercing: "Prc",
      fire: "Fire",
    };
    const tShort = ((key: string) => {
      const type = /^srd\.damageShort_(.+)$/.exec(key)?.[1];
      return type ? (short[type] ?? type) : key;
    }) as unknown as TFunction;
    expect(buildVerdict(vmFor("ice-storm"), tShort)).toBe("2d10 Bldg + 4d6 Cold");
    expect(buildVerdict(vmFor("ice-knife"), tShort)).toBe("1d10 Prc + 2d6 Cold");
    // Meteor Swarm's full composition ("20d6 Fire + 20d6 Bldg" = 21ch) overflows
    // the 20ch chip budget, so the chip gate keeps the primary dice alone (the full
    // detail is in the card description; L9, no live user near it).
    expect(buildVerdict(vmFor("meteor-swarm"), tShort)).toBe("20d6");
  });

  it("healer cards show 'NdM Heal' + the verdigris heal colour, not 'Utility'", () => {
    expect(buildVerdict(vmFor("cure-wounds"), t)).toBe("2d8 Heal");
    expect(spellVerdictOutcome(vmFor("cure-wounds"))).toBe("heal");
    expect(buildVerdict(vmFor("mass-cure-wounds"), t)).toBe("5d8 Heal");
    expect(spellVerdictOutcome(vmFor("mass-cure-wounds"))).toBe("heal");
  });

  it("a flat healer shows its amount: Heal → '70 Heal'", () => {
    expect(buildVerdict(vmFor("heal"), t)).toBe("70 Heal");
    expect(spellVerdictOutcome(vmFor("heal"))).toBe("heal");
  });

  it("a tag-only healer colours verdigris with the 'Heal' word (no dice)", () => {
    // Power Word Heal restores ALL HP — `effectTag: "heal"`, no `healDice`.
    expect(spellVerdictOutcome(vmFor("power-word-heal"))).toBe("heal");
    expect(buildVerdict(vmFor("power-word-heal"), t)).toBe("Heal");
  });
});
