/**
 * Consumer-seam derive helpers (L1 / L4 / L5 / L6).
 *
 * These pure functions turn an `AggregatedGrants` view (+ the character's own
 * proficiencies) into render-ready data. Component rendering is exercised
 * elsewhere; this file pins the model-side derivation against synthetic
 * aggregates so the renderers stay trivial and correct.
 */

import { describe, it, expect } from "vitest";
import { litText } from "@/lib/loc-text";
import { emptyAggregate, type AggregatedGrants } from "@/lib/grants";
import {
  mergeSkillProficiencies,
  mergeSaveProficiencies,
  displayLanguages,
  displayToolProficiencies,
  effectiveLanguageTokens,
  effectiveToolTokens,
  deriveImmunities,
  deriveSensesAndSpeeds,
  resolveNonWalkingSpeed,
  deriveAdvantageChips,
  applySetOverride,
  deriveDefenseKind,
  deriveFlatDamageReductions,
} from "@/lib/views/sheet-view";

function aggregateWith(partial: Partial<AggregatedGrants>): AggregatedGrants {
  return { ...emptyAggregate(), ...partial };
}

// ─── L4 — fixed skill / tool / save proficiency consumer ────────────────────

describe("L4 — mergeSkillProficiencies", () => {
  it("adds grant-granted skills as proficient", () => {
    const merged = mergeSkillProficiencies({}, new Set(["stealth", "arcana"]));
    expect(merged).toEqual({ stealth: "proficient", arcana: "proficient" });
  });

  it("never downgrades an existing expertise", () => {
    const merged = mergeSkillProficiencies(
      { stealth: "expertise" },
      new Set(["stealth"])
    );
    expect(merged.stealth).toBe("expertise");
  });

  // #66 — a FIXED-skill grant must UPGRADE a Jack-of-all-Trades half-proficiency
  // to full proficiency. The merge is MAX over `none < half < proficient <
  // expertise`, so a real proficiency always beats a half (the old merge wrongly
  // let half block the grant).
  it("a fixed grant upgrades an existing half-proficiency to proficient (#66)", () => {
    const merged = mergeSkillProficiencies(
      { history: "halfProficiency" },
      new Set(["history"])
    );
    expect(merged.history).toBe("proficient");
  });

  // Table-driven precedence: MAX over the lattice for the fixed-skill grant path.
  it.each([
    [undefined, "proficient"],
    ["halfProficiency", "proficient"],
    ["proficient", "proficient"],
    ["expertise", "expertise"],
  ] as const)("own=%s + fixed grant → %s (MAX precedence)", (own, expected) => {
    const ownMap: Record<string, "proficient" | "expertise" | "halfProficiency"> = own
      ? { stealth: own }
      : {};
    const merged = mergeSkillProficiencies(ownMap, new Set(["stealth"]));
    expect(merged.stealth).toBe(expected);
  });

  // Jack-of-all-Trades (Bard L2) — the boolean flag fills `halfProficiency` for
  // every unproficient skill, at the BOTTOM of the lattice (never overrides a
  // real proficiency/expertise).
  it.each([
    [undefined, "halfProficiency"],
    ["halfProficiency", "halfProficiency"],
    ["proficient", "proficient"],
    ["expertise", "expertise"],
  ] as const)(
    "JoaT flag: own=%s → %s (half never beats a real prof)",
    (own, expected) => {
      const ownMap: Record<string, "proficient" | "expertise" | "halfProficiency"> = own
        ? { stealth: own }
        : {};
      const merged = mergeSkillProficiencies(ownMap, new Set(), new Set(), true, [
        "stealth",
        "arcana",
      ]);
      expect(merged.stealth).toBe(expected);
      // a totally-unproficient skill in the catalogue gains half
      expect(merged.arcana).toBe("halfProficiency");
    }
  );

  it("JoaT flag is off by default — no half-proficiency is added", () => {
    const merged = mergeSkillProficiencies({ stealth: "proficient" }, new Set());
    expect(merged).toEqual({ stealth: "proficient" });
  });

  it("a fixed grant upgrades a JoaT-derived half in the same merge (#66 end-to-end)", () => {
    // JoaT fills `history` with half; the fixed grant on `history` then upgrades
    // it — order-independent because the merge is MAX.
    const merged = mergeSkillProficiencies({}, new Set(["history"]), new Set(), true, [
      "history",
      "arcana",
    ]);
    expect(merged.history).toBe("proficient");
    expect(merged.arcana).toBe("halfProficiency");
  });

  it("keeps own proficiencies and adds new ones", () => {
    const merged = mergeSkillProficiencies(
      { perception: "proficient" },
      new Set(["stealth"])
    );
    expect(merged).toEqual({ perception: "proficient", stealth: "proficient" });
  });

  // AX exposure audit — the fixed `expertise` grant kind (Menacing's
  // Intimidation) was aggregated but never consumed: a feat-granted expertise
  // rendered as mere proficiency. The merge now upgrades it.
  it("grant-derived expertise upgrades an own proficient entry", () => {
    const merged = mergeSkillProficiencies(
      { intimidation: "proficient" },
      new Set(),
      new Set(["intimidation"])
    );
    expect(merged.intimidation).toBe("expertise");
  });

  it("grant-derived expertise lands on a skill the character lacks (implies prof)", () => {
    const merged = mergeSkillProficiencies({}, new Set(), new Set(["perception"]));
    expect(merged.perception).toBe("expertise");
  });

  it("grant-derived expertise never downgrades an own expertise", () => {
    const merged = mergeSkillProficiencies(
      { stealth: "expertise" },
      new Set(["stealth"]),
      new Set(["stealth"])
    );
    expect(merged.stealth).toBe("expertise");
  });

  it("does not mutate the input", () => {
    const own = { perception: "proficient" } as const;
    mergeSkillProficiencies(own, new Set(["stealth"]));
    expect(own).toEqual({ perception: "proficient" });
  });
});

