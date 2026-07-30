/**
 * CampaignInvite — the campaign hub's ACCESS section: the invite link AND its kill switch,
 * co-located (golden rule 6 — the control lives with what it changes).
 *
 * The link is built purely from `campaign.inviteCode` (which IS the doc id, already in
 * every member's live subscription — no extra read, no `firestore.rules` change). SHARING
 * is UNGATED: every member can copy / natively-share the link to grow the table. REVOKING
 * is the DM's: the lock-new-members switch sits directly under the link, gated on
 * `canManage`. Because both stream off the ONE live campaign doc, the link is
 * `joinsLocked`-AWARE — when locked, Copy/Share go inert and a lock badge rides the rubric,
 * so a member can never copy a dead link (the bug when the lock lived off in DM Tools).
 *
 * COMPRESSED (premium re-layout) — this is the compact half of the TREASURY | ACCESS
 * utility pair, so it carries only the essentials: the invite link lives BEHIND a
 * Copy/Share action (no raw read-only link field eating a row) plus the lock-new-joins
 * toggle. It rides {@link SectionPanel} like every other desk card, so all hub sections
 * share one card rubric. Reuses the folio primitives (SectionPanel + InfoCard + Switch +
 * Badge) and the ONE share/copy primitives (CopyButton + shareOrCopy) — no parallel
 * component.
 */

import { useTranslation } from "react-i18next";
import { Lock, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/selection";
import { CopyButton } from "@/components/shared/CopyButton";
import { InfoCard } from "@/components/shared/InfoCard";
import { shareOrCopy } from "@/components/shared/copy-to-clipboard";
import { useToastStore } from "@/stores/toastStore";
import { SectionPanel } from "@/features/campaigns/SectionPanel";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { setJoinsLocked } from "@/features/campaigns/campaign-io";
import { inviteLinkFromCode } from "@/features/campaigns/invite-code";

export function CampaignInvite({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const campaign = useCampaignStore((s) => s.campaign);
  const setCampaign = useCampaignStore((s) => s.setCampaign);
  if (!campaign) return null;

  const inviteLink = inviteLinkFromCode(campaign.inviteCode);
  const name = campaign.name;
  const joinsLocked = campaign.joinsLocked === true;

  function share(): void {
    void shareOrCopy(inviteLink, {
      title: t("campaigns.shareTitle", { name }),
      text: t("campaigns.shareText", { name }),
      copiedToast: t("campaigns.linkCopied"),
    });
  }

  // Lock / re-open new member joins — the no-migration kill switch for a leaked invite
  // link (moved here from DM Tools so it sits with the link it disables). Optimistic store
  // flip + persisted write + a confirming toast; current members are unaffected.
  function toggleJoinsLocked(next: boolean): void {
    if (!campaign) return;
    setCampaign({ ...campaign, joinsLocked: next });
    void setJoinsLocked(campaign.id, next);
    useToastStore.getState().showToast({
      message: t(next ? "campaignHub.joinsLockedToast" : "campaignHub.joinsOpenedToast"),
      duration: 3000,
    });
  }

  return (
    <SectionPanel
      sectionId="invite"
      title={t("campaignHub.access")}
      meta={
        joinsLocked ? (
          <Badge
            variant="muted"
            size="sm"
            glyph={<Lock aria-hidden className="h-3 w-3" />}
          >
            {t("campaignHub.joinsLockedBadge")}
          </Badge>
        ) : undefined
      }
    >
      <InfoCard className="flex flex-col gap-3">
        {/* The link itself lives BEHIND the actions (compressed): Copy puts it on the
            clipboard, Share opens the native sheet — no raw read-only field. Both go
            inert when joins are locked, so a member can never hand out a dead link. */}
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">{t("campaigns.inviteLinkHint")}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton
              value={inviteLink}
              toastMessage={t("campaigns.linkCopied")}
              label={t("campaigns.copyInviteLink")}
              ariaLabel={t("campaigns.copyInviteLink")}
              disabled={joinsLocked}
            />
            <Button variant="primary" onClick={share} disabled={joinsLocked}>
              <Share2 aria-hidden className="h-4 w-4" />
              {t("campaigns.shareInvite")}
            </Button>
          </div>
        </div>

        {/* The kill switch lives WITH the link (golden rule 6). DM/admin only — a member
            sees the (possibly locked) link actions + badge, never the control. */}
        {canManage && (
          <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="invite-lock-joins" className="text-sm text-text-secondary">
                {t("campaignHub.lockJoins")}
              </label>
              <Switch
                id="invite-lock-joins"
                checked={joinsLocked}
                onCheckedChange={toggleJoinsLocked}
              />
            </div>
            <p className="text-xs text-text-muted">{t("campaignHub.lockJoinsHint")}</p>
          </div>
        )}
      </InfoCard>
    </SectionPanel>
  );
}
