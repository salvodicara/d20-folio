/** The read-only survey for #1215 (queued member effects before the drain goes). Counts only. */
import { describe, expect, it } from "vitest";
import type { RawMap } from "../../scripts/lib/migration-kit";
import { surveyMemberEffects } from "../../scripts/survey-member-effects";

const src = (path: string, data: Record<string, unknown>) => ({
  path,
  data: data as RawMap,
});
const effect = { id: "e1", targetId: "Secret", kind: "damage", amount: 3 };

describe("survey — queued member effects", () => {
  it("counts live and kept fights holding queued effects, and the effects", () => {
    const survey = surveyMemberEffects([
      src("campaigns/k1", { encounter: { memberEffects: [effect, effect] } }),
      src("campaigns/k2", { encounter: { memberEffects: [] } }),
      src("campaigns/k3", { encounter: null }),
      src("campaigns/k4", {}),
      src("campaigns/k1/combat/ended", { fight: { memberEffects: [effect] } }),
      src("campaigns/k2/combat/ended", { fight: { ended: true } }),
      src("users/u1/characters/c1/combat/state", { memberEffects: [effect] }),
    ]);
    expect(survey).toEqual({
      format: "d20-folio-member-effects-survey-v1",
      campaigns: 4,
      liveFights: 2,
      liveFightsWithQueued: 1,
      liveQueuedEffects: 2,
      keptFights: 2,
      keptFightsWithQueued: 1,
      keptQueuedEffects: 1,
    });
    expect(JSON.stringify(survey)).not.toMatch(/Secret|k1|k2|u1|c1|e1/);
  });

  it("a malformed memberEffects counts as queued, never as empty", () => {
    const survey = surveyMemberEffects([
      src("campaigns/k1", { encounter: { memberEffects: "junk" } }),
    ]);
    expect(survey.liveFightsWithQueued).toBe(1);
  });
});