describe("L4 — mergeSaveProficiencies", () => {
  it("appends grant-granted saves not already present", () => {
    const merged = mergeSaveProficiencies(["DEX"], new Set(["CON", "WIS"]));
    expect(merged).toEqual(["DEX", "CON", "WIS"]);
  });

  it("de-duplicates saves already owned", () => {
    const merged = mergeSaveProficiencies(["DEX", "CON"], new Set(["CON"]));
    expect(merged).toEqual(["DEX", "CON"]);
  });

  it("handles all six saves granted (Monk Disciplined Survivor)", () => {
    const merged = mergeSaveProficiencies(
      ["STR", "DEX"],
      new Set(["STR", "DEX", "CON", "INT", "WIS", "CHA"])
    );
    expect(new Set(merged)).toEqual(new Set(["STR", "DEX", "CON", "INT", "WIS", "CHA"]));
    expect(merged).toHaveLength(6);
  });

  it("does not mutate the input array", () => {
    const own: ("STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA")[] = ["DEX"];
    mergeSaveProficiencies(own, new Set(["CON"]));
    expect(own).toEqual(["DEX"]);
  });
});

describe("displayLanguages / displayToolProficiencies — single-source display string", () => {
  // The cockpit rail AND the Bio tab both render through these helpers, so the
  // two surfaces can never drift (owner 2026-06-06: single source of truth). The
  // MANUAL store is STABLE IDS + custom labels; granted is the EN-name FACT anchor;
  // both localize by id (golden rule 7 — never a leaked display string).
  it("merges manual ids ∪ grants and localizes languages (EN)", () => {
    const agg = aggregateWith({ languages: new Set(["Thieves' Cant"]) });
    expect(displayLanguages(["common", "elvish"], [], agg, "en")).toBe(
      "Common, Elvish, Thieves' Cant"
    );
  });

  it("merges and localizes languages (IT) — granted tongue is translated, not leaked in EN", () => {
    const agg = aggregateWith({ languages: new Set(["Thieves' Cant"]) });
    // common→Comune, elvish→Elfico, Thieves' Cant (granted) → Gergo dei Ladri
    expect(displayLanguages(["common", "elvish"], [], agg, "it")).toBe(
      "Comune, Elfico, Gergo dei Ladri"
    );
  });

  it("does not double a granted language already in the manual id list", () => {
    const agg = aggregateWith({ languages: new Set(["Druidic"]) });
    expect(displayLanguages(["common", "druidic"], [], agg, "en")).toBe(
      "Common, Druidic"
    );
  });

  it("appends a homebrew custom language verbatim (single-locale, the ONE label home)", () => {
    const agg = aggregateWith({ languages: new Set() });
    expect(displayLanguages(["common"], ["Old Tongue"], agg, "en")).toBe(
      "Common, Old Tongue"
    );
  });

  it("merges manual ids ∪ grants and localizes tools (EN + IT)", () => {
    const agg = aggregateWith({ toolProficiencies: new Set(["Disguise Kit"]) });
    expect(displayToolProficiencies(["lute"], [], agg, "en")).toBe("Lute, Disguise Kit");
    // lute→Liuto, Disguise Kit→Trucchi per il Camuffamento (official IT SRD terms)
    expect(displayToolProficiencies(["lute"], [], agg, "it")).toBe(
      "Liuto, Trucchi per il Camuffamento"
    );
  });

  it("is a pure function of its inputs — same args → identical output (no drift)", () => {
    const agg = aggregateWith({ languages: new Set(["Druidic"]) });
    expect(displayLanguages(["common"], [], agg, "en")).toBe(
      displayLanguages(["common"], [], agg, "en")
    );
  });

  // REGRESSION: a manual id and its EN-granted twin must collapse to ONE entry
  // (deduped by id) and localize.
  it("dedupes a manual id against its EN-granted twin (EN)", () => {
    const agg = aggregateWith({ toolProficiencies: new Set(["Thieves' Tools"]) });
    expect(displayToolProficiencies(["thieves-tools"], [], agg, "en")).toBe(
      "Thieves' Tools"
    );
  });

  // The "Strumenti da Artigiano" leak: an UMBRELLA must NEVER render as a finished
  // chip — it's excluded from the display string (surfaced as a pending choice).
  it("never renders an umbrella tool as a finished proficiency (the leak)", () => {
    const agg = aggregateWith({ toolProficiencies: new Set(["Herbalism Kit"]) });
    const en = displayToolProficiencies(["artisans-tools"], [], agg, "en");
    expect(en).toBe("Herbalism Kit"); // the umbrella is NOT in the string
    expect(en).not.toContain("Artisan");
  });
});

