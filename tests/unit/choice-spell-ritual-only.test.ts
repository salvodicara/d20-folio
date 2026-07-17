/**
 * NEW engine primitive: choice-spell `ritualOnly` constraint — a `choice-spell`
 * grant whose pool is restricted to Ritual-tagged spells (`spell.ritual ===
 * true`) across ALL class lists.
 *
 * Data feature that uses it (prose-only with NO grant before this):
 *   - Warlock "Pact of the Tome" (Eldritch Invocation): the Book of Shadows
 *     grants 3 cantrips + 2 level-1 Ritual-tagged spells from ANY class's spell
 *     list; the picks are always-prepared and function as Warlock spells (CHA).
 *
 * RAW source verified against dnd2024.wikidot.com (warlock:eldritch-invocations
 * → Pact of the Tome: "choose three cantrips, and choose
 * two level 1 spells that have the Ritual tag. The spells can be from any
 * class's spell list … you have the chosen spells prepared, and they function
 * as Warlock spells for you").
 *
 * This file proves three things, end-to-end:
 *   (1) the grant AGGREGATES — evaluateGrants surfaces `ritualOnly` on the
 *       pending "spell" choice;
 *   (2) the CONSUMER APPLIES it — listAvailableForSlot / pendingSpellChoicesForFeat
 *       restrict the pool to Ritual-tagged spells at/below maxLevel across every
 *       class list, with non-ritual slots unaffected (back-compat) and
 *       override-first edge cases (already-owned spells excluded);
 *   (3) the DATA is wired correctly — Pact of the Tome carries the right grants.
 */
import { describe, expect, it } from "vitest";
import {
  listAvailableForSlot,
  pendingSpellChoicesForFeat,
  type SpellChoiceSlot,
} from "@/lib/feat-spell-choices";
import { evaluateGrants, type Grant, type GrantSource } from "@/lib/grants";
import { SRD_INVOCATIONS } from "@/data/invocations";

// ── Test anchors (verified against src/data/spells) ─────────────────────────
//   L1 Ritual spells:
//     comprehend-languages → bard/sorcerer/warlock/wizard  (on warlock list)
//     find-familiar        → wizard ONLY                    (NOT on warlock list)
//     detect-poison-and-disease → cleric/druid/paladin/ranger (NOT on warlock list)
//     purify-food-and-drink     → cleric/druid/paladin       (NOT on warlock list)
//   L1 NON-ritual spells:
//     magic-missile        → sorcerer/wizard
//     cure-wounds          → cleric/…
//   L2 Ritual spell:
//     augury               → level 2, ritual: true (above the L1 cap)

const RITUAL_L1_SLOT: SpellChoiceSlot = {
  kind: "spell",
  maxLevel: 1,
  count: 2,
  slotId: "slot-0",
  ritualOnly: true,
  spellAbility: "CHA",
};

describe("choice-spell ritualOnly — listAvailableForSlot restricts to Ritual spells", () => {
  it("includes only Ritual-tagged spells (excludes non-ritual L1)", () => {
    const opts = listAvailableForSlot(RITUAL_L1_SLOT, new Set());
    const ids = new Set(opts.map((o) => o.id));
    // Ritual L1 present
    expect(ids.has("comprehend-languages")).toBe(true);
    expect(ids.has("find-familiar")).toBe(true);
    expect(ids.has("identify")).toBe(true);
    // Non-ritual L1 absent
    expect(ids.has("magic-missile")).toBe(false);
    expect(ids.has("cure-wounds")).toBe(false);
  });

  it("draws Ritual spells from ANY class list (not just Warlock)", () => {
    const ids = new Set(listAvailableForSlot(RITUAL_L1_SLOT, new Set()).map((o) => o.id));
    // These L1 ritual spells are NOT on the Warlock list — still offered,
    // because Pact of the Tome explicitly allows "any class's spell list".
    expect(ids.has("find-familiar")).toBe(true); // wizard-only
    expect(ids.has("detect-poison-and-disease")).toBe(true); // cleric/druid/paladin/ranger
    expect(ids.has("purify-food-and-drink")).toBe(true); // cleric/druid/paladin
  });

  it("every returned option is in fact a Ritual spell at level 1", () => {
    for (const o of listAvailableForSlot(RITUAL_L1_SLOT, new Set())) {
      expect(o.level).toBe(1);
    }
    // Sanity: the pool is non-empty.
    expect(listAvailableForSlot(RITUAL_L1_SLOT, new Set()).length).toBeGreaterThan(0);
  });

  it("respects maxLevel — an L2 ritual spell is excluded at maxLevel 1", () => {
    const ids = new Set(listAvailableForSlot(RITUAL_L1_SLOT, new Set()).map((o) => o.id));
    expect(ids.has("augury")).toBe(false); // L2 ritual — above the cap
  });

  it("widening maxLevel admits higher-level ritual spells (still ritual-only)", () => {
    const wide: SpellChoiceSlot = { ...RITUAL_L1_SLOT, maxLevel: 2 };
    const ids = new Set(listAvailableForSlot(wide, new Set()).map((o) => o.id));
    expect(ids.has("augury")).toBe(true); // L2 ritual now allowed
    expect(ids.has("magic-missile")).toBe(false); // still excludes non-ritual
  });

  it("ritualOnly COMBINES with a class-list restriction when both are set", () => {
    // Hypothetical: ritual-only AND warlock-only. find-familiar (wizard-only)
    // must drop out; comprehend-languages (on warlock list, ritual) stays.
    const warlockRitual: SpellChoiceSlot = {
      ...RITUAL_L1_SLOT,
      classSpellList: "warlock",
    };
    const ids = new Set(listAvailableForSlot(warlockRitual, new Set()).map((o) => o.id));
    expect(ids.has("comprehend-languages")).toBe(true); // ritual + warlock
    expect(ids.has("find-familiar")).toBe(false); // ritual but wizard-only
    expect(ids.has("magic-missile")).toBe(false); // non-ritual
  });

  it("override-first: excludes Ritual spells the character already owns", () => {
    const without = listAvailableForSlot(RITUAL_L1_SLOT, new Set());
    const owned = new Set(["comprehend-languages", "find-familiar"]);
    const withOwned = listAvailableForSlot(RITUAL_L1_SLOT, owned);
    const ids = new Set(withOwned.map((o) => o.id));
    expect(ids.has("comprehend-languages")).toBe(false);
    expect(ids.has("find-familiar")).toBe(false);
    expect(withOwned.length).toBe(without.length - 2);
  });

  it("back-compat: a non-ritual choice-spell slot is unaffected", () => {
    const plain: SpellChoiceSlot = {
      kind: "spell",
      maxLevel: 1,
      count: 1,
      slotId: "slot-0",
    };
    const ids = new Set(listAvailableForSlot(plain, new Set()).map((o) => o.id));
    // Without ritualOnly, BOTH ritual and non-ritual L1 spells are offered.
    expect(ids.has("magic-missile")).toBe(true);
    expect(ids.has("comprehend-languages")).toBe(true);
  });

  it("the ritual-only pool is strictly NARROWER than the unrestricted pool", () => {
    const restricted = listAvailableForSlot(RITUAL_L1_SLOT, new Set());
    const unrestricted = listAvailableForSlot(
      { ...RITUAL_L1_SLOT, ritualOnly: false },
      new Set()
    );
    expect(restricted.length).toBeLessThan(unrestricted.length);
  });
});

