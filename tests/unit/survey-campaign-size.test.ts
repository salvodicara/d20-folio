/**
 * How big each campaign document is, and what grows in it (the architecture review,
 * 2026-11-22: Firestore caps a document at 1 MiB, and the campaign holds the fight, the
 * treasury log and the members). Counts only: never an id, a name or a value.
 */
import { describe, expect, it } from "vitest";

import { surveyCampaignSizes } from "../../scripts/survey-campaign-size";

describe("surveyCampaignSizes", () => {
  it("lists each campaign's bytes and list lengths, largest first, with no id or name", () => {
    const survey = surveyCampaignSizes([
      {
        name: "Secret Table",
        treasuryLog: [{ note: "gold" }],
        memberDetails: { a: {}, b: {} },
      },
      {
        name: "Other",
        treasuryLog: Array.from({ length: 40 }, () => ({ note: "x".repeat(50) })),
        encounter: { events: [1, 2, 3], effectOps: [1], combatants: [1, 2] },
        memberDetails: { a: {} },
      },
    ]);
    expect(survey.campaigns).toBe(2);
    expect(survey.rows.map((r) => r.treasuryLog)).toEqual([40, 1]);
    expect(survey.rows[0]).toMatchObject({
      events: 3,
      effectOps: 1,
      combatants: 2,
      members: 1,
    });
    expect(survey.rows[0]?.bytes).toBeGreaterThan(survey.rows[1]?.bytes ?? 0);
    expect(survey.largestShareOfLimit).toBeGreaterThan(0);
    expect(JSON.stringify(survey)).not.toContain("Secret Table");
  });
});