describe("effectiveToolTokens / effectiveLanguageTokens — the one merge path (manual ∪ custom ∪ granted)", () => {
  it("tags manual ids manual and granted EN-names granted (locked), manual first", () => {
    const agg = aggregateWith({
      toolProficiencies: new Set(["Herbalism Kit", "Thieves' Tools"]),
    });
    const tokens = effectiveToolTokens(["herbalism-kit"], [], agg, "en");
    expect(tokens.map((t) => t.label)).toEqual(["Herbalism Kit", "Thieves' Tools"]);
    expect(tokens[0]).toMatchObject({ id: "herbalism-kit", manual: true, granted: true });
    expect(tokens[1]).toMatchObject({
      id: "thieves-tools",
      manual: false,
      granted: true,
    });
  });

  it("flags a held umbrella id with umbrellaId (a pending choice, never a finished chip)", () => {
    const agg = aggregateWith({ toolProficiencies: new Set() });
    const tokens = effectiveToolTokens(["artisans-tools"], [], agg, "en");
    expect(tokens[0]).toMatchObject({
      id: "artisans-tools",
      umbrellaId: "artisans-tools",
    });
  });

  it("localizes language ids to IT and keeps a custom label verbatim", () => {
    const agg = aggregateWith({ languages: new Set(["Draconic"]) });
    const tokens = effectiveLanguageTokens(["elvish"], ["Old Tongue"], agg, "it");
    const labels = tokens.map((t) => t.label);
    expect(labels).toContain("Elfico");
    expect(labels).toContain("Old Tongue"); // custom, single-locale verbatim
    expect(labels).toContain("Draconico"); // granted, localized by id
    // The custom token carries id:null (off-catalogue); the catalogue tokens an id.
    expect(tokens.find((t) => t.label === "Old Tongue")?.id).toBeNull();
    expect(tokens.find((t) => t.label === "Elfico")?.id).toBe("elvish");
  });
});

// ─── L5 — condition & damage immunities ─────────────────────────────────────

describe("L5 — deriveImmunities", () => {
  it("returns sorted condition + damage immunity ids", () => {
    const view = deriveImmunities(
      aggregateWith({
        conditionImmunities: new Set(["frightened", "charmed"]),
        damageImmunities: new Set(["poison", "fire"]),
      })
    );
    expect(view.conditionImmunities).toEqual(["charmed", "frightened"]);
    expect(view.damageImmunities).toEqual(["fire", "poison"]);
  });

  it("returns empty arrays when nothing is granted", () => {
    const view = deriveImmunities(emptyAggregate());
    expect(view.conditionImmunities).toEqual([]);
    expect(view.damageImmunities).toEqual([]);
  });
});

// ─── L6 — non-walking speeds + non-darkvision senses ────────────────────────

