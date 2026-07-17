/**
 * A3 — S6 alternate-cost wirings: the alternate-payment picker
 * (`getActionCostOptions` → CastLevelModal sibling) and the rail alt-recovery
 * affordance (`resolveAltRecovery` → `recoverTrackerByAltCost`). Pins the two
 * previously-dark resolvers now have a real consumer:
 *  - `getActionCostOptions` enumerates ≥ 2 payments for a Wild Companion (Wild
 *    Shape use OR a spell slot) — the picker opens when tapped;
 *  - `recoverTrackerByAltCost` restores ONE exhausted use of a tracker carrying
 *    an `altRecoveryCost` by paying its pool cost, with an undo that restores both.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { resolveActions, getActionCostOptions } from "@/lib/smart-tracker";
import { useCharacterStore } from "@/stores/characterStore";
import { buildScenario } from "@/lib/dev-scenarios";
import type { AbilityCode } from "@/data/types";

const FONT = "sorcerer-font-of-magic";
const INNATE = "sorcerer-innate-sorcery";

const S: Record<AbilityCode, number> = {
  STR: 8,
  DEX: 14,
  CON: 14,
  INT: 10,
  WIS: 12,
  CHA: 18,
};

beforeEach(() => {
  useCharacterStore.setState({ character: null, loading: false, error: null });
});

describe("getActionCostOptions — alternate-payment enumeration (Wild Companion)", () => {
  it("a Druid's Wild Companion offers BOTH a Wild Shape use AND a spell slot", () => {
    const doc = buildScenario({
      name: "Faun",
      raceId: "human",
      classId: "druid",
      subclassId: "circle-of-the-land",
      level: 5,
      background: "hermit",
      abilityScores: { ...S, WIS: 18, CHA: 10 },
    });
    const wildCompanion = resolveActions(doc).find((a) => a.alternateCost != null);
    expect(wildCompanion).toBeDefined();
    if (!wildCompanion) throw new Error("no alternate-cost action");
    const options = getActionCostOptions(wildCompanion);
    // Primary (a tracker spend) + the declared alternate (a spell slot).
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0]?.kind).toBe("primary");
    expect(options.some((o) => o.kind === "alternate")).toBe(true);
  });
});

describe("recoverTrackerByAltCost — pay-from-pool recovery (Sorcery Incarnate)", () => {
  // Sorcery Incarnate (Sorcerer L7, base class): re-activate an exhausted
  // Innate Sorcery (2 uses/LR) by paying 2 Sorcery Points from Font of Magic —
  // the shipped cross-feature `tracker-alt-recovery` grant.
  function mountSorcerer(overrides: Record<string, { used: number }>): void {
    const doc = buildScenario({
      name: "Vyrm",
      raceId: "dragonborn",
      classId: "sorcerer",
      subclassId: "draconic-sorcery",
      level: 14,
      background: "noble",
      abilityScores: S,
      sessionTrackers: overrides,
    });
    useCharacterStore.setState({ character: doc, loading: false, error: null });
  }
  const used = (id: string): number =>
    useCharacterStore.getState().character?.session.trackers[id]?.used ?? 0;

  it("restores ONE use of the target + spends the pool; undo restores both", () => {
    // Innate Sorcery (2 uses) exhausted; Font of Magic fully available.
    mountSorcerer({ [INNATE]: { used: 2 }, [FONT]: { used: 0 } });
    const restore = useCharacterStore.getState().recoverTrackerByAltCost(INNATE, FONT, 2);
    expect(restore).not.toBeNull();
    expect(used(INNATE)).toBe(1); // one use back
    expect(used(FONT)).toBe(2); // paid 2 from the pool

    restore?.();
    expect(used(INNATE)).toBe(2);
    expect(used(FONT)).toBe(0);
  });

  it("is a no-op (returns null) when the pool can't afford the cost", () => {
    // 14 Sorcery Points total; spend 13 → only 1 left, can't afford 2.
    mountSorcerer({ [INNATE]: { used: 2 }, [FONT]: { used: 13 } });
    const restore = useCharacterStore.getState().recoverTrackerByAltCost(INNATE, FONT, 2);
    expect(restore).toBeNull();
    expect(used(INNATE)).toBe(2);
    expect(used(FONT)).toBe(13);
  });

  it("is a no-op when the target still has uses left", () => {
    mountSorcerer({ [INNATE]: { used: 0 }, [FONT]: { used: 0 } });
    const restore = useCharacterStore.getState().recoverTrackerByAltCost(INNATE, FONT, 2);
    expect(restore).toBeNull();
    expect(used(FONT)).toBe(0);
  });
});

// ─── Slot-funded alt-recovery commit (Cleric Divine Foreknowledge level 6+) ───
// The only shipped slot-funded `altRecoveryCost` sources (Cleric Knowledge
// Divine Foreknowledge, Ranger Persistent Wrath) are PACK content —
// `recoverTrackerByMinSlot` is exercised in
// content-pack/tests/unit/s6-alt-cost.pack.test.tsx.
