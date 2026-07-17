/**
 * Level-up presenter (`lib/views/level-up-view.ts`) — resolves the STABLE ids the
 * level-up engine emits (`classId`, `featureId`) into the single LOCALIZED
 * interpolation arg each i18n template expects (`class`, `feature`), at render.
 * Proves the §3.3 reverse-leak fix: the engine no longer forces `name.en` +
 * `name.it` into args; the view picks ONE localized name. Fast-lane (jsdom-free).
 *
 * Slice 4 (R6+R3) adds coverage for the full per-step presenter: every picker VM
 * builder resolves a STABLE id to the LOCALIZED label via the catalogue (EN ≠ IT),
 * raw numbers stay raw, and the multiclass advancement-context + source label read
 * the advancing class. The single seam every level-up surface localizes through.
 */
import { describe, it, expect } from "vitest";
import { srd } from "../_harness/loc";
import {
  levelUpChangeArgs,
  levelUpChangeSource,
  subclassOptions,
  subclassReveal,
  subclassName,
  featName,
  spellName,
  abilityLabel,
  abilityCodes,
  featPrerequisite,
  fightingStyleOptions,
  weaponMasteryOptions,
  metamagicOptions,
  invocationOptions,
  spellPickOptions,
  featureCardsFromChange,
  advancementContext,
} from "@/lib/views/level-up-view";
import { getClassTable, classFeatureIndex } from "@/data/classes";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";

const LOCALES: Locale[] = ["en", "it"];

describe("levelUpChangeArgs", () => {
  it("returns undefined when the change has no args", () => {
    expect(levelUpChangeArgs({}, "en")).toBeUndefined();
    expect(levelUpChangeArgs({ i18nArgs: undefined }, "en")).toBeUndefined();
  });

  it("resolves classId → the localized class name under `class` (EN + IT)", () => {
    const bard = getClassTable("bard");
    expect(bard).toBeDefined();
    expect(levelUpChangeArgs({ i18nArgs: { classId: "bard" } }, "en")).toEqual({
      class: srd("class", bard?.id ?? "", "name", "en"),
    });
    expect(levelUpChangeArgs({ i18nArgs: { classId: "bard" } }, "it")).toEqual({
      class: srd("class", bard?.id ?? "", "name", "it"),
    });
  });

  it("resolves featureId → the localized feature name under `feature`, passing other args through", () => {
    const feat = classFeatureIndex.get("bard-bardic-inspiration");
    expect(feat).toBeDefined();
    expect(
      levelUpChangeArgs(
        { i18nArgs: { featureId: "bard-bardic-inspiration", from: "d6", to: "d8" } },
        "it"
      )
    ).toEqual({
      feature: srd("class-feature", feat?.id ?? "", "name", "it"),
      from: "d6",
      to: "d8",
    });
  });

  it("falls back to a humanized id when the id is unknown (no English leak into IT)", () => {
    expect(levelUpChangeArgs({ i18nArgs: { classId: "made-up-class" } }, "it")).toEqual({
      class: "Made Up Class",
    });
  });

  it("passes non-id args through unchanged", () => {
    expect(levelUpChangeArgs({ i18nArgs: { count: 3, dice: 5 } }, "en")).toEqual({
      count: 3,
      dice: 5,
    });
  });
});

// ── R4 source attribution + advancement context (multiclass) ──────────────────

describe("levelUpChangeSource", () => {
  it("returns undefined for a total-level event (no source class)", () => {
    expect(levelUpChangeSource({}, "en")).toBeUndefined();
  });

  it("labels a class-scoped change with the LOCALIZED class name + level", () => {
    const wizard = getClassTable("wizard");
    expect(
      levelUpChangeSource({ sourceClassId: "wizard", sourceClassLevel: 5 }, "en")
    ).toBe(`${srd("class", wizard?.id ?? "", "name", "en")} 5`);
    expect(
      levelUpChangeSource({ sourceClassId: "wizard", sourceClassLevel: 5 }, "it")
    ).toBe(`${srd("class", wizard?.id ?? "", "name", "it")} 5`);
  });

  it("omits the level when no class level is given", () => {
    const bard = getClassTable("bard");
    expect(levelUpChangeSource({ sourceClassId: "bard" }, "en")).toBe(
      srd("class", bard?.id ?? "", "name", "en")
    );
  });
});

describe("advancementContext (multiclass-aware)", () => {
  it("resolves the advancing class to its localized name + raw class level", () => {
    // The multiclass mock advances Wizard 2 → 3; the context labels Wizard, raw 3.
    for (const locale of LOCALES) {
      const ctx = advancementContext("wizard", 3, locale);
      expect(ctx.classId).toBe("wizard");
      expect(ctx.classLevel).toBe(3); // raw number, never formatted here
      expect(ctx.className).toBe(localizeSrd("class", "wizard", "name", locale));
    }
    expect(advancementContext("wizard", 3, "en").className).not.toBe(
      advancementContext("wizard", 3, "it").className
    );
  });
});

// ── name accessors resolve the id → ONE localized string (EN ≠ IT) ────────────

