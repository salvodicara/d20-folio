/**
 * `spell-damage-bonus` primitive — the NEW pieces beyond the already-shipped
 * aggregation + `resolveSpellDamageBonus` pure helper:
 *
 *  1. the `cantripOnly` / `oncePerTurn` flags on the Grant kind + entry (Cleric
 *     Potent Spellcasting rides ONLY cantrips; Radiant Soul / Elemental Affinity
 *     carry the informational once-per-turn limiter);
 *  2. `resolveSpellDamageBonus` honouring `cantripOnly` via the new `spellLevel`
 *     arg;
 *  3. the DATA wiring of the features that were prose-only — Cleric/Druid Potent
 *     Spellcasting (+WIS to any class cantrip) here; the PACK sibling (Warlock
 *     Celestial Radiant Soul, +CHA to Radiant/Fire spell damage) in
 *     content-pack/tests/unit/spell-damage-bonus-consumer.pack.test.ts;
 *  4. the missing CONSUMER — `resolveActions` (the spell-cast display path) now
 *     appends `+CHA` / `+WIS` to a spell's damage chip when its damage matches,
 *     override-first.
 *
 * Verified against the offline wiki scrape:
 *   - dnd2024.wikidot.com/warlock:celestial-patron (Level 6: Radiant Soul — "Once
 *     per turn, when a spell you cast deals Radiant or Fire damage, add your
 *     Charisma modifier to that spell's damage");
 *   - dnd2024.wikidot.com/cleric:main (Level 7 Blessed Strikes → Potent Spellcasting:
 *     "Add your Wisdom modifier to the damage you deal with any Cleric cantrip").
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { classFeatureIndex } from "@/data/classes";
import { resolveActions } from "@/lib/smart-tracker";
import { resolveSpellDamageBonus } from "@/lib/compute";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import type { AbilityCode } from "@/data/types";

const scores = (over: Partial<Record<AbilityCode, number>> = {}) => ({
  STR: 10,
  DEX: 10,
  CON: 10,
  INT: 10,
  WIS: 10,
  CHA: 10,
  ...over,
});

// ── 1. cantripOnly / oncePerTurn aggregate through the evaluator ──────────────

describe("evaluateGrants — spell-damage-bonus carries cantripOnly + oncePerTurn", () => {
  it("records cantripOnly + oncePerTurn when set (Potent Spellcasting / Radiant Soul shape)", () => {
    const src: GrantSource = {
      id: "x",
      name: { en: "X", it: "X" },
      grants: [
        {
          type: "spell-damage-bonus",
          damageTypes: [],
          cantripOnly: true,
          ability: "WIS",
          value: "modifier",
          scope: "cleric",
        },
        {
          type: "spell-damage-bonus",
          damageTypes: ["radiant", "fire"],
          ability: "CHA",
          value: "modifier",
          scope: "warlock",
          oncePerTurn: true,
        },
      ],
    };
    expect(evaluateGrants([src]).spellDamageBonuses).toEqual([
      {
        damageTypes: [],
        cantripOnly: true,
        ability: "WIS",
        value: "modifier",
        min: 0,
        scope: "cleric",
      },
      {
        damageTypes: ["radiant", "fire"],
        ability: "CHA",
        value: "modifier",
        min: 0,
        scope: "warlock",
        oncePerTurn: true,
      },
    ]);
  });

  it("omits the flags entirely when unset (lean shape — back-compat)", () => {
    const src: GrantSource = {
      id: "y",
      name: { en: "Y", it: "Y" },
      grants: [{ type: "spell-damage-bonus", damageTypes: ["cold"], ability: "INT" }],
    };
    // No cantripOnly / oncePerTurn keys — preserves the existing toEqual contract.
    expect(evaluateGrants([src]).spellDamageBonuses).toEqual([
      { damageTypes: ["cold"], ability: "INT", value: "modifier", min: 0, scope: "all" },
    ]);
  });
});

// ── 2. resolveSpellDamageBonus honours cantripOnly via spellLevel ─────────────

describe("resolveSpellDamageBonus — cantripOnly gating", () => {
  const potent = evaluateGrants([
    {
      id: "potent",
      name: { en: "Potent", it: "Potent" },
      grants: [
        {
          type: "spell-damage-bonus",
          damageTypes: [],
          cantripOnly: true,
          ability: "WIS",
          value: "modifier",
          scope: "cleric",
        },
      ],
    },
  ]).spellDamageBonuses;

  it("applies +WIS to a cleric cantrip (spellLevel 0)", () => {
    expect(
      resolveSpellDamageBonus(potent, ["radiant"], scores({ WIS: 18 }), "cleric", 0)
    ).toBe(4);
  });

  it("does NOT apply to a levelled cleric spell (spellLevel 1)", () => {
    expect(
      resolveSpellDamageBonus(potent, ["radiant"], scores({ WIS: 18 }), "cleric", 1)
    ).toBe(0);
  });

  it("conservatively skips a cantripOnly entry when the spell level is unknown", () => {
    expect(
      resolveSpellDamageBonus(potent, ["radiant"], scores({ WIS: 18 }), "cleric")
    ).toBe(0);
  });

  it("a non-cantripOnly entry ignores spellLevel (Elemental Affinity rides any level)", () => {
    const affinity = evaluateGrants([
      {
        id: "aff",
        name: { en: "Aff", it: "Aff" },
        grants: [
          {
            type: "spell-damage-bonus",
            damageTypes: ["fire"],
            ability: "CHA",
            value: "modifier",
            scope: "sorcerer",
          },
        ],
      },
    ]).spellDamageBonuses;
    // Fireball (level 3) still gets +CHA.
    expect(
      resolveSpellDamageBonus(affinity, ["fire"], scores({ CHA: 20 }), "sorcerer", 3)
    ).toBe(5);
  });
});

// ── 3. Data wiring — Potent Spellcasting declares the grant (the PACK sibling,
//    Warlock Celestial Radiant Soul, is pinned in
//    content-pack/tests/unit/spell-damage-bonus-consumer.pack.test.ts) ─────────

describe("Cleric Potent Spellcasting declares the cantrip-only spell-damage-bonus", () => {
  it("the Blessed Strikes bundle's Potent Spellcasting option grants +WIS to any Cleric cantrip", () => {
    const grants = classFeatureIndex.get("cleric-blessed-strikes")?.grants ?? [];
    const bundle = grants.find((g) => g.type === "choice-grant-bundle");
    expect(bundle?.type).toBe("choice-grant-bundle");
    if (bundle?.type !== "choice-grant-bundle") return;
    const potent = bundle.options.find((o) => o.id === "potent-spellcasting");
    expect(potent?.grants).toEqual([
      {
        type: "spell-damage-bonus",
        damageTypes: [],
        cantripOnly: true,
        ability: "WIS",
        value: "modifier",
        scope: "cleric",
      },
    ]);
  });
});

describe("Druid Potent Spellcasting declares the cantrip-only spell-damage-bonus", () => {
  it("the Elemental Fury bundle's Potent Spellcasting option grants +WIS to any Druid cantrip", () => {
    const grants = classFeatureIndex.get("druid-elemental-fury")?.grants ?? [];
    const bundle = grants.find((g) => g.type === "choice-grant-bundle");
    expect(bundle?.type).toBe("choice-grant-bundle");
    if (bundle?.type !== "choice-grant-bundle") return;
    const potent = bundle.options.find((o) => o.id === "potent-spellcasting");
    expect(potent?.grants).toEqual([
      {
        type: "spell-damage-bonus",
        damageTypes: [],
        cantripOnly: true,
        ability: "WIS",
        value: "modifier",
        scope: "druid",
      },
    ]);
  });

  it("a Druid who picks Potent Spellcasting resolves +WIS mod to a cantrip's damage (and not a levelled spell)", () => {
    const src: GrantSource = {
      id: "druid-elemental-fury",
      grants: classFeatureIndex.get("druid-elemental-fury")?.grants,
    };
    const agg = evaluateGrants(
      [src],
      new Set(),
      new Map([["druid-elemental-fury", "potent-spellcasting"]])
    );
    const entries = agg.spellDamageBonuses.filter((b) => b.scope === "druid");
    expect(entries).toHaveLength(1);
    // +WIS mod (WIS 16 → +3) rides a damaging Druid CANTRIP (level 0)…
    expect(
      resolveSpellDamageBonus(entries, ["fire"], scores({ WIS: 16 }), "druid", 0)
    ).toBe(3);
    // …but never a levelled Druid spell.
    expect(
      resolveSpellDamageBonus(entries, ["fire"], scores({ WIS: 16 }), "druid", 1)
    ).toBe(0);
  });
});

// ── 4. End-to-end consumer — resolveActions appends the modifier to the chip ──

describe("resolveActions — spell damage chip gains the spell-damage-bonus", () => {
  /** Wizard 10, Evoker (Empowered Evocation: +INT to a Wizard Evocation spell's
   *  damage — school-scoped, any level), carrying Fireball + Fire Bolt. */
  function evoker(over: Partial<CharacterDoc["session"]> = {}): CharacterDoc {
    return {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        classes: [{ classId: "wizard", level: 10 }],
        abilityScores: { ...MOCK_CHARACTER.character.abilityScores, INT: 20 }, // +5
        features: [{ srdId: "wizard-evoker-empowered-evocation" }],
        spells: [{ srdId: "fireball", prepared: true }, { srdId: "fire-bolt" }],
        spellcasting: { ...MOCK_CHARACTER.character.spellcasting, ability: "INT" },
      } as CharacterDoc["character"],
      session: { ...MOCK_CHARACTER.session, ...over },
    };
  }

  it("Empowered Evocation adds +INT(5) to an Evocation spell's damage (Fireball 8d6 → 8d6+5)", () => {
    const fb = resolveActions(evoker()).find((a) => a.spellId === "fireball");
    expect(fb?.summary.damage).toBe("8d6+5");
  });

  it("Empowered Evocation also rides an Evocation cantrip (Fire Bolt 2d10 → 2d10+5 at L10)", () => {
    const fbolt = resolveActions(evoker()).find((a) => a.spellId === "fire-bolt");
    // Fire Bolt is Evocation, level 0; at char level 10 it scales to 2d10.
    expect(fbolt?.summary.damage).toBe("2d10+5");
  });

  it("override-first: a manual per-spell damage override pins the formula, dropping the bonus", () => {
    const c = evoker();
    c.character = {
      ...c.character,
      spells: [
        { srdId: "fireball", prepared: true, overrides: { damage: "99d6" } },
        { srdId: "sacred-flame" },
      ],
    };
    const fb = resolveActions(c).find((a) => a.spellId === "fireball");
    expect(fb?.summary.damage).toBe("99d6");
  });

  /** Cleric 7, Blessed Strikes → Potent Spellcasting, carrying Sacred Flame + a levelled spell. */
  function cleric(): CharacterDoc {
    return {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        classes: [{ classId: "cleric", level: 7 }],
        abilityScores: { ...MOCK_CHARACTER.character.abilityScores, WIS: 18 }, // +4
        features: [{ srdId: "cleric-blessed-strikes" }],
        spells: [{ srdId: "sacred-flame" }, { srdId: "fireball", prepared: true }],
        spellcasting: { ...MOCK_CHARACTER.character.spellcasting, ability: "WIS" },
      } as CharacterDoc["character"],
      session: {
        ...MOCK_CHARACTER.session,
        // The Blessed Strikes chooser must select Potent Spellcasting.
        grantBundleChoices: { "cleric-blessed-strikes": "potent-spellcasting" },
      },
    };
  }

  it("Potent Spellcasting adds +WIS(4) to a Cleric cantrip (Sacred Flame 2d8 → 2d8+4 at L7)", () => {
    const sf = resolveActions(cleric()).find((a) => a.spellId === "sacred-flame");
    expect(sf?.summary.damage).toBe("2d8+4");
  });

  it("Potent Spellcasting does NOT touch a levelled spell (Fireball stays 8d6)", () => {
    const fb = resolveActions(cleric()).find((a) => a.spellId === "fireball");
    expect(fb?.summary.damage).toBe("8d6");
  });

  it("no bonus surfaces until the Blessed Strikes chooser picks Potent Spellcasting", () => {
    const c = cleric();
    c.session = { ...c.session, grantBundleChoices: {} };
    const sf = resolveActions(c).find((a) => a.spellId === "sacred-flame");
    expect(sf?.summary.damage).toBe("2d8");
  });
});

