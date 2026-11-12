/**
 * «Tira l'iniziativa» on Play (rehearsal 2026-11-06, #10): the Fight tab says a fight
 * starts when the first player rolls from their sheet, so the sheet offers the roll.
 * The same rule as the campaign's Fight tab: with no fight, the character's player may
 * roll (the first roll starts it); in a fight, only until they have rolled.
 */
import { describe, expect, it } from "vitest";
import { playRollOffer } from "@/domains/play/play-roll-offer";
import type { CampaignDoc } from "@/types/campaign";

const campaign = (patch: Partial<CampaignDoc> = {}) =>
  ({
    id: "c1",
    dmUid: "dm",
    // Attached as `attachCharacter` writes it: the id and the party snapshot.
    memberDetails: {
      me: { characterId: "lyra", character: { name: "Lyra" } },
      ally: { characterId: "cat", character: { name: "Cat" } },
    },
    encounter: null,
    encounterInit: {},
    ...patch,
  }) as unknown as CampaignDoc;

const fight = { currentCombatantId: null, combatants: [] } as unknown as NonNullable<
  CampaignDoc["encounter"]
>;

describe("playRollOffer", () => {
  it("out of a fight, offers the roll with the sheet's bonus", () => {
    expect(playRollOffer(campaign(), "me", "lyra", 3, [])).toEqual({
      bonus: 3,
      bonuses: { "pc-me": 3 },
    });
  });

  it("in a fight, offers it until the player has rolled, with every row's bonus", () => {
    const rows = [
      { id: "pc-me", initiativeBonus: 2 },
      { id: "pc-ally", initiativeBonus: 4 },
    ];
    expect(playRollOffer(campaign({ encounter: fight }), "me", "lyra", 3, rows)).toEqual({
      bonus: 2,
      bonuses: { "pc-me": 2, "pc-ally": 4 },
    });
    expect(
      playRollOffer(
        campaign({ encounter: fight, encounterInit: { me: 14 } }),
        "me",
        "lyra",
        3,
        rows
      )
    ).toBeNull();
  });

  it("offers nothing to a sheet that is not the player's character in the campaign", () => {
    expect(playRollOffer(campaign(), "me", "someone-else", 3, [])).toBeNull();
    expect(playRollOffer(null, "me", "lyra", 3, [])).toBeNull();
  });
});