describe("L6 — resolveNonWalkingSpeed", () => {
  it("resolves the equal-to-walking sentinel against walking speed", () => {
    expect(resolveNonWalkingSpeed("equal-to-walking", 35)).toBe(35);
  });
  it("passes through a numeric value", () => {
    expect(resolveNonWalkingSpeed(60, 30)).toBe(60);
  });
  it("returns null when no speed is granted", () => {
    expect(resolveNonWalkingSpeed(null, 30)).toBeNull();
  });
});

describe("L6 — deriveSensesAndSpeeds", () => {
  it("includes only senses with a positive range", () => {
    const view = deriveSensesAndSpeeds(
      aggregateWith({ darkvisionFt: 60, blindsightFt: 0, truesightFt: 120 }),
      30
    );
    expect(view.senses).toEqual([
      { kind: "darkvision", rangeFt: 60 },
      { kind: "truesight", rangeFt: 120 },
    ]);
  });

  it("includes all four sense kinds when present", () => {
    const view = deriveSensesAndSpeeds(
      aggregateWith({
        darkvisionFt: 60,
        blindsightFt: 10,
        tremorsenseFt: 30,
        truesightFt: 120,
      }),
      30
    );
    expect(view.senses.map((s) => s.kind)).toEqual([
      "darkvision",
      "blindsight",
      "tremorsense",
      "truesight",
    ]);
  });

  it("resolves equal-to-walking swim speed against the character's walking speed", () => {
    const view = deriveSensesAndSpeeds(
      aggregateWith({ swimSpeed: "equal-to-walking" }),
      35
    );
    expect(view.speeds).toEqual([{ kind: "swim", rangeFt: 35 }]);
  });

  it("renders numeric fly / swim / climb speeds", () => {
    const view = deriveSensesAndSpeeds(
      aggregateWith({ flySpeed: 60, swimSpeed: 30, climbSpeed: 20 }),
      30
    );
    expect(view.speeds).toEqual([
      { kind: "fly", rangeFt: 60 },
      { kind: "swim", rangeFt: 30 },
      { kind: "climb", rangeFt: 20 },
    ]);
  });

  it("omits speeds and senses entirely when nothing is granted", () => {
    const view = deriveSensesAndSpeeds(emptyAggregate(), 30);
    expect(view.senses).toEqual([]);
    expect(view.speeds).toEqual([]);
  });
});

// ─── L1 — advantage / disadvantage chips ────────────────────────────────────

describe("L1 — deriveAdvantageChips", () => {
  it("flattens advantages then disadvantages, tagging each mode", () => {
    const chips = deriveAdvantageChips(
      aggregateWith({
        advantages: [
          {
            sourceId: "fighter-champion-remarkable-athlete",
            rollType: "check",
            vs: "initiative",
            description: litText({ en: "Initiative rolls", it: "Tiri di Iniziativa" }),
          },
        ],
        disadvantages: [
          {
            sourceId: "some-feature",
            rollType: "save",
            vs: "fear",
            description: litText({ en: "Saves vs fear", it: "TS contro la paura" }),
          },
        ],
      })
    );
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({
      sourceId: "fighter-champion-remarkable-athlete",
      mode: "advantage",
      rollType: "check",
      vs: "initiative",
    });
    expect(chips[1]).toMatchObject({ mode: "disadvantage", rollType: "save" });
  });

  it("returns empty when no clauses are present", () => {
    expect(deriveAdvantageChips(emptyAggregate())).toEqual([]);
  });

  it("folds in `extra` clauses (active-condition adv/dis) alongside grant clauses", () => {
    const chips = deriveAdvantageChips(
      aggregateWith({
        advantages: [
          {
            sourceId: "feature",
            rollType: "check",
            vs: "x",
            description: litText({ en: "X", it: "X" }),
          },
        ],
      }),
      {
        advantages: [],
        disadvantages: [
          {
            sourceId: "poisoned",
            rollType: "attack",
            vs: "poisoned",
            description: litText({ en: "Attack rolls", it: "Tiri per colpire" }),
          },
        ],
      }
    );
    expect(chips).toHaveLength(2);
    expect(chips.find((c) => c.sourceId === "poisoned")).toMatchObject({
      mode: "disadvantage",
      rollType: "attack",
    });
  });
});