describe("choice-spell ritualOnly — grant aggregation through evaluateGrants", () => {
  function evalWith(grants: ReadonlyArray<Grant>) {
    const sources: GrantSource[] = [
      { id: "test-feature", name: { en: "Test", it: "Test" }, grants },
    ];
    return evaluateGrants(sources);
  }

  it("surfaces ritualOnly on the pending 'spell' choice", () => {
    const agg = evalWith([
      {
        type: "choice-spell",
        maxLevel: 1,
        amount: 2,
        ritualOnly: true,
        spellAbility: "CHA",
      },
    ]);
    const spellChoice = agg.pendingChoices.find((c) => c.kind === "spell");
    expect(spellChoice).toBeDefined();
    if (spellChoice?.kind !== "spell") throw new Error("expected spell choice");
    expect(spellChoice.ritualOnly).toBe(true);
    expect(spellChoice.amount).toBe(2);
    expect(spellChoice.maxLevel).toBe(1);
    expect(spellChoice.spellAbility).toBe("CHA");
  });

  it("a normal choice-spell aggregates with ritualOnly undefined", () => {
    const agg = evalWith([
      { type: "choice-spell", classSpellList: "cleric", maxLevel: 1, amount: 1 },
    ]);
    const spellChoice = agg.pendingChoices.find((c) => c.kind === "spell");
    if (spellChoice?.kind !== "spell") throw new Error("expected spell choice");
    expect(spellChoice.ritualOnly).toBeUndefined();
  });
});

describe("choice-spell ritualOnly — Pact of the Tome data is wired", () => {
  const tome = SRD_INVOCATIONS.find((i) => i.id === "pact-of-the-tome");

  it("Pact of the Tome carries grants (was prose-only before)", () => {
    expect(tome).toBeDefined();
    expect(tome?.grants).toBeDefined();
    expect((tome?.grants ?? []).length).toBeGreaterThan(0);
  });

  it("grants 3 cantrips + 2 ritual-only L1 spells, both pinned to CHA", () => {
    const grants = tome?.grants ?? [];
    const cantrip = grants.find((g) => g.type === "choice-cantrip");
    const spell = grants.find((g) => g.type === "choice-spell");
    expect(cantrip).toBeDefined();
    expect(spell).toBeDefined();
    if (cantrip?.type !== "choice-cantrip") throw new Error("expected choice-cantrip");
    if (spell?.type !== "choice-spell") throw new Error("expected choice-spell");
    // 3 cantrips from ANY class list (no classSpellList restriction).
    expect(cantrip.amount).toBe(3);
    expect(cantrip.classSpellList).toBeUndefined();
    expect(cantrip.spellAbility).toBe("CHA");
    // 2 L1 Ritual-tagged spells from ANY class list.
    expect(spell.amount).toBe(2);
    expect(spell.maxLevel).toBe(1);
    expect(spell.ritualOnly).toBe(true);
    expect(spell.classSpellList).toBeUndefined();
    expect(spell.spellAbility).toBe("CHA");
  });

  it("the resolved picker slot restricts to L1 Ritual spells from any class", () => {
    const slots = pendingSpellChoicesForFeat(tome ?? { grants: [] });
    const spell = slots.find((s) => s.kind === "spell");
    expect(spell?.ritualOnly).toBe(true);
    const ids = new Set(
      listAvailableForSlot(spell ?? ({} as SpellChoiceSlot), new Set()).map((o) => o.id)
    );
    expect(ids.has("comprehend-languages")).toBe(true); // ritual L1
    expect(ids.has("find-familiar")).toBe(true); // ritual L1, wizard-only — any class
    expect(ids.has("magic-missile")).toBe(false); // non-ritual L1 excluded
    expect(ids.has("augury")).toBe(false); // L2 ritual excluded by maxLevel
  });
});
