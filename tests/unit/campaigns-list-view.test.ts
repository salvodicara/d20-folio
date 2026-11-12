/**
 * The campaign list on the new frame (D&D Beyond's campaign list: one card per table):
 * each card's name, DM, start date, party size (players only, the DM out), the party's
 * level range, the shared purse in gp, when it was last active, and who may delete it.
 * The hidden personal campaign never shows.
 */
import { describe, expect, it } from "vitest";

import { campaignCards } from "@/domains/campaign/campaigns-list-view";
import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";
import type { CampaignDoc } from "@/types/campaign";

const NOW = new Date("2026-11-12T12:00:00Z").getTime();

function campaign(over: Partial<CampaignDoc> = {}): CampaignDoc {
  return {
    id: "c1",
    name: "La Rocca",
    createdAt: new Date("2026-05-02T18:00:00Z"),
    updatedAt: new Date("2026-11-11T12:00:00Z"),
    createdBy: "dm",
    dmUid: "dm",
    members: ["dm", "p1", "p2"],
    memberDetails: {
      dm: { displayName: "Sal", characterId: null, role: "dm" },
      p1: { displayName: "A", characterId: null, role: "player" },
      p2: { displayName: "B", characterId: null, role: "player" },
    },
    status: "active",
    inviteCode: "c1",
    treasury: { pp: 1, gp: 25, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
    encounter: null,
    ...over,
  };
}

describe("campaignCards", () => {
  it("counts the players, not the DM, and the purse in gp", () => {
    const [card] = campaignCards([campaign()], "p1", false, "it", NOW);
    expect(card).toMatchObject({ id: "c1", name: "La Rocca", dm: "Sal", party: 2 });
    expect(card?.potGp).toBe(35);
  });

  it("only the DM (or the admin) may delete", () => {
    expect(campaignCards([campaign()], "p1", false, "it", NOW)[0]?.canDelete).toBe(false);
    expect(campaignCards([campaign()], "dm", false, "it", NOW)[0]?.canDelete).toBe(true);
    expect(campaignCards([campaign()], "p1", true, "it", NOW)[0]?.canDelete).toBe(true);
  });

  it("no level range until a member attaches a character", () => {
    expect(campaignCards([campaign()], "p1", false, "it", NOW)[0]?.levels).toBeNull();
  });

  it("a start date and a recent activity in the reader's language", () => {
    const [card] = campaignCards([campaign()], "p1", false, "it", NOW);
    expect(card?.started).toMatch(/2026/);
    expect(card?.active).toBeTruthy();
  });

  it("the campaign's own picture for its thumbnail; none when it has no banner", () => {
    const [plain] = campaignCards([campaign()], "p1", false, "it", NOW);
    expect(plain?.picture).toBeNull();
    const [own] = campaignCards(
      [campaign({ bannerUrl: "https://x/banner.jpeg" })],
      "p1",
      false,
      "it",
      NOW
    );
    expect(own?.picture).toBe("https://x/banner.jpeg");
  });

  it("never lists the personal campaign", () => {
    const cards = campaignCards(
      [campaign(), campaign({ id: PERSONAL_CAMPAIGN_ID })],
      "p1",
      false,
      "it",
      NOW
    );
    expect(cards.map((c) => c.id)).toEqual(["c1"]);
  });
});
