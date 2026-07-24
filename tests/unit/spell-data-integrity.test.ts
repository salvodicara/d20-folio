/**
 * Spell-data integrity guards.
 *
 * These assertions protect against the duplicate / renamed / mis-leveled
 * spell-data regressions catalogued in the Wave-2 coverage audit:
 *  - duplicate srdId entries (apostrophe-collapsed vs. possessive wikidot slugs)
 *  - 2024 renames left as stale 2014 entries (Feeblemind → Befuddlement)
 *  - spell `level` disagreeing with the level file the object lives in
 *
 * Verified against the 2024 spell pages on `dnd2024.wikidot.com`.
 */
import { describe, expect, it } from "vitest";
import { srd } from "../_harness/loc";
import { spells, getSpellById } from "@/data/spells";
import { scaleUpcastDice, scaleCantripDice } from "@/lib/utils";
import { SRD_CANTRIPS } from "@/data/spells/cantrips";
import { SRD_SPELLS_LEVEL1 } from "@/data/spells/level1";
import { SRD_SPELLS_LEVEL2 } from "@/data/spells/level2";
import { SRD_SPELLS_LEVEL3 } from "@/data/spells/level3";
import { SRD_SPELLS_LEVEL4 } from "@/data/spells/level4";
import { SRD_SPELLS_LEVEL5 } from "@/data/spells/level5";
import { SRD_SPELLS_LEVEL6 } from "@/data/spells/level6";
import { SRD_SPELLS_LEVEL7 } from "@/data/spells/level7";
import { SRD_SPELLS_LEVEL8 } from "@/data/spells/level8";
import { SRD_SPELLS_LEVEL9 } from "@/data/spells/level9";

