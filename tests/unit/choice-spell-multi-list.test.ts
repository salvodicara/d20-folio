/**
 * NEW engine primitive: choice-spell-multi-list — a `choice-spell` grant whose
 * pool is a UNION of class spell lists (`classSpellLists: ClassId[]`), not a
 * single `classSpellList`.
 *
 * Data features that use it (both were prose-only with NO grant before this):
 *   - Bard "Magical Secrets" (L10 base): pick from Bard ∪ Cleric ∪ Druid ∪
 *     Wizard as your Prepared Spells number increases.
 *   - College of Lore "Magical Discoveries" (L6): two always-prepared spells
 *     from Cleric ∪ Druid ∪ Wizard, in any combination.
 *
 * RAW source verified against dnd2024.wikidot.com (bard:main
 * → "Bard, Cleric, Druid, and Wizard spell lists"; bard:college-of-lore
 * → Magical Discoveries "Cleric, Druid, or Wizard").
 *
 * This file proves three things, end-to-end:
 *   (1) the grant AGGREGATES — evaluateGrants surfaces classSpellLists on the
 *       pending "spell" choice;
 *   (2) the CONSUMER APPLIES it — listAvailableForSlot / allowedSpellListsForSlot
 *       offer the union (a spell on ANY listed list qualifies), with the
 *       single-list path still working (back-compat) and override-first edge
 *       cases;
 *   (3) the DATA is wired correctly — both bard features carry the right grant,
 *       and the L6 feature is renamed to "Magical Discoveries" with corrected
 *       (Cleric/Druid/Wizard) prose.
 */
import { describe, expect, it } from "vitest";
import { srd } from "../_harness/loc";
import {
  allowedSpellListsForSlot,
  listAvailableForSlot,
  pendingSpellChoicesForFeat,
  type SpellChoiceSlot,
} from "@/lib/feat-spell-choices";
import { evaluateGrants, type Grant, type GrantSource } from "@/lib/grants";
import { BARD_FEATURES } from "@/data/classes/bard";

// ── Test anchors (verified single-/multi-list spells from src/data/spells) ──
//   entangle           → druid, ranger      (druid in both bard unions)
//   magic-missile      → sorcerer, wizard   (wizard in both unions; sorcerer NOT)
//   bless              → cleric, paladin    (cleric in both unions; paladin NOT)
//   dissonant-whispers → bard ONLY          (in L10 union, NOT in L6 union)
//   hex                → warlock ONLY        (in NEITHER union)
//   hunters-mark       → ranger ONLY         (in NEITHER union)

describe("choice-spell-multi-list — allowedSpellListsForSlot", () => {
  it("returns the union of classSpellList + classSpellLists", () => {
    const allowed = allowedSpellListsForSlot({
      classSpellList: "bard",
      classSpellLists: ["cleric", "druid"],
    });
    expect(allowed).not.toBeNull();
    expect([...(allowed ?? [])].sort()).toEqual(["bard", "cleric", "druid"]);
  });

  it("treats an empty/absent union as 'any list' (null)", () => {
    expect(allowedSpellListsForSlot({})).toBeNull();
    expect(allowedSpellListsForSlot({ classSpellLists: [] })).toBeNull();
  });

  it("single-list still works (back-compat)", () => {
    const allowed = allowedSpellListsForSlot({ classSpellList: "cleric" });
    expect([...(allowed ?? [])]).toEqual(["cleric"]);
  });

  it("de-dupes overlap between the single list and the union", () => {
    const allowed = allowedSpellListsForSlot({
      classSpellList: "wizard",
      classSpellLists: ["wizard", "cleric"],
    });
    expect([...(allowed ?? [])].sort()).toEqual(["cleric", "wizard"]);
  });
});

describe("choice-spell-multi-list — listAvailableForSlot honors the union", () => {
  const loreUnion: SpellChoiceSlot = {
    kind: "spell",
    classSpellLists: ["cleric", "druid", "wizard"],
    maxLevel: 9,
    count: 2,
    slotId: "slot-0",
  };

  it("pulls in spells from EVERY listed list (cross-list picks)", () => {
    const ids = new Set(listAvailableForSlot(loreUnion, new Set()).map((o) => o.id));
    expect(ids.has("bless")).toBe(true); // cleric
    expect(ids.has("entangle")).toBe(true); // druid
    expect(ids.has("magic-missile")).toBe(true); // wizard
  });

  it("excludes spells on NO listed list", () => {
    const ids = new Set(listAvailableForSlot(loreUnion, new Set()).map((o) => o.id));
    expect(ids.has("hex")).toBe(false); // warlock-only
    expect(ids.has("hunters-mark")).toBe(false); // ranger-only
    expect(ids.has("dissonant-whispers")).toBe(false); // bard-only — NOT in Lore union
  });

  it("the L10 base union (incl. bard) DOES offer bard-only spells", () => {
    const baseUnion: SpellChoiceSlot = {
      kind: "spell",
      classSpellLists: ["bard", "cleric", "druid", "wizard"],
      maxLevel: 9,
      count: 1,
      slotId: "slot-0",
    };
    const ids = new Set(listAvailableForSlot(baseUnion, new Set()).map((o) => o.id));
    expect(ids.has("dissonant-whispers")).toBe(true); // bard-only, now allowed
    expect(ids.has("magic-missile")).toBe(true); // wizard pulled in
    expect(ids.has("hex")).toBe(false); // still excludes off-union
  });

  it("respects maxLevel and excludes cantrips for a spell-kind slot", () => {
    const lowSlot: SpellChoiceSlot = { ...loreUnion, maxLevel: 1 };
    for (const o of listAvailableForSlot(lowSlot, new Set())) {
      expect(o.level).toBeGreaterThan(0);
      expect(o.level).toBeLessThanOrEqual(1);
    }
  });

  it("override-first: excludes spells the character already owns", () => {
    const without = listAvailableForSlot(loreUnion, new Set());
    const owned = new Set(["bless", "magic-missile"]);
    const withOwned = listAvailableForSlot(loreUnion, owned);
    const ids = new Set(withOwned.map((o) => o.id));
    expect(ids.has("bless")).toBe(false);
    expect(ids.has("magic-missile")).toBe(false);
    expect(withOwned.length).toBe(without.length - 2);
  });

  it("the union is strictly WIDER than any single member list", () => {
    const druidOnly: SpellChoiceSlot = {
      kind: "spell",
      classSpellList: "druid",
      maxLevel: 9,
      count: 2,
      slotId: "slot-0",
    };
    const union = listAvailableForSlot(loreUnion, new Set());
    const single = listAvailableForSlot(druidOnly, new Set());
    expect(union.length).toBeGreaterThan(single.length);
    // and it includes a wizard spell the druid list omits
    expect(union.some((o) => o.id === "magic-missile")).toBe(true);
    expect(single.some((o) => o.id === "magic-missile")).toBe(false);
  });
});

