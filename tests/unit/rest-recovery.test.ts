/**
 * What a rest gave back, read from the sheet before and after it (walkthrough
 * 2026-11-12, M2: a rest was one bare line). Each field is set only when something came
 * back, so the line never carries an empty clause.
 */
import { describe, expect, it } from "vitest";

import { restRecovery } from "@/lib/play/rest-recovery";

const session = (patch: {
  hp?: number;
  hitDiceUsed?: number;
  trackers?: Record<string, number>;
}) => ({
  hp: { current: patch.hp ?? 30, temp: 0 },
  hitDice: { used: patch.hitDiceUsed ?? 0 },
  trackers: Object.fromEntries(
    Object.entries(patch.trackers ?? {}).map(([id, used]) => [id, { used }])
  ),
});

describe("restRecovery", () => {
  it("a short rest: the Hit Points it healed, the Hit Dice it spent, the uses that came back", () => {
    expect(
      restRecovery(
        session({
          hp: 22,
          hitDiceUsed: 1,
          trackers: { "bardic-inspiration": 3, rage: 0 },
        }),
        session({
          hp: 30,
          hitDiceUsed: 3,
          trackers: { "bardic-inspiration": 1, rage: 0 },
        })
      )
    ).toEqual({
      hpRegained: 8,
      hitDiceSpent: 2,
      recovered: [{ resource: "bardic-inspiration", count: 2 }],
    });
  });

  it("a long rest: the Hit Dice it gave back", () => {
    expect(
      restRecovery(
        session({ hp: 10, hitDiceUsed: 4 }),
        session({ hp: 52, hitDiceUsed: 0 })
      )
    ).toEqual({ hpRegained: 42, hitDiceRegained: 4 });
  });

  it("nothing came back: no field at all", () => {
    expect(restRecovery(session({}), session({}))).toEqual({});
  });

  it("a tracker the rest created or spent is not a recovery", () => {
    expect(
      restRecovery(session({ trackers: { a: 0 } }), session({ trackers: { a: 1, b: 0 } }))
    ).toEqual({});
  });
});
