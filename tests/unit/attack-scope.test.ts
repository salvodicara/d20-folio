/**
 * attack-scope — the single, pure decision of single- vs multi-target capture
 * (auto-narrated combat, Phases 2 + 3).
 *
 * Two shape signals drive it: `summary.instances > 1` (Magic Missile's darts, Scorching
 * Ray's rays — a multi-select attack capped at that count, Phase 2), and `summary.area`
 * (a Fireball-class burst — an UNBOUNDED multi-select SAVE declaration, Phase 3). The
 * `area` flag is what finally distinguishes an AoE save-spell (Fireball) from a
 * single-target save cantrip (Sacred Flame): both are `saveAbility` + `damage`, but only
 * the area one opens a multi-target save capture. Every other single-target action — a
 * weapon swing, a single-instance/save cantrip — stays single.
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
  isSaveDeclaration,
  actionRiderConditions,
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

  it("a single-target save cantrip is single-target (no instances/area → cap 1)", () => {
    // Sacred Flame's shape: a save + damage, NO instances, NO area.
    expect(attackTargetCap(makeAction("spell", { saveDC: 15, damage: "1d8" }))).toBe(1);
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

  it("an AREA save spell is UNBOUNDED (Fireball class — cap Infinity)", () => {
    expect(
      attackTargetCap(makeAction("spell", { saveDC: 15, damage: "8d6", area: true }))
    ).toBe(Infinity);
  });
});

describe("isSaveDeclaration — the area save-for-half branch (Phase 3)", () => {
  it("an area save spell resolves by a save", () => {
    expect(
      isSaveDeclaration(makeAction("spell", { saveDC: 15, damage: "8d6", area: true }))
    ).toBe(true);
  });

  it("a single-target save cantrip, a multi-instance attack, and a weapon do NOT", () => {
    expect(isSaveDeclaration(makeAction("spell", { saveDC: 15, damage: "1d8" }))).toBe(
      false
    );
    expect(isSaveDeclaration(makeAction("spell", { damage: "2d6", instances: 3 }))).toBe(
      false
    );
    expect(isSaveDeclaration(makeAction("weapon", { damage: "1d8+3" }))).toBe(false);
  });
});

describe("actionRiderConditions — modelled applied-condition riders (Phase 3)", () => {
  it("a Topple-mastery weapon carries the prone rider", () => {
    expect(
      actionRiderConditions(makeAction("weapon", { masteryDetail: { toppleDc: 13 } }))
    ).toEqual(["prone"]);
  });

  it("an action with no modelled condition rider carries none", () => {
    expect(actionRiderConditions(makeAction("weapon", { damage: "1d8+3" }))).toEqual([]);
    expect(
      actionRiderConditions(
        makeAction("spell", { saveDC: 15, damage: "8d6", area: true })
      )
    ).toEqual([]);
  });
});

describe("shouldDeclareAttack — which commits open the declaration banner", () => {
  it("a weapon swing opens it (Phase 1)", () => {
    expect(shouldDeclareAttack(makeAction("weapon", { damage: "1d8" }))).toBe(true);
  });

  it("a multi-target action opens it (Phase 2)", () => {
    expect(shouldDeclareAttack(makeAction("spell", { instances: 3 }))).toBe(true);
  });

  it("an area save spell opens it (Phase 3)", () => {
    expect(
      shouldDeclareAttack(makeAction("spell", { saveDC: 15, damage: "8d6", area: true }))
    ).toBe(true);
  });

  it("a single-target NON-weapon action does NOT open it (out of scope)", () => {
    // A single-target save cantrip (no area) stays out of scope.
    expect(shouldDeclareAttack(makeAction("spell", { saveDC: 15, damage: "1d8" }))).toBe(
      false
    );
    expect(shouldDeclareAttack(makeAction("feature", { die: "d6" }))).toBe(false);
  });
});