describe("name accessors", () => {
  it.each([
    ["subclassName", subclassName, "subclass", "evoker"],
    ["featName", featName, "feat", "alert"],
    ["spellName", spellName, "spell", "fireball"],
  ] as const)("%s resolves the id via the catalogue, EN ≠ IT", (_n, fn, kind, id) => {
    for (const locale of LOCALES) {
      expect(fn(id, locale)).toBe(localizeSrd(kind, id, "name", locale));
    }
    expect(fn(id, "en")).not.toBe(fn(id, "it"));
  });
});

// ── ASI ability tiles ─────────────────────────────────────────────────────────

describe("ability tiles", () => {
  it("exposes the six ability codes in canonical order", () => {
    expect(abilityCodes()).toEqual(["STR", "DEX", "CON", "INT", "WIS", "CHA"]);
  });

  it("localizes the tile abbreviation (CHA → CAR in IT)", () => {
    expect(abilityLabel("CHA", "en")).toBe("CHA");
    expect(abilityLabel("CHA", "it")).toBe("CAR");
    expect(abilityLabel("WIS", "it")).toBe("SAG");
  });
});

// ── feat prerequisite (optional field, hasSrd-gated) ──────────────────────────

describe("featPrerequisite", () => {
  it("returns the localized prerequisite when the feat has one", () => {
    // Level-gated feats (e.g. Ability Score Improvement: 'Level 4+') carry a
    // prerequisite.
    const en = featPrerequisite("ability-score-improvement", "en");
    const it = featPrerequisite("ability-score-improvement", "it");
    expect(en).toBeTruthy();
    expect(it).toBeTruthy();
    expect(en).not.toBe(it);
  });

  it("returns undefined (never throws) for a feat with no prerequisite", () => {
    // Alert has no prerequisite — the optional field is absent; hasSrd gates it.
    expect(featPrerequisite("alert", "en")).toBeUndefined();
  });
});

// ── picker VM builders: stable-id identity + localized labels ──────────────────

describe("subclassOptions", () => {
  it("builds one VM per subclass with localized label + EN anchor + gloss", () => {
    const wizardEn = subclassOptions("wizard", "en");
    const wizardIt = subclassOptions("wizard", "it");
    expect(wizardEn.length).toBeGreaterThan(0);
    expect(wizardEn.length).toBe(wizardIt.length);
    const evokerEn = wizardEn.find((o) => o.id === "evoker");
    const evokerIt = wizardIt.find((o) => o.id === "evoker");
    expect(evokerEn?.label).toBe(localizeSrd("subclass", "evoker", "name", "en"));
    expect(evokerIt?.label).toBe(localizeSrd("subclass", "evoker", "name", "it"));
    expect(evokerEn?.searchEn).toBe(localizeSrd("subclass", "evoker", "name", "en"));
    // gloss = first feature's localized description (non-empty for Evoker).
    expect(evokerEn?.meta).toBeTruthy();
  });

  it("returns [] for an unknown class id (never throws)", () => {
    expect(subclassOptions("made-up", "en")).toEqual([]);
  });
});

describe("subclassReveal", () => {
  it("lists the subclass's unlock-level features with localized name + prose", () => {
    const en = subclassReveal("paladin", "oath-of-devotion", 3, "en");
    const it = subclassReveal("paladin", "oath-of-devotion", 3, "it");
    expect(en.features.length).toBeGreaterThan(0);
    expect(en.features.length).toBe(it.features.length);
    for (const f of en.features) {
      expect(f.name).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(f.name).toBe(localizeSrd("class-feature", f.id, "name", "en"));
    }
    // Only the CHOSEN subclass's rows — never a sibling oath's.
    const vengeance = subclassReveal("paladin", "oath-of-vengeance", 3, "en");
    const ids = new Set(en.features.map((f) => f.id));
    expect(vengeance.features.some((f) => ids.has(f.id))).toBe(false);
  });

  it("collects always-prepared bonus spells THROUGH the level, localized", () => {
    const en = subclassReveal("paladin", "oath-of-devotion", 3, "en");
    expect(en.spells).toContain(localizeSrd("spell", "shield-of-faith", "name", "en"));
    const it = subclassReveal("paladin", "oath-of-devotion", 3, "it");
    expect(it.spells).toContain(localizeSrd("spell", "shield-of-faith", "name", "it"));
    // A subclass with no expanded-spell map reveals features only.
    const champion = subclassReveal("fighter", "champion", 3, "en");
    expect(champion.spells).toEqual([]);
    expect(champion.features.length).toBeGreaterThan(0);
  });
});

