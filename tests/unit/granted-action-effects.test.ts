/**
 * A granted action can carry structured effects (edge-case M14): Tactical Shift's
 * free row moves the fighter half its Speed with no Opportunity Attacks.
 */
import { describe, expect, it } from "vitest";
import { activityFromGrantedAction } from "@/lib/activities/from-granted-action";
import { conformHomebrewGrant } from "@/lib/grants";

const shift = {
  type: "granted-action",
  id: "tactical-shift",
  slot: "free",
  effects: [{ kind: "self-move", fraction: 0.5, noOpportunityAttacks: true }],
};

describe("granted-action effects", () => {
  it("conform at the authoring boundary, and a malformed one is refused", () => {
    expect(conformHomebrewGrant(shift)).toEqual(shift);
    expect(
      conformHomebrewGrant({ ...shift, effects: [{ kind: "self-move" }] })
    ).toBeNull();
  });

  it("reach the Activity", () => {
    const grant = conformHomebrewGrant(shift);
    if (grant?.type !== "granted-action") throw new Error("not a granted action");
    expect(
      activityFromGrantedAction(grant, "fighter-tactical-shift").activity.effects
    ).toEqual(shift.effects);
  });
});
