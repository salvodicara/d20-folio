/**
 * CampaignsListPage — the "Campaigns" realm (Phase 5 · Part 2b).
 *
 * Lists the Shared campaigns the player belongs to via a ONE-SHOT,
 * membership-scoped fetch (`listSharedCampaigns` — NOT a listener; the only list
 * shape the rules permit), with create + join entry points. The hidden Personal
 * Campaign is never a `/campaigns` document, so it can never appear here — and is
 * filtered defensively regardless. Owns its own `<main id="main">`.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { AlertTriangle, Swords, Copy, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PortraitImg } from "@/components/shared/PortraitImg";
import {
  CardOverflowMenu,
  type CardMenuItem,
} from "@/components/shared/CardOverflowMenu";
import { useCardMenuGuard } from "@/components/shared/use-card-menu-guard";
import { RunicEmptyState } from "@/components/ui/runic-empty-state";
import { Button } from "@/components/ui/button";
import { FolioLoader } from "@/components/shared/FolioLoader";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import { copyWithToast } from "@/components/shared/copy-to-clipboard";
import { useConfirmStore } from "@/stores/confirmStore";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { CampaignDoc } from "@/types/campaign";
import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";
import { listSharedCampaigns, deleteCampaign } from "@/features/campaigns/campaign-io";
import { inviteLinkFromCode } from "@/features/campaigns/invite-code";
import { snapshotTotalLevel } from "@/features/campaigns/member-snapshot";
import { campaignPartySize, treasuryTotalGp } from "@/features/campaigns/campaignStore";
import { formatRelativeTime, isRecent } from "@/features/roster/relative-time";
import { CreateCampaignModal } from "@/features/campaigns/CreateCampaignModal";
import { FREE_TIER_LIMITS } from "@/lib/limits";
import { JoinCampaignModal } from "@/features/campaigns/JoinCampaignModal";

export function CampaignsListPage() {
  const { t } = useTranslation();
  useDocumentTitle(t("nav.campaigns"));
  const navigate = useNavigate();
  const uid = useAuthStore((s) => s.user?.uid);

  const [campaigns, setCampaigns] = useState<CampaignDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // OWN-28d — "Ask the Folio → Create a campaign" deep-links here with `?new=1`.
  // Seed the create modal open from that param on mount (a lazy initializer, so no
  // setState-in-effect); the param is stripped when the modal closes (below) so a
  // refresh / back won't silently re-open it.
  const [createOpen, setCreateOpen] = useState(() => searchParams.get("new") === "1");
  const [joinOpen, setJoinOpen] = useState(false);

  const clearNewParam = () => {
    if (searchParams.get("new") == null) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      },
      { replace: true }
    );
  };
  // Bumped when a create/join modal closes so the one-shot fetch re-runs and a
  // just-created/joined campaign appears without a full reload (#31).
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // AuthGuard guarantees a uid here; if it is briefly absent the initial
    // `loading` state keeps the spinner up until the effect re-runs with it. All
    // setState happens in the async callbacks (never synchronously in the body),
    // so no cascading-render rule is tripped.
    if (!uid) return;
    let cancelled = false;
    void listSharedCampaigns(uid)
      .then((cs) => {
        if (cancelled) return;
        // Personal is never a /campaigns doc, but filter defensively.
        setCampaigns(cs.filter((c) => c.id !== PERSONAL_CAMPAIGN_ID));
        setError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("campaigns.errorBlurb"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid, t, refreshKey]);

  // Free-tier cap (#29): bound the per-user campaign count. Joining is always
  // allowed (it doesn't create a doc you own); only NEW campaigns hit the cap.
  const atCampaignCap = campaigns.length >= FREE_TIER_LIMITS.campaigns;
  const campaignCapLabel = t("campaigns.atCap", {
    max: FREE_TIER_LIMITS.campaigns,
  });
  const headerActions = (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={() => setJoinOpen(true)}>
        {t("campaigns.joinShort")}
      </Button>
      <Button
        variant="primary"
        onClick={() => setCreateOpen(true)}
        disabled={atCampaignCap}
        title={atCampaignCap ? campaignCapLabel : undefined}
      >
        {t("campaigns.new")}
      </Button>
    </div>
  );

  return (
    <main id="main" className="page-shell py-8">
      <PageHeader
        as="h1"
        crest
        title={t("nav.campaigns")}
        hint={t("campaigns.hint")}
        // #22 dedup — the empty state owns the Create/Join CTAs, so the header
        // actions only appear once there's a populated list to act on.
        actions={campaigns.length > 0 ? headerActions : undefined}
      />

      {/* While the list resolves, show the unified FolioLoader (delayed, so a warm
          load shows nothing); the page header is already up, and the empty-state below
          only shows once the fetch has settled to a genuinely-empty list. */}
      {loading ? (
        <FolioLoader variant="region" />
      ) : error ? (
        <RunicEmptyState
          className="on-art-scope"
          glyph={AlertTriangle}
          title={t("campaigns.errorTitle")}
          blurb={error}
          // A load error is recoverable — offer Retry (re-runs the one-shot fetch,
          // which forces a fresh server read) instead of leaving a dead end (the
          // 2026-07-09 "Clear site data" incident).
          actions={
            <Button
              variant="primary"
              onClick={() => {
                setError(null);
                setLoading(true);
                setRefreshKey((k) => k + 1);
              }}
            >
              {t("common.retry")}
            </Button>
          }
        />
      ) : campaigns.length === 0 ? (
        <RunicEmptyState
          className="on-art-scope"
          glyph={Swords}
          title={t("campaigns.emptyTitle")}
          blurb={t("campaigns.emptyBlurb")}
          actions={
            <>
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                {t("campaigns.createFirst")}
              </Button>
              <Button variant="secondary" onClick={() => setJoinOpen(true)}>
                {t("campaigns.joinWithCode")}
              </Button>
            </>
          }
        />
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <CampaignCard
                campaign={c}
                onOpen={() => void navigate(`/campaigns/${c.id}`)}
                onDeleted={() => setRefreshKey((k) => k + 1)}
              />
            </li>
          ))}
        </ul>
      )}

      <CreateCampaignModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          clearNewParam();
          setRefreshKey((k) => k + 1);
        }}
      />
      <JoinCampaignModal
        open={joinOpen}
        onClose={() => {
          setJoinOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    </main>
  );
}

