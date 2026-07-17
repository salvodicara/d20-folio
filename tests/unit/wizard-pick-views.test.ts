/**
 * Wizard F pick presenters — `feat-pick-view` (the read-then-choose feat list
 * VMs: RAW-illegal entries FILTERED, expert scan line derived from the SRD
 * markdown, localized half-feat clause) and `spell-pick-view` (the
 * read-then-Learn spell list VMs: class/level/exclusion pool filters, stable
 * school/casting-time tokens for the edge `t`).
 */
import { describe, expect, it } from "vitest";
import { asProficiencyToken as tok } from "@/lib/proficiency-tokens";
import {
  featPickVM,
  featPickCategories,
  offeredFeatVMs,
  originFeatVMs,
} from "@/lib/views/feat-pick-view";
import { learnableSpellVMs, spellPickVM } from "@/lib/views/spell-pick-view";
import { SRD_FEATS } from "@/data/feats";
import { spells as allSpells } from "@/data/spells";
import { localizeSrd } from "@/i18n/resolver";
import type { FeatGateCtx } from "@/lib/feat-prereq";

const GATE_L4_FIGHTER: FeatGateCtx = {
  level: 4,
  abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 10 },
  armorTraining: [
    tok("light-armor"),
    tok("medium-armor"),
    tok("heavy-armor"),
    tok("shields"),
  ],
  hasSpellcasting: false,
  hasFightingStyleFeature: true,
};

describe("offeredFeatVMs — RAW-illegal entries are FILTERED, not greyed", () => {
  const offered = offeredFeatVMs(GATE_L4_FIGHTER, new Set(), "en");
  const ids = offered.map((f) => f.id);

  it("excludes the redundant ability-score-improvement pseudo-feat", () => {
    expect(ids).not.toContain("ability-score-improvement");
  });

  it("hides Epic Boons below level 19, offers them at 19+", () => {
    expect(offered.some((f) => f.category === "epic-boon")).toBe(false);
    const epicGate = { ...GATE_L4_FIGHTER, level: 19 };
    expect(
      offeredFeatVMs(epicGate, new Set(), "en").some((f) => f.category === "epic-boon")
    ).toBe(true);
  });

  it("filters feats whose 2024 prerequisite is unmet (no spellcasting → no caster feats)", () => {
    const casterOnly = SRD_FEATS.filter((f) => f.prereq?.spellcasting);
    if (casterOnly.length > 0) {
      for (const f of casterOnly) expect(ids).not.toContain(f.id);
    }
  });

  it("filters an already-taken non-repeatable feat, keeps repeatable ones", () => {
    const nonRepeatable = offered.find((f) => !f.entry.repeatable);
    expect(nonRepeatable).toBeDefined();
    if (!nonRepeatable) return;
    const after = offeredFeatVMs(GATE_L4_FIGHTER, new Set([nonRepeatable.id]), "en");
    expect(after.some((f) => f.id === nonRepeatable.id)).toBe(false);
  });

  it("offers fighting styles only with the feature", () => {
    expect(offered.some((f) => f.category === "fighting-style")).toBe(true);
    const noStyle = { ...GATE_L4_FIGHTER, hasFightingStyleFeature: false };
    expect(
      offeredFeatVMs(noStyle, new Set(), "en").some(
        (f) => f.category === "fighting-style"
      )
    ).toBe(false);
  });
});

describe("featPickVM — derived display facts", () => {
  it("derives the expert scan line from the feat's OWN benefit headings", () => {
    const alert = SRD_FEATS.find((f) => f.id === "alert");
    expect(alert).toBeDefined();
    if (!alert) return;
    const vm = featPickVM(alert, "en");
    expect(vm.summary).toMatch(/·/); // joined headings
    expect(vm.summary).not.toMatch(/\*\*/); // markdown stripped
  });

  it("carries the localized half-feat clause (and null for non-half-feats)", () => {
    const feyTouched = SRD_FEATS.find((f) => f.id === "fey-touched");
    const alert = SRD_FEATS.find((f) => f.id === "alert");
    if (feyTouched) {
      expect(featPickVM(feyTouched, "en").halfFeat).toMatch(/^\+1 /);
      // IT half-feat clause uses the IT ability abbreviations (SAG, not WIS).
      const it_ = featPickVM(feyTouched, "it").halfFeat;
      expect(it_).toMatch(/SAG|INT|CAR/);
    }
    if (alert) expect(featPickVM(alert, "en").halfFeat).toBeNull();
  });

  it("search text pairs the localized name with the EN anchor", () => {
    const alert = SRD_FEATS.find((f) => f.id === "alert");
    if (!alert) return;
    const vm = featPickVM(alert, "it");
    expect(vm.searchText.toLowerCase()).toContain("alert");
  });

  it("searchDesc (tier 2, fb4) pairs the LOCALIZED description with the EN twin, markdown flattened", () => {
    const alert = SRD_FEATS.find((f) => f.id === "alert");
    expect(alert).toBeDefined();
    if (!alert) return;
    const flat = (s: string) => s.replace(/\*+/g, " ");
    const en = flat(localizeSrd("feat", "alert", "description", "en"));
    const it_ = flat(localizeSrd("feat", "alert", "description", "it"));
    const vmIt = featPickVM(alert, "it");
    expect(vmIt.searchDesc).toContain(en.slice(0, 24)); // EN query finds it
    expect(vmIt.searchDesc).toContain(it_.slice(0, 24)); // IT query finds it
    expect(vmIt.searchDesc).not.toContain("**"); // markdown never breaks a phrase
    // EN locale carries no duplicated twin — one corpus.
    expect(featPickVM(alert, "en").searchDesc).toBe(en);
  });

  it("originFeatVMs offers exactly the origin category", () => {
    const origins = originFeatVMs("en");
    expect(origins.length).toBeGreaterThan(0);
    expect(origins.every((f) => f.category === "origin")).toBe(true);
    expect(featPickCategories(origins)).toEqual(["origin"]);
  });
});