// ── 5. AX exposure audit — the cantrip-rider CONSUMERS in resolveActions ──────
// `cantrip-damage-bonus` (Agonizing Blast), `cantrip-effect-rider` (Repelling
// Blast) and `cantrip-range-bonus` (Eldritch Spear) were aggregated + had pure
// resolvers, but NO consumer called them — the riders never reached the combat
// cards. resolveActions now folds all three into the action summary.

describe("resolveActions — cantrip riders reach the action summary", () => {
  /** Warlock 6 with the three blast invocations, carrying Eldritch Blast. */
  function blastlock(): CharacterDoc {
    return {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        classes: [
          {
            classId: "warlock",
            level: 6,
            invocationChoices: ["agonizing-blast", "repelling-blast", "eldritch-spear"],
          },
        ],
        features: [],
        spells: [{ srdId: "eldritch-blast" }, { srdId: "sacred-flame" }],
        spellcasting: { ...MOCK_CHARACTER.character.spellcasting, ability: "CHA" },
      } as CharacterDoc["character"],
      session: { ...MOCK_CHARACTER.session },
    };
  }

  it("Agonizing Blast appends +CHA to the chosen cantrip's damage chip", () => {
    const eb = resolveActions(blastlock()).find((a) => a.spellId === "eldritch-blast");
    // Mock CHA 20 → +5 folded into the damage formula.
    expect(eb?.summary.damage).toMatch(/\+5$/);
  });

  it("Agonizing Blast does NOT ride a different cantrip", () => {
    const sf = resolveActions(blastlock()).find((a) => a.spellId === "sacred-flame");
    expect(sf?.summary.damage ?? "").not.toMatch(/\+5$/);
  });

  it("Repelling Blast surfaces the push rider on the chosen cantrip only", () => {
    const actions = resolveActions(blastlock());
    const eb = actions.find((a) => a.spellId === "eldritch-blast");
    const sf = actions.find((a) => a.spellId === "sacred-flame");
    expect(eb?.summary.forcedMovement).toEqual({
      direction: "push",
      distanceFt: 10,
      maxTargetSize: "Large",
    });
    expect(sf?.summary.forcedMovement).toBeUndefined();
  });

  it("Eldritch Spear surfaces +30 ft × Warlock level as the range bonus", () => {
    const eb = resolveActions(blastlock()).find((a) => a.spellId === "eldritch-blast");
    expect(eb?.summary.rangeBonusFt).toBe(180); // 30 × warlock 6
  });

  it("override-first: a manual per-spell damage override pins the formula (no +CHA)", () => {
    const c = blastlock();
    c.character = {
      ...c.character,
      spells: [{ srdId: "eldritch-blast", overrides: { damage: "1d10" } }],
    };
    const eb = resolveActions(c).find((a) => a.spellId === "eldritch-blast");
    expect(eb?.summary.damage).toBe("1d10");
  });
});

