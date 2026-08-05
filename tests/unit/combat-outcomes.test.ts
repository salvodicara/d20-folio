import { describe, expect, it } from "vitest";
import {
  combatOutcomeMatches,
  compileCombatOutcomeReceipts,
  parseCombatOutcomeReceipt,
  queryCombatOutcomes,
} from "@/lib/combat-outcomes";
import type { CombatOutcomeReceipt } from "@/types/combat-outcome";

const target = (combatantId: string, tokenIndex?: number) => ({
  combatantId,
  ...(tokenIndex !== undefined ? { tokenIndex } : {}),
});

describe("combat outcome receipts", () => {
  it("compiles per-instance, per-target attack and save facts", () => {
    const receipts = compileCombatOutcomeReceipts({
      occurrenceId: "use-1",
      actionId: "scorching-rays",
      targets: [
        {
          target: target("monster-1", 0),
          attack: { attempts: 2, hits: 1 },
        },
        {
          target: target("monster-2"),
          attack: { attempts: 1, hits: 0 },
          save: { ability: "DEX", result: "failure" },
        },
      ],
    });

    expect(
      receipts.map(({ instance, count, target: bound, fact }) => ({
        instance,
        count,
        target: bound,
        fact,
      }))
    ).toEqual([
      {
        instance: null,
        count: 1,
        target: target("monster-1", 0),
        fact: { kind: "attack", result: "hit" },
      },
      {
        instance: null,
        count: 1,
        target: target("monster-1", 0),
        fact: { kind: "attack", result: "miss" },
      },
      {
        instance: 0,
        count: 1,
        target: target("monster-2"),
        fact: { kind: "attack", result: "miss" },
      },
      {
        instance: 0,
        count: 1,
        target: target("monster-2"),
        fact: { kind: "save", ability: "DEX", result: "failure" },
      },
    ]);
    expect(new Set(receipts.map(({ id }) => id)).size).toBe(receipts.length);
  });

  it("keeps repeated uses of the same action distinct by occurrence", () => {
    const compile = (occurrenceId: string) =>
      compileCombatOutcomeReceipts({
        occurrenceId,
        actionId: "longsword",
        targets: [{ target: target("monster-1"), attack: { attempts: 1, hits: 1 } }],
      })[0];

    expect(compile("swing-1")?.id).not.toBe(compile("swing-2")?.id);
    expect(compile("swing-1")?.occurrenceId).toBe("swing-1");
  });

  it("queries any successful attack while preserving exact target binding", () => {
    const receipts = compileCombatOutcomeReceipts({
      occurrenceId: "attack-1",
      actionId: "longsword",
      targets: [
        { target: target("monster-1"), attack: { attempts: 1, hits: 1 } },
        { target: target("monster-2"), attack: { attempts: 1, hits: 0 } },
      ],
    });

    expect(
      queryCombatOutcomes({ kind: "attack", result: "success" }, receipts)
    ).toMatchObject({
      targets: [target("monster-1")],
    });
    expect(
      queryCombatOutcomes(
        { kind: "attack", result: "success", target: target("monster-2") },
        receipts
      ).receipts
    ).toEqual([]);
  });

  it("matches a negated reduction only when positive incoming damage reaches zero", () => {
    const [negated, remaining] = compileCombatOutcomeReceipts({
      occurrenceId: "deflect-1",
      actionId: "monk-deflect-attacks-reaction",
      targets: [
        { target: target("self"), damageReduction: { incoming: 10, remaining: 0 } },
        { target: target("self"), damageReduction: { incoming: 10, remaining: 2 } },
      ],
    });
    const predicate = {
      actionId: "monk-deflect-attacks-reaction",
      kind: "damage-reduction",
      result: "negated",
    } as const;

    expect(negated && combatOutcomeMatches(negated, predicate)).toBe(true);
    expect(remaining && combatOutcomeMatches(remaining, predicate)).toBe(false);
  });

  it("parses critical-hit as a first-class observed fact", () => {
    // CombatResolver currently supplies HIT/MISS only. This contract test keeps the
    // missing explicit critical input visible without fabricating it in production.
    const critical: CombatOutcomeReceipt = {
      id: "crit-1:0",
      occurrenceId: "crit-1",
      actionId: "greataxe",
      instance: 0,
      count: 1,
      target: target("monster-1"),
      fact: { kind: "attack", result: "critical-hit" },
    };
    expect(parseCombatOutcomeReceipt(critical)).toEqual(critical);
    expect(combatOutcomeMatches(critical, { kind: "attack", result: "success" })).toBe(
      true
    );
  });

  it("normalizes non-finite aggregate inputs without emitting an unreadable receipt", () => {
    const receipts = compileCombatOutcomeReceipts({
      occurrenceId: "hostile-1",
      actionId: "hostile-action",
      targets: [
        {
          target: target("monster-1"),
          attack: { attempts: Number.POSITIVE_INFINITY, hits: Number.NaN },
          save: {
            ability: "WIS",
            result: "failure",
            instances: Number.POSITIVE_INFINITY,
          },
          damageReduction: {
            incoming: Number.NaN,
            remaining: Number.POSITIVE_INFINITY,
          },
        },
      ],
    });
    expect(receipts.every((candidate) => parseCombatOutcomeReceipt(candidate))).toBe(
      true
    );
  });

  it.each([
    null,
    {},
    {
      id: "",
      occurrenceId: "x",
      actionId: "a",
      instance: 0,
      target: target("x"),
      fact: { kind: "attack", result: "hit" },
    },
    {
      id: "1",
      occurrenceId: "x",
      actionId: "a",
      instance: -1,
      target: target("x"),
      fact: { kind: "attack", result: "hit" },
    },
    {
      id: "1",
      occurrenceId: "x",
      actionId: "a",
      instance: 0,
      target: {},
      fact: { kind: "attack", result: "hit" },
    },
    {
      id: "1",
      occurrenceId: "x",
      actionId: "a",
      instance: 0,
      target: target("x"),
      fact: { kind: "save", ability: "LCK", result: "success" },
    },
    {
      id: "1",
      occurrenceId: "x",
      actionId: "a",
      instance: 0,
      target: target("x"),
      fact: { kind: "damage-reduction", incoming: 5, reduced: 1, remaining: 0 },
    },
    {
      id: "1",
      occurrenceId: "x",
      actionId: "a",
      instance: 0,
      count: 3,
      target: target("x"),
      fact: { kind: "attack", result: "hit" },
    },
  ])("drops malformed receipt %#", (candidate) => {
    expect(parseCombatOutcomeReceipt(candidate)).toBeNull();
  });
});
