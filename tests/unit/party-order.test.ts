/**
 * The party's resting order (OWNER-1): A–Z by character name, a member without a hero by
 * their player name in the same list, and the uid as the last tiebreak so the order never
 * churns. The classic Party and the new Gruppo panel both list members this way.
 */
import { describe, expect, it } from "vitest";

import { partyOrder } from "@/features/campaigns/party-order";
import type { CampaignDoc } from "@/types/campaign";

const details = {
  u3: {
    displayName: "Zeno",
    characterId: "c3",
    role: "player",
    character: { name: "Brunilde" },
  },
  u1: {
    displayName: "Ada",
    characterId: "c1",
    role: "player",
    character: { name: "Ugo" },
  },
  dm: { displayName: "Carla", characterId: null, role: "dm" },
  u2: {
    displayName: "Bea",
    characterId: "c2",
    role: "player",
    character: { name: "brunilde" },
  },
} as unknown as CampaignDoc["memberDetails"];

describe("partyOrder", () => {
  it("sorts by character name, then a hero-less member by player name, then by uid", () => {
    // Brunilde/brunilde tie (case-insensitive) → uid u2 before u3; Carla (the DM, no hero)
    // sorts by player name between them and Ugo.
    expect(partyOrder(details, "en").map(([uid]) => uid)).toEqual([
      "u2",
      "u3",
      "dm",
      "u1",
    ]);
  });

  it("is the same whatever order the members are stored in", () => {
    const reversed = Object.fromEntries(Object.entries(details).reverse());
    expect(partyOrder(reversed, "it").map(([uid]) => uid)).toEqual([
      "u2",
      "u3",
      "dm",
      "u1",
    ]);
  });
});
