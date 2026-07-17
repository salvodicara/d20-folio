/**
 * personal-campaign — `PERSONAL_CAMPAIGN_ID` is a PURE virtual sentinel: the id the
 * campaign-list/hub/member surfaces use to represent the solo state. It is NEVER
 * persisted onto a character (`campaignId == null` is the permanent solo state), so
 * the module must expose ONLY the sentinel — no `campaignId` "migration"/"resolve"
 * machinery (deleted in feat/migration-hygiene as misnamed dead code). This guard
 * fails if that fiction creeps back.
 */

import { describe, it, expect } from "vitest";
import * as personalCampaign from "@/app/_data/personal-campaign";
import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";

describe("personal-campaign", () => {
  it("exposes the virtual solo-campaign sentinel", () => {
    expect(PERSONAL_CAMPAIGN_ID).toBe("personal");
  });

  it("is a PURE sentinel module — no campaignId migration/resolution machinery", () => {
    // The whole point of feat/migration-hygiene: there is no campaignId migration.
    // The module must export the sentinel and nothing that mutates a character's
    // campaignId (no resolveCampaignId / needsCampaignIdMigration / version guard).
    expect(Object.keys(personalCampaign).sort()).toEqual(["PERSONAL_CAMPAIGN_ID"]);
  });
});
