/**
 * The incapacitation sweep (live play): a creature that can no longer act loses its
 * Concentration effects and the grapples it holds (2024 Concentration, Grappled).
 * Each device answers for its own combatants; the first look only primes.
 */
import { describe, expect, it } from "vitest";

import { incapacitationSweep, rowIsIncapacitated } from "@/lib/combat-effects";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";

const monster = (id: string) => ({ kind: "monster" as const, combatantId: id });

const op = (
  id: string,
  actor: string,
  payload: ActiveCombatEffect["payload"],
  duration: ActiveCombatEffect["duration"]
): CombatEffectOp => ({
  id: `op-${id}`,
  kind: "apply",
  effect: {
    id,
    actor: monster(actor),
    target: monster("pc-lyra"),
    source: { kind: "spell", id: `${id}-spell`, actionId: `${id}-action` },
    payload,
    duration,
  },
});

const OPS: CombatEffectOp[] = [
  op(
    "hold",
    "monster-1",
    { kind: "condition", conditionId: "paralyzed" },
    { kind: "concentration", actorId: "monster-1", sourceId: "hold-person" }
  ),
  op(
    "grab",
    "monster-1",
    { kind: "condition", conditionId: "grappled" },
    { kind: "encounter" }
  ),
  op(
    "curse",
    "monster-1",
    { kind: "condition", conditionId: "frightened" },
    { kind: "encounter" }
  ),
  op(
    "other",
    "monster-2",
    { kind: "condition", conditionId: "grappled" },
    { kind: "encounter" }
  ),
];

const row = (id: string, currentHp: number, conditions: string[] = []) => ({
  id,
  currentHp,
  conditions,
});
const everything = () => true;

describe("rowIsIncapacitated", () => {
  it("0 HP or an Incapacitated-family condition", () => {
    expect(rowIsIncapacitated(row("a", 0))).toBe(true);
    expect(rowIsIncapacitated(row("a", 5, ["stunned"]))).toBe(true);
    expect(rowIsIncapacitated(row("a", 5, ["unconscious"]))).toBe(true);
    expect(rowIsIncapacitated(row("a", 5, ["frightened"]))).toBe(false);
  });
});

describe("incapacitationSweep", () => {
  const before = [row("monster-1", 20), row("monster-2", 20)];

  it("a creature dropping to 0 loses its Concentration and its grapples, not the rest", () => {
    expect(
      incapacitationSweep(
        before,
        [row("monster-1", 0), row("monster-2", 20)],
        OPS,
        everything
      )
    ).toEqual(["hold", "grab"]);
  });

  it("Stunned does it too", () => {
    expect(
      incapacitationSweep(
        before,
        [row("monster-1", 20, ["stunned"]), row("monster-2", 20)],
        OPS,
        everything
      )
    ).toEqual(["hold", "grab"]);
  });

  it("the first look only primes, and an already-down creature isn't swept again", () => {
    expect(incapacitationSweep(null, [row("monster-1", 0)], OPS, everything)).toEqual([]);
    expect(
      incapacitationSweep([row("monster-1", 0)], [row("monster-1", 0)], OPS, everything)
    ).toEqual([]);
  });

  it("a device sweeps only the combatants it answers for", () => {
    expect(
      incapacitationSweep(
        before,
        [row("monster-1", 0), row("monster-2", 0)],
        OPS,
        (id) => id === "monster-2"
      )
    ).toEqual(["other"]);
  });
});
