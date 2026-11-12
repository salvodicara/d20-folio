/**
 * The DM's read-only view of a party member's sheet on the new frame
 * (`/campaigns/:campaignId/sheets/:memberUid`): the same Play sheet the player sees,
 * every control read-only, with «Torna alla campagna». The old view's loading and
 * permission states, each as one tile with the way back. The same subscriptions the
 * old view used (the member's character, the campaign clock, the effects on the party).
 */
import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";

import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";
import { PlaySheet } from "@/domains/play/ui/PlayScreen";
import { useCampaignClockProjection } from "@/features/campaigns/campaign-clock-projection";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { useEffectsOnParty } from "@/features/campaigns/effects-on-party";
import { useCampaignSubscription } from "@/features/campaigns/useCampaignSubscription";
import { useMemberCharacterSubscription } from "@/features/campaigns/useMemberCharacterSubscription";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { Button, Icon } from "@/ui";

export function MemberSheetScreen() {
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
  const uid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();
  useCampaignSubscription(campaignId);
  const campaign = useCampaignStore((s) => s.campaign);
  const campaignError = useCampaignStore((s) => s.error);
  const characterId = campaign?.memberDetails[memberUid]?.characterId ?? undefined;
  const canView = !!campaign && ((!!uid && campaign.members.includes(uid)) || isAdmin);
  useMemberCharacterSubscription(
    canView && characterId ? memberUid : undefined,
    canView && characterId ? characterId : undefined
  );
  useCampaignClockProjection(canView ? characterId : undefined, campaign);
  const effectsOn = useEffectsOnParty(campaign);
  const setEncounterEffects = useCharacterStore((s) => s.setEncounterEffects);
  const loadedId = useCharacterStore((s) => s.character?.id);
  useEffect(() => {
    if (!canView || !characterId || loadedId !== characterId) return;
    setEncounterEffects(characterId, effectsOn(memberUid));
  }, [canView, characterId, loadedId, memberUid, effectsOn, setEncounterEffects]);
  const character = useCharacterStore((s) => s.character);
  const loading = useCharacterStore((s) => s.loading);
  const characterError = useCharacterStore((s) => s.error);
  const toCampaign = `/campaigns/${campaignId}`;

  if (!campaign)
    return campaignError ? (
      <Stop
        title={t("campaignHub.notFound")}
        blurb={t("campaignHub.notFoundBlurb")}
        to="/campaigns"
      />
    ) : (
      <Waiting />
    );
  if (!canView)
    return (
      <Stop
        title={t("dmView.notAllowedTitle")}
        blurb={t("dmView.notAllowedBlurb")}
        to={toCampaign}
      />
    );
  if (!characterId)
    return (
      <Stop
        title={t("dmView.noCharacterTitle")}
        blurb={t("dmView.noCharacterBlurb")}
        to={toCampaign}
      />
    );
  if (!loading && !character && characterError)
    return (
      <Stop
        title={t("dmView.sheetUnavailableTitle")}
        blurb={t("dmView.sheetUnavailableBlurb")}
        to={toCampaign}
      />
    );
  if (loading || !character) return <Waiting />;
  return (
    <PlaySheet
      characterId={characterId}
      campaign={campaign}
      back={{ to: toCampaign, label: t("dmView.backToCampaign"), crumb: true }}
    />
  );
}

function Waiting() {
  const { t } = useTranslation();
  return (
    <main id="main" className="f-page f-sheet">
      <p role="status">{t("character.loading")}</p>
    </main>
  );
}

/** A view the DM cannot open: one tile saying why, and the way back (the 404's grammar). */
function Stop({ title, blurb, to }: { title: string; blurb: string; to: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <main id="main" className="f-page f-roster">
      <section className="f-roster-empty f-notfound">
        <div className="f-tile">
          <Icon name="g-error" size={48} />
          <h1>{title}</h1>
          <span>{blurb}</span>
          <Button kind="primary" onClick={() => void navigate(to)}>
            {t("dmView.backToCampaign")}
          </Button>
        </div>
      </section>
    </main>
  );
}