describe("choice-spell-multi-list — grant aggregation through evaluateGrants", () => {
  function evalWith(grants: ReadonlyArray<Grant>) {
    const sources: GrantSource[] = [
      { id: "test-feature", name: { en: "Test", it: "Test" }, grants },
    ];
    return evaluateGrants(sources);
  }

  it("surfaces classSpellLists on the pending 'spell' choice", () => {
    const agg = evalWith([
      {
        type: "choice-spell",
        classSpellLists: ["cleric", "druid", "wizard"],
        maxLevel: 9,
        amount: 2,
      },
    ]);
    const spellChoice = agg.pendingChoices.find((c) => c.kind === "spell");
    expect(spellChoice).toBeDefined();
    if (spellChoice?.kind !== "spell") throw new Error("expected spell choice");
    expect(spellChoice.classSpellLists).toEqual(["cleric", "druid", "wizard"]);
    expect(spellChoice.amount).toBe(2);
    expect(spellChoice.maxLevel).toBe(9);
  });

  it("a single-list choice-spell still aggregates classSpellList alone", () => {
    const agg = evalWith([
      { type: "choice-spell", classSpellList: "cleric", maxLevel: 1, amount: 1 },
    ]);
    const spellChoice = agg.pendingChoices.find((c) => c.kind === "spell");
    if (spellChoice?.kind !== "spell") throw new Error("expected spell choice");
    expect(spellChoice.classSpellList).toBe("cleric");
    expect(spellChoice.classSpellLists).toBeUndefined();
  });
});

describe("choice-spell-multi-list — bard data is wired", () => {
  const byId = new Map(BARD_FEATURES.map((f) => [f.id, f]));

  it("L10 Magical Secrets carries the union Bard∪Cleric∪Druid∪Wizard (pool-widener, amount:0)", () => {
    const f = byId.get("bard-magical-secrets");
    expect(f).toBeDefined();
    // bard-magical-secrets is a POOL-WIDENER (amount:0) — it expands the
    // prepared-spell pool to Bard∪Cleric∪Druid∪Wizard without granting extra
    // fixed picks. pendingSpellChoicesForFeat intentionally skips amount:0 grants
    // so no picker is surfaced (no "Pick 0 spells" section in the level-up UI).
    const slots = pendingSpellChoicesForFeat(f ?? { grants: [] });
    expect(slots).toHaveLength(0); // no picker for a pool-widener
    // The grant DATA itself must carry the correct classSpellLists.
    const grant = f?.grants?.find((g) => g.type === "choice-spell");
    expect(grant).toBeDefined();
    expect(
      grant?.type === "choice-spell" && [...(grant.classSpellLists ?? [])].sort()
    ).toEqual(["bard", "cleric", "druid", "wizard"]);
  });

  it("L6 Lore feature is renamed 'Magical Discoveries' with corrected prose", () => {
    const f = byId.get("bard-lore-additional-magical-secrets");
    expect(f).toBeDefined();
    expect(srd("class-feature", f?.id ?? "", "name", "en")).toBe("Magical Discoveries");
    expect(srd("class-feature", f?.id ?? "", "name", "it")).toBe("Scoperte Magiche");
    // Prose must no longer claim "any class's spell list".
    expect(
      srd("class-feature", f?.id ?? "", "description", "en").toLowerCase()
    ).not.toContain("any class");
    expect(srd("class-feature", f?.id ?? "", "description", "en")).toContain("Cleric");
    expect(srd("class-feature", f?.id ?? "", "description", "en")).toContain("Druid");
    expect(srd("class-feature", f?.id ?? "", "description", "en")).toContain("Wizard");
  });

  it("L6 Lore feature grants 2 always-prepared picks from Cleric∪Druid∪Wizard", () => {
    const f = byId.get("bard-lore-additional-magical-secrets");
    const slots = pendingSpellChoicesForFeat(f ?? { grants: [] });
    const spell = slots.find((s) => s.kind === "spell");
    expect(spell?.count).toBe(2);
    expect([...(spell?.classSpellLists ?? [])].sort()).toEqual([
      "cleric",
      "druid",
      "wizard",
    ]);
    // And the consumer offers cross-list picks (bard-only spells excluded).
    const ids = new Set(
      listAvailableForSlot(spell ?? ({} as SpellChoiceSlot), new Set()).map((o) => o.id)
    );
    expect(ids.has("magic-missile")).toBe(true); // wizard
    expect(ids.has("bless")).toBe(true); // cleric
    expect(ids.has("dissonant-whispers")).toBe(false); // bard-only
  });
});
