/**
 * derivePartyMemberStats — the DM party-overview statblock is computed LIVE from a
 * member's real character doc (single source of truth, golden rule 6).
 *
 * A pure-function unit (smart-test rule 13): assert the recipe against the
 * producing function over `MOCK_CHARACTER` (Lyra Voss, Elf Bard 9), not by mounting
 * the dashboard. The render WIRING is pinned thinly in `party-dashboard.test.tsx`.
 * `@/lib/firebase` is mocked in case the mock pulls it transitively.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  derivePartyMemberStats,
  derivePcLive,
  hydrateMemberDoc,
} from "@/features/campaigns/party-stats";
import { MOCK_CHARACTER } from "@/lib/mock";
import { ALL_ABILITIES } from "@/lib/compute";
import type { CombatState } from "@/types/combat-state";

describe("derivePartyMemberStats", () => {
  it("computes the full glance statblock from the live character doc", () => {
    const stats = derivePartyMemberStats(MOCK_CHARACTER);

    // All six saves, in canonical ability order (the expanded-detail grid).
    expect(stats.saves.map((s) => s.code)).toEqual(ALL_ABILITIES.map((a) => a.code));
    expect(stats.saves.every((s) => Number.isFinite(s.bonus))).toBe(true);

    // At-a-glance vitals are grant-aware positives, read straight from the doc.
    expect(stats.ac).toBeGreaterThan(0);
    expect(stats.maxHp).toBeGreaterThan(0);
    expect(stats.currentHp).toBe(MOCK_CHARACTER.session.hp.current);
    expect(stats.walkingSpeedFt).toBeGreaterThan(0);
    expect(Number.isFinite(stats.passivePerception)).toBe(true);

    // Lyra is an Elf → the species grant surfaces darkvision in the senses list.
    expect(stats.senses.some((s) => s.kind === "darkvision")).toBe(true);

    // Conditions thread through as stable ids (never localized here).
    expect(stats.conditions).toEqual(MOCK_CHARACTER.session.conditions);

    // The initiative BONUS is the engine's (DEX mod + Alert PB + grants − exhaustion),
    // a finite number the encounter's roll-to-total widget adds to the typed d20.
    expect(Number.isFinite(stats.initiativeBonus)).toBe(true);
  });

  it("honors the initiative-bonus override (override-first)", () => {
    // A hand-pinned `initiativeBonusOverride` wins over the computed composition —
    // the SAME override-first rule the cockpit's CombatHeader/ThisTurnTracker apply.
    const doc = {
      ...MOCK_CHARACTER,
      character: { ...MOCK_CHARACTER.character, initiativeBonusOverride: 7 },
    };
    expect(derivePartyMemberStats(doc).initiativeBonus).toBe(7);
  });
});

describe("hydrateMemberDoc — combat/state subdoc is the sole source", () => {
  it("overlays a PRESENT subdoc's WOUNDED trio", () => {
    const wounded: CombatState = {
      hp: { current: 5, temp: 0 },
      conditions: ["prone"],
      initiativeRoll: 13,
      deathSaves: { successes: 0, failures: 1 },
      round: 1,
    };
    const stats = derivePartyMemberStats(hydrateMemberDoc(MOCK_CHARACTER, wounded));
    expect(stats.currentHp).toBe(5);
    expect(stats.maxHp).toBeGreaterThan(5);
    expect(stats.conditions).toEqual(["prone"]);
  });

  it("defaults to full HP when the subdoc is absent (a fresh/undamaged member)", () => {
    const stats = derivePartyMemberStats(hydrateMemberDoc(MOCK_CHARACTER, null));
    expect(stats.currentHp).toBe(stats.maxHp);
  });
});

describe("derivePcLive — initiative TOTAL = roll + bonus (the encounterInit table roll)", () => {
  const bonus = derivePartyMemberStats(MOCK_CHARACTER).initiativeBonus;
  const combat = (over: Partial<CombatState>): CombatState => ({
    hp: { current: 10, temp: 0 },
    conditions: [],
    initiativeRoll: null,
    deathSaves: { successes: 0, failures: 0 },
    round: 1,
    ...over,
  });

  it("derives the total (raw roll + engine bonus) from the passed encounterInit roll", () => {
    const live = derivePcLive(MOCK_CHARACTER, combat({}), 15);
    expect(live.initiative).toBe(15 + bonus); // never the stored value alone
    // The pip surfaces the bonus + the RAW roll separately.
    expect(live.initiativeBonus).toBe(bonus);
    expect(live.initiativeRoll).toBe(15);
  });

  it("IGNORES the subdoc's SOLO initiativeRoll — the encounter roll has ONE home (the campaign table)", () => {
    // A lingering solo roll on the subdoc must never leak into the encounter view:
    // the table says un-rolled, so the PC reads un-rolled (the old cross-fight-stale
    // -roll disease is structurally impossible).
    const live = derivePcLive(MOCK_CHARACTER, combat({ initiativeRoll: 15 }), null);
    expect(live.initiativeRoll).toBeNull();
    expect(live.initiative).toBeNull();
    expect(live.initiativeBonus).toBe(bonus); // the bonus is always live
  });

  it("is null when there is no roll at all", () => {
    expect(derivePcLive(MOCK_CHARACTER, combat({}), null).initiative).toBeNull();
    expect(derivePcLive(MOCK_CHARACTER, null, null).initiative).toBeNull();
  });
});
