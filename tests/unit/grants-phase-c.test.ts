/**
 * Phase C — Grant schema extension tests.
 *
 * Pins every new Grant kind shipped in Phase C against the evaluator. The
 * existing A4-Phase-0 test file (`grants.test.ts`) keeps covering the
 * original 13 kinds; this file covers the 17 new ones (senses, immunity,
 * vulnerability, non-walking speeds, free-cast, ritual, casting modifiers,
 * choice-* grants, ac-formula, advantage/disadvantage chips).
 *
 * Every assertion cites the wiki sample it mirrors (`docs/MECHANICS.md`).
 */

import { describe, it, expect } from "vitest";
import { emptyAggregate, evaluateGrants } from "@/lib/grants";
import type { Grant } from "@/lib/grants";
import type { BiText } from "@/data/types";
import { loc } from "../_harness/loc";

const NAME: BiText = { en: "Test Feat", it: "Talento Test" };
const src = (id: string, grants: ReadonlyArray<Grant>) => ({
  id,
  name: NAME,
  grants,
});

// ─── Senses (max per kind) ──────────────────────────────────────────────────

describe("senses — blindsight / tremorsense / truesight", () => {
  it("takes the max blindsight range across sources", () => {
    const agg = evaluateGrants([
      src("a", [{ type: "blindsight", range: 30 }]),
      src("b", [{ type: "blindsight", range: 60 }]),
    ]);
    expect(agg.blindsightFt).toBe(60);
  });

  it("tracks tremorsense + truesight independently of darkvision", () => {
    const agg = evaluateGrants([
      src("a", [{ type: "darkvision", range: 60 }]),
      src("b", [{ type: "tremorsense", range: 60 }]),
      src("c", [{ type: "truesight", range: 120 }]),
    ]);
    expect(agg.darkvisionFt).toBe(60);
    expect(agg.tremorsenseFt).toBe(60);
    expect(agg.truesightFt).toBe(120);
  });
});

// ─── Damage immunity / vulnerability (set-union) ────────────────────────────

describe("damage immunity / vulnerability", () => {
  it("collects immunities into a set-union", () => {
    const agg = evaluateGrants([
      src("periapt", [{ type: "damage-immunity", damageType: "poison" }]),
      src("trait", [{ type: "damage-immunity", damageType: "necrotic" }]),
      src("dup", [{ type: "damage-immunity", damageType: "poison" }]),
    ]);
    expect([...agg.damageImmunities].sort()).toEqual(["necrotic", "poison"]);
  });

  it("vulnerabilities are tracked separately", () => {
    const agg = evaluateGrants([
      src("curse", [{ type: "damage-vulnerability", damageType: "radiant" }]),
    ]);
    expect([...agg.damageVulnerabilities]).toEqual(["radiant"]);
    expect(agg.damageResistances.size).toBe(0);
  });
});

// ─── Condition immunity (set-union) ─────────────────────────────────────────

describe("condition immunity", () => {
  it("Aura of Protection-style 'Immunity to Frightened' adds the condition", () => {
    const agg = evaluateGrants([
      src("paladin-aura", [{ type: "condition-immunity", condition: "frightened" }]),
    ]);
    expect(agg.conditionImmunities.has("frightened")).toBe(true);
  });
});

// ─── Non-walking speeds (max per kind, equal-to-walking wins) ───────────────

describe("non-walking speeds", () => {
  it("takes the max numeric fly speed", () => {
    const agg = evaluateGrants([
      src("wing", [{ type: "fly-speed", amount: 30 }]),
      src("magic-item", [{ type: "fly-speed", amount: 60 }]),
    ]);
    expect(agg.flySpeed).toBe(60);
  });

  it("'equal-to-walking' wins over a numeric value (Triton swim)", () => {
    const agg = evaluateGrants([
      src("triton", [{ type: "swim-speed", amount: "equal-to-walking" }]),
      src("trinket", [{ type: "swim-speed", amount: 20 }]),
    ]);
    expect(agg.swimSpeed).toBe("equal-to-walking");
  });

  it("climb speed is independent", () => {
    const agg = evaluateGrants([
      src("monk-thief", [{ type: "climb-speed", amount: 30 }]),
    ]);
    expect(agg.climbSpeed).toBe(30);
    expect(agg.flySpeed).toBeNull();
    expect(agg.swimSpeed).toBeNull();
  });
});

// ─── AC formula (collects all candidates) ───────────────────────────────────