describe("#68 — applySetOverride (defense / proficiency set overrides)", () => {
  it("returns the pure computed set (sorted, deduped) when no override is given", () => {
    expect(applySetOverride(["fire", "cold", "fire"], undefined)).toEqual([
      "cold",
      "fire",
    ]);
    expect(applySetOverride(new Set(["fire", "acid"]), {})).toEqual(["acid", "fire"]);
  });

  it("force-ADDS an id not in the computed set (override true)", () => {
    expect(applySetOverride(["fire"], { cold: true })).toEqual(["cold", "fire"]);
  });

  it("force-REMOVES a computed id (override false)", () => {
    expect(applySetOverride(["fire", "cold"], { fire: false })).toEqual(["cold"]);
  });

  it("applies adds and removes together: effective = (computed ∪ added) \\ removed", () => {
    expect(
      applySetOverride(["fire", "cold", "acid"], { fire: false, radiant: true })
    ).toEqual(["acid", "cold", "radiant"]);
  });

  it("is idempotent — adding a computed id or removing an absent id is a no-op", () => {
    expect(applySetOverride(["fire"], { fire: true })).toEqual(["fire"]);
    expect(applySetOverride(["fire"], { cold: false })).toEqual(["fire"]);
  });

  it("works for proficiency strings, not just enum ids", () => {
    expect(
      applySetOverride(["Light armor", "Shields"], {
        Shields: false,
        "Heavy armor": true,
      })
    ).toEqual(["Heavy armor", "Light armor"]);
  });

  it("does not mutate the input set", () => {
    const computed = new Set(["fire"]);
    applySetOverride(computed, { cold: true });
    expect([...computed]).toEqual(["fire"]);
  });
});

describe("PLAY-NO-EDIT — deriveDefenseKind (session overlay over the permanent set)", () => {
  it("permanent = applySetOverride; session layers additively into effective", () => {
    const v = deriveDefenseKind(["fire", "cold"], { fire: false }, ["poison"]);
    expect(v.permanent).toEqual(["cold"]);
    expect(v.session).toEqual(["poison"]);
    expect(v.effective).toEqual(["cold", "poison"]);
  });

  it("drops session entries that duplicate a permanent defense (no information)", () => {
    const v = deriveDefenseKind(["fire"], undefined, ["fire", "acid", "acid"]);
    expect(v.permanent).toEqual(["fire"]);
    expect(v.session).toEqual(["acid"]);
    expect(v.effective).toEqual(["acid", "fire"]);
  });

  it("handles an absent session list and empty inputs", () => {
    expect(deriveDefenseKind([], undefined, undefined)).toEqual({
      permanent: [],
      session: [],
      effective: [],
    });
    const v = deriveDefenseKind([], undefined, ["necrotic"]);
    expect(v.session).toEqual(["necrotic"]);
    expect(v.effective).toEqual(["necrotic"]);
  });

  it("a session add over a force-removed permanent id still takes effect", () => {
    // Build says "not resistant to fire" (override false); a potion grants it
    // anyway for the session — the overlay wins while it lasts.
    const v = deriveDefenseKind(["fire"], { fire: false }, ["fire"]);
    expect(v.permanent).toEqual([]);
    expect(v.session).toEqual(["fire"]);
    expect(v.effective).toEqual(["fire"]);
  });
});

describe("G9 — deriveFlatDamageReductions (Heavy Armor Master, self-side line)", () => {
  // The aggregate carries the HAM grant verbatim ("PB" + a wearing-heavy-armor
  // gate); the consumer resolves "PB" to the passed PB and DROPS the line unless
  // Heavy armor is equipped — a displayed reminder, not a damage subtraction.
  const hamAggregate = aggregateWith({
    flatDamageReductions: [
      {
        damageTypes: ["bludgeoning", "piercing", "slashing"],
        amount: "PB",
        condition: "wearing-heavy-armor",
        sourceId: "heavy-armor-master",
      },
    ],
  });

  it("shows the −PB B/P/S line ONLY while Heavy armor is equipped", () => {
    expect(deriveFlatDamageReductions(hamAggregate, 3, false)).toEqual([]);
    const [line] = deriveFlatDamageReductions(hamAggregate, 3, true);
    expect(line).toMatchObject({
      damageTypes: ["bludgeoning", "piercing", "slashing"],
      amount: 3, // "PB" resolved to the passed Proficiency Bonus
      requiresHeavyArmor: true,
      sourceId: "heavy-armor-master",
    });
  });

  it("resolves the PB amount from the argument (scales with level)", () => {
    expect(deriveFlatDamageReductions(hamAggregate, 4, true)[0]?.amount).toBe(4);
  });

  it("an empty aggregate yields no lines", () => {
    expect(deriveFlatDamageReductions(aggregateWith({}), 2, true)).toEqual([]);
  });
});
