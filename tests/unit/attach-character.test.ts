/**
 * Attaching a character to the campaign on the new campaign screen (headless), from the
 * classic party card: one campaign per character (the campaign it is already in is
 * named), the atomic claim (a concurrent attach that won the race reverts this one),
 * detaching, and no change of character mid-fight.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ db: {} }));
import type { TFunction } from "i18next";

const io = vi.hoisted(() => ({
  listSharedCampaigns: vi.fn(() => Promise.resolve([] as unknown[])),
  attachMemberCharacter: vi.fn(() => Promise.resolve("attached" as const)),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);
vi.mock("@/features/campaigns/member-snapshot", () => ({
  buildMemberSnapshot: (doc: { character: { name: string } }) => ({
    name: doc.character.name,
  }),
}));

import { attachChoices, attachCharacter } from "@/domains/campaign/attach-character";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import type { RosterCharacterDoc } from "@/lib/character-cache";
import { useToastStore } from "@/stores/toastStore";
import type { CampaignDoc } from "@/types/campaign";

const t = ((key: string, args?: { campaign?: string }) =>
  args?.campaign ? `${key}:${args.campaign}` : key) as unknown as TFunction;

const roster = [
  { id: "c-1", character: { name: "Arwen" } },
  { id: "c-2", character: { name: "Brom" } },
] as unknown as RosterCharacterDoc[];

const member = (
  characterId: string | null = null,
  character: { name: string } | null = null
) =>
  ({
    displayName: "Ann",
    characterId,
    role: "player",
    character,
  }) as CampaignDoc["memberDetails"][string];

const campaign = (characterId: string | null = null) =>
  ({
    id: "camp-1",
    name: "Keep",
    memberDetails: {
      u1: { displayName: "Ann", characterId, role: "player", character: null },
    },
  }) as unknown as CampaignDoc;

const me = () => useCampaignStore.getState().campaign?.memberDetails.u1;
const lastToast = () => useToastStore.getState().toasts.at(-1)?.message;

beforeEach(() => {
  vi.clearAllMocks();
  useCampaignStore.getState().setCampaign(campaign());
});

describe("attachChoices", () => {
  it("my own card out of a fight: every roster character, the blank one attaches none", () => {
    expect(attachChoices(member(), roster, { isMe: true, inCombat: false })).toEqual({
      canChange: true,
      blank: "campaignHub.attachNone",
      options: [
        { id: "c-1", name: "Arwen" },
        { id: "c-2", name: "Brom" },
      ],
    });
  });

  it("with a hero attached the blank one detaches; mid-fight nothing changes", () => {
    const attached = member("c-1", { name: "Arwen" });
    expect(attachChoices(attached, roster, { isMe: true, inCombat: false }).blank).toBe(
      "campaignHub.detachCharacter"
    );
    expect(
      attachChoices(attached, roster, { isMe: true, inCombat: true }).canChange
    ).toBe(false);
    expect(
      attachChoices(attached, roster, { isMe: false, inCombat: false }).canChange
    ).toBe(false);
  });

  it("an attached hero no longer on the roster still shows as itself", () => {
    const stale = member("c-9", { name: "Gone" });
    expect(
      attachChoices(stale, roster, { isMe: true, inCombat: false }).options[0]
    ).toEqual({
      id: "c-9",
      name: "Gone",
    });
  });
});

describe("attachCharacter", () => {
  it("claims the hero for this campaign", async () => {
    expect(await attachCharacter("c-1", "u1", roster, t)).toBe("attached");
    expect(me()?.characterId).toBe("c-1");
    expect(io.attachMemberCharacter).toHaveBeenCalledWith("camp-1", "u1", null, "c-1", {
      name: "Arwen",
    });
  });

  it("a hero already in another campaign is refused, and that campaign is named", async () => {
    io.listSharedCampaigns.mockResolvedValueOnce([
      {
        id: "other",
        name: "Dragon Heist",
        memberDetails: { u1: { characterId: "c-1" } },
      },
    ]);
    expect(await attachCharacter("c-1", "u1", roster, t)).toBe("elsewhere");
    expect(me()?.characterId).toBeNull();
    expect(io.attachMemberCharacter).not.toHaveBeenCalled();
    expect(lastToast()).toBe("campaignHub.attachAlreadyElsewhere:Dragon Heist");
  });

  it("this same campaign holding the hero is no reason to refuse", async () => {
    io.listSharedCampaigns.mockResolvedValueOnce([
      { id: "camp-1", name: "Keep", memberDetails: { u1: { characterId: "c-1" } } },
    ]);
    expect(await attachCharacter("c-1", "u1", roster, t)).toBe("attached");
  });

  it("a lost race reverts", async () => {
    io.attachMemberCharacter.mockResolvedValueOnce("conflict" as never);
    expect(await attachCharacter("c-1", "u1", roster, t)).toBe("conflict");
    expect(me()?.characterId).toBeNull();
    expect(lastToast()).toBe("campaignHub.attachRaceLost");
  });

  it("detaching never asks the other campaigns", async () => {
    useCampaignStore.getState().setCampaign(campaign("c-1"));
    expect(await attachCharacter("", "u1", roster, t)).toBe("attached");
    expect(io.listSharedCampaigns).not.toHaveBeenCalled();
    expect(me()?.characterId).toBeNull();
  });
});
