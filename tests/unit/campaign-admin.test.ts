/**
 * Managing the campaign on the new campaign screen (headless), from the classic DM
 * tools and invite card: the invite link and its lock, handing the DM role to a member,
 * removing a member. Each write is optimistic and reverts with a notice when the
 * server refuses it, as the classic hub does.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ db: {} }));
import type { TFunction } from "i18next";

const io = vi.hoisted(() => ({
  setJoinsLocked: vi.fn(async () => {}),
  yieldDmRole: vi.fn(async () => {}),
  removeMember: vi.fn(async () => {}),
  deleteCampaign: vi.fn(async () => {}),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);

import {
  campaignAdminView,
  handOverDm,
  removeCampaignMember,
  setInviteLocked,
} from "@/domains/campaign/campaign-admin";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useToastStore } from "@/stores/toastStore";
import type { CampaignDoc } from "@/types/campaign";

const t = ((key: string) => key) as unknown as TFunction;

const campaign = (): CampaignDoc =>
  ({
    id: "camp-1",
    name: "The Starless Keep",
    dmUid: "dm-9",
    inviteCode: "ABC123",
    members: ["dm-9", "u1", "u2"],
    memberDetails: {
      "dm-9": { displayName: "Dana", characterId: null, role: "dm" },
      u1: { displayName: "Lyra", characterId: "c-lyra", role: "player" },
      u2: { displayName: "", characterId: null, role: "player" },
    },
  }) as unknown as CampaignDoc;

const current = () => useCampaignStore.getState().campaign;
const lastToast = () => useToastStore.getState().toasts.at(-1)?.message;

beforeEach(() => {
  vi.clearAllMocks();
  useCampaignStore.getState().setCampaign(campaign());
});

describe("campaignAdminView", () => {
  it("the DM manages; candidates are every member but the DM, named or not", () => {
    const view = campaignAdminView(campaign(), "dm-9", false, t);
    expect(view.canManage).toBe(true);
    expect(view.members).toEqual([
      { uid: "u1", name: "Lyra" },
      { uid: "u2", name: "campaignHub.unnamedPlayer" },
    ]);
    expect(view.invite).toMatchObject({ locked: false });
    expect(view.invite.link).toContain("ABC123");
  });

  it("an admin manages any campaign; a player does not", () => {
    expect(campaignAdminView(campaign(), "u1", true, t).canManage).toBe(true);
    expect(campaignAdminView(campaign(), "u1", false, t).canManage).toBe(false);
  });

  it("a locked campaign's link cannot be shared", () => {
    const view = campaignAdminView({ ...campaign(), joinsLocked: true }, "u1", false, t);
    expect(view.invite.locked).toBe(true);
  });
});

describe("the DM's actions", () => {
  it("locking joins writes and says so", () => {
    setInviteLocked(true, t);
    expect(current()?.joinsLocked).toBe(true);
    expect(io.setJoinsLocked).toHaveBeenCalledWith("camp-1", true);
    expect(lastToast()).toBe("campaignHub.joinsLockedToast");
  });

  it("handing over the DM role flips both roles", async () => {
    expect(await handOverDm("u1", t)).toBe(true);
    expect(current()?.dmUid).toBe("u1");
    expect(current()?.memberDetails.u1?.role).toBe("dm");
    expect(current()?.memberDetails["dm-9"]?.role).toBe("player");
    expect(io.yieldDmRole).toHaveBeenCalledWith("camp-1", "dm-9", "u1");
  });

  it("a refused hand-over reverts, so the party is never left without a DM", async () => {
    io.yieldDmRole.mockRejectedValueOnce(new Error("denied"));
    expect(await handOverDm("u1", t)).toBe(false);
    expect(current()?.dmUid).toBe("dm-9");
    expect(lastToast()).toBe("campaignHub.yieldDmError");
  });

  it("removing a member drops them and their row in a running fight", async () => {
    useCampaignStore.getState().setCampaign({
      ...campaign(),
      encounter: { combatants: [{ id: "pc-u1" }, { id: "m-1" }] },
    } as unknown as CampaignDoc);
    expect(await removeCampaignMember("u1", t)).toBe(true);
    expect(current()?.members).toEqual(["dm-9", "u2"]);
    expect(current()?.memberDetails.u1).toBeUndefined();
    expect(current()?.encounter?.combatants.map((c) => c.id)).toEqual(["m-1"]);
    expect(io.removeMember).toHaveBeenCalledWith("camp-1", "u1");
  });

  it("a refused removal reverts", async () => {
    io.removeMember.mockRejectedValueOnce(new Error("denied"));
    expect(await removeCampaignMember("u1", t)).toBe(false);
    expect(current()?.members).toContain("u1");
    expect(lastToast()).toBe("campaignHub.removeMemberError");
  });
});