/** The localized party-level range across attached characters (min–max), or null
 *  when no member has attached a character yet. */
function partyLevelRange(campaign: CampaignDoc): string | null {
  const levels = Object.values(campaign.memberDetails)
    .map((m) => (m.character ? snapshotTotalLevel(m.character) : 0))
    .filter((l): l is number => l > 0);
  if (levels.length === 0) return null;
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  return min === max ? String(min) : `${min}–${max}`;
}

/**
 * A single campaign tile (N1/N2) — a rich summary that rhymes with the roster
 * `.ch-card`: a fitted 16:9 banner header (the cover-fit PortraitImg shows the
 * stored crop exactly, undistorted), the name + DM + start date, and a foot of
 * scannable chips (party size · level range · treasury). Everything is read from
 * the campaign doc itself (denormalized) — no per-card extra reads.
 */
function CampaignCard({
  campaign,
  onOpen,
  onDeleted,
}: {
  campaign: CampaignDoc;
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const { t, i18n } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const isAdmin = useIsAdmin();
  // The card chip is LABELED "Party"/"Gruppo", so it counts players only (DM
  // excluded) via the single-source `campaignPartySize`.
  const members = campaignPartySize(campaign);
  const dm = campaign.memberDetails[campaign.dmUid];
  const dmName = dm?.displayName || "";
  const levels = partyLevelRange(campaign);
  const potGp = treasuryTotalGp(campaign.treasury);

  // ─── Row-actions menu (shared with the roster card) ──────────────────────────
  // Copy invite link is open to any member; deleting is gated to the DM (or the
  // supreme admin), mirrors the hub's DM Tools delete (same confirm + toasts).
  const {
    open: menuOpen,
    setOpen: setMenuOpen,
    openBtnRef,
    guardProps,
  } = useCardMenuGuard();
  const canDelete = campaign.dmUid === uid || isAdmin;

  // The invite is a LINK; the embedded code is just the doc id (de-dup pass).
  const inviteLink = inviteLinkFromCode(campaign.inviteCode);

  function copyInviteLink(): void {
    copyWithToast(inviteLink, t("campaigns.linkCopied"));
  }

  async function deleteThisCampaign(): Promise<void> {
    const ok = await useConfirmStore.getState().confirm({
      title: t("campaignHub.deleteCampaignTitle"),
      message: t("campaignHub.deleteCampaignMessage"),
      confirmLabel: t("campaignHub.deleteCampaignConfirm"),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteCampaign(campaign.id);
    } catch {
      useToastStore.getState().showToast({
        message: t("campaignHub.deleteError"),
        duration: 3000,
      });
      return;
    }
    useToastStore.getState().showToast({
      message: t("campaignHub.deletedToast"),
      duration: 3000,
    });
    onDeleted();
  }

  const menuItems: CardMenuItem[] = [
    {
      key: "copy-link",
      label: t("campaigns.copyInviteLink"),
      icon: Copy,
      onSelect: copyInviteLink,
    },
    {
      key: "delete",
      label: t("campaignHub.deleteCampaignConfirm"),
      icon: Trash2,
      danger: true,
      dividerBefore: true,
      hidden: !canDelete,
      onSelect: () => void deleteThisCampaign(),
    },
  ];

  const dateFmt = (d: Date): string =>
    d.toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const startedValid =
    campaign.createdAt instanceof Date && !Number.isNaN(campaign.createdAt.getTime())
      ? campaign.createdAt
      : null;
  const activeValid =
    campaign.updatedAt instanceof Date && !Number.isNaN(campaign.updatedAt.getTime())
      ? campaign.updatedAt
      : null;
  // Stable "now" captured once per mount so relative-time stays render-pure (#59 F16).
  const [now] = useState(() => Date.now());
  const active = activeValid ? formatRelativeTime(activeValid, i18n.language, now) : null;
  const activeRecent = activeValid ? isRecent(activeValid, now) : false;

  return (
    <article className="ch-card cmp-card" {...guardProps}>
      <button
        ref={openBtnRef}
        type="button"
        className="ch-open"
        disabled={menuOpen}
        onClick={onOpen}
        aria-label={t("campaigns.openHubNamed", { name: campaign.name })}
      />
      <CardOverflowMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        items={menuItems}
        triggerLabel={t("campaigns.cardMoreActions")}
        menuLabel={t("campaigns.cardActionsFor", {
          name: campaign.name,
        })}
      />
      {/* N4 — a member's cropped custom banner (via the shared PortraitImg) when
          set, else the default art (the `.cmp-banner` CSS background). */}
      <span className="cmp-banner" aria-hidden>
        {campaign.bannerUrl ? (
          <PortraitImg
            src={campaign.bannerUrl}
            crop={campaign.bannerCrop ?? null}
            alt=""
            loading="lazy"
          />
        ) : null}
      </span>
      <div className="ch-top cmp-top">
        <div className="ch-id">
          <span className="ch-name">{campaign.name}</span>
          <span className="ch-sub">
            {dmName ? (
              <em>{t("campaigns.cardDm", { name: dmName })}</em>
            ) : (
              t("campaigns.cardNoDm")
            )}
            {startedValid ? (
              <>
                {" · "}
                {t("campaigns.cardStarted", {
                  date: dateFmt(startedValid),
                })}
              </>
            ) : null}
          </span>
        </div>
      </div>
      <div className="ch-foot flex-wrap">
        <span className="ch-stat shrink-0">
          <span className="cst-lbl">{t("campaigns.cardParty")}</span>
          <span className="cst-val">{members}</span>
        </span>
        {levels ? (
          <span className="ch-stat shrink-0">
            <span className="cst-lbl">{t("campaigns.cardLevels")}</span>
            <span className="cst-val">{levels}</span>
          </span>
        ) : null}
        {potGp > 0 ? (
          <span className="ch-stat shrink-0">
            <span className="cst-lbl">{t("campaigns.cardPot")}</span>
            <span className="cst-val">{potGp} gp</span>
          </span>
        ) : null}
        {active ? (
          <span className={activeRecent ? "ch-played now" : "ch-played"}>
            {t("campaigns.cardActive", { date: active })}
          </span>
        ) : null}
      </div>
    </article>
  );
}