describe("learnableSpellVMs — pool filters + stable tokens", () => {
  it("cantripsOnly returns exactly the class's level-0 list", () => {
    const pool = learnableSpellVMs(
      { classId: "wizard", cantripsOnly: true, maxLevel: 0, exclude: new Set() },
      "en"
    );
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((s) => s.level === 0)).toBe(true);
    expect(pool.every((s) => s.entry.classes.includes("wizard"))).toBe(true);
  });

  it("leveled pool caps at maxLevel and excludes owned spells", () => {
    const all = learnableSpellVMs(
      { classId: "bard", cantripsOnly: false, maxLevel: 2, exclude: new Set() },
      "en"
    );
    expect(all.every((s) => s.level >= 1 && s.level <= 2)).toBe(true);
    const first = all[0];
    expect(first).toBeDefined();
    if (!first) return;
    const without = learnableSpellVMs(
      { classId: "bard", cantripsOnly: false, maxLevel: 2, exclude: new Set([first.id]) },
      "en"
    );
    expect(without.some((s) => s.id === first.id)).toBe(false);
  });

  it("allowedLists widens to the Magical Secrets union (bard∪cleric∪druid∪wizard) but NOT off-union lists", () => {
    const bardOnly = learnableSpellVMs(
      { classId: "bard", cantripsOnly: false, maxLevel: 5, exclude: new Set() },
      "en"
    );
    const widened = learnableSpellVMs(
      {
        classId: "bard",
        allowedLists: new Set(["bard", "cleric", "druid", "wizard"]),
        cantripsOnly: false,
        maxLevel: 5,
        exclude: new Set(),
      },
      "en"
    );
    const widenedIds = new Set(widened.map((s) => s.id));
    expect(widened.length).toBeGreaterThan(bardOnly.length);
    // The union pulls in cleric-only / wizard-only / druid-only spells …
    expect(widenedIds.has("guiding-bolt")).toBe(true); // cleric-only L1
    expect(widenedIds.has("find-familiar")).toBe(true); // wizard-only L1
    expect(widenedIds.has("moonbeam")).toBe(true); // druid-only L2
    // … but NEVER an off-union (warlock-only) spell — RAW is the four lists only.
    expect(widenedIds.has("hex")).toBe(false); // warlock-only L1
  });

  it("absent allowedLists keeps the single-class gate (default behavior)", () => {
    const pool = learnableSpellVMs(
      { classId: "bard", cantripsOnly: false, maxLevel: 5, exclude: new Set() },
      "en"
    );
    const ids = new Set(pool.map((s) => s.id));
    expect(ids.has("guiding-bolt")).toBe(false); // cleric-only — not on the bard list
    expect(pool.every((s) => s.entry.classes.includes("bard"))).toBe(true);
  });

  it("spell searchDesc (tier 2, fb4) pairs the LOCALIZED description with the EN twin, lazily", () => {
    const fireball = allSpells.find((s) => s.id === "fireball");
    expect(fireball).toBeDefined();
    if (!fireball) return;
    const flat = (s: string) => s.replace(/\*+/g, " ");
    const en = flat(localizeSrd("spell", "fireball", "description", "en"));
    const it_ = flat(localizeSrd("spell", "fireball", "description", "it"));
    const vmIt = spellPickVM(fireball, "it");
    expect(vmIt.searchDesc).toContain(en.slice(0, 24));
    expect(vmIt.searchDesc).toContain(it_.slice(0, 24));
    expect(spellPickVM(fireball, "en").searchDesc).toBe(en);
  });

  it("VMs carry stable school + casting-time tokens (the edge localizes)", () => {
    const fireball = allSpells.find((s) => s.id === "fireball");
    expect(fireball).toBeDefined();
    if (!fireball) return;
    const vm = spellPickVM(fireball, "it");
    expect(vm.school).toBe("evocation"); // stable token, not a label
    expect(vm.castingTimeKey).toBe("action");
    expect(vm.name.length).toBeGreaterThan(0);
  });

  it("VMs expose LOCALIZED range + duration for the reading spread's fact rows", () => {
    const fireBolt = allSpells.find((s) => s.id === "fire-bolt");
    expect(fireBolt).toBeDefined();
    if (!fireBolt) return;
    expect(spellPickVM(fireBolt, "en").range).toBe("120 feet");
    expect(spellPickVM(fireBolt, "en").duration).toBe("Instantaneous");
    // IT resolves through the same catalogue path (never the EN literal).
    expect(spellPickVM(fireBolt, "it").range).toBe(
      localizeSrd("spell", "fire-bolt", "range", "it")
    );
    expect(spellPickVM(fireBolt, "it").duration).toBe(
      localizeSrd("spell", "fire-bolt", "duration", "it")
    );
  });
});