// ── S12 — structured `damageDice`/`healDice` ARE the combat-tab dice ──────────
// The combat tab no longer regexes English prose; it reads the SAME structured
// field the spell cards read. These pins lock the migration to the OLD regex's
// output (the oracle) for spells it reached: the combat `summary.damage`/`.healing`
// values must equal what `extractDamageDice`/the heal regex produced before
// deletion (cantrip scaling at 5/11/17 preserved; the cure-family still folds the
// caster mod). fail-before: with the prose regex deleted and no structured field
// read, summary.damage/healing would be undefined for all of these.

describe("resolveActions — structured spell dice match the deleted regex oracle (S12)", () => {
  /** A rider-free arcane caster at a chosen level (cantrip scaling visible). */
  function wizard(level: number, spellIds: string[]): CharacterDoc {
    return {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        classes: [{ classId: "wizard", level }],
        features: [],
        spells: spellIds.map((srdId) => ({ srdId, prepared: true })),
        spellcasting: { ...MOCK_CHARACTER.character.spellcasting, ability: "INT" },
      } as CharacterDoc["character"],
      session: { ...MOCK_CHARACTER.session },
    };
  }
  /** A rider-free divine caster — WIS 10 (mod 0) so a cure-family heal stays bare. */
  function cleric(level: number, spellIds: string[]): CharacterDoc {
    return {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        classes: [{ classId: "cleric", level }],
        features: [],
        abilityScores: { ...MOCK_CHARACTER.character.abilityScores, WIS: 10 },
        spells: spellIds.map((srdId) => ({ srdId, prepared: true })),
        spellcasting: { ...MOCK_CHARACTER.character.spellcasting, ability: "WIS" },
      } as CharacterDoc["character"],
      session: { ...MOCK_CHARACTER.session },
    };
  }
  const dmg = (c: CharacterDoc, id: string) =>
    resolveActions(c).find((a) => a.spellId === id)?.summary.damage;
  const heal = (c: CharacterDoc, id: string) =>
    resolveActions(c).find((a) => a.spellId === id)?.summary.healing;

  it("leveled damage spell: Fireball → 8d6 (base dice verbatim, no char scaling)", () => {
    expect(dmg(wizard(11, ["fireball"]), "fireball")).toBe("8d6");
  });

  it("cantrip scales by character level: Fire Bolt 1d10 → 1d10/3d10/4d10 at 1/11/17", () => {
    expect(dmg(wizard(1, ["fire-bolt"]), "fire-bolt")).toBe("1d10");
    expect(dmg(wizard(11, ["fire-bolt"]), "fire-bolt")).toBe("3d10");
    expect(dmg(wizard(17, ["fire-bolt"]), "fire-bolt")).toBe("4d10");
  });

  it("player-choice damage spell carries dice: Chromatic Orb → 3d8", () => {
    expect(dmg(wizard(5, ["chromatic-orb"]), "chromatic-orb")).toBe("3d8");
  });

  it("multi-instance spells show the per-instance dice (S12b defers the ×N total)", () => {
    // Magic Missile: 3 darts of 1d4+1 each; Scorching Ray: 3 rays of 2d6. The
    // combat tab showed the single-instance value before S12 too (oracle parity).
    expect(dmg(wizard(5, ["magic-missile"]), "magic-missile")).toBe("1d4+1");
    expect(dmg(wizard(5, ["scorching-ray"]), "scorching-ray")).toBe("2d6");
  });

  it("divine damage spells match the oracle: Guiding Bolt 4d6, Spirit Guardians 3d8", () => {
    expect(dmg(cleric(5, ["guiding-bolt"]), "guiding-bolt")).toBe("4d6");
    expect(dmg(cleric(5, ["spirit-guardians"]), "spirit-guardians")).toBe("3d8");
  });

  it("cure-family heal folds the caster mod (WIS 10 → +0): Cure Wounds → 2d8", () => {
    expect(heal(cleric(5, ["cure-wounds"]), "cure-wounds")).toBe("2d8");
  });

  it("cure-family heal with a positive caster mod folds it: Cure Wounds WIS 18 → 2d8+4", () => {
    const c = cleric(5, ["cure-wounds"]);
    c.character = {
      ...c.character,
      abilityScores: { ...c.character.abilityScores, WIS: 18 },
    };
    expect(heal(c, "cure-wounds")).toBe("2d8+4");
  });

  it("flat heal surfaces as a structured amount (NEW S12 coverage): Heal → 70", () => {
    // The leading-prose regex never reached Heal's "70" (it came after "regain"),
    // so the combat tab showed nothing; the structured `healDice` now surfaces it.
    expect(heal(cleric(6, ["heal"]), "heal")).toBe("70");
  });

  it("override-first still wins: a per-spell damage override pins the formula", () => {
    const c = wizard(11, ["fireball"]);
    c.character = {
      ...c.character,
      spells: [{ srdId: "fireball", prepared: true, overrides: { damage: "1d4" } }],
    };
    expect(dmg(c, "fireball")).toBe("1d4");
  });
});
