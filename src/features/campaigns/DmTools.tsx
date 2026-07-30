/**
 * DmTools — DM-only campaign controls (Phase 5 · Part 2b).
 *
 * Renders only for the campaign's DM (`uid === dmUid`) or the admin — for everyone else
 * it returns null, so the campaign hub simply ends at the utility pair (no phantom foot
 * card). ROLE + DANGER only: roster management (yield DM · remove member) and the
 * delete-campaign danger zone, laid out 2-up. The lock-new-members kill switch moved to
 * the Access section (CampaignInvite) to sit with the link it disables (golden rule 6);
 * the party overview + encounter tracker live in the Party section. It rides
 * {@link SectionPanel} so it shares the one desk-card rubric, and spans both dashboard
 * columns (`lg:col-span-2`) as the full-width foot.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Trash2, Crown, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoCard } from "@/components/shared/InfoCard";
import { Select } from "@/components/shared/Select";
import { useAuthStore } from "@/stores/authStore";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useToastStore } from "@/stores/toastStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import {
  deleteCampaign,
  removeMember,
  yieldDmRole,
} from "@/features/campaigns/campaign-io";
import { removeCombatant } from "@/features/campaigns/encounter";

export function DmTools() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const uid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();
  const campaign = useCampaignStore((s) => s.campaign);
  const setCampaign = useCampaignStore((s) => s.setCampaign);
  const [yieldTo, setYieldTo] = useState("");
  const [removeTo, setRemoveTo] = useState("");

  // D29 — the DM tools render for the campaign's DM OR the admin (the owner
  // always overrides every campaign, even ones they don't run).
  if (!campaign || (campaign.dmUid !== uid && !isAdmin)) return null;
  const campaignId = campaign.id;

  // Members who could be promoted to DM (everyone except the current DM).
  const otherMembers = Object.entries(campaign.memberDetails).filter(
    ([id]) => id !== campaign.dmUid
  );

  // D29 — transfer the DM crown to another member (the current DM, or the admin acting
  // on their behalf). Optimistic store update, then AWAIT the write so a failure can be
  // handled (B10): the panel hides for the ex-DM the instant local `dmUid` flips, so an
  // unhandled write failure used to strand the party with NO DM until a reload. On
  // rejection revert the optimistic flip + surface an error toast; the success toast +
  // ACL reconcile fire only after the write commits.
  async function confirmYieldDm(): Promise<void> {
    if (!campaign || !yieldTo) return;
    const target = campaign.memberDetails[yieldTo];
    const targetName = target?.displayName || t("campaignHub.unnamedPlayer");
    const ok = await useConfirmStore.getState().confirm({
      title: t("campaignHub.yieldDmTitle"),
      message: t("campaignHub.yieldDmMessage", {
        name: targetName,
      }),
      confirmLabel: t("campaignHub.yieldDmConfirm"),
    });
    if (!ok) return;
    const oldDmUid = campaign.dmUid;
    const newDmUid = yieldTo;
    const md = campaign.memberDetails;
    const oldDm = md[oldDmUid];
    const newDm = md[newDmUid];
    if (!oldDm || !newDm) return;
    const prevCampaign = campaign; // revert anchor if the persisted write fails
    setCampaign({
      ...campaign,
      dmUid: newDmUid,
      memberDetails: {
        ...md,
        [newDmUid]: { ...newDm, role: "dm" },
        [oldDmUid]: { ...oldDm, role: "player" },
      },
    });
    try {
      await yieldDmRole(campaignId, oldDmUid, newDmUid);
    } catch {
      // The role flip never landed — undo the optimistic mutation so the party is not
      // left locked out of DM Tools with no DM, and tell the DM to retry.
      setCampaign(prevCampaign);
      useToastStore.getState().showToast({
        message: t("campaignHub.yieldDmError"),
        duration: 5000,
      });
      return;
    }
    setYieldTo("");
    // No ACL reconcile: cross-user access derives LIVE from the campaign doc's `dmUid`
    // in firestore.rules, so the role flip above IS the whole convergence.
    useToastStore.getState().showToast({
      message: t("campaignHub.yieldDmToast", {
        name: targetName,
      }),
      duration: 3000,
    });
  }

  // Remove a player from the campaign (DM, or admin acting for them). Optimistic store
  // update, then AWAIT the write (B10 — mirror confirmYieldDm): on rejection revert +
  // error toast. B03 — the optimistic update also prunes the removed member's `pc-<uid>`
  // combatant from a running encounter (through the SAME `removeCombatant` reducer the
  // persisted `removeMember` uses), so the view never shows an orphan row.
  async function confirmRemoveMember(): Promise<void> {
    if (!campaign || !removeTo) return;
    const target = campaign.memberDetails[removeTo];
    const targetName = target?.displayName || t("campaignHub.unnamedPlayer");
    const ok = await useConfirmStore.getState().confirm({
      title: t("campaignHub.removeMemberTitle"),
      message: t("campaignHub.removeMemberMessage", { name: targetName }),
      confirmLabel: t("campaignHub.removeMemberConfirm"),
      tone: "danger",
    });
    if (!ok) return;
    const prevCampaign = campaign; // revert anchor if the persisted write fails
    const remaining = Object.fromEntries(
      Object.entries(campaign.memberDetails).filter(([id]) => id !== removeTo)
    );
    const combatantId = `pc-${removeTo}`;
    const prunedEncounter =
      campaign.encounter &&
      campaign.encounter.combatants.some((c) => c.id === combatantId)
        ? removeCombatant(campaign.encounter, combatantId)
        : campaign.encounter;
    setCampaign({
      ...campaign,
      members: campaign.members.filter((m) => m !== removeTo),
      memberDetails: remaining,
      ...(prunedEncounter !== campaign.encounter ? { encounter: prunedEncounter } : {}),
    });
    try {
      await removeMember(campaignId, removeTo);
    } catch {
      setCampaign(prevCampaign);
      useToastStore.getState().showToast({
        message: t("campaignHub.removeMemberError"),
        duration: 5000,
      });
      return;
    }
    setRemoveTo("");
    // No ACL reconcile: cross-user access derives LIVE from the campaign roster in
    // firestore.rules, so the roster write above IS the whole convergence.
    useToastStore.getState().showToast({
      message: t("campaignHub.removeMemberToast", { name: targetName }),
      duration: 3000,
    });
  }

  async function confirmDeleteCampaign(): Promise<void> {
    const ok = await useConfirmStore.getState().confirm({
      title: t("campaignHub.deleteCampaignTitle"),
      message: t("campaignHub.deleteCampaignMessage"),
      confirmLabel: t("campaignHub.deleteCampaignConfirm"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteCampaign(campaignId);
      useToastStore.getState().showToast({
        message: t("campaignHub.deletedToast"),
        duration: 3000,
      });
    } catch {
      useToastStore.getState().showToast({
        message: t("campaignHub.deleteError"),
        duration: 3000,
      });
      return;
    }
    void navigate("/campaigns");
  }

  return (
    <SectionPanel
      sectionId="dm"
      className="lg:col-span-2"
      title={t("campaignHub.dmTools")}
    >
      {/* ROLE + DANGER only, laid out 2-up on desktop (one column on mobile). The party
          overview + encounter tracker live in the Party section; the invite link + its
          lock (revoke) live in the Access section. Each control is its own carded cell so
          a missing one (no member to promote/remove) never leaves a hanging divider. */}
      <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
        {/* D29 — hand the DM crown to another member (shown only when there's
            someone to promote). */}
        {otherMembers.length > 0 && (
          <InfoCard className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">
              {t("campaignHub.yieldDm")}
            </span>
            <p className="mb-1 text-xs text-text-muted">{t("campaignHub.yieldDmHint")}</p>
            <div className="flex items-center gap-2">
              <Select
                value={yieldTo}
                onChange={(e) => setYieldTo(e.target.value)}
                aria-label={t("campaignHub.yieldDm")}
              >
                <option value="">{t("campaignHub.yieldDmPick")}</option>
                {otherMembers.map(([id, m]) => (
                  <option key={id} value={id}>
                    {m.displayName || t("campaignHub.unnamedPlayer")}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                disabled={!yieldTo}
                onClick={() => void confirmYieldDm()}
              >
                <Crown aria-hidden className="h-4 w-4" />
                {t("campaignHub.yieldDmConfirm")}
              </Button>
            </div>
          </InfoCard>
        )}

        {/* Remove a player from the campaign (shown only when there's someone to
            remove). Their character detaches; they can rejoin unless joins are locked. */}
        {otherMembers.length > 0 && (
          <InfoCard className="flex flex-col gap-1">
            <span className="text-sm text-text-secondary">
              {t("campaignHub.removeMember")}
            </span>
            <p className="mb-1 text-xs text-text-muted">
              {t("campaignHub.removeMemberHint")}
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={removeTo}
                onChange={(e) => setRemoveTo(e.target.value)}
                aria-label={t("campaignHub.removeMember")}
              >
                <option value="">{t("campaignHub.yieldDmPick")}</option>
                {otherMembers.map(([id, m]) => (
                  <option key={id} value={id}>
                    {m.displayName || t("campaignHub.unnamedPlayer")}
                  </option>
                ))}
              </Select>
              <Button
                variant="destructive"
                disabled={!removeTo}
                onClick={() => void confirmRemoveMember()}
              >
                <UserMinus aria-hidden className="h-4 w-4" />
                {t("campaignHub.removeMemberConfirm")}
              </Button>
            </div>
          </InfoCard>
        )}

        <InfoCard className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm text-text-secondary">
            {t("campaignHub.dangerZone")}
          </span>
          <p className="mb-1 text-xs text-text-muted">
            {t("campaignHub.deleteCampaignHint")}
          </p>
          <div>
            <Button variant="destructive" onClick={() => void confirmDeleteCampaign()}>
              <Trash2 aria-hidden className="h-4 w-4" />
              {t("campaignHub.deleteCampaignConfirm")}
            </Button>
          </div>
        </InfoCard>
      </div>
    </SectionPanel>
  );
}
