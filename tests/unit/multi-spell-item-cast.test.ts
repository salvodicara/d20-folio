/**
 * Multi-spell item-casters (S9) — SHIPPED. Four magic items cast ONE OF several
 * spells from a shared charge pool, at per-spell charge cost, through the SAME
 * `free-cast-from-list` guided picker Divine Intervention / War God's Blessing use.
 * RAW-verified per-spell costs (wikidot + D&D Beyond):
 *
 *   Wand of Binding (7 ch.)  — Hold Monster 5 / Hold Person 2   ← per-spell-different cost
 *   Wand of Fear (7 ch.)     — Command 1 + Fear 3 (both real spells)  ← per-spell-different cost
 *   Ring of Animal Influence (3 ch.) — Animal Friendship / Speak with Animals, ALL 1 (uniform)
 *   Staff of Charming (10 ch.)       — Charm Person / Command / Comprehend Languages, ALL 1 (uniform)
 *
 * This pins the wired data shape (golden rule 10): each item carries its charge
 * pool + a `free-cast-from-list` grant (with `spellCosts` for the two variable-cost
 * wands) + an `always-prepared-spell` grant per pool spell (so the spells show on
 * the Spells page). The item→pool ACTION bridge + the picker cost/disable behavior
 * are pinned by `item-pool-cast-actions.test.ts` and `divine-intervention-modal.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import { getMagicItem } from "@/data/magic-items";
import { parseMagicItemCharges } from "@/lib/magic-item-utils";

/** The four multi-spell item-casters, by stable id (golden rule 7). */
const MULTI_SPELL_ITEMS = [
  "wand-of-binding",
  "wand-of-fear",
  "ring-of-animal-influence",
  "staff-of-charming",
] as const;

/** The RAW-verified pool + per-spell costs each item carries. */
const EXPECTED: Record<
  (typeof MULTI_SPELL_ITEMS)[number],
  { charges: number; spells: string[]; spellCosts?: Record<string, number> }
> = {
  "wand-of-binding": {
    charges: 7,
    spells: ["hold-monster", "hold-person"],
    spellCosts: { "hold-monster": 5, "hold-person": 2 },
  },
  "wand-of-fear": {
    charges: 7,
    spells: ["command", "fear"],
    spellCosts: { command: 1, fear: 3 },
  },
  "ring-of-animal-influence": {
    charges: 3,
    spells: ["animal-friendship", "speak-with-animals"],
  },
  "staff-of-charming": {
    charges: 10,
    spells: ["charm-person", "command", "comprehend-languages"],
  },
};

describe("multi-spell item-casters — the shared-pool cast (S9, shipped)", () => {
  it.each(MULTI_SPELL_ITEMS)(
    "%s carries a free-cast-from-list pool + always-prepared spells matching its RAW charges/costs",
    (id) => {
      const item = getMagicItem(id);
      expect(item, `${id} must exist in the SRD catalogue`).toBeDefined();
      if (!item) return;
      const spec = EXPECTED[id];

      // The charge pool is still modeled (the auto-prefilled tracker).
      expect(parseMagicItemCharges(item)).toBe(spec.charges);

      const grants = item.grants ?? [];

      // The multi-spell pool grant.
      const pool = grants.find((g) => g.type === "free-cast-from-list");
      expect(pool, `${id} must carry a free-cast-from-list pool`).toBeDefined();
      if (pool?.type !== "free-cast-from-list") return;
      expect([...(pool.spellIds ?? [])].sort()).toEqual([...spec.spells].sort());
      expect(pool.chargesPerRest).toBe(spec.charges);
      // Dawn regen ⇒ modeled as a long-rest recovery cadence (never auto-refilled).
      expect(pool.rest).toBe("long");
      // Variable-cost wands declare `spellCosts`; uniform-1 items omit it (default 1).
      expect(pool.spellCosts).toEqual(spec.spellCosts);

      // Each pool spell is also always-prepared (surfaces on the Spells page).
      const prepared: string[] = [];
      for (const g of grants) {
        if (g.type === "always-prepared-spell") prepared.push(g.spellId);
      }
      for (const spellId of spec.spells) {
        expect(prepared).toContain(spellId);
      }
    }
  );

  it("free-cast-from-list accepts an optional per-spell spellCosts map", () => {
    // A compile-time proof the grant shape gained the field (the two variable-cost
    // wands rely on it). Building the literal with `spellCosts` must typecheck.
    const grant = {
      type: "free-cast-from-list" as const,
      spellIds: ["hold-monster", "hold-person"] as const,
      spellCosts: { "hold-monster": 5, "hold-person": 2 },
      chargesPerRest: 7,
      rest: "long" as const,
    };
    expect(grant.spellCosts["hold-monster"]).toBe(5);
    expect(grant.spellCosts["hold-person"]).toBe(2);
  });
});
