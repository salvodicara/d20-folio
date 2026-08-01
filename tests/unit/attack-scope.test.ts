/**
 * attack-scope — the single, pure decision of single- vs multi-target capture
 * (auto-narrated combat, Phase 2).
 *
 * The multi-target signal is the action's OWN modeled shape: a spell that creates
 * several SEPARATE damage instances (`summary.instances > 1` — Magic Missile's darts,
 * Scorching Ray's rays) can strike that many distinct foes, so its declaration picker
 * is multi-select capped at that count. Every single-target action — a weapon swing, a
 * single-instance spell, an AoE SAVE spell (Fireball carries NO `instances`, so by
 * shape it is indistinguishable from a single-target save cantrip) — stays single.
 *
 * The ENGINE's population of `summary.instances` (3 for Magic Missile / Scorching Ray,
 * ABSENT for Fireball) is proven upstream in `smart-tracker.test.ts` ("Magic Missile
 * carries instances=3…", "a single-roll spell carries NO instances"); here we pin the
 * DECISION that reads it. Blind spot: this suite builds minimal action fixtures rather
 * than resolving the full engine, so it cannot see a regression in that population —
 * that is the smart-tracker suite's job.
 */

import { describe, it, expect } from "vitest";
import {
  attackTargetCap,
  shouldDeclareAttack,
} from "@/features/character/center/attack-scope";
import type { ActionSummary, ResolvedAction } from "@/lib/smart-tracker";

/** A minimal {@link ResolvedAction} carrying only what the scope decision reads
 *  (`source` + `summary`); every other field is a benign default. */
function makeAction(
  source: ResolvedAction["source"],
  summary: ActionSummary
): ResolvedAction {
  return {
    id: `${source}-x`,
    name: source,
    nameLoc: { custom: source },
    type: "action",
    source,
    spellLevel: source === "spell" ? 1 : null,
    concentration: false,
    summary,
    costsSlot: false,
    pinned: false,
    defaultPinned: false,
  };
}

describe("attackTargetCap — the target cap from the action's shape", () => {
  it("a weapon swing is always single-target (cap 1)", () => {
    expect(attackTargetCap(makeAction("weapon", { damage: "1d8+3" }))).toBe(1);
  });

  it("a single-instance spell is single-target (no instances → cap 1)", () => {
    // Fireball's shape: a save + damage, NO instances (proven in smart-tracker.test).
    expect(attackTargetCap(makeAction("spell", { saveDC: 15, damage: "8d6" }))).toBe(1);
  });

  it("a multi-instance spell caps at its instance count (Magic Missile 3, Scorching Ray 3)", () => {
    expect(attackTargetCap(makeAction("spell", { damage: "1d4+1", instances: 3 }))).toBe(
      3
    );
    expect(attackTargetCap(makeAction("spell", { damage: "2d6", instances: 3 }))).toBe(3);
  });

  it("instances of 1 (or 0) is treated as single-target (never < 1)", () => {
    expect(attackTargetCap(makeAction("spell", { instances: 1 }))).toBe(1);
  });
});

describe("shouldDeclareAttack — which commits open the declaration banner", () => {
  it("a weapon swing opens it (Phase 1)", () => {
    expect(shouldDeclareAttack(makeAction("weapon", { damage: "1d8" }))).toBe(true);
  });

  it("a multi-target action opens it (Phase 2)", () => {
    expect(shouldDeclareAttack(makeAction("spell", { instances: 3 }))).toBe(true);
  });

  it("a single-target NON-weapon action does NOT open it (out of scope this phase)", () => {
    expect(shouldDeclareAttack(makeAction("spell", { saveDC: 15, damage: "8d6" }))).toBe(
      false
    );
    expect(shouldDeclareAttack(makeAction("feature", { die: "d6" }))).toBe(false);
  });
});