describe("spell-data integrity", () => {
  it("has unique spell ids across every level file", () => {
    const seen = new Map<string, number>();
    for (const s of spells) {
      seen.set(s.id, (seen.get(s.id) ?? 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    expect(dupes).toEqual([]);
  });

  it("no longer ships the apostrophe-collapsed/possessive duplicate slugs", () => {
    // Possessive wikidot-slug copies were removed; canonical ids survive.
    // (The pack-only crusaders-mantle pair is pinned in
    // `content-pack/tests/unit/spell-data-integrity.pack.test.ts`.)
    expect(getSpellById("crusader-s-mantle")).toBeUndefined();
    expect(getSpellById("leomund-s-tiny-hut")).toBeUndefined();
    expect(getSpellById("tasha-s-hideous-laughter")).toBeUndefined();
    expect(getSpellById("leomunds-tiny-hut")).toBeDefined();
    expect(getSpellById("tashas-hideous-laughter")).toBeDefined();
  });

  it("dropped the stale 2014 Feeblemind in favour of 2024 Befuddlement", () => {
    expect(getSpellById("feeblemind")).toBeUndefined();
    const befuddlement = getSpellById("befuddlement");
    expect(befuddlement).toBeDefined();
    // 2024 wiki: Level 8 Enchantment, Bard/Druid/Warlock/Wizard, INT save.
    expect(befuddlement?.level).toBe(8);
    expect(befuddlement?.school).toBe("enchantment");
    expect(befuddlement?.saveAbility).toBe("INT");
  });

  it("encodes the 2024 saving-throw abilities that drive the save-vs display", () => {
    const expected: Record<string, "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA"> = {
      dream: "WIS",
      seeming: "CHA",
      "control-water": "STR",
      "contact-other-plane": "INT",
      "magic-circle": "CHA",
      forcecage: "CHA",
      "prismatic-wall": "CON",
      telekinesis: "STR",
      "conjure-celestial": "DEX",
      "conjure-elemental": "DEX",
      "mordenkainens-faithful-hound": "DEX",
      "animal-messenger": "CHA",
      // 2024 reworks that added a save where the data had none.
      "inflict-wounds": "CON",
      counterspell: "CON",
    };
    for (const [id, ability] of Object.entries(expected)) {
      expect(getSpellById(id)?.saveAbility, id).toBe(ability);
    }
  });

  it("models the 2024 attack-roll reworks (no stale save left behind)", () => {
    // (The pack-only melee rework — Grasping Vine — is pinned in
    // `content-pack/tests/unit/spell-data-integrity.pack.test.ts`.)
    const ranged = ["poison-spray", "ray-of-sickness"];
    for (const id of ranged) {
      const s = getSpellById(id);
      expect(s?.attackType, id).toBe("ranged");
      expect(s?.saveAbility, id).toBeUndefined();
    }
  });

  it("uses the 2024 school of magic for the audited spells", () => {
    // (The pack-only smite reschools — Banishing/Staggering Smite — are pinned
    // in `content-pack/tests/unit/spell-data-integrity.pack.test.ts`.)
    const expected: Record<string, string> = {
      contingency: "abjuration",
      "otilukes-resilient-sphere": "abjuration",
      // M07 — 2024 Healing Word moved Evocation → Abjuration.
      "healing-word": "abjuration",
    };
    for (const [id, school] of Object.entries(expected)) {
      expect(getSpellById(id)?.school, id).toBe(school);
    }
  });

  it("stores the 2024 V/S/M components for the audited spells (M08)", () => {
    // V/S accuracy is load-bearing (Silence blocks V; a bound caster can't supply
    // S; Subtle Spell removes only V/S). Verified against each spell's 2024
    // Components line on wikidot.
    const expected: Record<string, { v: boolean; s: boolean; m: boolean }> = {
      "dancing-lights": { v: true, s: true, m: true }, // V, S, M (a bit of phosphorus)
      demiplane: { v: false, s: true, m: false }, // S
      "mind-spike": { v: false, s: true, m: false }, // S
      mislead: { v: false, s: true, m: false }, // S (was V)
      // (steel-wind-strike is pack content — its M08 row lives in
      // `content-pack/tests/unit/spell-data-integrity.pack.test.ts`.)
    };
    for (const [id, comp] of Object.entries(expected)) {
      expect(getSpellById(id)?.components, id).toEqual(comp);
    }
  });

  it("RA-23 — every gp-priced material component carries structured costGp/consumed (equivalence lock)", () => {
    // Derive the expected facts INDEPENDENTLY from the shipped EN Components prose
    // (the SRD source of truth) so this catches arithmetic/typo/omission, not just
    // a re-pin: costGp = the first gp figure named, consumed = a "consume" clause.
    const GP = /([\d,]+)\s*\+?\s*gp/i; // first gp figure
    for (const s of spells) {
      // SRD spells only — pack-spell priced-material rows are pinned in
      // `content-pack/tests/unit/spell-data-integrity.pack.test.ts` (the same
      // partition M08/M10/M01 use for pack content).
      if (s.source !== "SRD") continue;
      const prose = srd("spell", `${s.id}.components`, "material", "en");
      const digits = GP.exec(prose)?.[1];
      if (digits != null) {
        const expected = Number(digits.replace(/,/g, ""));
        expect(s.components.costGp, `${s.id} costGp`).toBe(expected);
        expect(s.components.m, `${s.id} priced ⇒ m`).toBe(true);
        expect(s.components.consumed ?? false, `${s.id} consumed`).toBe(
          /consume/i.test(prose)
        );
      } else {
        // No gp figure in prose ⇒ no structured cost (guards a stray costGp).
        expect(s.components.costGp, `${s.id} unpriced`).toBeUndefined();
      }
    }
  });

  it("RA-23 — costGp/consumed are lean, well-formed, and paired", () => {
    for (const s of spells) {
      if (s.components.costGp != null) {
        expect(
          Number.isInteger(s.components.costGp) && s.components.costGp > 0,
          s.id
        ).toBe(true);
      }
      // consumed is only ever true or omitted (never an explicit false) …
      expect([true, undefined], `${s.id} consumed value`).toContain(
        s.components.consumed
      );
      // … and only where a cost is present.
      if (s.components.consumed) {
        expect(s.components.costGp, `${s.id} consumed⇒cost`).toBeDefined();
      }
    }
    // Spot pins (the ledger's examples + a priced-but-not-consumed case).
    expect(getSpellById("revivify")?.components).toMatchObject({
      m: true,
      costGp: 300,
      consumed: true,
    });
    expect(getSpellById("chromatic-orb")?.components).toMatchObject({ costGp: 50 });
    expect(getSpellById("chromatic-orb")?.components.consumed).toBeUndefined();
  });

  // (M10 — the Dawn/Sickening Radiance "Exotic" provenance pins are pack
  // content; they live in `content-pack/tests/unit/spell-data-integrity.pack.test.ts`.)

  it("reconciles the 2024 class lists (Artificer now in scope — M01)", () => {
    // (Pack-only rows — circle-of-power, summon-elemental,
    // tashas-bubbling-cauldron, sticks-to-snakes — are pinned in
    // `content-pack/tests/unit/spell-data-integrity.pack.test.ts`.)
    const expected: Record<string, string[]> = {
      "flesh-to-stone": ["druid", "sorcerer", "wizard"],
      "greater-restoration": [
        "artificer",
        "bard",
        "cleric",
        "druid",
        "paladin",
        "ranger",
      ],
      "mass-suggestion": ["bard", "sorcerer", "wizard"],
      "phantasmal-force": ["bard", "sorcerer", "wizard"],
      "prismatic-wall": ["bard", "wizard"],
    };
    for (const [id, classes] of Object.entries(expected)) {
      expect([...(getSpellById(id)?.classes ?? [])].sort(), id).toEqual(
        [...classes].sort()
      );
    }
    // dispel-magic gained Ranger.
    expect(getSpellById("dispel-magic")?.classes).toContain("ranger");
  });

  // ── M01: the full 2024 Artificer spell-roster exact-set pin is pack content
  // (Artificer is a pack class) — it lives in
  // `content-pack/tests/unit/spell-data-integrity.pack.test.ts`.

  it("stores class lists in lowercase so id matching is robust", () => {
    for (const s of spells) {
      for (const c of s.classes) {
        expect(c, `${s.id} class "${c}"`).toBe(c.toLowerCase());
      }
    }
  });

  it("carries the 2024 concentration flag for the audited spells", () => {
    expect(getSpellById("animal-shapes")?.concentration).toBe(false);
    expect(srd("spell", getSpellById("animal-shapes")?.id ?? "", "duration", "en")).toBe(
      "24 hours"
    );
    expect(getSpellById("enthrall")?.concentration).toBe(true);
    expect(getSpellById("forcecage")?.concentration).toBe(true);
  });

  // ── W8: the cantrip-concentration flag is a verified FACT ────────────────────
  // The `concentration` boolean feeds the spell card's "Concentration" tag AND
  // the combat tracker that engages/drops concentration on cast — a wrong flag
  // mis-renders both. Every level-0 spell's flag was verified against its 2024
  // SRD Duration line (does it start with "Concentration"?) via wikidot. This
  // table pins the result so a future cantrip can't ship the wrong flag (a new
  // cantrip absent from the table fails the exhaustiveness check below, forcing
  // a deliberate decision). Only the 4 charm/buff cantrips with a
  // "Concentration, up to 1 minute" Duration are `true`; every damage/utility
  // cantrip (Fire Bolt, Sacred Flame, Eldritch Blast, Toll the Dead, Mind
  // Sliver, …) is `false`.
  it("pins every cantrip's 2024 concentration flag (W8 data-integrity guard)", () => {
    const CANTRIP_CONCENTRATION: Record<string, boolean> = {
      "acid-splash": false,
      "chill-touch": false,
      "dancing-lights": true, // Concentration, up to 1 minute
      druidcraft: false,
      "eldritch-blast": false,
      elementalism: false,
      "fire-bolt": false,
      guidance: true, // Concentration, up to 1 minute
      light: false,
      "mage-hand": false,
      mending: false,
      message: false,
      "minor-illusion": false,
      "poison-spray": false,
      prestidigitation: false,
      "produce-flame": false,
      "ray-of-frost": false,
      resistance: true, // Concentration, up to 1 minute
      "sacred-flame": false,
      shillelagh: false,
      "shocking-grasp": false,
      "sorcerous-burst": false,
      "spare-the-dying": false,
      "starry-wisp": false,
      thaumaturgy: false,
      "true-strike": false,
      "vicious-mockery": false,
    };
    // Exhaustive: the shipped cantrip set must equal the pinned table — a new
    // cantrip forces a flag decision here rather than shipping an unverified one.
    expect(SRD_CANTRIPS.map((c) => c.id).sort()).toEqual(
      Object.keys(CANTRIP_CONCENTRATION).sort()
    );
    for (const c of SRD_CANTRIPS) {
      expect(c.concentration, `${c.id} concentration`).toBe(CANTRIP_CONCENTRATION[c.id]);
    }
  });

  // (The A1-sweep 'D&D Beyond Drops' spells — searing-orb / tortoise-shell /
  // void-star, all source:"Wiki" — are pack content; their pins live in
  // `content-pack/tests/unit/spell-data-integrity.pack.test.ts`.)

  it("carries the 2024 Divine Smite base damage dice (G5 — 2d8 Radiant)", () => {
    // RAW: 2d8 Radiant at 1st level (+1d8 per slot above 1st via generic upcast
    // scaling). Was missing `damageDice`, so the combat card showed a bare type.
    const smite = getSpellById("divine-smite");
    expect(smite?.damageDice).toBe("2d8");
    expect(smite?.damageType).toBe("radiant");
  });

  // ── M03/M04/M14: dual-damage-instance spells (secondaryDamage) ───────────────
  // Ice Storm, Ice Knife and Meteor Swarm each deal TWO simultaneous damage
  // instances with DIFFERENT dice. The single damageType/damageDice pair mis-typed
  // the primary and dropped the second half entirely; `secondaryDamage` now carries
  // it. Verified against wikidot spell:ice-storm / :ice-knife / :meteor-swarm.
  it("models Ice Storm as 2d10 Bludgeoning + 4d6 Cold (M03)", () => {
    const s = getSpellById("ice-storm");
    expect(s?.school).toBe("evocation");
    // The scaling instance is BLUDGEONING (was mislabeled Cold), +1d10/slot.
    expect(s?.damageType).toBe("bludgeoning");
    expect(s?.damageDice).toBe("2d10");
    expect(s?.damageDicePerUpcast).toBe("1d10");
    // The fixed 4d6 Cold half (no upcast) was entirely missing before.
    expect(s?.secondaryDamage).toEqual({ dice: "4d6", damageType: "cold" });
    expect(scaleUpcastDice(s ?? { level: 4 }, 6)).toBe("4d10"); // bludgeoning scales
  });

  it("models Ice Knife as 1d10 Piercing on hit + 2d6 Cold on a save (M04)", () => {
    const s = getSpellById("ice-knife");
    expect(s?.school).toBe("conjuration");
    // The attack-hit die is PIERCING (was mislabeled Cold) and does not scale.
    expect(s?.damageType).toBe("piercing");
    expect(s?.damageDice).toBe("1d10");
    expect(s?.attackType).toBe("ranged");
    expect(s?.saveAbility).toBe("DEX");
    expect(s?.damageDicePerUpcast).toBeUndefined();
    // The 2d6 Cold DEX-save AoE (+1d6/slot) — the whole second instance was absent.
    expect(s?.secondaryDamage).toEqual({
      dice: "2d6",
      damageType: "cold",
      dicePerUpcast: "1d6",
    });
    // Components: S, M (no Verbal) per 2024 RAW.
    expect(s?.components).toEqual({ v: false, s: true, m: true });
  });

  it("models Meteor Swarm as 20d6 Fire + 20d6 Bludgeoning (M14)", () => {
    const s = getSpellById("meteor-swarm");
    expect(s?.damageType).toBe("fire");
    expect(s?.damageDice).toBe("20d6");
    expect(s?.secondaryDamage).toEqual({ dice: "20d6", damageType: "bludgeoning" });
    expect(s?.damageDicePerUpcast).toBeUndefined(); // L9 — no upcast
  });

  it("models Sorcerous Burst damage (1d8, player-chosen type) (M13)", () => {
    const s = getSpellById("sorcerous-burst");
    expect(s?.damageDice).toBe("1d8");
    expect(s?.damageChoice).toEqual([
      "acid",
      "cold",
      "fire",
      "lightning",
      "poison",
      "psychic",
      "thunder",
    ]);
    // Cantrip scaling on damageDice: 2d8 at 5, 3d8 at 11, 4d8 at 17.
    expect(scaleCantripDice(s?.damageDice, 5)).toBe("2d8");
    expect(scaleCantripDice(s?.damageDice, 11)).toBe("3d8");
  });

  it("every secondaryDamage instance is a well-formed NdM dice pair", () => {
    for (const s of spells) {
      if (!s.secondaryDamage) continue;
      expect(s.secondaryDamage.dice, `${s.id} secondary dice`).toMatch(
        /^\d+d\d+(\+\d+)?$/
      );
      if (s.secondaryDamage.dicePerUpcast != null) {
        expect(
          s.secondaryDamage.dicePerUpcast,
          `${s.id} secondary dicePerUpcast`
        ).toMatch(/^\d+d\d+$/);
      }
    }
  });

  // ── S12: structured spell dice are the SINGLE source both surfaces read ──────
  // The spell card and the combat tab both read `damageDice`/`healDice` (the old
  // prose `extractDamageDice` + heal regex were deleted). These locks make it
  // IMPOSSIBLE to ship a damage spell with no dice or a heal verdict with no
  // amount — a future spell can't regress to a bare-type or wrong-"Utility" card.

  it("every dice-dealing damage spell carries a structured `damageDice` (S12 lock)", () => {
    // A few damage-TYPED spells deal NO direct dice — their type colours a
    // retaliation/aura whose damage lives in prose with no leading die (the combat
    // tab showed no dice for them before S12 either). Allowlisted by construction.
    const NO_DICE_DAMAGE = new Set([
      "armor-of-agathys", // 5 temp HP; melee attacker takes 5 cold (flat, prose)
      "aura-of-life", // resistance aura, no direct dice
      "guardian-of-faith", // 20 radiant on entry (flat, prose)
    ]);
    const offenders = spells
      .filter((s) => {
        const hasFacet =
          !!s.damageType ||
          (s.damageTypes?.length ?? 0) > 0 ||
          (s.damageChoice?.length ?? 0) > 0;
        return hasFacet && !s.damageDice && !NO_DICE_DAMAGE.has(s.id);
      })
      .map((s) => s.id);
    expect(offenders).toEqual([]);
  });

  it("every damageDice is a well-formed NdM[+K] dice string (S12 lock)", () => {
    for (const s of spells) {
      if (s.damageDice == null) continue;
      expect(s.damageDice, `${s.id} damageDice`).toMatch(/^\d+d\d+(\+\d+)?$/);
    }
  });

  // ── S12c: leveled DAMAGE spells scale their dice on upcast ───────────────────
  // Before S12c the combat card + cast modal showed the BASE dice at EVERY slot
  // level (Fireball read "8d6" cast at 3rd, 5th, or 9th). `damageDicePerUpcast`
  // declares the per-slot increment; `scaleUpcastDice` resolves the slot total.

  it("every damageDicePerUpcast is a well-formed NdM increment sharing the base die face (S12c lock)", () => {
    for (const s of spells) {
      if (s.damageDicePerUpcast == null) continue;
      // Well-formed plain NdM (no flat tail on the increment).
      expect(s.damageDicePerUpcast, `${s.id} damageDicePerUpcast`).toMatch(/^\d+d\d+$/);
      // It can only ride a spell that has base dice…
      expect(s.damageDice, `${s.id} has perUpcast but no base damageDice`).toBeDefined();
      // …and MUST share the base die face so the count-scaling is meaningful.
      const baseFace = s.damageDice?.match(/^\d+d(\d+)/)?.[1];
      const incFace = s.damageDicePerUpcast.match(/^\d+d(\d+)$/)?.[1];
      expect(incFace, `${s.id} increment die face`).toBe(baseFace);
    }
  });

  it("RA-07 — every healDicePerUpcast is a well-formed NdM increment sharing the base heal die face", () => {
    for (const s of spells) {
      if (s.healDicePerUpcast == null) continue;
      // Well-formed plain NdM (no flat tail on the increment).
      expect(s.healDicePerUpcast, `${s.id} healDicePerUpcast`).toMatch(/^\d+d\d+$/);
      // It can only ride a spell that has DICE-based base healing (not a flat "70").
      expect(s.healDice, `${s.id} has healPerUpcast but no base healDice`).toMatch(
        /^\d+d\d+/
      );
      // …and MUST share the base heal die face so count-scaling is meaningful.
      const baseFace = s.healDice?.match(/^\d+d(\d+)/)?.[1];
      const incFace = s.healDicePerUpcast.match(/^\d+d(\d+)$/)?.[1];
      expect(incFace, `${s.id} heal increment die face`).toBe(baseFace);
    }
  });

  it("RA-07 — scales the healing family to its RAW slot totals via scaleUpcastDice", () => {
    // scaleUpcastDice is heal/damage-agnostic — call it with the heal fields
    // mapped onto its `damageDice`/`damageDicePerUpcast` params (the exact reuse
    // the CastLevelModal makes). [id, castLevel, expected scaled heal dice].
    const CASES: Array<[string, number, string]> = [
      ["cure-wounds", 1, "2d8"], // base
      ["cure-wounds", 3, "6d8"], // +2×2d8
      ["healing-word", 4, "8d4"], // L1 base 2d4, +3×2d4
      ["prayer-of-healing", 4, "6d8"], // L2 base 2d8, +2×2d8
      ["mass-healing-word", 5, "4d4"], // L3 base 2d4, +2×1d4
      ["mass-cure-wounds", 7, "7d8"], // L5 base 5d8, +2×1d8
    ];
    for (const [id, level, expected] of CASES) {
      const spell = getSpellById(id);
      expect(spell, id).toBeDefined();
      if (!spell) continue;
      const scaled = scaleUpcastDice(
        {
          level: spell.level,
          damageDice: spell.healDice,
          damageDicePerUpcast: spell.healDicePerUpcast,
        },
        level
      );
      expect(scaled, `${id} heal at slot ${level}`).toBe(expected);
    }
  });

  it("scales the audited upcastable damage spells to their RAW slot totals (S12c table)", () => {
    // [id, castLevel, expected scaled dice] — verified against the 2024 wikidot
    // "Using a Higher-Level Spell Slot" clause. Spans every increment shape: the
    // canonical +1d6 (Fireball/Lightning Bolt), other faces (Inflict Wounds +1d10,
    // Thunderwave +1d8, Witch Bolt +1d12), a multi-die step (Vitriolic Sphere
    // +2d4, Circle of Death +2d8, Disintegrate +3d6 with a preserved +40 tail),
    // a smite rider (Divine Smite +1d8), and the base-level no-op.
    const CASES: Array<[string, number, string]> = [
      ["fireball", 3, "8d6"],
      ["fireball", 5, "10d6"],
      ["fireball", 9, "14d6"],
      ["lightning-bolt", 4, "9d6"],
      ["burning-hands", 4, "6d6"], // L1 base 3d6, +3 steps
      ["guiding-bolt", 3, "6d6"], // L1 base 4d6, +2 steps
      ["inflict-wounds", 3, "4d10"], // L1 base 2d10, +2 steps
      ["thunderwave", 2, "3d8"], // L1 base 2d8, +1 step
      ["shatter", 4, "5d8"], // L2 base 3d8, +2 steps
      ["spiritual-weapon", 4, "3d8"], // L2 base 1d8, +2 steps
      ["vitriolic-sphere", 6, "14d4"], // L4 base 10d4, +2×2d4
      ["circle-of-death", 8, "12d8"], // L6 base 8d8, +2×2d8
      ["disintegrate", 8, "16d6+40"], // L6 base 10d6+40, +2×3d6, tail kept
      ["divine-smite", 3, "4d8"], // L1 base 2d8, +2 steps
      // S12c backfill — the adversarial-sweep spells still shipped here.
      ["wall-of-ice", 7, "12d6"], // SRD L6 base 10d6, +1×2d6 (RAW: appearance +2d6/slot)
      ["dragons-breath", 4, "5d6"], // SRD L2 base 3d6, +1d6/slot above 2
      ["otilukes-freezing-sphere", 9, "13d6"], // SRD L6 base 10d6, +1d6/slot above 6
      // (The pack-only backfill rows — Witch Bolt, the pack spell corpus —
      // live in `content-pack/tests/unit/spell-data-integrity.pack.test.ts`.)
    ];
    for (const [id, level, expected] of CASES) {
      const spell = getSpellById(id);
      expect(spell, id).toBeDefined();
      if (!spell) continue;
      expect(scaleUpcastDice(spell, level), `${id} at slot ${level}`).toBe(expected);
    }
  });

  it("a ray-count spell scales its instance count, NOT its dice (S12c)", () => {
    // Scorching Ray / Magic Missile add an extra ray/dart per upcast level
    // (instancesPerUpcast) and carry NO damageDicePerUpcast — their per-ray dice
    // stay constant, so scaleUpcastDice returns the bare base dice unchanged.
    for (const id of ["scorching-ray", "magic-missile"]) {
      const spell = getSpellById(id);
      expect(spell?.damageDicePerUpcast, `${id} must not scale dice`).toBeUndefined();
      expect(spell?.instancesPerUpcast, `${id} scales instances`).toBe(1);
      expect(scaleUpcastDice(spell ?? { level: 1 }, (spell?.level ?? 1) + 3)).toBe(
        spell?.damageDice
      );
    }
  });

  it("every heal verdict carries a structured `healDice` amount (S12 lock)", () => {
    // Two healers convey no fixed amount: Power Word Heal restores ALL Hit Points;
    // Arcane Vigor heals by spent Hit Point Dice. They tag `heal` (verdigris card)
    // without a die — allowlisted by construction.
    const HEAL_TAG_ONLY = new Set(["power-word-heal", "arcane-vigor"]);
    const offenders = spells
      .filter((s) => s.effectTag === "heal" && !s.healDice && !HEAL_TAG_ONLY.has(s.id))
      .map((s) => s.id);
    expect(offenders).toEqual([]);
    // And every spell carrying `healDice` is tagged `heal` (so the card colours it).
    for (const s of spells) {
      if (s.healDice != null) expect(s.effectTag, `${s.id} healDice`).toBe("heal");
    }
  });

  it("only fixed-amount heals omit healAddsCastMod; the cure-family sets it (S12)", () => {
    // The 2024 "regains NdM + your spellcasting ability modifier" family.
    const addsMod = [
      "cure-wounds",
      "healing-word",
      "mass-healing-word",
      "mass-cure-wounds",
      "prayer-of-healing",
    ];
    for (const id of addsMod) {
      expect(getSpellById(id)?.healAddsCastMod, id).toBe(true);
    }
    // Fixed-amount heals (Regenerate "4d8+15", Aura of Vitality 2d6, flat Heal 70)
    // must NOT add the caster mod.
    for (const id of [
      "regenerate",
      "aura-of-vitality",
      "heal",
      "mass-heal",
      "goodberry",
    ]) {
      expect(getSpellById(id)?.healAddsCastMod ?? false, id).toBe(false);
    }
  });

  // ── Polymorph family — catalogued, Concentration, 2024-RAW prose ────────────
  // The stat-block SWAP is now BUILT for Phase 1 (S7): the CR-indexed Beast
  // catalogue (`src/data/beasts/`), the per-cast form picker (`BeastFormPicker`),
  // and the SELF-swap applicator (`assumePolymorphForm` — stamps the Beast's
  // AC/speeds/scores + Temp HP, engages Concentration) — see `tests/unit/polymorph.test.ts`.
  // Polymorphing ANOTHER creature stays a read-only reference card (one modeled
  // character), and True Polymorph's non-Beast forms remain narrative (Phase 2 =
  // the full CR 0-8 Beast fill). What THIS test pins is the spell-DATA facts the
  // engine + applicator read: level/school/Concentration (the concentration tracker
  // engages by id — the form's engage path); the WIS save (the control verdict); and
  // the bilingual catalogue text, including the official IT SRD 5.2.1 names (Polymorph
  // = "Metamorfosi", True Polymorph = "Metamorfosi pura") and the 2024 transform rules
  // (retains its OWN Hit Points + gains Temporary Hit Points equal to the Beast's HP —
  // the value the applicator applies).
  it("catalogues the Polymorph family as Concentration transmutation with 2024 prose", () => {
    const poly = getSpellById("polymorph");
    expect(poly?.level).toBe(4);
    expect(poly?.school).toBe("transmutation");
    expect(poly?.concentration).toBe(true);
    expect(poly?.saveAbility).toBe("WIS");
    expect(poly?.castingTime).toBe("action");
    expect([...(poly?.classes ?? [])].sort()).toEqual([
      "bard",
      "druid",
      "sorcerer",
      "wizard",
    ]);

    const truePoly = getSpellById("true-polymorph");
    expect(truePoly?.level).toBe(9);
    expect(truePoly?.school).toBe("transmutation");
    expect(truePoly?.concentration).toBe(true);
    expect(truePoly?.saveAbility).toBe("WIS");

    // Official IT SRD 5.2.1 names (NOT the non-authoritative "Polimorfismo").
    expect(srd("spell", "polymorph", "name", "it")).toBe("Metamorfosi");
    expect(srd("spell", "true-polymorph", "name", "it")).toBe("Metamorfosi pura");
    expect(srd("spell", "polymorph", "name", "en")).toBe("Polymorph");

    // 1-hour Concentration duration in both locales.
    expect(srd("spell", "polymorph", "duration", "en")).toBe(
      "Concentration, up to 1 hour"
    );
    expect(srd("spell", "polymorph", "duration", "it")).toBe(
      "Concentrazione, fino a 1 ora"
    );

    // 2024 transform rules: the description keeps the target's own Hit Points and
    // grants Temporary Hit Points (the change the old 2014-flavour prose lacked).
    const enDesc = srd("spell", "polymorph", "description", "en");
    expect(enDesc).toContain("Temporary Hit Points");
    expect(enDesc).toContain("Hit Point Dice");
    expect(enDesc).not.toContain("drops to 0 Hit Points");
    const itDesc = srd("spell", "polymorph", "description", "it");
    expect(itDesc).toContain("punti ferita temporanei");
    expect(itDesc).not.toContain("scende a 0 punti ferita");
  });

  // ── B3: `instantaneous` is the STRUCTURED duration FACT (golden rule 7) ──────
  // The smart-tracker action summary and the spell-view both omit the duration row
  // for instantaneous spells. They used to read the canonical EN prose
  // (`srdEn("spell", id, "duration") === "Instantaneous"`); they now read the
  // structured `instantaneous` boolean. This equivalence lock pins, for EVERY
  // shipped spell, that the boolean matches the (old) prose-derived value — so the
  // refactored consumers produce byte-identical output AND no future spell can
  // ship a flag that disagrees with its catalogued duration. Covers all three
  // shapes: instantaneous, non-instantaneous, and Concentration (never instant).
  it("`instantaneous` equals the canonical EN duration === 'Instantaneous' (B3 equivalence lock)", () => {
    for (const s of spells) {
      const durationEn = srd("spell", s.id, "duration", "en");
      // Every shipped spell has a catalogued EN duration to derive the fact from.
      expect(durationEn.length, `${s.id} has a catalogued EN duration`).toBeGreaterThan(
        0
      );
      expect(Boolean(s.instantaneous), `${s.id} instantaneous flag`).toBe(
        durationEn === "Instantaneous"
      );
      // A Concentration spell is never Instantaneous — the two structured facts
      // can't both be set (a sanity cross-check on the backfill).
      if (s.concentration) {
        expect(s.instantaneous ?? false, `${s.id} concentration ⇒ not instant`).toBe(
          false
        );
      }
    }
  });

  it("the `instantaneous` field is set true (never false) and only on instant spells (B3 lean-data lock)", () => {
    // Lean representation: the field is OMITTED (undefined) for non-instant spells,
    // and `true` for the 124 instant ones — never an explicit `false`.
    for (const s of spells) {
      expect([true, undefined], `${s.id} instantaneous value`).toContain(s.instantaneous);
    }
    // Representative spread across the three shapes the consumers branch on.
    expect(getSpellById("fireball")?.instantaneous, "fireball (instant damage)").toBe(
      true
    );
    expect(getSpellById("cure-wounds")?.instantaneous, "cure-wounds (instant heal)").toBe(
      true
    );
    expect(
      getSpellById("mage-armor")?.instantaneous,
      "mage-armor (8-hour buff)"
    ).toBeUndefined();
    expect(
      getSpellById("hypnotic-pattern")?.instantaneous,
      "hypnotic-pattern (concentration)"
    ).toBeUndefined();
    expect(
      getSpellById("hypnotic-pattern")?.concentration,
      "hypnotic-pattern concentration"
    ).toBe(true);
  });

  it("places every spell in the level file matching its `level` field", () => {
    const byFile: Array<[number, readonly { id: string; level: number }[]]> = [
      [0, SRD_CANTRIPS],
      [1, SRD_SPELLS_LEVEL1],
      [2, SRD_SPELLS_LEVEL2],
      [3, SRD_SPELLS_LEVEL3],
      [4, SRD_SPELLS_LEVEL4],
      [5, SRD_SPELLS_LEVEL5],
      [6, SRD_SPELLS_LEVEL6],
      [7, SRD_SPELLS_LEVEL7],
      [8, SRD_SPELLS_LEVEL8],
      [9, SRD_SPELLS_LEVEL9],
    ];
    for (const [expectedLevel, list] of byFile) {
      for (const s of list) {
        expect(
          s.level,
          `${s.id} sits in the level-${expectedLevel} file but has level ${s.level}`
        ).toBe(expectedLevel);
      }
    }
  });
});
