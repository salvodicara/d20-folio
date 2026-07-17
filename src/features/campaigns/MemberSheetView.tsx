/**
 * MemberSheetView — a campaign member views a teammate's FULL character sheet,
 * read-only.
 *
 * Route: `/campaigns/:campaignId/sheets/:memberUid`. Reachable from the Party (any
 * member clicks a teammate who has attached a character — the live membership grant
 * authorizes every co-member to read the doc, not just the DM). It:
 *
 *   1. loads the campaign (the SAME scoped subscription the hub uses) to resolve
 *      the member's attached `characterId` AND to gate access to any co-member/admin;
 *   2. read-only-subscribes to the member's REAL character document via the SAME
 *      `subscribeToCharacter` the owner's cockpit uses (`useMemberCharacterSubscription`)
 *      — ONE load path for owner + admin + DM — and loads it into the shared
 *      character store with the `readonly` flag set;
 *   3. renders the SAME `CockpitView` the owner sees (no fork), in read-only mode
 *      — the DM EXPLORES it (expand feature/spell/item cards, switch tabs, read
 *      tooltips all work), while every MUTATING affordance hides/disables (via
 *      `useSheetReadonly`) and every store write is a no-op at the
 *      `patchCharacter`/store seam (the backstop). The Left/Right HUD rails — dense
 *      mutating-control clusters — stay `inert`.
 *
 * Firestore enforces the read independently (the character read rule's live-membership
 * ACL): every campaign co-member (or admin) may read the member's character, so this
 * UI gate is a UX nicety, not the security boundary.
 */

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router";
import { AlertTriangle, ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { FolioLoader } from "@/components/shared/FolioLoader";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";
import { useAuthStore } from "@/stores/authStore";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useCampaignSubscription } from "@/features/campaigns/useCampaignSubscription";
import { makeDevCampaign } from "@/features/campaigns/dev-fixture";
import { useMemberCharacterSubscription } from "@/features/campaigns/useMemberCharacterSubscription";
import { useCharacterStore } from "@/stores/characterStore";
import { CockpitView } from "@/features/character/CharacterCockpit";

export function MemberSheetView() {
  const { campaignId, memberUid } = useParams<{
    campaignId: string;
    memberUid: string;
  }>();
  if (!campaignId || campaignId === PERSONAL_CAMPAIGN_ID || !memberUid) {
    return <Navigate to="/campaigns" replace />;
  }
  return <MemberSheet campaignId={campaignId} memberUid={memberUid} />;
}

function MemberSheet({
  campaignId,
  memberUid,
}: {
  campaignId: string;
  memberUid: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const uid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();

  // The campaign tells us (a) the requester is its DM/admin and (b) the member's
  // attached characterId. Reuse the hub's scoped subscription + dev seed.
  useCampaignSubscription(campaignId);
  useEffect(() => {
    if (!DEV_BYPASS_AUTH) return;
    const store = useCampaignStore.getState();
    if (store.campaign?.id !== campaignId) {
      store.setCampaign(makeDevCampaign(campaignId));
    }
  }, [campaignId]);

  const campaign = useCampaignStore((s) => s.campaign);
  const campaignError = useCampaignStore((s) => s.error);

  const member = campaign?.memberDetails[memberUid];
  const characterId = member?.characterId ?? undefined;
  // C5 — every campaign co-member may open a teammate's sheet (read-only); the
  // live campaign-membership grant on the char doc authorizes the read for any member, not just
  // the DM. Admins keep the override. The sheet stays read-only for non-owners.
  const canView = !!campaign && ((!!uid && campaign.members.includes(uid)) || isAdmin);

  // Read-only-subscribe to the member's REAL character doc (no-op until we may view
  // AND the member has a character attached) — INCLUDING a live `combat/state`
  // subscription so a peer's read-only cockpit shows LIVE HP/conditions, not the
  // stripped parent default. The Firestore live-membership rule independently gates
  // the read to any co-member/admin; this is the SAME load path the owner's cockpit uses.
  useMemberCharacterSubscription(
    canView && characterId ? memberUid : undefined,
    canView && characterId ? characterId : undefined
  );

  const character = useCharacterStore((s) => s.character);
  const loading = useCharacterStore((s) => s.loading);
  const characterError = useCharacterStore((s) => s.error);

  // Campaign still settling.
  if (!campaign) {
    if (!campaignError) return <FolioLoader variant="region" />;
    return (
      <NotAllowed
        title={t("campaignHub.notFound")}
        blurb={t("campaignHub.notFoundBlurb")}
        onBack={() => void navigate("/campaigns")}
        backLabel={t("dmView.backToCampaign")}
      />
    );
  }

  // Not a co-member/admin → refuse (the rules would deny the read anyway).
  if (!canView) {
    return (
      <NotAllowed
        title={t("dmView.notAllowedTitle")}
        blurb={t("dmView.notAllowedBlurb")}
        onBack={() => void navigate(`/campaigns/${campaignId}`)}
        backLabel={t("dmView.backToCampaign")}
      />
    );
  }

  // Member has no attached character to view.
  if (!characterId) {
    return (
      <NotAllowed
        title={t("dmView.noCharacterTitle")}
        blurb={t("dmView.noCharacterBlurb")}
        onBack={() => void navigate(`/campaigns/${campaignId}`)}
        backLabel={t("dmView.backToCampaign")}
      />
    );
  }

  // The character doc could not be read (absent / denied / parse error) — surface a
  // clean not-found, never a stuck spinner (the #106 infinite-loader bug). Only once
  // we're done loading and have an error with no character.
  if (!loading && !character && characterError) {
    return (
      <NotAllowed
        title={t("dmView.sheetUnavailableTitle")}
        blurb={t("dmView.sheetUnavailableBlurb")}
        onBack={() => void navigate(`/campaigns/${campaignId}`)}
        backLabel={t("dmView.backToCampaign")}
      />
    );
  }

  if (loading || !character) {
    return <FolioLoader variant="region" />;
  }

  // The SAME cockpit body the owner sees — read-only. ONE compact header row
  // carries both affordances (owner 2026-06-12: never two stacked rows): the
  // back button inline-left, and a quiet "Read-only" status chip inline-right
  // (the reused `.toolbar-chip` recipe) whose title carries the full sentence.
  // The row floats DIRECTLY on the backdrop art (no card), so it sits in the
  // canonical `.on-art-scope`: the ghost back button takes the on-art gilt
  // treatment in light theme (the chip is its own carved surface — untouched).
  return (
    <div className="flex flex-col">
      <div className="on-art-scope mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void navigate(`/campaigns/${campaignId}`)}
        >
          <Icon as={ArrowLeft} size="sm" decorative />
          {t("dmView.backToCampaign")}
        </Button>
        <span role="status" className="toolbar-chip" title={t("dmView.readonlyTip")}>
          <Icon as={Eye} size="sm" decorative />
          {t("dmView.readonly")}
        </span>
      </div>
      <CockpitView />
    </div>
  );
}

function NotAllowed({
  title,
  blurb,
  onBack,
  backLabel,
}: {
  title: string;
  blurb: string;
  onBack: () => void;
  backLabel: string;
}) {
  return (
    <main id="main" className="page-shell on-art-scope py-12">
      <RunicEmptyState
        glyph={AlertTriangle}
        title={title}
        blurb={blurb}
        actions={
          <Button size="lg" onClick={onBack}>
            {backLabel}
          </Button>
        }
      />
    </main>
  );
}