describe("AC formula candidates", () => {
  it("Barbarian Unarmored Defense: 10 + DEX + CON, no-armor", () => {
    const agg = evaluateGrants([
      src("barb-ud", [
        {
          type: "ac-formula",
          base: 10,
          bonuses: ["DEX", "CON"],
          condition: "no-armor",
        },
      ]),
    ]);
    expect(agg.acFormulas).toHaveLength(1);
    const f = agg.acFormulas[0];
    expect(f?.sourceId).toBe("barb-ud");
    expect(f?.base).toBe(10);
    expect([...(f?.bonuses ?? [])]).toEqual(["DEX", "CON"]);
    expect(f?.condition).toBe("no-armor");
    expect(f?.shieldBonus).toBe(0);
  });

  it("Monk Unarmored Defense: 10 + DEX + WIS, no-armor-no-shield", () => {
    const agg = evaluateGrants([
      src("monk-ud", [
        {
          type: "ac-formula",
          base: 10,
          bonuses: ["DEX", "WIS"],
          condition: "no-armor-no-shield",
        },
      ]),
    ]);
    expect(agg.acFormulas[0]?.condition).toBe("no-armor-no-shield");
  });
});

// ─── Choice grants (pendingChoices) ─────────────────────────────────────────

describe("choice grants surface as pendingChoices", () => {
  it("choice-skill-proficiency surfaces with options + amount", () => {
    const agg = evaluateGrants([
      src("battlemaster", [
        {
          type: "choice-skill-proficiency",
          options: ["Athletics", "Investigation"],
          amount: 1,
        },
      ]),
    ]);
    expect(agg.pendingChoices).toHaveLength(1);
    const pc = agg.pendingChoices[0];
    if (pc?.kind === "skill-proficiency") {
      expect([...pc.options]).toEqual(["Athletics", "Investigation"]);
      expect(pc.amount).toBe(1);
    } else {
      throw new Error("expected skill-proficiency choice");
    }
  });

  it("choice-language with empty options means 'any language'", () => {
    const agg = evaluateGrants([
      src("scholar", [{ type: "choice-language", options: [], amount: 1 }]),
    ]);
    const pc = agg.pendingChoices[0];
    if (pc?.kind === "language") {
      expect(pc.options).toEqual([]);
    } else {
      throw new Error("expected language choice");
    }
  });

  it("choice-cantrip + choice-spell carry classSpellList + maxLevel", () => {
    const agg = evaluateGrants([
      src("magic-initiate", [
        { type: "choice-cantrip", classSpellList: "wizard", amount: 2 },
        { type: "choice-spell", classSpellList: "wizard", maxLevel: 1, amount: 1 },
      ]),
    ]);
    expect(agg.pendingChoices).toHaveLength(2);
    const cantrip = agg.pendingChoices.find((c) => c.kind === "cantrip");
    const spell = agg.pendingChoices.find((c) => c.kind === "spell");
    if (cantrip?.kind === "cantrip") expect(cantrip.classSpellList).toBe("wizard");
    if (spell?.kind === "spell") {
      expect(spell.classSpellList).toBe("wizard");
      expect(spell.maxLevel).toBe(1);
    }
  });
});

// ─── Spell grants — ritual + free-cast ──────────────────────────────────────

describe("ritual-casting / free-cast", () => {
  it("ritual-casting collects per-spell entries", () => {
    const agg = evaluateGrants([
      src("banneret", [{ type: "ritual-casting", spellId: "comprehend-languages" }]),
    ]);
    expect(agg.ritualSpells.has("comprehend-languages")).toBe(true);
  });

  it("ritual-casting-any tags class lists", () => {
    const agg = evaluateGrants([
      src("ritual-adept", [{ type: "ritual-casting-any", classSpellList: "wizard" }]),
    ]);
    expect(agg.ritualAnyClasses.has("wizard")).toBe(true);
  });

  it("free-cast carries chargesPerRest + rest + optional casterAbility", () => {
    const agg = evaluateGrants([
      src("fey-touched", [
        {
          type: "free-cast-spell",
          spellId: "misty-step",
          chargesPerRest: 1,
          rest: "long",
          casterAbility: "CHA",
        },
      ]),
    ]);
    expect(agg.freeCasts).toHaveLength(1);
    const fc = agg.freeCasts[0];
    expect(fc?.spellId).toBe("misty-step");
    expect(fc?.chargesPerRest).toBe(1);
    expect(fc?.rest).toBe("long");
    expect(fc?.casterAbility).toBe("CHA");
    expect(fc?.sourceId).toBe("fey-touched");
  });
});

// ─── Casting modifiers (per-scope entries) ──────────────────────────────────

describe("spell save DC / attack bonus deltas", () => {
  it("collects entries per scope (Draconic Sorcerer style)", () => {
    const agg = evaluateGrants([
      src("draconic-affinity", [
        { type: "spell-save-dc-bonus", amount: 1, scope: "sorcerer" },
        { type: "spell-attack-bonus", amount: 1, scope: "sorcerer" },
      ]),
    ]);
    expect(agg.spellSaveDcBonus).toHaveLength(1);
    expect(agg.spellSaveDcBonus[0]).toEqual({ amount: 1, scope: "sorcerer" });
    expect(agg.spellAttackBonus[0]).toEqual({ amount: 1, scope: "sorcerer" });
  });

  it("global 'all' scope is preserved", () => {
    const agg = evaluateGrants([
      src("rod-of-the-pact-keeper", [
        { type: "spell-save-dc-bonus", amount: 2, scope: "all" },
      ]),
    ]);
    expect(agg.spellSaveDcBonus[0]?.scope).toBe("all");
  });
});

