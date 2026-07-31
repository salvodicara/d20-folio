/**
 * admin-search — the omni-search matcher (owner-grilled, 2026-07-31): users by
 * identity, characters → the owner's row, campaigns → the DM's row, every
 * match resolved to a USER row with a why-hint.
 */

import { describe, it, expect } from "vitest";
import { buildAdminMatches } from "@/features/account/admin-search";
import type { AdminCampaignSummary } from "@/lib/dev-admin-fixture";

const USERS = [
  { uid: "u1", email: "aria@example.com", displayName: "Aria Holloway" },
  { uid: "u2", email: "garrick@example.com", displayName: "Garrick Stone" },
  { uid: "u3", email: "senna@example.com", displayName: "Senna Vale" },
];

const CAMPAIGNS: AdminCampaignSummary[] = [
  {
    id: "c1",
    name: "Shadows over the Mistlands",
    dmUid: "u2",
    members: ["u1", "u2"],
    status: "active",
  },
];

const CHAR_INDEX = {
  u1: [{ id: "ch1", name: "Lyra Voss", portraitUrl: null }],
  u2: [],
  u3: [{ id: "ch2", name: "Talon Brightwood", portraitUrl: null }],
};

describe("buildAdminMatches", () => {
  it("empty query means no filtering", () => {
    expect(buildAdminMatches("", USERS, CAMPAIGNS, CHAR_INDEX)).toBeNull();
    expect(buildAdminMatches("   ", USERS, CAMPAIGNS, CHAR_INDEX)).toBeNull();
  });

  it("matches a user by name and by email, hint-free", () => {
    const byName = buildAdminMatches("aria", USERS, CAMPAIGNS, CHAR_INDEX);
    expect(byName?.get("u1")).toBeNull();
    expect(byName?.has("u2")).toBe(false);
    const byEmail = buildAdminMatches("garrick@", USERS, CAMPAIGNS, CHAR_INDEX);
    expect(byEmail?.has("u2")).toBe(true);
  });

  it("resolves a character name to the OWNER's row with a hint", () => {
    const m = buildAdminMatches("lyra", USERS, CAMPAIGNS, CHAR_INDEX);
    expect(m?.get("u1")).toEqual({ kind: "character", label: "Lyra Voss" });
    expect(m?.size).toBe(1);
  });

  it("resolves a campaign name to the DM's row (not every member)", () => {
    const m = buildAdminMatches("mistlands", USERS, CAMPAIGNS, CHAR_INDEX);
    expect(m?.get("u2")).toEqual({
      kind: "campaign",
      label: "Shadows over the Mistlands",
    });
    expect(m?.has("u1")).toBe(false);
  });

  it("an identity match outranks a hint on the same row", () => {
    // "stone" hits Garrick's own name — no campaign hint even though he DMs.
    const m = buildAdminMatches("stone", USERS, CAMPAIGNS, CHAR_INDEX);
    expect(m?.get("u2")).toBeNull();
  });

  it("a null character index skips character matches without failing", () => {
    const m = buildAdminMatches("lyra", USERS, CAMPAIGNS, null);
    expect(m?.size).toBe(0);
  });
});
