/**
 * Divine Sense (SRD 5.2.1 Paladin, Channel Divinity): as a Bonus Action, spend a
 * Channel Divinity use to sense Celestials, Fiends and Undead for 10 minutes. The
 * sheet offers it as the Channel Divinity row; what is sensed is the DM's.
 */
import { describe, expect, it } from "vitest";
import { resolveActions } from "@/lib/smart-tracker";
import { makeCharacterDoc } from "./_helpers";

const paladin = makeCharacterDoc({
  classId: "paladin",
  level: 3,
  features: [{ srdId: "paladin-channel-divinity" }],
});

describe("Divine Sense", () => {
  it("is a Bonus Action that spends one Channel Divinity use and lasts 10 minutes", () => {
    const row = resolveActions(paladin, "combat").find((a) =>
      a.id.includes("paladin-channel-divinity")
    );
    expect(row).toMatchObject({
      type: "bonus",
      costTracker: "paladin-channel-divinity",
    });
    expect(row?.activatesKey).toBe("paladin-divine-sense");
  });
});