// ─── Advantage / disadvantage chips ─────────────────────────────────────────

describe("advantage / disadvantage chips", () => {
  it("collects advantage clauses with rollType + vs + bilingual description", () => {
    const agg = evaluateGrants([
      src("fey-ancestry", [
        {
          type: "advantage-on",
          rollType: "save",
          vs: "charmed",
          description: {
            en: "Advantage on saves against being Charmed",
            it: "Vantaggio sui tiri salvezza contro essere Affascinati",
          },
        },
      ]),
    ]);
    expect(agg.advantages).toHaveLength(1);
    const a = agg.advantages[0];
    expect(a?.rollType).toBe("save");
    expect(a?.vs).toBe("charmed");
    expect(loc(a?.description, "en")).toContain("Charmed");
    expect(loc(a?.description, "it")).toContain("Affascinati");
  });

  it("disadvantages are tracked separately", () => {
    const agg = evaluateGrants([
      src("sunlight-sensitivity", [
        {
          type: "disadvantage-on",
          rollType: "attack",
          vs: "sunlight",
          description: {
            en: "Disadvantage in sunlight",
            it: "Svantaggio alla luce del sole",
          },
        },
      ]),
    ]);
    expect(agg.disadvantages).toHaveLength(1);
    expect(agg.advantages).toHaveLength(0);
  });
});

// ─── Temporary HP grant (override-first — collected, never auto-applied) ─────

describe("temp-hp grant", () => {
  it("aggregates a triggered temp-HP grant with its source, formula and trigger", () => {
    // Warlock Fiend "Dark One's Blessing" — CHA + Warlock level on a kill.
    const agg = evaluateGrants([
      src("warlock-fiend-patron-dark-ones-blessing", [
        {
          type: "temp-hp",
          formula: "CHA+level",
          trigger: {
            en: "when you reduce an enemy to 0 HP",
            it: "quando riduci un nemico a 0 PF",
          },
        },
      ]),
    ]);
    expect(agg.tempHpGrants).toHaveLength(1);
    expect(agg.tempHpGrants[0]).toMatchObject({
      sourceId: "warlock-fiend-patron-dark-ones-blessing",
      formula: "CHA+level",
    });
    expect(loc(agg.tempHpGrants[0]?.trigger, "it")).toContain("0 PF");
    // No slot ⇒ an automatic/triggered gain (no action-economy cost).
    expect(agg.tempHpGrants[0]?.slot).toBeUndefined();
  });

  it("collects temp-HP grants across sources; carries an optional action slot", () => {
    const agg = evaluateGrants([
      src("druid-moon-circle-forms", [{ type: "temp-hp", formula: "3*level" }]),
      src("orc-adrenaline-rush", [{ type: "temp-hp", formula: "PB", slot: "bonus" }]),
    ]);
    expect(agg.tempHpGrants.map((t) => t.formula).sort()).toEqual(["3*level", "PB"]);
    const orc = agg.tempHpGrants.find((t) => t.sourceId === "orc-adrenaline-rush");
    expect(orc?.slot).toBe("bonus");
  });

  it("empty by default — never fabricated", () => {
    expect(evaluateGrants([]).tempHpGrants).toHaveLength(0);
  });
});

// ─── Empty aggregate is the additive identity ───────────────────────────────

describe("emptyAggregate", () => {
  it("contains all new fields initialised", () => {
    const e = emptyAggregate();
    expect(e.blindsightFt).toBe(0);
    expect(e.tremorsenseFt).toBe(0);
    expect(e.truesightFt).toBe(0);
    expect(e.damageImmunities.size).toBe(0);
    expect(e.damageVulnerabilities.size).toBe(0);
    expect(e.conditionImmunities.size).toBe(0);
    expect(e.flySpeed).toBeNull();
    expect(e.swimSpeed).toBeNull();
    expect(e.climbSpeed).toBeNull();
    expect(e.acFormulas).toEqual([]);
    expect(e.spellSaveDcBonus).toEqual([]);
    expect(e.spellAttackBonus).toEqual([]);
    expect(e.ritualSpells.size).toBe(0);
    expect(e.ritualAnyClasses.size).toBe(0);
    expect(e.freeCasts).toEqual([]);
    expect(e.advantages).toEqual([]);
    expect(e.disadvantages).toEqual([]);
    expect(e.tempHpGrants).toEqual([]);
  });
});
