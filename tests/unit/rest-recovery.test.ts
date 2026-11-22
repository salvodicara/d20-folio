/**
 * What a rest gave back, read from the sheet before and after it (walkthrough
 * 2026-11-12, M2: a rest was one bare line). Each field is set only when something came
 * back, so the line never carries an empty clause.
 */
import { describe, expect, it } from "vitest";

import { restRecovery } from "@/lib/play/rest-recovery";
import { MOCK_CHARACTER } from "@/lib/mock";
import { grantSourceLabel, localizeTrackers } from "@/lib/views/tracker-view";

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

/** The trackers the character has (`resolveTrackers`). */
const HAS = new Set(["bardic-inspiration", "rage"]);

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
        }),
        HAS
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
        session({ hp: 52, hitDiceUsed: 0 }),
        HAS
      )
    ).toEqual({ hpRegained: 42, hitDiceRegained: 4 });
  });

  it("nothing came back: no field at all", () => {
    expect(restRecovery(session({}), session({}), HAS)).toEqual({});
  });

  it("a tracker the rest created or spent is not a recovery", () => {
    expect(
      restRecovery(
        session({ trackers: { a: 0 } }),
        session({ trackers: { a: 1, b: 0 } }),
        new Set(["a", "b"])
      )
    ).toEqual({});
  });

  it("a resource the rest fully reset (its entry dropped) came back in full", () => {
    // Font of Inspiration: a short rest gives every Bardic Inspiration back, and the
    // session drops the reset tracker (walkthrough 2026-11-13, the line said nothing).
    expect(
      restRecovery(session({ trackers: { "bardic-inspiration": 2 } }), session({}), HAS)
    ).toEqual({ recovered: [{ resource: "bardic-inspiration", count: 2 }] });
  });

  it("an entry the rest cleared that the character has no tracker for came back as nothing", () => {
    // A legacy item tracker the long rest only cleans away.
    expect(
      restRecovery(session({ trackers: { "winged-boots": 2 } }), session({}), HAS)
    ).toEqual({});
  });
});

describe("the rest line names what came back", () => {
  it("each tracker reads as its Resources row does, in Italian and English, never its id", () => {
    // Lyra's trackers: Bardic Inspiration, Second Wind, Action Surge and Elven
    // Lineage's free casts. The log names a recovered one with `grantSourceLabel`,
    // as `ActionLog` passes it; the Resources panel with `localizeTrackers`.
    for (const locale of ["it", "en"] as const) {
      const rows = localizeTrackers(MOCK_CHARACTER, locale);
      expect(rows.length).toBeGreaterThan(2);
      for (const row of rows)
        expect(grantSourceLabel(row.id, locale), row.id).toBe(row.label);
    }
  });
});
