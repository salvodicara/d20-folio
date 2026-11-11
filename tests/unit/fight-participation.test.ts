/**
 * Fight participation (headless): a member sits a fight out or comes back in; the
 * turn order leaves out who sat out; beginning with some heroes unrolled sits them
 * out; the DM's own character (a DMPC) fights on the party grid, while a DM with no
 * character is the banner only. Shared by the classic party and the new fight screen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";

vi.mock("@/lib/firebase", () => ({ db: {} }));
const write = vi.fn<(id: string, uid: string, participating: boolean) => Promise<void>>();
vi.mock("@/features/campaigns/campaign-io", () => ({
  setEncounterParticipation: (id: string, uid: string, participating: boolean) =>
    write(id, uid, participating),
}));

import {
  dmSeat,
  participatingIds,
  setFightParticipation,
  skippedAfter,
  skippedAtBegin,
} from "@/domains/combat/fight-participation";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const t = ((key: string) => key) as unknown as TFunction;

const pc = (memberUid: string) => ({
  id: `pc-${memberUid}`,
  kind: "pc" as const,
  memberUid,
});
const monster = (id: string) => ({ id, kind: "monster" as const });
const encounter = {
  combatants: [pc("ana"), pc("bo"), monster("m1")],
} as unknown as EncounterState;

describe("skippedAfter", () => {
  it("sitting out adds the member; coming back removes only them", () => {
    expect(skippedAfter({ bo: true }, "ana", false)).toEqual({ bo: true, ana: true });
    expect(skippedAfter({ bo: true, ana: true }, "ana", true)).toEqual({ bo: true });
  });
});

describe("participatingIds", () => {
  it("leaves out a hero who sat out, never a monster", () => {
    expect(participatingIds(encounter, ["pc-ana", "pc-bo", "m1"], { bo: true })).toEqual([
      "pc-ana",
      "m1",
    ]);
  });
});

describe("skippedAtBegin", () => {
  it("a hero who has not rolled sits out when the DM begins; the rest keep theirs", () => {
    expect(skippedAtBegin(encounter, { carl: true }, ["pc-ana", "m1"])).toEqual({
      carl: true,
      bo: true,
    });
  });
});

describe("dmSeat", () => {
  const campaign = (dmCharacter: boolean) =>
    ({
      dmUid: "dm",
      memberDetails: {
        dm: {
          displayName: "",
          role: "dm",
          character: dmCharacter ? { name: "Npc" } : null,
        },
        ana: { displayName: "Ana", role: "player", character: { name: "A" } },
        bo: { displayName: "Bo", role: "player", character: null },
      },
    }) as unknown as CampaignDoc;

  it("a DM with no character is the banner only, not a card", () => {
    const seat = dmSeat(campaign(false), "ana", t);
    expect(seat).toMatchObject({ dmUid: "dm", dmIsMe: false, dmPlays: false });
    expect(seat.dmName).toBe("campaignHub.unnamedPlayer");
    expect(seat.gridUids.sort()).toEqual(["ana", "bo"]);
  });

  it("the DM's own character fights as a card on the grid", () => {
    const seat = dmSeat(campaign(true), "dm", t);
    expect(seat).toMatchObject({ dmIsMe: true, dmPlays: true });
    expect(seat.gridUids.sort()).toEqual(["ana", "bo", "dm"]);
  });
});

describe("setFightParticipation", () => {
  const base = { id: "c1", encounterSkipped: { bo: true } } as unknown as CampaignDoc;
  beforeEach(() => {
    write.mockReset();
    useCampaignStore.getState().setCampaign(base);
  });

  it("shows the choice at once and writes it", () => {
    write.mockResolvedValue();
    setFightParticipation(base, "ana", false);
    expect(useCampaignStore.getState().campaign?.encounterSkipped).toEqual({
      bo: true,
      ana: true,
    });
    expect(write).toHaveBeenCalledWith("c1", "ana", false);
  });

  it("a refused write puts the campaign back", async () => {
    write.mockRejectedValue(new Error("denied"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    setFightParticipation(base, "ana", false);
    await vi.waitFor(() =>
      expect(useCampaignStore.getState().campaign?.encounterSkipped).toEqual({ bo: true })
    );
  });
});
