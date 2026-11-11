/**
 * DmTools — DM-only campaign controls (Phase 5 · Part 2b).
 *
 * Renders only for the campaign's DM (`uid === dmUid`) or the admin — for everyone else
 * it returns null, so the campaign hub simply ends at the utility pair (no phantom foot
 * card). ROLE + DANGER only: roster management (yield DM · remove member) and the
 * delete-campaign danger zone, laid out in one compact, always-visible manager panel.
 * The DM workspace tab is already the disclosure boundary; nesting another reveal here
 * would hide a small toolset and leave a misleading empty card. The lock-new-members kill switch moved to
 * the Access section (CampaignInvite) to sit with the link it disables (golden rule 6);
 * the party overview + encounter tracker live in the Party section. It rides
 * {@link SectionPanel} so it shares the one desk-card rubric, and spans both dashboard
 * grid as the full-width manager workspace.
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
import { useConfirmStore } from "@/stores/confirmStore";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import {
  deleteCampaignForGood,
  handOverDm,
  removeCampaignMember,
} from "@/domains/campaign/campaign-admin";

export function DmTools() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const uid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();
  const campaign = useCampaignStore((s) => s.campaign);
  const [yieldTo, setYieldTo] = useState("");
  const [removeTo, setRemoveTo] = useState("");

  // D29 — the DM tools render for the campaign's DM OR the admin (the owner
  // always overrides every campaign, even ones they don't run).
  if (!campaign || (campaign.dmUid !== uid && !isAdmin)) return null;

  // Members who could be promoted to DM (everyone except the current DM).
  const otherMembers = Object.entries(campaign.memberDetails).filter(
    ([id]) => id !== campaign.dmUid
  );

  // D29 — transfer the DM crown to another member (the current DM, or the admin acting
  // on their behalf), once confirmed: `handOverDm` (optimistic, reverted on refusal).
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
    if (await handOverDm(yieldTo, t)) setYieldTo("");
  }

  // Remove a player from the campaign (DM, or admin acting for them), once confirmed:
  // `removeCampaignMember` (optimistic, reverted on refusal; prunes their fight row).
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
    if (await removeCampaignMember(removeTo, t)) setRemoveTo("");
  }

  async function confirmDeleteCampaign(): Promise<void> {
    const ok = await useConfirmStore.getState().confirm({
      title: t("campaignHub.deleteCampaignTitle"),
      message: t("campaignHub.deleteCampaignMessage"),
      confirmLabel: t("campaignHub.deleteCampaignConfirm"),
      tone: "danger",
    });
    if (!ok) return;
    if (!(await deleteCampaignForGood(t))) return;
    void navigate("/campaigns");
  }

  return (
    <SectionPanel sectionId="dm" title={t("campaignHub.dmTools")} framed>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">{t("campaignHub.dmToolsSummary")}</p>
        <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
          {/* D29 — hand the DM crown to another member (shown only when there's
              someone to promote). */}
          {otherMembers.length > 0 && (
            <InfoCard className="flex flex-col gap-1">
              <span className="text-sm text-text-secondary">
                {t("campaignHub.yieldDm")}
              </span>
              <p className="mb-1 text-xs text-text-muted">
                {t("campaignHub.yieldDmHint")}
              </p>
              <div className="flex flex-wrap items-center gap-2 [&>:first-child]:min-w-[10rem] [&>:first-child]:flex-1">
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
                  className="shrink-0 whitespace-nowrap"
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
              <div className="flex flex-wrap items-center gap-2 [&>:first-child]:min-w-[10rem] [&>:first-child]:flex-1">
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
                  className="shrink-0 whitespace-nowrap"
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
      </div>
    </SectionPanel>
  );
}
