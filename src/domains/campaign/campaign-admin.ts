/**
 * Managing a campaign (headless): the invite link and its lock, handing the DM role to
 * a member, removing a member, deleting the campaign. The classic DM tools and invite
 * card and the new campaign screen share these; the confirmation stays in each UI.
 *
 * Every write is optimistic, then awaited: a refusal reverts the change and says so
 * (an unhandled failure once left the party with no DM until a reload, B10). Access
 * derives live from the campaign document in the rules, so each write is the whole
 * convergence.
 */
import type { TFunction } from "i18next";
import {
  deleteCampaign,
  removeMember,
  setJoinsLocked,
  yieldDmRole,
} from "@/features/campaigns/campaign-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { removeCombatant } from "@/features/campaigns/encounter";
import { inviteLinkFromCode } from "@/features/campaigns/invite-code";
import { useToastStore } from "@/stores/toastStore";
import type { CampaignDoc } from "@/types/campaign";

export interface CampaignAdminView {
  /** The DM, or an admin (who may manage any campaign). */
  canManage: boolean;
  /** The link a member shares; a locked campaign's link leads nowhere. */
  invite: { link: string; locked: boolean };
  /** Everyone but the DM: who can take the DM role, or be removed. */
  members: Array<{ uid: string; name: string }>;
}

export function campaignAdminView(
  campaign: CampaignDoc,
  uid: string | undefined,
  isAdmin: boolean,
  t: TFunction
): CampaignAdminView {
  return {
    canManage: campaign.dmUid === uid || isAdmin,
    invite: {
      link: inviteLinkFromCode(campaign.inviteCode),
      locked: campaign.joinsLocked === true,
    },
    members: Object.entries(campaign.memberDetails)
      .filter(([id]) => id !== campaign.dmUid)
      .map(([id, member]) => ({
        uid: id,
        name: member.displayName || t("campaignHub.unnamedPlayer"),
      })),
  };
}

const toast = (message: string, duration = 3000): void => {
  useToastStore.getState().showToast({ message, duration });
};

/** Lock or reopen joins by the invite link. */
export function setInviteLocked(locked: boolean, t: TFunction): void {
  const campaign = useCampaignStore.getState().campaign;
  if (!campaign) return;
  useCampaignStore.getState().setCampaign({ ...campaign, joinsLocked: locked });
  void setJoinsLocked(campaign.id, locked);
  toast(t(locked ? "campaignHub.joinsLockedToast" : "campaignHub.joinsOpenedToast"));
}

/** Hand the DM role to `toUid`. False when nothing changed (refused, or no such member). */
export async function handOverDm(toUid: string, t: TFunction): Promise<boolean> {
  const { campaign, setCampaign } = useCampaignStore.getState();
  if (!campaign) return false;
  const md = campaign.memberDetails;
  const oldDmUid = campaign.dmUid;
  const oldDm = md[oldDmUid];
  const newDm = md[toUid];
  if (!oldDm || !newDm || toUid === oldDmUid) return false;
  const name = newDm.displayName || t("campaignHub.unnamedPlayer");
  setCampaign({
    ...campaign,
    dmUid: toUid,
    memberDetails: {
      ...md,
      [toUid]: { ...newDm, role: "dm" },
      [oldDmUid]: { ...oldDm, role: "player" },
    },
  });
  try {
    await yieldDmRole(campaign.id, oldDmUid, toUid);
  } catch {
    setCampaign(campaign);
    toast(t("campaignHub.yieldDmError"), 5000);
    return false;
  }
  toast(t("campaignHub.yieldDmToast", { name }));
  return true;
}

/** Remove a member, and their row from a running fight. False when refused. */
export async function removeCampaignMember(
  memberUid: string,
  t: TFunction
): Promise<boolean> {
  const { campaign, setCampaign } = useCampaignStore.getState();
  if (!campaign) return false;
  const target = campaign.memberDetails[memberUid];
  if (!target || memberUid === campaign.dmUid) return false;
  const name = target.displayName || t("campaignHub.unnamedPlayer");
  const combatantId = `pc-${memberUid}`;
  const encounter =
    campaign.encounter?.combatants.some((c) => c.id === combatantId) === true
      ? removeCombatant(campaign.encounter, combatantId)
      : campaign.encounter;
  setCampaign({
    ...campaign,
    members: campaign.members.filter((m) => m !== memberUid),
    memberDetails: Object.fromEntries(
      Object.entries(campaign.memberDetails).filter(([id]) => id !== memberUid)
    ),
    ...(encounter !== campaign.encounter ? { encounter } : {}),
  });
  try {
    await removeMember(campaign.id, memberUid);
  } catch {
    setCampaign(campaign);
    toast(t("campaignHub.removeMemberError"), 5000);
    return false;
  }
  toast(t("campaignHub.removeMemberToast", { name }));
  return true;
}

/** Delete the campaign for good. True once deleted (the UI then leaves the page). */
export async function deleteCampaignForGood(t: TFunction): Promise<boolean> {
  const campaign = useCampaignStore.getState().campaign;
  if (!campaign) return false;
  try {
    await deleteCampaign(campaign.id);
  } catch {
    toast(t("campaignHub.deleteError"));
    return false;
  }
  toast(t("campaignHub.deletedToast"));
  return true;
}