describe("multi-pick option builders", () => {
  it("metamagicOptions carries raw cost + flags already-known as disabled", () => {
    const known = new Set(["careful-spell"]);
    const vms = metamagicOptions(known, "TAKEN", "en");
    const careful = vms.find((v) => v.id === "careful-spell");
    expect(careful?.disabled).toBe(true);
    expect(careful?.note).toBe("TAKEN");
    expect(typeof careful?.cost).toBe("number"); // raw number, formatted at edge
    const other = vms.find((v) => !known.has(v.id));
    expect(other?.disabled).toBeFalsy();
    // localized: EN ≠ IT label
    expect(
      metamagicOptions(known, "TAKEN", "it").find((v) => v.id === "careful-spell")?.label
    ).not.toBe(careful?.label);
  });

  it("invocationOptions excludes already-known + prefixes the prerequisite label", () => {
    const all = invocationOptions(5, [], "PRE:", "en");
    const first = all[0];
    expect(first).toBeDefined();
    if (!first) return;
    const filtered = invocationOptions(5, [first.id], "PRE:", "en");
    expect(filtered.some((v) => v.id === first.id)).toBe(false);
    // any option WITH a prerequisite renders behind the localized label.
    const withPre = all.find((v) => v.note);
    if (withPre) expect(withPre.note?.startsWith("PRE:")).toBe(true);
  });

  // (The maneuverOptions pin — maneuvers are pack content — lives in
  // `content-pack/tests/unit/level-up-view.pack.test.ts`.)

  it("weaponMasteryOptions labels the weapon + notes the mastery keyword", () => {
    const vms = weaponMasteryOptions("en");
    expect(vms.length).toBeGreaterThan(0);
    const longsword = vms.find((v) => v.id === "longsword");
    expect(longsword?.label).toBe(localizeSrd("equipment", "longsword", "name", "en"));
    expect(longsword?.note).toBeTruthy(); // mastery property keyword (raw, stable)
  });

  it("fightingStyleOptions flags an owned style disabled with the localized note", () => {
    const all = fightingStyleOptions([], "OWNED", "en");
    const first = all[0];
    expect(first).toBeDefined();
    if (!first) return;
    const styleId = first.id;
    const withOwned = fightingStyleOptions([{ srdId: styleId }], "OWNED", "en");
    const owned = withOwned.find((v) => v.id === styleId);
    expect(owned?.disabled).toBe(true);
    expect(owned?.note).toBe("OWNED");
  });

  // (The CASTER-style pins — Blessed/Druidic Warrior are pack fighting
  // styles — live in `content-pack/tests/unit/level-up-view.pack.test.ts`.
  // The negative half stays public: a Fighter — and a class-agnostic call —
  // never sees a caster style, in either composition.)
  it("a non-caster-style class and a class-agnostic call see NO caster style", () => {
    const fighter = fightingStyleOptions([], "OWNED", "en", "fighter").map((v) => v.id);
    expect(fighter).not.toContain("blessed-warrior");
    expect(fighter).not.toContain("druidic-warrior");
    const agnostic = fightingStyleOptions([], "OWNED", "en").map((v) => v.id);
    expect(agnostic).not.toContain("blessed-warrior");
    expect(agnostic).not.toContain("druidic-warrior");
  });
});

describe("spellPickOptions (spell mastery / signature)", () => {
  it("maps eligible {id} spells to localized label VMs (EN ≠ IT)", () => {
    const en = spellPickOptions([{ id: "fireball" }], "en");
    const it = spellPickOptions([{ id: "fireball" }], "it");
    expect(en[0]?.id).toBe("fireball");
    expect(en[0]?.label).toBe(localizeSrd("spell", "fireball", "name", "en"));
    expect(en[0]?.label).not.toBe(it[0]?.label);
  });
});

// ── new-feature preview cards (feature IDS → localized cards, no name round-trip) ─

describe("featureCardsFromChange", () => {
  it("localizes each feature id to its card (no display-name round-trip)", () => {
    expect(classFeatureIndex.get("bard-bardic-inspiration")).toBeDefined();
    const change = { featureIds: ["bard-bardic-inspiration"] };
    const en = featureCardsFromChange(change, false, "en");
    const it = featureCardsFromChange(change, false, "it");
    expect(en[0]?.id).toBe("bard-bardic-inspiration");
    expect(en[0]?.name).toBe(
      localizeSrd("class-feature", "bard-bardic-inspiration", "name", "en")
    );
    expect(en[0]?.name).not.toBe(it[0]?.name);
  });

  it("returns every id independently — no ', '-splitting of names (the old round-trip dropped a feature whose localized name contained a comma)", () => {
    const asi = [...classFeatureIndex.values()].find((f) => f.id.endsWith("-asi"));
    expect(asi).toBeDefined();
    if (!asi) return;
    const ids = ["bard-bardic-inspiration", asi.id];
    const cards = featureCardsFromChange({ featureIds: ids }, false, "en");
    expect(cards.map((c) => c.id)).toEqual(ids);
  });

  it("drops `-asi` feature cards when hideAsi is set", () => {
    const asi = [...classFeatureIndex.values()].find((f) => f.id.endsWith("-asi"));
    expect(asi).toBeDefined();
    if (!asi) return;
    const change = { featureIds: [asi.id] };
    expect(featureCardsFromChange(change, true, "en")).toEqual([]);
    expect(featureCardsFromChange(change, false, "en").length).toBeGreaterThan(0);
  });

  it("yields no cards when the change carries no featureIds", () => {
    expect(featureCardsFromChange({}, false, "en")).toEqual([]);
  });
});
